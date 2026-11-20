import { registerWindow } from './roles'
import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let floatingAssistantWindow: BrowserWindow | null = null
let latestProgress: { step: string; goal: string } | null = null
let lastFloatingPosition: { x: number; y: number } | null = null

export function createFloatingAssistantWindow(): BrowserWindow {
  if (floatingAssistantWindow && !floatingAssistantWindow.isDestroyed()) {
    return floatingAssistantWindow
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  const width = 310
  const height = 75

  // Default to bottom-right corner of screen
  const x = lastFloatingPosition ? lastFloatingPosition.x : screenWidth - width - 20
  const y = lastFloatingPosition ? lastFloatingPosition.y : screenHeight - height - 20

  floatingAssistantWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  registerWindow(floatingAssistantWindow, 'floating-assistant')

  // Cache user dragging positions
  floatingAssistantWindow.on('move', () => {
    if (floatingAssistantWindow && !floatingAssistantWindow.isDestroyed()) {
      const [newX, newY] = floatingAssistantWindow.getPosition()
      lastFloatingPosition = { x: newX, y: newY }
    }
  })

  floatingAssistantWindow.on('closed', () => {
    floatingAssistantWindow = null
    latestProgress = null
  })

  floatingAssistantWindow.webContents.on('did-finish-load', () => {
    if (latestProgress) floatingAssistantWindow?.webContents.send('floating:update', latestProgress)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    floatingAssistantWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?window=floating-assistant`)
  } else {
    floatingAssistantWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { window: 'floating-assistant' }
    })
  }

  return floatingAssistantWindow
}

export function getFloatingAssistantWindow(): BrowserWindow | null {
  if (floatingAssistantWindow && !floatingAssistantWindow.isDestroyed()) {
    return floatingAssistantWindow
  }
  return null
}

export function destroyFloatingAssistantWindow(): void {
  if (floatingAssistantWindow && !floatingAssistantWindow.isDestroyed()) {
    floatingAssistantWindow.destroy()
  }
  floatingAssistantWindow = null
}

export function showFloatingAssistantWindow(): void {
  if (floatingAssistantWindow && !floatingAssistantWindow.isDestroyed()) {
    floatingAssistantWindow.show()
  }
}

export function hideFloatingAssistantWindow(): void {
  if (floatingAssistantWindow && !floatingAssistantWindow.isDestroyed()) {
    floatingAssistantWindow.hide()
  }
}
export function updateFloatingAssistantProgress(step: string, goal: string): void {
  if (floatingAssistantWindow && !floatingAssistantWindow.isDestroyed()) {
    latestProgress = { step, goal }
    floatingAssistantWindow.webContents.send('floating:update', latestProgress)
  }
}
