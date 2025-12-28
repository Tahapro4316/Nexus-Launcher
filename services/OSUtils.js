const child_process = require('child_process')

function setHighPriorityForJavaProcesses() {
  try {
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "$procs = Get-Process java,javaw -ErrorAction SilentlyContinue; foreach ($p in $procs) { try { $p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::High } catch {} }"`
    child_process.exec(cmd)
  } catch {}
}

module.exports = {
  setHighPriorityForJavaProcesses
}
