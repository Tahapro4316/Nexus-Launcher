const { app } = require('electron')
const fs = require('fs')
const path = require('path')

function baseRoot() {
  return path.join(app.getPath('appData'), '.nexus-launcher')
}

function sharedStorageRoot() {
  return path.join(baseRoot(), 'shared_storage')
}

function instanceRoot(profileId) {
  return path.join(baseRoot(), 'instances', String(profileId || 'default'))
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

function ensureLink(target, linkPath) {
  try {
    if (fs.existsSync(linkPath)) return
    fs.symlinkSync(target, linkPath, 'junction')
  } catch {}
}

function ensureInstance(profileId) {
  const root = instanceRoot(profileId)
  const shared = sharedStorageRoot()
  ensureDir(baseRoot())
  ensureDir(shared)
  ensureDir(path.join(shared, 'assets'))
  ensureDir(path.join(shared, 'libraries'))
  ensureDir(root)
  ensureLink(path.join(shared, 'assets'), path.join(root, 'assets'))
  ensureLink(path.join(shared, 'libraries'), path.join(root, 'libraries'))
  const cfg = path.join(root, 'instance-config.json')
  if (!fs.existsSync(cfg)) {
    const data = { version: null, mods: [], options: {}, authlibInjectorUrl: null }
    fs.writeFileSync(cfg, JSON.stringify(data, null, 2))
  }
  return root
}

function readConfig(profileId) {
  const root = instanceRoot(profileId)
  const cfg = path.join(root, 'instance-config.json')
  if (!fs.existsSync(cfg)) return {}
  try { return JSON.parse(fs.readFileSync(cfg, 'utf-8')) } catch { return {} }
}

function writeConfig(profileId, data) {
  const root = instanceRoot(profileId)
  ensureDir(root)
  const cfg = path.join(root, 'instance-config.json')
  fs.writeFileSync(cfg, JSON.stringify(data || {}, null, 2))
}

function updateConfig(profileId, patch) {
  const current = readConfig(profileId)
  const next = Object.assign({}, current, patch || {})
  writeConfig(profileId, next)
  return next
}

module.exports = {
  ensureInstance,
  instanceRoot,
  sharedStorageRoot,
  readConfig,
  writeConfig,
  updateConfig
}
