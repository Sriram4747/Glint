import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export function readBuildFingerprint(): string | undefined {
  if (process.env.ELECTRON_RENDERER_URL) return undefined
  try {
    const hash = createHash('sha256')
    // Vite's renderer HTML references content-hashed script and stylesheet assets.
    for (const path of [__filename, join(__dirname, '../preload/index.js'), join(__dirname, '../renderer/index.html')]) {
      hash.update(readFileSync(path)).update('\0')
    }
    return hash.digest('hex')
  } catch {
    return undefined
  }
}

export const runningBuild = readBuildFingerprint()
