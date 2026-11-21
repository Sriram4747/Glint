import { settingsDestinations, type SettingsDestination } from './settings-destinations'

type SettingsIntent =
  | { kind: 'open'; destination: SettingsDestination }
  | { kind: 'clarify'; choices: SettingsDestination[] }
  | { kind: 'guide' }

const pageNames = new Map<string, SettingsDestination>()
for (const [destination, page] of Object.entries(settingsDestinations)) {
  for (const alias of [page.label, ...page.aliases]) {
    pageNames.set(normalize(alias), destination as SettingsDestination)
  }
}

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase()
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ').trim()
}

// Keep both the action and the destination anchored. Explanations, negations and
// text appended to a valid request must never be reduced to a launchable substring.
const englishOpen = /^(?:(?:can|could|would|will) you (?:please )?|how (?:do|can) i )?(?:open|show me|take me to|go to|bring up|launch|navigate to|access) (.+)$/u
const tamilOpen = /^(.+?) (?:எப்படி(?:த்)? (?:(?:open|ஓபன்) (?:பண்றது|பண்ணுவது|செய்வது)|திறப்பது|திறக்கலாம்)|(?:open|ஓபன்)(?: (?:பண்ணு|பண்ணுங்க|பண்ணுங்கள்|செய்|செய்யவும்))?|திற(?:க்கவும்|ங்கள்)?|காட்டு(?:ங்கள்)?|காட்டவும்)$/u
const settingsOnly = /^(?:(?:the )?(?:windows )?settings(?: (?:page|app))?|அமைப்புகள்)$/u

function resolvePage(text: string): SettingsDestination | undefined {
  const title = text
    .replace(/^the /u, '')
    .replace(/^(?:windows )?settings (?:page )?for /u, '')
    .replace(/ (?:settings(?: page)?|(?:page )?in (?:the )?windows settings|அமைப்புகள்|அமைப்புகளை(?:த்)?)$/u, '')
  return pageNames.get(title) ?? pageNames.get(title.replace(/^windows /u, ''))
}

export function routeSettingsIntent(request: string): SettingsIntent {
  const text = normalize(request).replace(/[.!?]+$/u, '').trim()
    .replace(/^(?:please,? |தயவுசெய்து )/u, '')
    .replace(/,? (?:please|for me)$/u, '')
  const target = englishOpen.exec(text)?.[1] ?? tamilOpen.exec(text)?.[1]
  if (!target) return { kind: 'guide' }
  if (settingsOnly.test(target)) return { kind: 'clarify', choices: [] }

  const destination = resolvePage(target)
  if (destination) return { kind: 'open', destination }

  const parts = target.split(/(?: (?:or|and|அல்லது|மற்றும்) |,\s*|\s*\/\s*)/u)
  if (parts.length > 1) {
    const choices = parts.map(resolvePage).filter(page => page !== undefined)
    if (choices.length === parts.length) return { kind: 'clarify', choices: [...new Set(choices)] }
  }
  return { kind: 'guide' }
}
