export interface NativeRequest {
  text: string
  openTarget?: string
}

export interface NativeAction {
  id: string
  target: string
  execute(): Promise<string>
}

export type NativeIntent = { kind: 'open'; action: NativeAction } | { kind: 'reply'; text: string }
type NativeResolution = NativeIntent | { kind: 'unavailable'; reason: string }

export interface NativeAdapter {
  resolve(request: NativeRequest): NativeIntent | undefined
}

export function normalizeRequest(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[‐‑‒–—]/g, '-').replace(/\s+/g, ' ').trim()
}

// Extract a whole destination from an opening phrase in either language.
const englishOpen = /^(?:(?:can|could|would|will) you (?:please )?|how (?:do|can) i )?(?:open(?: up)?|show me|take me to|go to|bring up|pull up|launch|navigate to|access) (.+)$/u
const tamilOpen = /^(.+?) (?:(?:open|ஓபன்)(?: (?:பண்ணு|பண்ணுங்க|பண்ணுங்கள்|செய்|செய்யவும்))?|திற(?:க்கவும்|ங்கள்)?|காட்டு(?:ங்கள்)?|காட்டவும்)$/u
const tamilOpenQuestion = /^(.+?) எப்படி(?:த்)? (?:(?:open|ஓபன்) (?:பண்றது|பண்ணுவது|செய்வது)|திறப்பது|திறக்கலாம்)$/u

const REPEAT_WINDOW_MS = 2000

export class NativeActions {
  private pending: string | undefined
  private lastLaunch: { id: string; time: number } | undefined

  constructor(private readonly adapters: readonly NativeAdapter[]) {}

  resolve(goal: string): NativeResolution {
    const text = normalizeRequest(goal).replace(/[.!?]+$/u, '').trim()
      .replace(/^(?:(?:hey|ok|okay) )?glint,? /u, '')
      .replace(/^(?:please,? |தயவுசெய்து )/u, '')
      .replace(/(?:,? (?:please|for me))+$/u, '')
    const openTarget = englishOpen.exec(text)?.[1] ?? tamilOpen.exec(text)?.[1] ?? tamilOpenQuestion.exec(text)?.[1]
    for (const adapter of this.adapters) {
      const intent = adapter.resolve({ text, openTarget })
      if (intent) return intent
    }
    return {
      kind: 'unavailable',
      reason: openTarget && !/^how to /u.test(openTarget)
        ? 'No direct Windows action matches that destination.'
        : 'No direct Windows action matches this request.'
    }
  }

  async execute(action: NativeAction) {
    if (this.pending === action.id) {
      return { success: true, text: `A request to open ${action.target} is already in progress.` }
    }
    if (this.pending) {
      return { success: false, error: 'Wait for the current Windows request, then try again.' }
    }
    if (this.lastLaunch?.id === action.id && performance.now() - this.lastLaunch.time < REPEAT_WINDOW_MS) {
      return { success: true, text: `A request to open ${action.target} was already sent.` }
    }

    this.pending = action.id
    try {
      const text = await action.execute()
      this.lastLaunch = { id: action.id, time: performance.now() }
      return { success: true, text }
    } catch {
      return { success: false, error: `Windows could not open ${action.target}. Try again or open it manually.` }
    } finally {
      this.pending = undefined
    }
  }
}
