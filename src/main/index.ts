import { app, session } from 'electron'
import { createTray } from './tray'
import { registerIPC } from './ipc'
import { ServiceManager, ShortcutService } from './services'
import { createAssistantWindow } from './windows/assistant'
import { configureVoicePermissions } from './services/voice'
import { readBuildFingerprint, runningBuild } from './services/runtime-build'

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

const serviceManager = new ServiceManager()
const showAssistantFlag = '--glint-show-assistant'
let relaunching = false

app.on('second-instance', () => {
  if (relaunching) return
  const currentBuild = readBuildFingerprint()
  if (runningBuild && currentBuild && currentBuild !== runningBuild) {
    relaunching = true
    const args = process.argv.slice(1).filter(arg => arg !== showAssistantFlag)
    app.relaunch({ args: [...args, showAssistantFlag] })
    app.quit()
    return
  }
  void app.whenReady().then(() => { if (!relaunching) createAssistantWindow() })
})

app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', event => event.preventDefault())
  contents.on('will-attach-webview', event => event.preventDefault())
})

app.whenReady().then(() => {
  if (!gotTheLock) return
  if (runningBuild) console.info(`Glint build ${runningBuild.slice(0, 12)}`)
  configureVoicePermissions(session.defaultSession)
  // Register future services
  serviceManager.registerPlaceholders()

  // Set up IPC handlers
  registerIPC()

  // Create system tray
  createTray()

  // Register activation global keyboard shortcuts
  ShortcutService.register()
  if (process.argv.includes(showAssistantFlag)) createAssistantWindow()
})

app.on('will-quit', () => {
  // Clean up global shortcuts on exit
  ShortcutService.unregisterAll()
})

// Keep app running when all windows are closed (tray app)
app.on('window-all-closed', () => {
  // Do not quit - we're a tray application
})
