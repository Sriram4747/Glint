import { app, safeStorage } from 'electron'
import * as fs from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { bundledRelay } from './gemini-relay'

type Section = Record<string, unknown>
type Store = Record<string, Section>
const record = (value: unknown): value is Section =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function validField(section: string, key: string, value: unknown): boolean {
  switch (section + '.' + key) {
    case 'general.guidanceLevel': return value === 'minimal' || value === 'standard'
    case 'general.launchAtStartup':
    case 'general.alwaysOnTop':
    case 'voice.enabled': return typeof value === 'boolean'
    case 'appearance.theme': return ['dark', 'light', 'system'].includes(String(value)) && typeof value === 'string'
    case 'appearance.accentColor': return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    case 'ai.model': return typeof value === 'string' && /^gemini-[a-z0-9.-]{1,80}$/.test(value)
    case 'ai.apiKey': return typeof value === 'string' && value.length <= 512
    default: return false
  }
}

export class SettingsStore {
  private file = join(app.getPath('userData'), 'settings.json')
  private data: Store = {}
  private readError = ''

  constructor() {
    if (!fs.existsSync(this.file)) return
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (!record(saved) || !Object.values(saved).every(record)) throw new Error()
      this.data = saved as Store
      if (this.data.ai?.apiKey) this.update({ ai: { apiKey: this.data.ai.apiKey } })
    } catch {
      this.readError = 'Settings could not be read or migrated. Check settings.json and Windows credential storage, then restart Glint.'
    }
  }

  view() {
    if (this.readError) throw new Error(this.readError)
    const { apiKey, encryptedKey, ...ai } = this.data.ai || {}
    return { ...this.data, ai: { ...ai, hasApiKey: Boolean(encryptedKey), hosted: Boolean(bundledRelay) } }
  }

  guidance() {
    if (this.readError) throw new Error(this.readError)
    const ai = this.data.ai || {}
    const key = bundledRelay?.token ?? (typeof ai.encryptedKey === 'string'
      ? safeStorage.decryptString(Buffer.from(ai.encryptedKey, 'base64'))
      : process.env.GEMINI_API_KEY)
    return {
      key, visual: this.data.general?.guidanceLevel === 'standard',
      model: typeof ai.model === 'string' && validField('ai', 'model', ai.model) ? ai.model : undefined
    }
  }

  update(patch: unknown): void {
    if (this.readError) throw new Error(this.readError)
    if (!record(patch)) throw new Error('Invalid settings.')
    const next = { ...this.data }
    for (const [section, fields] of Object.entries(patch)) {
      if (!record(fields) || !['general', 'appearance', 'voice', 'ai'].includes(section)) throw new Error('Invalid settings section.')
      const merged = { ...next[section] }
      for (const [key, value] of Object.entries(fields)) {
        if (!validField(section, key, value)) throw new Error('Invalid setting.')
        if (section === 'ai' && key === 'apiKey') {
          delete merged.apiKey
          delete merged.encryptedKey
          if (typeof value === 'string' && value.trim()) {
            if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential storage is unavailable.')
            merged.encryptedKey = safeStorage.encryptString(value.trim()).toString('base64')
          }
        } else {
          merged[key] = value
        }
      }
      next[section] = merged
    }
    const temporary = this.file + '.' + randomUUID() + '.tmp'
    try {
      fs.writeFileSync(temporary, JSON.stringify(next, null, 2), { flag: 'wx' })
      fs.renameSync(temporary, this.file)
      this.data = next
    } finally {
      fs.rmSync(temporary, { force: true })
    }
  }
}
