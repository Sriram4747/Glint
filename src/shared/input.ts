export type GoalInput =
  | { source: 'text'; text: string }
  | { source: 'voice'; final: true; text: string; language: string }

// Implemented by a future provider. Only final events are eligible for submission.
export type SpeechEvent =
  | { type: 'partial' | 'final'; text: string; language: string }
  | { type: 'error'; message: string }

export interface SpeechProvider {
  requestMicrophonePermission(): Promise<'granted' | 'denied'>
  start(options: { language: string; consent: true }, onEvent: (event: SpeechEvent) => void): Promise<void>
  stop(): Promise<void>
  cancel(): Promise<void>
}

export function resolveGoalInput(input: unknown): string {
  // Strings remain supported for callers of the original goal:execute channel.
  const value = typeof input === 'string' ? { source: 'text', text: input } : input
  if (!value || typeof value !== 'object' || !('source' in value) || !('text' in value) ||
      typeof value.text !== 'string' || !value.text.trim() || value.text.length > 4000) {
    throw new Error('Enter a goal between 1 and 4000 characters.')
  }
  if (value.source === 'voice') {
    if (!('final' in value) || value.final !== true || !('language' in value) ||
        typeof value.language !== 'string' || !value.language.trim() || value.language.length > 64) {
      throw new Error('A final transcript and language are required.')
    }
  } else if (value.source !== 'text') {
    throw new Error('Unsupported input source.')
  }
  return value.text.trim()
}
