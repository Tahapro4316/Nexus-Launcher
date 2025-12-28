const fs = require('fs')
const path = require('path')
const child_process = require('child_process')
const os = require('os')
const AdmZip = require('adm-zip')

// Java gereksinimleri MC sürümüne göre
const JAVA_REQUIREMENTS = {
  '1.12': 8,
  '1.16': 8,
  '1.17': 16,
  '1.18': 17,
  '1.19': 17,
  '1.20': 17,
  '1.21': 21
}

function getSystemInfo() {
  return {
    platform: process.platform,
    arch: process.arch,
    home: os.homedir()
  }
}

function parseJavaMajor(output) {
  try {
    const s = String(output)
    const m1 = s.match(/version\s+"1\.(\d+)/)
    if (m1) return parseInt(m1[1], 10)
    const m2 = s.match(/version\s+"(\d+)/)
    if (m2) return parseInt(m2[1], 10)
  } catch { }
  return null
}

function getRequiredMajor(mcVersion) {
  try {
    const v = String(mcVersion).trim()
    const parts = v.split('.')
    const majorMinor = `${parts[0]}.${parts[1] || '0'}`

    for (const [key, required] of Object.entries(JAVA_REQUIREMENTS)) {
      if (majorMinor.startsWith(key)) {
        return required
      }
    }
    return 17
  } catch {
    return 17
  }
}

function execVersion(javaExe) {
  try {
    let output = ''
    try {
      output += child_process.execSync(`"${javaExe}" -version`, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 2000,
        encoding: 'utf8'
      })
    } catch (e) {
      output += e.stdout || ''
      output += e.stderr || ''
    }
    return parseJavaMajor(output)
  } catch (e) {
    return null
  }
}

function getPlatformSpecificPaths() {
  const info = getSystemInfo()

  if (info.platform === 'win32') {
    return [
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Microsoft',
      'C:\\Program Files\\Amazon Corretto',
      path.join(info.home, '.jdks'),
      path.join(os.homedir(), '.launcher-plus', 'java') // Uygulamanın kendi kurduğu yer
    ]
  } else if (info.platform === 'linux') {
    return [
      '/usr/lib/jvm',
      '/usr/local/lib/jvm',
      '/opt/java',
      '/opt/jdk',
      path.join(info.home, '.jdks'),
      path.join(info.home, '.sdkman/candidates/java')
    ]
  } else if (info.platform === 'darwin') {
    return [
      '/Library/Java/JavaVirtualMachines',
      '/System/Library/Java/JavaVirtualMachines',
      '/usr/local/Cellar/openjdk',
      path.join(info.home, '.jdks'),
      path.join(info.home, 'Library/Java/JavaVirtualMachines')
    ]
  }

  return []
}

function getJavaExecutableName() {
  return process.platform === 'win32' ? 'java.exe' : 'java'
}

function detectInstalledJavas() {
  const candidates = []
  const execName = getJavaExecutableName()

  if (process.env.JAVA_HOME) {
    const p = path.join(process.env.JAVA_HOME, 'bin', execName)
    if (fs.existsSync(p)) {
      const major = execVersion(p)
      candidates.push({ path: p, major })
    }
  }

  const roots = getPlatformSpecificPaths()

  for (const root of roots) {
    if (!fs.existsSync(root)) continue

    let dirs = []
    try {
      dirs = fs.readdirSync(root)
    } catch {
      dirs = []
    }

    for (const d of dirs) {
      const potentialPaths = [
        path.join(root, d, 'bin', execName),
        path.join(root, d, 'Contents', 'Home', 'bin', execName),
        path.join(root, d, 'jdk', 'bin', execName),
        path.join(root, d, 'java', 'bin', execName),
        path.join(root, d, 'bin', execName),
        path.join(root, d, 'openjdk', 'bin', execName)
      ]

      for (const exe of potentialPaths) {
        if (fs.existsSync(exe)) {
          const major = execVersion(exe)
          candidates.push({ path: exe, major })
        }
      }
    }
  }

  try {
    const cmd = process.platform === 'win32' ? `where ${getJavaExecutableName()}` : `which ${getJavaExecutableName()}`
    const result = child_process.execSync(cmd, { encoding: 'utf8' })
    const paths = result.split('\n').filter(p => p.trim())
    for (const p of paths) {
      const major = execVersion(p)
      candidates.push({ path: p, major })
    }
  } catch { }

  const unique = []
  const seen = new Set()
  for (const c of candidates) {
    const key = c.path.toLowerCase()
    if (!seen.has(key) && c.major) {
      seen.add(key)
      unique.push(c)
    }
  }

  return unique
}

function selectJavaForVersion(mcVersion) {
  const need = getRequiredMajor(mcVersion)
  const list = detectInstalledJavas().filter(x => x.major)

  const exact = list.find(x => x.major === need)
  if (exact) return exact.path

  const higher = list.find(x => x.major > need)
  if (higher) return higher.path

  const any = list.find(x => !!x.path)
  if (any) return any.path

  return null
}

async function autoInstallJava(version, onProgress) {
  const axios = require('axios');
  const { execSync } = require('child_process');
  const MAX_RETRIES = 3;

  try {
    const info = getSystemInfo();

    // Use .nexus-launcher in User Home which is standard and safe
    const preferredBase = path.join(os.homedir(), '.nexus-launcher', 'java_runtime');

    const jdkDir = preferredBase;
    const versionDir = path.join(jdkDir, `java-${version}`);

    // Internal temp to avoid system temp permission issues
    const internalTemp = path.join(jdkDir, 'temp_cache');
    if (!fs.existsSync(internalTemp)) {
      try { fs.mkdirSync(internalTemp, { recursive: true }); } catch (e) { }
    }

    const tempZip = path.join(internalTemp, `nexus-java-${version}-${Date.now()}.zip`);
    const extractTemp = path.join(internalTemp, `nexus-extract-${version}-${Date.now()}`);

    if (!fs.existsSync(jdkDir)) {
      try { fs.mkdirSync(jdkDir, { recursive: true }); } catch (err) { /* ignore */ }
    }

    // Eğer zaten kurulu ise kontrol et
    const javaBinWin = path.join(versionDir, 'bin', 'java.exe');
    const javaBinNix = path.join(versionDir, 'bin', 'java');
    if (fs.existsSync(javaBinWin) || fs.existsSync(javaBinNix)) {
      const candidate = fs.existsSync(javaBinWin) ? javaBinWin : javaBinNix;
      const major = execVersion(candidate);
      if (major === parseInt(version)) return candidate;
    }

    const downloadUrl = getJavaDownloadUrl(version);
    if (!downloadUrl) {
      console.error(`[JavaManager] No download URL for ${version}`);
      return null;
    }

    if (onProgress) onProgress({ percent: 1, status: 'İndirme başlatılıyor...' });

    // İndir (axios ile redirect takip edilir)
    // Standart Node.js stream kullanımı - güvenli path ve detaylı hata yönetimi
    if (fs.existsSync(tempZip)) try { fs.unlinkSync(tempZip); } catch { }

    let attempt = 0;
    while (attempt < MAX_RETRIES) {
      attempt++;
      try {
        const writer = fs.createWriteStream(tempZip);
        const resp = await axios({
          method: 'get', url: downloadUrl, responseType: 'stream', timeout: 120000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NexusLauncher' }
        });

        const total = parseInt(resp.headers['content-length'] || '0', 10);
        let downloaded = 0;

        resp.data.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0 && onProgress) {
            const pct = Math.round((downloaded / total) * 100);
            onProgress({ percent: pct, status: `İndiriliyor... ${pct}%` });
          } else if (onProgress) {
            onProgress({ percent: 1, status: `İndiriliyor... ${(downloaded / 1024 / 1024).toFixed(1)} MB` });
          }
        });

        resp.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
          resp.data.on('error', reject);
        });

        // Doğrulama: dosya boyutu kontrolü
        const stats = fs.statSync(tempZip);
        if (stats.size < 1000) throw new Error('İndirilen dosya çok küçük, bozuk olabilir.');

        break; // Başarılı, döngüden çık
      } catch (e) {
        console.warn(`[JavaManager] Download attempt ${attempt} failed:`, e.message || e);
        if (attempt >= MAX_RETRIES) throw new Error('İndirme başarısız: ' + (e.message || e));
        await new Promise(r => setTimeout(r, 1500 * attempt));
      }
    }

    if (onProgress) onProgress({ percent: 80, status: 'Çıkartma hazırlanıyor...' });

    // extract to temporary folder
    if (!fs.existsSync(extractTemp)) fs.mkdirSync(extractTemp, { recursive: true });
    try {
      const zip = new AdmZip(tempZip);
      zip.extractAllTo(extractTemp, true);
    } catch (e) {
      try { fs.unlinkSync(tempZip); } catch { }
      // Retry extract a couple of times in case of transient corruption
      let exAttempt = 0;
      let extracted = false;
      while (exAttempt < 2 && !extracted) {
        exAttempt++;
        try {
          const zip2 = new AdmZip(tempZip);
          zip2.extractAllTo(extractTemp, true);
          extracted = true;
          break;
        } catch (err2) {
          console.warn('[JavaManager] extract attempt failed', exAttempt, err2.message || err2);
          if (exAttempt >= 2) throw new Error('ZIP çıkarma hatası: ' + (err2.message || String(err2)));
          try { await new Promise(r => setTimeout(r, 400 * exAttempt)); } catch { }
        }
      }
    }

    // find the extracted top-level directory
    let topDirs = fs.readdirSync(extractTemp).filter(f => fs.statSync(path.join(extractTemp, f)).isDirectory());
    let sourceDir = extractTemp;
    if (topDirs.length === 1) sourceDir = path.join(extractTemp, topDirs[0]);

    // move / rename to versionDir
    if (fs.existsSync(versionDir)) {
      // remove existing
      try { fs.rmSync(versionDir, { recursive: true, force: true }); } catch { }
    }
    try {
      fs.renameSync(sourceDir, versionDir);
    } catch (e) {
      // fallback: copy recursively
      const copyRecursive = (src, dest) => {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        for (const item of fs.readdirSync(src)) {
          const s = path.join(src, item);
          const d = path.join(dest, item);
          if (fs.statSync(s).isDirectory()) copyRecursive(s, d);
          else fs.copyFileSync(s, d);
        }
      };
      copyRecursive(sourceDir, versionDir);
    }

    // cleanup temp
    try { fs.rmSync(extractTemp, { recursive: true, force: true }); } catch { }
    try { fs.unlinkSync(tempZip); } catch { }

    if (onProgress) onProgress({ percent: 95, status: 'Yürütülebilir aranıyor...' });

    // find java executable
    const candidates = [];
    const walk = (p) => {
      for (const f of fs.readdirSync(p)) {
        const full = path.join(p, f);
        try {
          const st = fs.statSync(full);
          if (st.isDirectory()) walk(full);
          else if (f.toLowerCase() === 'java.exe' || f === 'java') candidates.push(full);
        } catch { }
      }
    };
    try { walk(versionDir); } catch (e) { throw new Error('Kurulum dosyaları aranırken hata: ' + (e.message || String(e))); }

    const javaExec = candidates.find(p => p.toLowerCase().includes(path.sep + 'bin' + path.sep)) || candidates[0] || null;
    if (javaExec && fs.existsSync(javaExec)) {
      if (onProgress) onProgress({ percent: 100, status: 'Kurulum tamamlandı' });
      return javaExec;
    }

    throw new Error('Java yürütülebilir dosyası bulunamadı sonrası taşıma/çıkartma adımında.');
  } catch (e) {
    console.error('[JavaManager] Auto install error:', e);
    throw e;
  }
}

function getJavaDownloadUrl(version) {
  // Prefer Adoptium/Temurin API endpoint which redirects to the correct binary for the requested major version.
  // This supports multiple major versions (8,11,16,17,18,19,20,21 etc.)
  try {
    const v = String(version).trim();
    return `https://api.adoptium.net/v3/binary/latest/${v}/ga/windows/x64/jdk/hotspot/normal/eclipse`;
  } catch (e) {
    return `https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse`;
  }
}

module.exports = {
  detectInstalledJavas,
  selectJavaForVersion,
  getRequiredMajor,
  getSystemInfo,
  autoInstallJava,
  getJavaDownloadUrl
}
