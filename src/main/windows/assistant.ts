import { registerWindow } from './roles'
import { BrowserWindow, screen, app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let assistantWindow: BrowserWindow | null = null
let lastPosition: { x: number; y: number } | null = null
let isQuitting = false

app.on('before-quit', () => {
  isQuitting = true
})

export function createAssistantWindow(): void {
  if (assistantWindow && !assistantWindow.isDestroyed()) {
    if (assistantWindow.isMinimized()) assistantWindow.restore()
    assistantWindow.show()
    assistantWindow.focus()
    // Notify renderer that the window was restored
    assistantWindow.webContents.send('window:shown')
    return
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  const width = 500
  const height = 260

  const x = lastPosition ? lastPosition.x : Math.round((screenWidth - width) / 2)
  const y = lastPosition ? lastPosition.y : Math.round((screenHeight - height) / 2)

  assistantWindow = new BrowserWindow({
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  registerWindow(assistantWindow, 'assistant')

  assistantWindow.on('ready-to-show', () => {
    assistantWindow?.show()
    assistantWindow?.webContents.send('window:shown')
  })

  assistantWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      assistantWindow?.hide()
    }
  })

  assistantWindow.on('closed', () => {
    assistantWindow = null
  })

  assistantWindow.on('blur', () => {
    if (assistantWindow && !assistantWindow.isDestroyed()) {
      assistantWindow.hide()
    }
  })

  assistantWindow.on('move', () => {
    if (assistantWindow && !assistantWindow.isDestroyed()) {
      const [newX, newY] = assistantWindow.getPosition()
      lastPosition = { x: newX, y: newY }
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    assistantWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?window=assistant`)
  } else {
    assistantWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { window: 'assistant' }
    })
  }
}

export function getAssistantWindow(): BrowserWindow | null {
  if (assistantWindow && !assistantWindow.isDestroyed()) {
    return assistantWindow
  }
  return null
}
