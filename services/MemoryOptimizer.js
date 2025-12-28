const child_process = require('child_process')

let interval = null

function startFlusher(periodMs = 45000) {
  stopFlusher()
  const ps = `
    Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class MemTools {
      [DllImport(\\"psapi.dll\\")]
      public static extern bool EmptyWorkingSet(IntPtr hProcess);
    }
"@
    Get-Process | ForEach-Object { try { [MemTools]::EmptyWorkingSet($_.Handle) | Out-Null } catch {} }
  `
  interval = setInterval(() => {
    try {
      child_process.exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`)
    } catch {}
  }, periodMs)
}

function stopFlusher() {
  try { if (interval) clearInterval(interval); } catch {}
  interval = null
}

module.exports = {
  startFlusher,
  stopFlusher
}
