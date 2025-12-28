// Fabric, Forge, Quilt, NeoForge - TÜM Minecraft sürümleri desteği

const FABRIC_VERSIONS = {
  '1.16.5': '0.11.7',
  '1.17.1': '0.12.12',
  '1.18.2': '0.13.3',
  '1.19.2': '0.14.10',
  '1.19.4': '0.14.21',
  '1.20.1': '0.15.3',
  '1.20.4': '0.15.11',
  '1.20.5': '0.16.0',
  '1.21': '0.16.0',
  '1.21.1': '0.16.5'
}

const FORGE_VERSIONS = {
  '1.12.2': '14.23.5.2860',
  '1.16.5': '36.2.39',
  '1.17.1': '37.1.1',
  '1.18.2': '40.2.14',
  '1.19.2': '43.3.13',
  '1.19.3': '44.1.23',
  '1.20.1': '47.3.34',
  '1.20.4': '49.0.51',
  '1.21': '51.0.28'
}

const QUILT_VERSIONS = {
  '1.17.1': '0.12.0',
  '1.18.2': '0.16.0',
  '1.19.2': '0.19.0',
  '1.20.1': '0.21.2',
  '1.20.4': '0.22.1',
  '1.21': '0.23.0',
  '1.21.1': '0.23.5'
}

const NEOFORGE_VERSIONS = {
  '1.20.1': '47.1.106',
  '1.20.4': '49.0.51',
  '1.21': '21.0.157',
  '1.21.1': '21.1.72'
}

class VersionManager {
  // Loader'ı doğrula ve gerekli sürümleri döndür
  static getLoaderVersion(mcVersion, loaderType) {
    const versions = {
      fabric: FABRIC_VERSIONS,
      forge: FORGE_VERSIONS,
      quilt: QUILT_VERSIONS,
      neoforge: NEOFORGE_VERSIONS
    }

    if (!versions[loaderType]) {
      return null
    }

    return versions[loaderType][mcVersion] || null
  }

  // Tüm desteklenen MC sürümleri
  static getAllMinecraftVersions() {
    const allVersions = new Set([
      ...Object.keys(FABRIC_VERSIONS),
      ...Object.keys(FORGE_VERSIONS),
      ...Object.keys(QUILT_VERSIONS),
      ...Object.keys(NEOFORGE_VERSIONS)
    ])
    return Array.from(allVersions).sort((a, b) => {
      const aParts = a.split('.').map(Number)
      const bParts = b.split('.').map(Number)
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aVal = aParts[i] || 0
        const bVal = bParts[i] || 0
        if (aVal !== bVal) return bVal - aVal
      }
      return 0
    })
  }

  // Tüm desteklenen loader'ları döndür
  static getSupportedLoadersForVersion(mcVersion) {
    const loaders = []
    if (FABRIC_VERSIONS[mcVersion]) loaders.push('fabric')
    if (FORGE_VERSIONS[mcVersion]) loaders.push('forge')
    if (QUILT_VERSIONS[mcVersion]) loaders.push('quilt')
    if (NEOFORGE_VERSIONS[mcVersion]) loaders.push('neoforge')
    return loaders
  }

  // Loader'ın MC sürümünde desteklenip desteklenmediğini kontrol et
  static isLoaderSupported(mcVersion, loaderType) {
    return this.getLoaderVersion(mcVersion, loaderType) !== null
  }

  // Loader bilgisi döndür
  static getLoaderInfo(mcVersion, loaderType) {
    const loaderVersion = this.getLoaderVersion(mcVersion, loaderType)
    
    if (!loaderVersion) {
      return null
    }

    return {
      type: loaderType,
      mcVersion: mcVersion,
      loaderVersion: loaderVersion,
      name: this._getLoaderName(loaderType),
      downloadUrl: this._getDownloadUrl(mcVersion, loaderType, loaderVersion)
    }
  }

  static _getLoaderName(type) {
    const names = {
      fabric: 'Fabric',
      forge: 'Forge',
      quilt: 'Quilt',
      neoforge: 'NeoForge'
    }
    return names[type] || type
  }

  static _getDownloadUrl(mcVersion, loaderType, loaderVersion) {
    switch (loaderType) {
      case 'fabric':
        return `https://maven.fabricmc.net/net/fabricmc/fabric-installer/${loaderVersion}/fabric-installer-${loaderVersion}.jar`
      case 'forge':
        return `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${loaderVersion}/forge-${mcVersion}-${loaderVersion}-installer.jar`
      case 'quilt':
        return `https://maven.quiltmc.org/repository/release/org/quiltmc/quilt-installer/${loaderVersion}/quilt-installer-${loaderVersion}.jar`
      case 'neoforge':
        return `https://maven.neoforged.net/releases/net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`
      default:
        return null
    }
  }

  // JVM argümanlarını loader'a göre optimize et
  static getOptimizedJvmArgs(loaderType, memory = 4096) {
    const baseArgs = [
      `-Xmx${memory}M`,
      `-Xms${Math.floor(memory / 2)}M`,
      '-XX:+UseG1GC',
      '-XX:MaxGCPauseMillis=200',
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:G1NewCollectionPercentage=30',
      '-XX:G1MaxNewGenPercent=40',
      '-XX:G1HeapFragmentationTarget=5',
      '-XX:G1HeapRegionSize=16M'
    ]

    if (loaderType === 'fabric') {
      baseArgs.push('-Dfabric.skipMc=true')
    }

    if (loaderType === 'forge') {
      baseArgs.push('-XX:+ParallelRefProcEnabled')
    }

    return baseArgs
  }

  // Versiyon karşılaştırması
  static compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number)
    const parts2 = v2.split('.').map(Number)

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0
      const p2 = parts2[i] || 0
      if (p1 > p2) return 1
      if (p1 < p2) return -1
    }
    return 0
  }

  // Loader konfigürasyonu oluştur
  static createLoaderConfig(loaderType, mcVersion, modDir) {
    const fs = require('fs')
    const path = require('path')
    const configDir = path.join(modDir, 'loader-config')
    
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    const loaderInfo = this.getLoaderInfo(mcVersion, loaderType)
    if (!loaderInfo) return null

    const configFile = path.join(configDir, `${loaderType}-config.json`)
    const config = {
      loader: loaderType,
      mcVersion: mcVersion,
      loaderVersion: loaderInfo.loaderVersion,
      createdAt: new Date().toISOString(),
      mods: [],
      config: this._getDefaultLoaderConfig(loaderType)
    }

    fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
    return configFile
  }

  static _getDefaultLoaderConfig(loaderType) {
    const configs = {
      fabric: {
        incompatibilityChecker: true,
        modMenu: {
          compact: false,
          sorting: 'name'
        }
      },
      forge: {
        showWarnings: true,
        checkModList: true,
        modListFormat: 'json'
      },
      quilt: {
        modMenu: {
          compact: false
        }
      },
      neoforge: {
        experimental: false
      }
    }

    return configs[loaderType] || {}
  }

  // Minecraft sürümüne göre gerekli Java versiyonunu döndür
  static getRequiredJavaVersion(mcVersion) {
    const versionParts = mcVersion.split('.').map(Number)
    const major = versionParts[0] || 0
    const minor = versionParts[1] || 0

    // Java version requirements by Minecraft version
    if (major < 1 || (major === 1 && minor < 17)) {
      // 1.12.2 to 1.16.5 → Java 8
      return 8
    } else if (major === 1 && (minor === 17 || minor === 18 || minor === 19)) {
      // 1.17 to 1.19 → Java 16 or 17 (prefer 17)
      return 17
    } else if (major === 1 && minor === 20) {
      // 1.20 → Java 17
      return 17
    } else {
      // 1.21+ → Java 21
      return 21
    }
  }

}

module.exports = VersionManager
