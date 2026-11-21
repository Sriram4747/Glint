import { shell } from 'electron'
import { settingsDestinations, type SettingsDestination } from './settings-destinations'

const REPEAT_WINDOW_MS = 2000

export class SettingsNavigationService {
  private pending: SettingsDestination | undefined
  private lastLaunch: { destination: SettingsDestination; time: number } | undefined

  async open(destination: SettingsDestination) {
    const page = settingsDestinations[destination]
    if (this.pending === destination) {
      return { success: true, text: `A request to open ${page.label} in Windows Settings is already in progress.` }
    }
    if (this.pending) {
      return { success: false, error: 'Wait for the current Windows Settings request, then try again.' }
    }
    if (this.lastLaunch?.destination === destination && performance.now() - this.lastLaunch.time < REPEAT_WINDOW_MS) {
      return { success: true, text: `A request to open ${page.label} in Windows Settings was already sent.` }
    }

    this.pending = destination
    try {
      await shell.openExternal(page.uri)
      this.lastLaunch = { destination, time: performance.now() }
      return { success: true, text: `Asked Windows to open ${page.label}. Check the Settings window for the page.` }
    } catch {
      return { success: false, error: `Windows could not open ${page.label} in Settings. Try again or open it manually.` }
    } finally {
      this.pending = undefined
    }
  }
}
