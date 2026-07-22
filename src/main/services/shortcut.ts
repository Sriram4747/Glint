import { globalShortcut } from 'electron'
import { createAssistantWindow } from '../windows/assistant'

const ACTIVATION_SHORTCUT = 'Ctrl+Shift+Space'

export class ShortcutService {
  static register(): void {
    try {
      const registered = globalShortcut.register(ACTIVATION_SHORTCUT, () => {
        createAssistantWindow()
      })

      if (!registered) {
        console.error('Failed to register global shortcut:', ACTIVATION_SHORTCUT)
      } else {
        console.log('Registered global shortcut:', ACTIVATION_SHORTCUT)
      }
    } catch (error) {
      console.error('Exception during global shortcut registration:', error)
    }
  }

  static unregisterAll(): void {
    try {
      globalShortcut.unregisterAll()
      console.log('Unregistered all global shortcuts')
    } catch (error) {
      console.error('Exception during global shortcut unregistration:', error)
    }
  }
}
