export type VoiceLanguage = 'en' | 'ta'
export type VoiceResult = { ok: true } | { ok: false; error: string }
export type TranscriptionResult = { ok: true; text: string } | { ok: false; error: string }

export const VOICE_SAMPLE_RATE = 16000
export const VOICE_MAX_SECONDS = 25
export const VOICE_PERMISSION_MS = 15000
export const WAV_HEADER_BYTES = 44
export const NO_SPEECH = 'No speech was recognized. Try recording again or type your request.'
