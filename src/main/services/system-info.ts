import { app, screen } from 'electron'
import { execFile } from 'node:child_process'
import * as os from 'node:os'

function queryWindows(command: string): Promise<string> {
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true, timeout: 5000 }, (error, stdout) => resolve(error ? '' : stdout.trim()))
  })
}

export async function getSystemInfo() {
  const display = screen.getPrimaryDisplay()
  const [caption, gpu] = await Promise.all([
    queryWindows('(Get-CimInstance Win32_OperatingSystem).Caption'),
    queryWindows('Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name')
  ])
  const pixels = display.size
  return {
    computerName: os.hostname() || 'Unavailable',
    windowsVersion: caption || os.version() || os.release(),
    cpu: os.cpus()[0]?.model || 'Unavailable',
    ram: os.totalmem() ? (os.totalmem() / 2 ** 30).toFixed(1) + ' GiB' : 'Unavailable',
    gpu: gpu.split(/\r?\n/).filter(Boolean).join(' / ') || 'Unavailable',
    screenResolution: Math.round(pixels.width * display.scaleFactor) + ' × ' + Math.round(pixels.height * display.scaleFactor),
    displayScaling: Math.round(display.scaleFactor * 100) + '%',
    appVersion: app.getVersion()
  }
}
