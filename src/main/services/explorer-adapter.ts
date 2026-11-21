import { app, shell } from 'electron'
import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { join, win32 } from 'node:path'
import { promisify } from 'node:util'
import type { NativeAdapter } from './native-action'

const runFile = promisify(execFile)
const folders = {
  downloads: { label: 'Downloads', aliases: ['download', 'downloaded files', 'டவுன்லோட்ஸ்', 'பதிவிறக்கங்கள்', 'பதிவிறக்கம்'] },
  documents: { label: 'Documents', aliases: ['ஆவணங்கள்', 'டாக்குமெண்ட்ஸ்'] },
  pictures: { label: 'Pictures', aliases: ['photos', 'படங்கள்', 'புகைப்படங்கள்', 'பிக்சர்ஸ்'] }
} as const

type KnownFolder = keyof typeof folders
type ExplorerDestination = KnownFolder | 'thisPc'
const folderNames = new Map<string, KnownFolder>()
for (const [id, folder] of Object.entries(folders)) {
  for (const name of [id, ...folder.aliases]) folderNames.set(name, id as KnownFolder)
}

const locationQuestion = /^(?:where (?:is|are|can i find) (.+)|(.+?) (?:எங்கே (?:இருக்கு|இருக்கிறது|உள்ளது)|எங்க இருக்கு))$/u
// Keep file-related requests inside this adapter, including requests that ask for individual files.
const fileWords = /\b(?:explorer|folders?|director(?:y|ies)|files?|pdfs?|downloads?|documents|pictures|photos|appdata)\b|பதிவிறக்க|ஆவண|கோப்ப|படங்கள்|டவுன்லோட்|புகைப்பட/u
const filePath = /\\|(?:^|[\s"'(])(?:[a-z]:\/|\.{1,2}\/|~\/|\/)|\.(?:pdf|docx?|xlsx?|pptx?|txt|csv|json|env|md|jpe?g|png|mp4|exe|msi|lnk|url|bat|cmd|ps1|zip)\b/u

function resolveFolder(target: string) {
  return folderNames.get(target.replace(/^(?:the )?(?:(?:file|windows) )?explorer (?:to|at|in) /u, '')
    .replace(/^(?:the |my |என் |எனது )/u, '')
    .replace(/ in (?:the )?(?:file|windows) explorer$/u, '')
    .replace(/ (?:folder|directory|folder-ஐ|கோப்புறை(?:யை(?:த்)?)?)$/u, ''))
}

async function openInExplorer(destination: ExplorerDestination, label: string) {
  const folder = destination === 'thisPc' ? '' : win32.normalize(app.getPath(destination))
  if (destination === 'thisPc') {
    await shell.openExternal('shell:MyComputerFolder')
  } else {
    if (!/^[a-z]:\\[^\\]/i.test(folder) || !(await stat(folder)).isDirectory()) {
      throw new Error('Expected a local known folder')
    }
    if (await shell.openPath(folder)) throw new Error('Explorer rejected the known folder')
  }

  const script = join(__dirname, '../../resources/verify-explorer.ps1')
  const windowsDir = process.env.SystemRoot
  if (windowsDir) {
    const powershell = win32.join(windowsDir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    try {
      const { stdout } = await runFile(powershell, ['-NoProfile', '-NonInteractive', '-Sta', '-ExecutionPolicy', 'Bypass', '-File', script], {
        windowsHide: true, timeout: 8000, maxBuffer: 4096,
        env: { ...process.env, GLINT_EXPLORER_FOLDER: folder }
      })
      if (stdout.trim() === 'verified') return `${label} is open in File Explorer.`
    } catch {
      // Explorer accepted the launch. A verifier failure doesn't undo it.
    }
  }
  return `Asked Windows to open ${label} in File Explorer. Check the Explorer window for the location.`
}

export const explorerAdapter: NativeAdapter = {
  resolve({ text, openTarget }) {
    const location = locationQuestion.exec(text)
    const target = openTarget ?? location?.[1] ?? location?.[2] ?? ''
    const folder = resolveFolder(target)
    const destination = folder ?? (openTarget && /^(?:the )?(?:file explorer|windows explorer|explorer|this pc)$/u.test(openTarget)
      ? 'thisPc' : undefined)

    if (destination) {
      const label = destination === 'thisPc' ? 'This PC' : folders[destination].label
      return {
        kind: 'open',
        action: { id: `explorer:${destination}`, target: `${label} in File Explorer`, execute: () => openInExplorer(destination, label) }
      }
    }

    const parts = target.split(/(?: (?:or|and|அல்லது|மற்றும்) |,\s*)/u)
    const choices = parts.map(resolveFolder).filter(folder => folder !== undefined)
    if (choices.length > 1 && choices.length === parts.length) {
      const labels = [...new Set(choices)].map(folder => folders[folder].label)
      return { kind: 'reply', text: `Which folder should I open in File Explorer? ${labels.join(' or ')}? Say “Open ${labels[0]}” or name another folder.` }
    }
    if (fileWords.test(text) || filePath.test(text)) {
      return { kind: 'reply', text: 'I can open Downloads, Documents, or Pictures for you to browse in File Explorer. Name one of those folders to continue.' }
    }
  }
}
