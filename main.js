const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { Client, Authenticator } = require('minecraft-launcher-core');
const fs = require('fs');
const msmc = require('msmc');
const axios = require('axios');
const child_process = require('child_process');
const AdmZip = require('adm-zip');
const os = require('os');
const InstanceManager = require('./services/InstanceManager');
const JavaManager = require('./services/JavaManager');
const VersionManager = require('./services/VersionManager');
const PerformanceTweak = require('./services/PerformanceTweak');
const OSUtils = require('./services/OSUtils');
const MemoryOptimizer = require('./services/MemoryOptimizer');
// HUDManager removed - feature disabled

const launcher = new Client();
let mainWindow;
const _progressState = {};

function _shouldLogProgress(key, percent, minDelta = 3, minMs = 300) {
    try {
        if (typeof percent !== 'number' || Number.isNaN(percent)) return false;
        const now = Date.now();
        if (!_progressState[key]) _progressState[key] = { lastPercent: -999, lastTime: 0 };
        const st = _progressState[key];
        if (percent === st.lastPercent && (now - st.lastTime) < minMs) return false;
        if (Math.abs(percent - st.lastPercent) < minDelta && (now - st.lastTime) < minMs) return false;
        st.lastPercent = percent;
        st.lastTime = now;
        return true;
    } catch (e) { return true; }
}

function safeSend(channel, payload) {
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(channel, payload);
        }
    } catch { }
}

function resolveRoot(gameDir) {
    return gameDir === 'Default' ? path.join(app.getPath('appData'), '.nexus-launcher') : gameDir;
}

/**
 * Akıllı Sürüm Çözücü: Kullanıcının girdiği sürüm (ör. 1.21.11) 
 * resmi sunucularda yoksa en yakın geçerli sürümü (ör. 1.21.1) bulmaya çalışır.
 */
async function smartResolveVersion(mcVersion, type) {
    try {
        let api = "";
        if (type === 'fabric') api = "https://bmclapi2.bangbang93.com/fabric-meta/v2/versions/game";
        else if (type === 'quilt') api = "https://meta.quiltmc.org/v3/versions/game";
        else if (type === 'forge' || type === 'neoforge') api = "https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json";

        const res = await axios.get(api);
        const list = type === 'forge' || type === 'neoforge' ? res.data.versions.map(v => v.id) : res.data.map(v => v.version);

        // 1. Tam eşleşme varsa dön
        if (list.includes(mcVersion)) return mcVersion;

        // 2. Noktalara göre parçala ve en yakınını bul (ör. 1.21.11 -> 1.21.1 veya 1.21)
        const parts = mcVersion.split('.');
        if (parts.length > 2) {
            const fallback = parts.slice(0, 2).join('.'); // ör. 1.21
            const subFallback = parts.slice(0, 3).join('.').substring(0, mcVersion.lastIndexOf('.')); // ör. 1.21.1

            if (list.includes(subFallback)) return subFallback;
            if (list.includes(fallback)) return fallback;
        }

        // 3. Hiçbiri olmazsa orijinali dön (hata yönetimini çağıran yapar)
        return mcVersion;
    } catch (e) {
        return mcVersion;
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        resizable: true,
        frame: false,
        backgroundColor: '#121212',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile('index.html');
    mainWindow.removeMenu();
}

app.whenReady().then(() => {
    createWindow();
    initAutoUpdate();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- Window Controls ---
ipcMain.handle('window-minimize', async () => {
    try { if (mainWindow) mainWindow.minimize(); return { success: true }; } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('window-toggle-maximize', async () => {
    try {
        if (mainWindow) {
            if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
        }
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('window-close', async () => {
    try { if (mainWindow) mainWindow.close(); return { success: true }; } catch (e) { return { success: false, error: e.message }; }
});

// --- Version Management ---
ipcMain.handle('get-versions', async () => {
    try {
        const response = await axios.get('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
        return response.data.versions;
    } catch (error) {
        console.error('Failed to fetch versions:', error);
        return [];
    }
});

// --- File Browsing ---
ipcMain.handle('browse-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Executables', extensions: ['exe'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return (result.filePaths && result.filePaths[0]) || null;
});

ipcMain.handle('open-folder', async (event, params) => {
    try {
        let rootPath = resolveRoot(params.gameDir || 'Default');
        if (params && params.profileId) {
            rootPath = InstanceManager.ensureInstance(params.profileId);
        }
        if (!fs.existsSync(rootPath)) fs.mkdirSync(rootPath, { recursive: true });

        let target = rootPath;
        if (params.which === 'mods') target = path.join(rootPath, 'mods');
        else if (params.which === 'skins') target = path.join(rootPath, 'skins');
        else if (params.which === 'config') target = path.join(rootPath, 'config');

        if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });

        const err = await shell.openPath(target);
        if (err && err.trim().length > 0) {
            child_process.spawn('explorer', [target], { detached: true, stdio: 'ignore' });
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- Authentication ---
ipcMain.handle('login-microsoft', async () => {
    try {
        const authManager = new msmc.Auth("select_account");
        authManager.on("status", (info) => {
            console.log("[MSMC Status]", info);
            safeSend('console-log', { type: 'info', msg: `[Login] Microsoft: ${info}` });
        });

        const xboxManager = await authManager.launch("electron");
        const token = await xboxManager.getMinecraft();

        if (!token || !token.profile) {
            console.error("Login result missing profile data:", token);
            throw new Error("Microsoft hesabı doğrulandı ancak Minecraft profili bulunamadı (Oyun satın alınmamış olabilir).");
        }

        console.log("[Login] Success:", token.profile.name);
        return {
            success: true,
            username: token.profile.name,
            uuid: token.profile.id,
            token: token.mcToken
        };
    } catch (e) {
        console.error("Microsoft Login Failed Detail:", e);

        let displayError = e?.message || "Bilinmeyen bir hata oluştu.";

        // Handle msmc specific error objects
        if (e && e.ts === 'error.auth.minecraft.profile' || e?.response?.status === 404) {
            displayError = "Minecraft profili bulunamadı! Lütfen bu Microsoft hesabında Minecraft: Java Edition satın alındığından emin olun.";
        } else if (typeof displayError === 'string') {
            if (displayError.toLowerCase().includes("undefined")) {
                displayError = "Giriş işlemi iptal edildi veya veri alınamadı.";
            } else if (displayError.toLowerCase().includes("abort") || displayError.toLowerCase().includes("cancel")) {
                displayError = "Giriş işlemi iptal edildi.";
            }
        }

        return { success: false, error: displayError };
    }
});

// --- Profile & Social ---
ipcMain.handle('get-profiles', async () => {
    try {
        const rootPath = resolveRoot('Default');
        const p = path.join(rootPath, 'profiles.json');
        if (!fs.existsSync(p)) return [];
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch { return []; }
});

ipcMain.handle('save-profile', async (event, profile) => {
    try {
        const rootPath = resolveRoot('Default');
        const p = path.join(rootPath, 'profiles.json');
        let list = [];
        if (fs.existsSync(p)) {
            try { list = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { }
        }
        list.push(profile);
        fs.writeFileSync(p, JSON.stringify(list, null, 2));
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('delete-profile', async (event, id) => {
    try {
        const rootPath = resolveRoot('Default');
        const p = path.join(rootPath, 'profiles.json');
        if (!fs.existsSync(p)) return { success: true };
        let list = [];
        try { list = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { }
        list = list.filter(x => x.id !== id);
        fs.writeFileSync(p, JSON.stringify(list, null, 2));
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('delete-instance', async (event, name) => {
    try {
        const target = path.join(resolveRoot('Default'), 'instances', name);
        if (fs.existsSync(target)) {
            fs.rmSync(target, { recursive: true, force: true });
        }
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('delete-content', async (event, params) => {
    try {
        const rootPath = resolveRoot(params.gameDir || 'Default');
        let folder = 'mods';
        if (params.type === 'resourcepack') folder = 'resourcepacks';
        else if (params.type === 'shader') folder = 'shaderpacks';

        const target = path.join(rootPath, folder, params.name);
        if (fs.existsSync(target)) {
            fs.unlinkSync(target);
        }
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('delete-all-mods', async (event, params) => {
    try {
        const rootPath = resolveRoot(params.gameDir || 'Default');
        const modsDir = path.join(rootPath, 'mods');
        if (fs.existsSync(modsDir)) {
            fs.readdirSync(modsDir).forEach(f => {
                const full = path.join(modsDir, f);
                try { fs.unlinkSync(full); } catch { }
            });
        }
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('get-installed-content', async (event, params) => {
    try {
        const rootPath = resolveRoot(params.gameDir || 'Default');
        const mods = fs.existsSync(path.join(rootPath, 'mods')) ? fs.readdirSync(path.join(rootPath, 'mods')).filter(f => f.endsWith('.jar')) : [];
        const resourcepacks = fs.existsSync(path.join(rootPath, 'resourcepacks')) ? fs.readdirSync(path.join(rootPath, 'resourcepacks')) : [];
        const shaders = fs.existsSync(path.join(rootPath, 'shaderpacks')) ? fs.readdirSync(path.join(rootPath, 'shaderpacks')) : [];

        // Instances
        const instanceDir = path.join(resolveRoot('Default'), 'instances');
        const instances = fs.existsSync(instanceDir) ? fs.readdirSync(instanceDir).map(name => {
            let version = 'Bilinmiyor';
            try {
                const configPath = path.join(instanceDir, name, 'nexus_config.json');
                if (fs.existsSync(configPath)) {
                    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    version = cfg.version || version;
                }
            } catch { }
            return { name, version };
        }) : [];

        return { mods, resourcepacks, shaders, instances };
    } catch { return { mods: [], resourcepacks: [], shaders: [], instances: [] }; }
});

// --- Modrinth Integration ---
ipcMain.handle('modrinth-search', async (event, params) => {
    try {
        const facets = [];
        if (params.type) facets.push([`project_type:${params.type}`]);
        if (params.loader) facets.push([`categories:${params.loader}`]);
        if (params.mcVersion) facets.push([`versions:${params.mcVersion}`]);

        const facetsStr = facets.length > 0 ? `&facets=${encodeURIComponent(JSON.stringify(facets))}` : '';
        const limit = params.limit || 60;
        const offset = params.offset || 0;
        const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(params.query || '')}&limit=${limit}&offset=${offset}${facetsStr}`;
        const res = await axios.get(url, { headers: { 'User-Agent': 'NexusLauncher/1.0' } });
        return res.data.hits || [];
    } catch { return []; }
});

ipcMain.handle('modrinth-browse', async (event, params) => {
    try {
        const facets = [];
        const type = params.type || 'modpack';
        facets.push([`project_type:${type}`]);
        if (params.loader) facets.push([`categories:${params.loader}`]);
        if (params.category) facets.push([`categories:${params.category}`]);
        if (params.mcVersion) facets.push([`versions:${params.mcVersion}`]);

        const limit = params.limit || 20;
        const offset = params.offset || 0;
        const url = `https://api.modrinth.com/v2/search?limit=${limit}&offset=${offset}&facets=${encodeURIComponent(JSON.stringify(facets))}`;
        const res = await axios.get(url, { headers: { 'User-Agent': 'NexusLauncher/1.0' } });
        return res.data.hits || [];
    } catch { return []; }
});

ipcMain.handle('modrinth-install', async (event, params) => {
    try {
        const { id, projectId, loader, gameDir, mcVersion, type } = params;
        const finalId = id || projectId;
        const rootPath = resolveRoot(gameDir || 'Default');

        // Target Dirs
        let targetDir = path.join(rootPath, 'mods');
        if (type === 'resourcepack') targetDir = path.join(rootPath, 'resourcepacks');
        else if (type === 'shader') targetDir = path.join(rootPath, 'shaderpacks');

        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        safeSend('console-log', { type: 'info', msg: `[Modrinth] Sürüm aranıyor: ${finalId}` });
        const versionsUrl = `https://api.modrinth.com/v2/project/${finalId}/version`;
        const res = await axios.get(versionsUrl, { headers: { 'User-Agent': 'NexusLauncher/1.0' } });
        const versions = res.data;

        let chosen = null;
        for (const v of versions) {
            const loaderOk = (!loader || !v.loaders || v.loaders.includes(loader));
            const versionOk = (!mcVersion || (v.game_versions && v.game_versions.includes(mcVersion)));
            if (loaderOk && versionOk) { chosen = v; break; }
        }
        if (!chosen) chosen = versions[0];
        if (!chosen) return { success: false, error: 'Uygun sürüm bulunamadı' };

        const files = chosen.files || [];
        const mrpack = files.find(f => f.filename && f.filename.endsWith('.mrpack'));
        if (mrpack) {
            safeSend('console-log', { type: 'info', msg: `[Modrinth] Modpack indiriliyor: ${mrpack.filename}` });
            const tmp = path.join(rootPath, 'cache', mrpack.filename);
            if (!fs.existsSync(path.dirname(tmp))) fs.mkdirSync(path.dirname(tmp), { recursive: true });
            await downloadTo(mrpack.url, tmp);
            await importMrpackFile(tmp, rootPath);
            return { success: true };
        }

        const primaryFile = files.find(f => f.primary) || files[0];
        if (!primaryFile) return { success: false, error: 'Dosya bulunamadı' };

        safeSend('console-log', { type: 'info', msg: `[Modrinth] Dosya indiriliyor: ${primaryFile.filename}` });
        const dest = path.join(targetDir, primaryFile.filename);
        await downloadTo(primaryFile.url, dest);
        safeSend('console-log', { type: 'success', msg: `[Modrinth] İşlem tamam: ${path.basename(dest)}` });
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('modrinth-project-versions', async (event, params) => {
    try {
        const id = params.id || params.projectId;
        if (!id) return [];
        const url = `https://api.modrinth.com/v2/project/${id}/version`;
        const res = await axios.get(url, { headers: { 'User-Agent': 'NexusLauncher/1.0' } });
        return res.data || [];
    } catch { return []; }
});

ipcMain.handle('modrinth-list-modpacks', async (event, params = {}) => {
    try {
        const facets = encodeURIComponent(JSON.stringify([["project_type:modpack"]]));
        const limit = params.limit || 60;
        const offset = params.offset || 0;
        const url = `https://api.modrinth.com/v2/search?limit=${limit}&offset=${offset}&facets=${facets}`;
        const res = await axios.get(url, { headers: { 'User-Agent': 'NexusLauncher/1.0' } });
        return res.data.hits || [];
    } catch { return []; }
});

// --- Nexus Integrations ---

ipcMain.handle('install-voice-mod', async (event, params) => {
    try {
        const { slug, gameDir, loader, mcVersion } = params || {};
        const rootPath = resolveRoot(gameDir || 'Default');
        const versionsUrl = `https://api.modrinth.com/v2/project/${slug}/version`;
        const res = await axios.get(versionsUrl, { headers: { 'User-Agent': 'NexusLauncher/1.0' } });
        const versions = res.data;

        const targetLoader = (loader || 'vanilla').toLowerCase();

        // Find best match: check exact mcVersion, or if mcVersion starts with the game version (e.g., 1.20 matches 1.20.1)
        let chosen = versions.find(v => (v.loaders.includes(targetLoader)) && v.game_versions.some(gv => gv === mcVersion || mcVersion.startsWith(gv)));

        if (!chosen) {
            // Fallback: just match loader
            chosen = versions.find(v => v.loaders.includes(targetLoader));
        }

        if (!chosen) return { success: false, error: 'Uyumlu sürüm bulunamadı.' };

        const jar = chosen.files.find(f => f.filename.endsWith('.jar') && f.primary) || chosen.files.find(f => f.filename.endsWith('.jar')) || chosen.files[0];
        const modsDir = path.join(rootPath, 'mods');
        if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });

        const dest = path.join(modsDir, jar.filename);
        await downloadTo(jar.url, dest);
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

// --- HUD Settings (Removed) ---
// HUD feature has been disabled

// --- Game Installers & Tools ---
ipcMain.handle('run-optifine-installer', async (event, params) => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'JAR', extensions: ['jar'] }] });
        const jar = result.filePaths[0];
        if (!jar) return { success: false };
        child_process.spawn('java', ['-jar', jar], { detached: true, stdio: 'ignore' });
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('import-mrpack-local', async (event, params) => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'MRPACK', extensions: ['mrpack'] }] });
        if (result.filePaths[0]) {
            await importMrpackFile(result.filePaths[0], resolveRoot(params.gameDir || 'Default'));
            return { success: true };
        }
        return { success: false };
    } catch (e) { return { success: false, error: e.message }; }
});

// --- Memory & Performance Helpers ---
function computeOptimalRamMB() {
    const total = Math.floor(os.totalmem() / (1024 * 1024));
    return Math.max(2048, Math.min(Math.floor(total * 0.5), 8192));
}

function buildJVMArgs(javaExe, ramMB, mcVersion, profileId) {
    const args = PerformanceTweak.buildNexusJvmFlags(javaExe, ramMB, mcVersion) || [];
    const cfg = InstanceManager.readConfig(profileId || null);
    if (cfg?.authlibInjectorUrl) {
        const jar = path.join(InstanceManager.instanceRoot(profileId || null), 'cache', 'authlib-injector.jar');
        if (fs.existsSync(jar)) args.push(`-javaagent:${jar}=${cfg.authlibInjectorUrl}`);
    }
    return args;
}

// --- Game Launch Core Logic ---
ipcMain.on('launch-game', async (event, options) => {
    const { username, version, ram, gameDir, javaPath, authType, modLoader, uuid, accessToken, profileId } = options;
    const rootPath = gameDir === 'Default' ? InstanceManager.ensureInstance(profileId || username) : gameDir;

    if (!fs.existsSync(rootPath)) fs.mkdirSync(rootPath, { recursive: true });

    // Validate inputs
    if (!username || !version) {
        safeSend('console-log', { type: 'error', msg: '[Launch] Kullanıcı adı veya sürüm seçilmedi!' });
        return safeSend('launch-error', 'Lütfen kullanıcı ve sürüm seçiniz.');
    }

    let auth = authType === 'microsoft' ? { access_token: accessToken, client_token: uuid, uuid: uuid, name: username, meta: { type: 'msa' } } : Authenticator.getAuth(username);

    // Get java path if not provided or invalid
    let finalJavaPath = javaPath;
    let requiredJavaVersion = VersionManager.getRequiredJavaVersion(version);

    if (!finalJavaPath || finalJavaPath.trim() === '' || !fs.existsSync(finalJavaPath)) {
        // Otomatik tespit etmeyi deneyelim
        const detected = JavaManager.detectInstalledJavas();
        const suitable = detected.find(j => j.major >= requiredJavaVersion) || detected[0];

        if (suitable && fs.existsSync(suitable.path)) {
            finalJavaPath = suitable.path;
            safeSend('console-log', { type: 'info', msg: `[Java] Otomatik tespit: ${finalJavaPath}` });
        } else {
            // Hiç bulunamadıysa indirme başlat
            safeSend('console-log', { type: 'warn', msg: `[Java] Gereksinim karşılanamadı. Kurulum başlatılıyor...` });
            safeSend('auto-install-java-prompt', { version: requiredJavaVersion, autoStart: true });

            try {
                const autoInstalledPath = await JavaManager.autoInstallJava(requiredJavaVersion, (progress) => {
                    safeSend('java-install-progress', progress);
                    const pct = Number(progress?.percent) || 0;
                    if (_shouldLogProgress('java', pct)) {
                        if (progress && progress.status) safeSend('console-log', { type: 'info', msg: `[Java] ${progress.status}` });
                    }
                });

                if (autoInstalledPath) {
                    finalJavaPath = autoInstalledPath;
                    safeSend('console-log', { type: 'success', msg: `[Java] Java ${requiredJavaVersion} kuruldu: ${autoInstalledPath}` });
                } else {
                    safeSend('console-log', { type: 'error', msg: `[Java] Java kurulum başarısız oldu!` });
                    return safeSend('launch-error', `Java kurulması başarısız. Lütfen manuel kurulum yapın.`);
                }
            } catch (e) {
                safeSend('console-log', { type: 'error', msg: `[Java] Kurulum hatası: ${e.message}` });
                return safeSend('launch-error', `Java kurulması başarısız: ${e.message}`);
            }
        }
    }

    const launchOptions = {
        authorization: auth,
        root: rootPath,
        version: { number: version, type: "release" },
        memory: { max: Number(ram) || computeOptimalRamMB(), min: Math.floor((Number(ram) || computeOptimalRamMB()) / 2) },
        javaPath: finalJavaPath,
        // EMFILE: too many open files hatası için indirme limitlerini düşürelim
        overrides: {
            detached: false,
            // MCL-Core içindeki indirme havuzunu kısıtlar (EMFILE hatasını önler)
            maxSockets: 25,
            // İndirmelerin daha stabil olması için BMCLAPI mirrorlarını kullanalım
            url: {
                resource: "https://bmclapi2.bangbang93.com/assets",
                library: "https://bmclapi2.bangbang93.com/maven"
            }
        }
    };


    // JVM Args
    const jvmArgs = buildJVMArgs(launchOptions.javaPath, launchOptions.memory.max, version, profileId);
    if (jvmArgs.length > 0) process.env._JAVA_OPTIONS = jvmArgs.join(' ');

    // Mod Loaders
    if (modLoader === 'vanilla') {
        // Vanilla - no extra steps
    } else if (modLoader === 'forge' || modLoader === 'neoforge') {
        try {
            safeSend('console-log', { type: 'info', msg: `[${modLoader.toUpperCase()}] Sürüm kontrol ediliyor: ${version}` });

            let installer = await (modLoader === 'forge' ? ensureForge(version, rootPath) : ensureNeoForge(version, rootPath));

            if (!installer) {
                safeSend('console-log', { type: 'info', msg: `[${modLoader.toUpperCase()}] Installer bulunamadı, indiriliyor...` });
                installer = await downloadLoaderInstaller(modLoader, version, rootPath);
            }

            if (installer) {
                launchOptions.forge = installer;
                safeSend('console-log', { type: 'success', msg: `[${modLoader.toUpperCase()}] Kurulum hazır.` });
            } else {
                throw new Error(`${modLoader.toUpperCase()} installer bulunamadı veya indirilemedi.`);
            }
        } catch (e) {
            safeSend('console-log', { type: 'error', msg: `[${modLoader.toUpperCase()}] Hata: ${e.message}` });
            return safeSend('launch-error', e.message);
        }
    } else if (modLoader === 'fabric' || modLoader === 'quilt') {
        try {
            // First, try BMCLAPI mirror for speed and stability
            let api = modLoader === 'fabric' ? 'https://bmclapi2.bangbang93.com/fabric-meta/v2' : 'https://meta.quiltmc.org/v3';

            // Handle potentially non-standard versions dynamically
            const mcVersionToFetch = await smartResolveVersion(version, modLoader);

            if (mcVersionToFetch !== version) {
                safeSend('console-log', { type: 'warn', msg: `[${modLoader.toUpperCase()}] ${version} için loader bulunamadı, ${mcVersionToFetch} deneniyor...` });
            }

            safeSend('console-log', { type: 'info', msg: `[${modLoader.toUpperCase()}] Loader bilgisi alınıyor: MC ${mcVersionToFetch}` });

            let loaderRes;
            try {
                loaderRes = await axios.get(`${api}/versions/loader/${mcVersionToFetch}`);
            } catch (e) {
                // If BMCLAPI fails, fallback to official
                api = modLoader === 'fabric' ? 'https://meta.fabricmc.net/v2' : 'https://meta.quiltmc.org/v3';
                loaderRes = await axios.get(`${api}/versions/loader/${mcVersionToFetch}`);
            }

            if (loaderRes.data && loaderRes.data.length > 0) {
                const loaderVer = loaderRes.data[0].loader.version;
                safeSend('console-log', { type: 'info', msg: `[${modLoader.toUpperCase()}] Loader: ${loaderVer} bulundu.` });

                const metaUrl = `${api}/versions/loader/${mcVersionToFetch}/${loaderVer}/profile/json`;
                const versionJson = await axios.get(metaUrl);

                const versionsDir = path.join(rootPath, 'versions', `${modLoader}-${version}`);
                if (!fs.existsSync(versionsDir)) fs.mkdirSync(versionsDir, { recursive: true });
                fs.writeFileSync(path.join(versionsDir, `${modLoader}-${version}.json`), JSON.stringify(versionJson.data));

                // IMPORTANT: Use the base resolved version for .number, and custom name for .custom
                launchOptions.version.number = mcVersionToFetch;
                launchOptions.version.custom = `${modLoader}-${version}`;
                safeSend('console-log', { type: 'success', msg: `[${modLoader.toUpperCase()}] Başarı: ${modLoader.toUpperCase()} hazır.` });
            } else {
                throw new Error(`Bu sürüm [${mcVersionToFetch}] için ${modLoader.toUpperCase()} loader bulunamadı.`);
            }
        } catch (e) {
            safeSend('console-log', { type: 'error', msg: `[${modLoader.toUpperCase()}] Kritik Hata: ${e.message}` });
            safeSend('console-log', { type: 'warn', msg: `[${modLoader.toUpperCase()}] Vanilla (modsuz) olarak başlatılacak.` });
        }
    }

    // Set up listeners BEFORE launching
    launcher.removeAllListeners();
    launcher.on('data', (e) => safeSend('console-log', { type: 'game', msg: e }));
    launcher.on('progress', (e) => {
        const percent = Math.round((e.task / (e.total || 1)) * 100);
        if (_shouldLogProgress('launcher', percent)) {
            safeSend('progress', { percent, status: `${e.type}: ${e.task}/${e.total || '?'}` });
            safeSend('console-log', { type: 'info', msg: `[Download] ${e.type} indiriliyor: ${percent}%` });
        }
    });
    launcher.on('download-status', (e) => {
        safeSend('console-log', { type: 'info', msg: `[Download] Status: ${e.name} (${e.current}/${e.total})` });
    });
    launcher.on('debug', (e) => safeSend('console-log', { type: 'debug', msg: e }));
    launcher.on('error', (e) => {
        safeSend('console-log', { type: 'error', msg: `[LaunchError] ${e}` });
        safeSend('launch-error', e);
    });
    launcher.on('spawn', () => {
        safeSend('console-log', { type: 'success', msg: '[Launch] Oyun penceresi açıldı, launcher gizleniyor.' });
        if (mainWindow) mainWindow.hide();
    });
    launcher.on('close', (e) => {
        safeSend('console-log', { type: 'info', msg: `[Game] Kapandı. Kod: ${e}` });
        safeSend('launch-status', 'stopped');
        MemoryOptimizer.stopFlusher();

        // Oyun kapanınca launcher geri gelsin
        if (mainWindow) mainWindow.show();
    });

    try {
        safeSend('console-log', { type: 'info', msg: `[Launch] Başlatılıyor... Java: ${finalJavaPath}` });
        safeSend('console-log', { type: 'debug', msg: `[Launch] Launch Options: ${JSON.stringify({ ...launchOptions, javaPath: 'hidden' })}` });
        // Notify renderer that launch is starting
        safeSend('launch-status', 'starting');
        launcher.launch(launchOptions);
        safeSend('console-log', { type: 'success', msg: `[Launch] ${version} oyunu başlatıldı!` });

        // Pencereyi hemen gizlemiyoruz, kullanıcı indirme detaylarını görsün.
    } catch (e) {
        let errorMsg = e.message || String(e);
        console.error('[LaunchError] Full error:', e);
        if (errorMsg.includes('java') && (errorMsg.includes('not recognized') || errorMsg.includes('not found') || errorMsg.includes('spawn') || errorMsg.includes('ENOENT'))) {
            safeSend('console-log', { type: 'error', msg: `[Java] Java bulunamadı! Otomatik kurulum deneniyor...` });
            try {
                const autoInstalledPath = await JavaManager.autoInstallJava(requiredJavaVersion || '21', (progress) => {
                    safeSend('java-install-progress', progress);
                    const pct = Number(progress?.percent) || 0;
                    if (_shouldLogProgress('java', pct)) {
                        if (progress && progress.status) safeSend('console-log', { type: 'info', msg: `[Java] ${progress.status}` });
                    }
                });
                if (autoInstalledPath) {
                    finalJavaPath = autoInstalledPath;
                    launchOptions.javaPath = finalJavaPath;
                    process.env.JAVA_HOME = path.dirname(path.dirname(finalJavaPath));
                    process.env.PATH = `${path.join(process.env.JAVA_HOME, 'bin')};${process.env.PATH}`;
                    safeSend('console-log', { type: 'success', msg: `[Java] Otomatik kurulum başarılı: ${finalJavaPath}. Yeniden başlatılıyor...` });
                    try {
                        launcher.launch(launchOptions);
                        safeSend('console-log', { type: 'success', msg: `[Launch] ${version} oyunu başlatıldı!` });
                        return;
                    } catch (e2) {
                        safeSend('console-log', { type: 'error', msg: `[Launch] Yeniden başlatma başarısız: ${e2.message}` });
                        return safeSend('launch-error', e2.message);
                    }
                } else {
                    safeSend('console-log', { type: 'error', msg: `[Java] Java otomatik kurulamadı.` });
                    return safeSend('launch-error', 'Java bulunamadı ve otomatik kurulum başarısız.');
                }
            } catch (installErr) {
                safeSend('console-log', { type: 'error', msg: `[Java] Otomatik kurulum hatası: ${installErr.message}` });
                return safeSend('launch-error', installErr.message);
            }
        }
        safeSend('console-log', { type: 'error', msg: `[Launch] Kritik hata: ${errorMsg}` });
        safeSend('launch-error', errorMsg);
    }

    OSUtils.setHighPriorityForJavaProcesses();
    MemoryOptimizer.startFlusher(45000);
}
);

ipcMain.handle('stop-launch', async () => {
    try {
        try { launcher.kill(); } catch (e) { console.error('stop-launch: kill failed', e); }
        try { launcher.removeAllListeners(); } catch (e) { }
        safeSend('launch-status', 'stopped');
        safeSend('console-log', { type: 'info', msg: '[Launch] Başlatma işlemi kullanıcı tarafından iptal edildi.' });
        return { success: true };
    } catch (e) {
        console.error('stop-launch error', e);
        return { success: false, error: e.message };
    }
});

// --- Skin System ---
ipcMain.handle('enable-custom-skin-mod', async (event, params) => {
    try {
        const rootPath = InstanceManager.ensureInstance(params.profileId);
        const dest = path.join(rootPath, 'mods', 'CustomSkinLoader.jar');
        if (fs.existsSync(dest)) return { success: true };
        await downloadTo('https://github.com/CustomSkinLoader/CustomSkinLoader/releases/download/v14.13/CustomSkinLoader_Forge-14.13.jar', dest);
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('apply-offline-skin', async (event, params) => {
    try {
        const { username, filePath, profileId } = params;
        const root = InstanceManager.ensureInstance(profileId);
        const skinsDir = path.join(root, 'skins');
        if (!fs.existsSync(skinsDir)) fs.mkdirSync(skinsDir, { recursive: true });
        fs.copyFileSync(filePath, path.join(skinsDir, `${username}.png`));
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('get-skins', async (event, params) => {
    const root = InstanceManager.ensureInstance(params.profileId);
    const skinsDir = path.join(root, 'skins');
    if (!fs.existsSync(skinsDir)) return [];
    return fs.readdirSync(skinsDir).filter(f => f.endsWith('.png')).map(f => ({ name: f, path: path.join(skinsDir, f) }));
});

ipcMain.handle('fetch-catalog-skins', async () => {
    try {
        // En popüler skinlerin bir kısmını getir
        const catalog = [
            { name: 'Dream', url: 'https://minotar.net/skin/Dream' },
            { name: 'Technoblade', url: 'https://minotar.net/skin/Technoblade' },
            { name: 'GeorgeNotFound', url: 'https://minotar.net/skin/GeorgeNotFound' },
            { name: 'Sapnap', url: 'https://minotar.net/skin/Sapnap' },
            { name: 'DanTDM', url: 'https://minotar.net/skin/DanTDM' },
            { name: 'PewDiePie', url: 'https://minotar.net/skin/PewDiePie' },
            { name: 'CaptainSparklez', url: 'https://minotar.net/skin/CaptainSparklez' },
            { name: 'MrBeast', url: 'https://minotar.net/skin/MrBeast' }
        ];
        return catalog;
    } catch { return []; }
});

ipcMain.handle('download-catalog-skin', async (event, params) => {
    try {
        const { name, url, profileId } = params || {};
        const root = InstanceManager.ensureInstance(profileId || null);
        const skinsDir = path.join(root, 'skins');
        if (!fs.existsSync(skinsDir)) fs.mkdirSync(skinsDir, { recursive: true });
        const safeName = (name || `skin-${Date.now()}`).replace(/[^a-zA-Z0-9-_\.]/g, '_');
        const dest = path.join(skinsDir, `${safeName}.png`);
        await downloadTo(url, dest);
        return { success: true, path: dest };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('remove-skin', async (event, params) => {
    try {
        if (fs.existsSync(params.path)) fs.unlinkSync(params.path);
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

// --- Global Utilities ---
async function downloadTo(url, dest) {
    const writer = fs.createWriteStream(dest);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        timeout: 30000,
        headers: { 'User-Agent': 'NexusLauncher/1.0' }
    });

    if (response.status !== 200) {
        throw new Error(`Download failed with status ${response.status}`);
    }

    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            writer.close();
            resolve();
        });
        writer.on('error', (err) => {
            fs.unlink(dest, () => { }); // Delete partial file
            reject(err);
        });
    });
}

async function importMrpackFile(filePath, rootPath) {
    const zip = new AdmZip(filePath);
    const tempDir = path.join(rootPath, 'cache', 'mrpack_tmp');
    zip.extractAllTo(tempDir, true);
    const index = JSON.parse(fs.readFileSync(path.join(tempDir, 'modrinth.index.json'), 'utf-8'));
    for (const f of index.files) {
        const dl = f.downloads[0];
        const dest = path.join(rootPath, f.path);
        if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
        await downloadTo(dl, dest);
    }
    const overrides = path.join(tempDir, 'overrides');
    if (fs.existsSync(overrides)) copyRecursive(overrides, rootPath);
    fs.rmSync(tempDir, { recursive: true, force: true });
    safeSend('console-log', { type: 'success', msg: '[Modpack] Kurulu tamamlandı' });
}

function copyRecursive(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src, { withFileTypes: true }).forEach(entry => {
        const s = path.join(src, entry.name), d = path.join(dest, entry.name);
        entry.isDirectory() ? copyRecursive(s, d) : fs.copyFileSync(s, d);
    });
}

// --- Auto Update ---
function initAutoUpdate() {
    autoUpdater.on('update-available', (info) => safeSend('update-available', info));
    autoUpdater.on('update-not-available', () => safeSend('update-not-available'));
    autoUpdater.on('download-progress', (data) => safeSend('update-progress', data));
    autoUpdater.on('update-downloaded', (info) => safeSend('update-downloaded', info));
    autoUpdater.on('error', (err) => safeSend('update-error', err.message));

    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify().catch(e => console.error("AutoUpdate Failed:", e));
    }
}

ipcMain.handle('check-for-updates', async () => {
    try {
        const result = await autoUpdater.checkForUpdates();
        return { success: true, updateInfo: result?.updateInfo };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('download-update', async () => {
    try {
        await autoUpdater.downloadUpdate();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('quit-and-install', async () => {
    autoUpdater.quitAndInstall();
});

ipcMain.handle('check-java-installed', async () => {
    try {
        const javas = JavaManager.detectInstalledJavas();
        if (javas && javas.length > 0) {
            // Java found
            const bestJava = javas.find(j => j.major >= 17) || javas[0];
            return {
                success: true,
                installed: true,
                javaPath: bestJava.path,
                version: bestJava.major
            };
        }
        // No Java found
        return { success: true, installed: false };
    } catch (e) {
        console.error('[Check Java] Error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('auto-install-java', async (event, params) => {
    try {
        const version = params?.version || '21';

        safeSend('console-log', { type: 'info', msg: `[Java] Otomatik kurulum: JDK ${version} (kullanıcı dizinine)` });

        const resultPath = await JavaManager.autoInstallJava(version, (progress) => {
            safeSend('java-install-progress', progress);
            if (progress && progress.status) safeSend('console-log', { type: 'info', msg: `[Java] ${progress.status}` });
        });

        if (!resultPath) {
            throw new Error('Java otomatik kurulamadı (bilinmeyen neden)');
        }

        // Set JAVA_HOME and PATH for this process
        const javaInstallPath = path.dirname(path.dirname(resultPath));
        process.env.JAVA_HOME = javaInstallPath;
        process.env.PATH = `${path.join(javaInstallPath, 'bin')};${process.env.PATH}`;

        safeSend('console-log', { type: 'success', msg: `[Java] Java ${version} kuruldu: ${resultPath}` });
        return { success: true, javaPath: resultPath, javaVersion: version };
    } catch (e) {
        console.error('[Java Auto-Install] Error:', e);
        const msg = e && e.message ? e.message : String(e);
        safeSend('console-log', { type: 'error', msg: `[Java] Kurulum hatası: ${msg}` });
        return { success: false, error: msg };
    }
});

async function ensureForge(version, rootPath) {
    const versionsDir = path.join(rootPath, 'versions');
    if (fs.existsSync(versionsDir)) {
        const files = fs.readdirSync(versionsDir);
        const match = files.find(f => f.toLowerCase().includes('forge') && f.includes(version) && f.endsWith('.jar'));
        if (match) {
            const fullPath = path.join(versionsDir, match);
            const stats = fs.statSync(fullPath);
            if (stats.size > 1024 * 100) return fullPath; // At least 100kb
            else fs.unlinkSync(fullPath); // Delete corrupted small file
        }
    }
    return null;
}

async function ensureNeoForge(version, rootPath) {
    const versionsDir = path.join(rootPath, 'versions');
    if (fs.existsSync(versionsDir)) {
        const files = fs.readdirSync(versionsDir);
        const match = files.find(f => f.toLowerCase().includes('neoforge') && f.includes(version) && f.endsWith('.jar'));
        if (match) {
            const fullPath = path.join(versionsDir, match);
            const stats = fs.statSync(fullPath);
            if (stats.size > 1024 * 100) return fullPath;
            else fs.unlinkSync(fullPath);
        }
    }
    return null;
}

async function downloadLoaderInstaller(type, mcVersion, rootPath) {
    try {
        const versionsDir = path.join(rootPath, 'versions');
        if (!fs.existsSync(versionsDir)) fs.mkdirSync(versionsDir, { recursive: true });

        // Normalize version dynamically
        const resolvedMcVer = await smartResolveVersion(mcVersion, type);

        if (resolvedMcVer !== mcVersion) {
            safeSend('console-log', { type: 'warn', msg: `[${type.toUpperCase()}] ${mcVersion} geçersiz, ${resolvedMcVer} üzerinden kuruluyor.` });
        }

        let url = '';
        let fileName = '';

        if (type === 'forge') {
            safeSend('console-log', { type: 'info', msg: `[Forge] ${resolvedMcVer} için installer aranıyor...` });

            // Try BMCLAPI first
            try {
                const res = await axios.get(`https://bmclapi2.bangbang93.com/forge/minecraft/${resolvedMcVer}`);
                if (res.data && res.data.length > 0) {
                    const latest = res.data.sort((a, b) => new Date(b.modified) - new Date(a.modified))[0];
                    url = `https://bmclapi2.bangbang93.com/forge/download?mcversion=${resolvedMcVer}&version=${latest.version}&category=installer&format=jar`;
                    fileName = `forge-${mcVersion}-${latest.version}-installer.jar`;
                }
            } catch (e) {
                safeSend('console-log', { type: 'warn', msg: `[Forge] BMCLAPI üzerinden liste alınamadı.` });
            }

            // Fallback
            if (!url) {
                url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${resolvedMcVer}-latest/forge-${resolvedMcVer}-latest-installer.jar`;
                fileName = `forge-${mcVersion}-installer.jar`;
            }
        } else if (type === 'neoforge') {
            safeSend('console-log', { type: 'info', msg: `[NeoForge] ${resolvedMcVer} için installer aranıyor...` });
            try {
                const res = await axios.get(`https://bmclapi2.bangbang93.com/neoforge/minecraft/${resolvedMcVer}`);
                if (res.data && res.data.length > 0) {
                    const latest = res.data[0];
                    url = `https://bmclapi2.bangbang93.com/neoforge/download/${latest.version}?format=jar`;
                    fileName = `neoforge-${latest.version}-installer.jar`;
                }
            } catch (e) { }

            if (!url) {
                url = `https://bmclapi2.bangbang93.com/neoforge/minecraft/${resolvedMcVer}/latest/installer.jar`;
                fileName = `neoforge-${mcVersion}-installer.jar`;
            }
        }

        if (url) {
            const dest = path.join(versionsDir, fileName);
            safeSend('console-log', { type: 'info', msg: `[Loader] İndiriliyor: ${url}` });
            await downloadTo(url, dest);

            // Verify download
            const stats = fs.statSync(dest);
            if (stats.size < 100 * 1024) {
                throw new Error("İndirilen dosya geçersiz veya çok küçük.");
            }

            return dest;
        }
    } catch (e) {
        safeSend('console-log', { type: 'error', msg: `[LoaderDownloader] Kritik Hata: ${e.message}` });
    }
    return null;
}
