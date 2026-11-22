import { app } from 'electron'
import { join } from 'node:path'

export function resourcePath(...parts: string[]) {
  return join(app.isPackaged ? process.resourcesPath : join(__dirname, '../../resources'), ...parts)
}
