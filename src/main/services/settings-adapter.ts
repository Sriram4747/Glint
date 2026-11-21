import { shell } from 'electron'
import { normalizeRequest, type NativeAdapter } from './native-action'
import { settingsDestinations, type SettingsDestination } from './settings-destinations'

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

export const settingsAdapter: NativeAdapter = {
  resolve({ openTarget }) {
    if (!openTarget) return
    if (settingsOnly.test(openTarget)) return clarify([])

    const destination = resolvePage(openTarget)
    if (destination) {
      const page = settingsDestinations[destination]
      return {
        kind: 'open',
        action: {
          id: `settings:${destination}`,
          target: `${page.label} in Windows Settings`,
          async execute() {
            await shell.openExternal(page.uri)
            return `Asked Windows to open ${page.label}. Check the Settings window for the page.`
          }
        }
      }
    }

    const parts = openTarget.split(/(?: (?:or|and|அல்லது|மற்றும்) |,\s*|\s*\/\s*)/u)
    const choices = parts.map(resolvePage).filter(page => page !== undefined)
    if (parts.length > 1 && choices.length === parts.length) return clarify(choices)
  }
}
