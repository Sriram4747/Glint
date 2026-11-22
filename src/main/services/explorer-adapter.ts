import { app } from 'electron'
import type { NativeAdapter } from './native-action'
import { openExplorer } from './windows-shell'

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

function resolveFolder(target: string) {
  return folderNames.get(target.replace(/^(?:the )?(?:(?:file|windows) )?explorer (?:to|at|in) /u, '')
    .replace(/^(?:the |my |என் |எனது )/u, '')
    .replace(/ in (?:the )?(?:file|windows) explorer$/u, '')
    .replace(/ (?:folder|directory|folder-ஐ|கோப்புறை(?:யை(?:த்)?)?)$/u, ''))
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
        action: { id: `explorer:${destination}`, target: `${label} in File Explorer`, execute: () =>
          openExplorer(destination === 'thisPc' ? '' : app.getPath(destination as KnownFolder), label) }
      }
    }

    const parts = target.split(/(?: (?:or|and|அல்லது|மற்றும்) |,\s*)/u)
    const choices = parts.map(resolveFolder).filter(folder => folder !== undefined)
    if (choices.length > 1 && choices.length === parts.length) {
      const labels = [...new Set(choices)].map(folder => folders[folder].label)
      return { kind: 'reply', text: `Which folder should I open in File Explorer? ${labels.join(' or ')}? Say “Open ${labels[0]}” or name another folder.` }
    }
  }
}
