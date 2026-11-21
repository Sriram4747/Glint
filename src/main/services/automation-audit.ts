import { app } from 'electron'
import { appendFileSync, copyFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Logger } from './logger'

type Status = 'planned' | 'attempted' | 'observed' | 'verified' | 'rejected' | 'failed' | 'stopped'

export function auditAutomation(run: string, tool: string, status: Status) {
  const entry = { at: new Date().toISOString(), run, tool, status }
  Logger.info('Windows automation', entry)
  try {
    const file = join(app.getPath('userData'), 'automation-audit.jsonl')
    if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > 512 * 1024) {
      copyFileSync(file, file + '.previous')
      writeFileSync(file, '')
    }
    appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8')
  } catch {
    Logger.warn('Local Windows automation audit could not be written.')
  }
}
