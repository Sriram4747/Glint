import { app, session } from 'electron'
import { createTray } from './tray'
import { registerIPC } from './ipc'
import { ServiceManager, ShortcutService } from './services'
import { createAssistantWindow } from './windows/assistant'

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

const serviceManager = new ServiceManager()

app.on('second-instance', () => {
  // If user tries to launch a second instance, show the assistant
  createAssistantWindow()
})

app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', event => event.preventDefault())
  contents.on('will-attach-webview', event => event.preventDefault())
})

app.whenReady().then(() => {
  if (!gotTheLock) return
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, reply) => reply(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  // Register future services
  serviceManager.registerPlaceholders()

  // Set up IPC handlers
  registerIPC()

  // Create system tray
  createTray()

  // Register activation global keyboard shortcuts
  ShortcutService.register()
})

app.on('will-quit', () => {
  // Clean up global shortcuts on exit
  ShortcutService.unregisterAll()
})

// Keep app running when all windows are closed (tray app)
app.on('window-all-closed', () => {
  // Do not quit - we're a tray application
})
