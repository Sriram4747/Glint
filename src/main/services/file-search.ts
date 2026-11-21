import { app } from 'electron'
import { lstat, opendir, realpath } from 'node:fs/promises'
import { win32 as path } from 'node:path'
import { normalizeRequest } from './native-action'
import { isLocalPath, WindowsActionError, windowsScript } from './windows-shell'

const standardFolders = ['desktop', 'documents', 'downloads', 'pictures', 'videos', 'music'] as const
export const searchScopes = [...standardFolders, 'captures', 'screenshots', 'profile'] as const
type Scope = typeof searchScopes[number]
const fileTypes = {
  pdf: ['.pdf'],
  document: ['.pdf', '.doc', '.docx', '.txt', '.odt', '.rtf', '.md', '.xls', '.xlsx', '.xlsm', '.ods', '.ppt', '.pptx', '.odp', '.csv', '.tsv'],
  video: ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.wmv', '.m4v'],
  image: ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.heic', '.tiff'],
  audio: ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg']
} as const
export const searchTypes = ['folder', 'file', ...Object.keys(fileTypes)] as const
export const searchOrders = ['relevance', 'modified', 'created', 'size'] as const
export const searchDates = ['any', 'today', 'yesterday', 'week', 'month'] as const
export const searchDateFields = ['modified', 'created'] as const

export interface FileQuery {
  terms: string
  type: string
  scopes: Scope[]
  order: typeof searchOrders[number]
  date: typeof searchDates[number]
  dateField: typeof searchDateFields[number]
}

interface Root {
  id: Scope
  folder: string
}

export interface FileMatch {
  path: string
  root: string
  scope: Scope
  kind: 'folder' | 'file'
  score: number
  size: number
  modified: number
  created: number
}

const skipped = /^(?:\.|node_modules$|appdata$|application data$|local settings$|windows$|programdata$|program files(?: \(x86\))?$|\$)/i
const mediaWords = {
  captures: /\b(?:screen (?:recordings?|captures?)|(?:game|video) (?:recordings?|captures?)|recordings?|captures?)\b|திரைப் பதிவு|திரை பதிவ|ஸ்கிரீன் ரெக்கார்ட/u,
  screenshots: /\b(?:screenshots?|screen ?shots?|screen ?grabs?)\b|திரைப்பிடிப்பு|ஸ்கிரீன்ஷாட்/u
}

function within(root: string, target: string) {
  const relative = path.relative(root, target)
  return relative !== '..' && !relative.startsWith('..\\') && !path.isAbsolute(relative)
}

async function canonicalEntry(folder: string) {
  if (!isLocalPath(folder)) return
  const info = await lstat(folder)
  if (info.isSymbolicLink()) return
  const resolved = await realpath(folder)
  if (isLocalPath(resolved)) return { resolved, info }
}

async function personalRoots(signal: AbortSignal, resolveMedia: boolean) {
  const sources = standardFolders.map(id => ({ id: id as Scope, folder: app.getPath(id) }))
  if (resolveMedia) {
    try {
      const media = JSON.parse(await windowsScript('known-media-folders.ps1', {}, { signal, timeout: 4500 }))
      for (const id of ['captures', 'screenshots'] as const) {
        if (typeof media[id] === 'string') sources.push({ id, folder: media[id] })
      }
    } catch {
      signal.throwIfAborted()
    }
  }
  sources.push({ id: 'profile', folder: app.getPath('home') })
  const roots = await Promise.all(sources.map(async ({ id, folder }) => {
    const entry = await canonicalEntry(folder).catch(() => undefined)
    if (entry?.info.isDirectory()) return { id, folder: entry.resolved }
  }))
  return roots.filter((root): root is Root => Boolean(root))
}

function dateRange(period: FileQuery['date']): [number, number] {
  if (period === 'any') return [-Infinity, Infinity]
  const start = new Date()
  const end = new Date()
  start.setHours(0, 0, 0, 0)
  end.setHours(24, 0, 0, 0)
  if (period === 'yesterday') {
    start.setDate(start.getDate() - 1)
    end.setDate(end.getDate() - 1)
  }
  if (period === 'week') start.setDate(start.getDate() - 6)
  if (period === 'month') start.setDate(start.getDate() - 29)
  return [+start, +end]
}

export async function findFiles(query: FileQuery, signal: AbortSignal) {
  const term = normalizeRequest(query.terms)
  const tokens = term.match(/[\p{L}\p{M}\p{N}]+/gu) ?? []
  const media = query.type === 'folder' && Object.entries(mediaWords).find(([, words]) => words.test(term))?.[0]
  const genericMedia = media && !term.replace(mediaWords[media as keyof typeof mediaWords], '').trim()
  const [from, until] = dateRange(query.date)
  const wanted = query.type === 'folder' ? 'folder' : 'file'
  const extensions = fileTypes[query.type as keyof typeof fileTypes] as readonly string[] | undefined
  const results = new Map<string, FileMatch>()
  const roots = (await personalRoots(signal, Boolean(media || query.scopes.some(scope =>
    scope === 'captures' || scope === 'screenshots')))).filter(root =>
    query.scopes.length ? query.scopes.includes(root.id) : root.id !== 'profile' || wanted === 'folder')
  const queue = roots.map(root => ({ root, folder: root.folder, depth: 0 }))
  const visited = new Set<string>()
  let blocked = 0
  let entries = 0
  const deadline = performance.now() + 3200

  async function consider(candidate: string, root: Root, kind: FileMatch['kind']) {
    if (kind !== wanted || (extensions && !extensions.includes(path.extname(candidate).toLowerCase()))) return
    const name = normalizeRequest(path.parse(candidate).name)
    const location = normalizeRequest(path.relative(root.folder, candidate).replace(/\\/g, ' '))
    const lexicalScore = !term ? 1 : name === term ? 6 : name.includes(term) ? 5 :
      tokens.length && tokens.every(token => name.includes(token)) ? 4 :
        kind === 'file' && tokens.length && tokens.every(token => location.includes(token)) ? 2 : 0
    const association = genericMedia && candidate === root.folder && root.id === media ? 6 :
      genericMedia && mediaWords[media as keyof typeof mediaWords].test(name) ? 4 : 0
    const score = Math.max(lexicalScore, association)
    if (!score) return
    try {
      const entry = await canonicalEntry(candidate)
      if (!entry || !within(root.folder, entry.resolved)) return
      const { size, mtimeMs: modified, birthtimeMs: created } = entry.info
      const when = query.dateField === 'created' ? created : modified
      if (when < from || when >= until) return
      const key = entry.resolved.toLowerCase()
      if ((results.get(key)?.score ?? 0) >= score) return
      results.set(key, { path: entry.resolved, root: root.folder, scope: root.id, kind, score, size, modified, created })
    } catch (error) {
      if (['EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) blocked++
    }
  }

  for (const root of roots) await consider(root.folder, root, 'folder')
  while (queue.length && entries < 12000 && performance.now() < deadline) {
    signal.throwIfAborted()
    const { root, folder, depth } = queue.shift()!
    const visitKey = folder.toLowerCase()
    if (visited.has(visitKey)) continue
    visited.add(visitKey)
    try {
      const dir = await opendir(folder)
      for await (const item of dir) {
        if (++entries >= 12000 || performance.now() >= deadline) break
        signal.throwIfAborted()
        if (item.isSymbolicLink() || skipped.test(item.name)) continue
        const candidate = path.join(folder, item.name)
        if (item.isDirectory()) {
          await consider(candidate, root, 'folder')
          if (depth < (root.id === 'profile' ? 2 : 6)) {
            const resolved = await realpath(candidate).catch(() => undefined)
            if (resolved && within(root.folder, resolved)) queue.push({ root, folder: resolved, depth: depth + 1 })
          }
        } else if (item.isFile()) {
          await consider(candidate, root, 'file')
        }
      }
    } catch (error) {
      signal.throwIfAborted()
      if (['EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) blocked++
    }
  }
  const matches = [...results.values()].sort((a, b) => (
    query.order === 'relevance' ? b.score - a.score : b[query.order] - a[query.order]
  ) || b.modified - a.modified || a.path.localeCompare(b.path))
  return { matches: matches.slice(0, 8), blocked, limited: queue.length > 0 || entries >= 12000 || performance.now() >= deadline }
}

export async function locatePersonalPath(exact: string, signal: AbortSignal): Promise<FileMatch> {
  if (!isLocalPath(exact) || exact.split(/[\\/]/).includes('..')) {
    throw new WindowsActionError('Use an absolute local path in a personal folder.')
  }
  const roots = await personalRoots(signal, true)
  const root = roots.find(({ folder, id }) => id !== 'profile' && within(folder, exact))
  if (!root) throw new WindowsActionError('That path is outside the available personal folders.')
  if (path.relative(root.folder, exact).split(path.sep).some(part => skipped.test(part))) {
    throw new WindowsActionError('That path includes a location excluded from personal search.')
  }
  const entry = await canonicalEntry(exact).catch(() => undefined)
  if (!entry || !within(root.folder, entry.resolved) || !(entry.info.isDirectory() || entry.info.isFile())) {
    throw new WindowsActionError('That path does not exist or cannot be accessed safely.')
  }
  return {
    path: entry.resolved, root: root.folder, scope: root.id, kind: entry.info.isDirectory() ? 'folder' : 'file',
    score: 6, size: entry.info.size, modified: entry.info.mtimeMs, created: entry.info.birthtimeMs
  }
}

export async function checkMatch(match: FileMatch) {
  const entry = await canonicalEntry(match.path).catch(() => undefined)
  if (!entry || !within(match.root, entry.resolved) ||
      (match.kind === 'folder' ? !entry.info.isDirectory() : !entry.info.isFile())) {
    throw new WindowsActionError('The selected item moved or is no longer accessible.')
  }
  return entry.resolved
}
