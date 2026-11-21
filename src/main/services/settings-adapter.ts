import { shell } from 'electron'
import { normalizeRequest, type NativeAdapter } from './native-action'
import { settingsDestinations, settingsHeadings, type SettingsDestination } from './settings-destinations'
import { Logger } from './logger'
import { waitForShell, WindowsActionError, windowsScript } from './windows-shell'

const pageNames = new Map<string, SettingsDestination>()
for (const [destination, page] of Object.entries(settingsDestinations)) {
  for (const alias of [page.label, ...page.aliases]) {
    pageNames.set(normalizeRequest(alias), destination as SettingsDestination)
  }
}

const settingsOnly = /^(?:(?:the )?(?:windows(?: 11)? )?settings(?: (?:page|app))?|அமைப்புகள்)$/u

const settingsPrefix = /^(?:windows(?: 11)? )?settings(?: (?:page|app))? (?:for|to|and (?:go|navigate) to) (?:the )?/u
const settingsContext = / (?:in|on|under) (?:the )?(?:windows(?: 11)?(?: settings(?: app)?)?|settings(?: app)?)$/u
const pageSuffix = / (?:(?:windows(?: 11)? )?settings(?: (?:page|screen))?|page|screen|அமைப்புகள்|அமைப்புகளை(?:த்)?)$/u

function resolvePage(text: string): SettingsDestination | undefined {
  const title = text
    .replace(/^the /u, '')
    .replace(settingsPrefix, '')
    .replace(settingsContext, '')
    .replace(pageSuffix, '')
  return pageNames.get(title) ?? pageNames.get(title.replace(/^windows(?: 11)? /u, ''))
}

function clarify(choices: SettingsDestination[]) {
  const labels = [...new Set(choices)].map(destination => settingsDestinations[destination].label)
  const options = labels.length > 1 ? ` ${labels.join(' or ')}?` : ''
  const example = labels[0] || 'Wi-Fi'
  return { kind: 'reply' as const, text: `Which Windows Settings page should I open?${options} Try “Open ${example} settings.”` }
}

export async function openSettings(destination: SettingsDestination, signal?: AbortSignal) {
  const { uri, label } = settingsDestinations[destination]
  const variables = {
    GLINT_SETTINGS_URI: uri,
    GLINT_SETTINGS_HEADINGS: JSON.stringify(settingsHeadings(destination)),
    GLINT_SETTINGS_HOME: destination === 'home' ? '1' : '0'
  }
  let lastStatus = 'launch-failed'
  for (const route of ['electron-shell', 'windows-shell']) {
    signal?.throwIfAborted()
    Logger.info('Settings navigation attempted', { destination, route })
    try {
      if (route === 'electron-shell') await waitForShell(shell.openExternal(uri, { activate: true }), signal)
      const status = await windowsScript('verify-settings.ps1', {
        ...variables, GLINT_SETTINGS_RETRY: route === 'windows-shell' ? '1' : '0'
      }, { signal })
      lastStatus = status
      Logger.info('Settings observation', { destination, route, status })
      if (status === 'verified') {
        return destination === 'home' ? 'Windows Settings is open.' : `${label} is open in Windows Settings.`
      }
    } catch {
      signal?.throwIfAborted()
      lastStatus = 'verification-unavailable'
      Logger.warn('Settings route failed', { destination, route })
    }
  }
  const reason = lastStatus === 'unresponsive' ? 'Settings is unresponsive.' :
    lastStatus === 'wrong-page' ? 'Settings opened, but the requested page could not be verified.' :
      'Glint could not verify that Windows Settings opened.'
  throw new WindowsActionError(destination === 'home' ? reason : `${reason} Requested page: ${label}.`)
}

export const settingsAdapter: NativeAdapter = {
  resolve({ openTarget }) {
    if (!openTarget) return
    const destination = settingsOnly.test(openTarget) ? 'home' : resolvePage(openTarget)
    if (destination) {
      const page = settingsDestinations[destination]
      return {
        kind: 'open',
        action: {
          id: `settings:${destination}`,
          target: `${page.label} in Windows Settings`,
          execute: () => openSettings(destination)
        }
      }
    }

    const parts = openTarget.split(/(?: (?:or|and|அல்லது|மற்றும்) |,\s*|\s*\/\s*)/u)
    const choices = parts.map(resolvePage).filter(page => page !== undefined)
    if (parts.length > 1 && choices.length === parts.length) return clarify(choices)
  }
}
