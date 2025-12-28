const JavaManager = require('./JavaManager')

function buildNexusJvmFlags(javaExe, ramMB, mcVersion) {
  const major = JavaManager.getRequiredMajor(mcVersion)
  const args = []
  const xmx = `${ramMB}M`
  args.push(`-Xms${xmx}`)
  args.push(`-Xmx${xmx}`)
  args.push(`-XX:+UnlockExperimentalVMOptions`)
  if (major >= 21) {
    args.push(`-XX:+UseZGC`)
    args.push(`-XX:+ZGenerational`)
    args.push(`-XX:ZCollectionInterval=5`)
    args.push(`-XX:MaxGCPauseMillis=10`)
  } else {
    args.push(`-XX:+UseG1GC`)
    args.push(`-XX:MaxGCPauseMillis=10`)
    args.push(`-XX:+AlwaysPreTouch`)
    args.push(`-XX:+StringDeduplication`)
  }
  return args
}

module.exports = {
  buildNexusJvmFlags
}
