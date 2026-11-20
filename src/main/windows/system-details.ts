import { registerWindow } from './roles'
import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let systemDetailsWindow: BrowserWindow | null = null

export function createSystemDetailsWindow(): void {
  if (systemDetailsWindow && !systemDetailsWindow.isDestroyed()) {
    if (systemDetailsWindow.isMinimized()) systemDetailsWindow.restore()
    systemDetailsWindow.focus()
    return
  }

  systemDetailsWindow = new BrowserWindow({
    width: 440,
    height: 460,
    frame: true,
    center: true,
    resizable: false,
    skipTaskbar: false,
    alwaysOnTop: false,
    show: false,
    title: 'System Details',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  registerWindow(systemDetailsWindow, 'system-details')

  systemDetailsWindow.on('ready-to-show', () => {
    systemDetailsWindow?.show()
  })

  systemDetailsWindow.on('closed', () => {
    systemDetailsWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    systemDetailsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?window=system-details`)
  } else {
    systemDetailsWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { window: 'system-details' }
    })
  }
}
