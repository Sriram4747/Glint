import type { GoalInput } from '../shared/input'
import type { FloatingProgress } from '../shared/guidance'
import type { TranscriptionResult, VoiceLanguage, VoiceResult } from '../shared/voice'
import type { Settings } from '../renderer/src/types'

interface GlintAPI {
  onWindowShown: (callback: () => void) => () => void
  onWindowHidden: (callback: () => void) => () => void
  prepareVoice: (id: number) => Promise<VoiceResult>
  transcribeVoice: (id: number, language: VoiceLanguage, audio: ArrayBuffer) => Promise<TranscriptionResult>
  cancelVoice: (id: number) => void
  onSessionRestored: (callback: (session: any) => void) => () => void
  closeWindow: () => void
  minimizeWindow: () => void
  getSystemInfo: () => Promise<Record<string, string>>
  getSettings: () => Promise<Partial<Settings>>
  saveSettings: (settings: Record<string, unknown>) => Promise<void>
  openSettings: () => void
  openSystemDetails: () => void
  openAssistant: () => void
  captureScreen: () => Promise<any>
  executeGoalStep: (goal: string | GoalInput) => Promise<any>
  clearGoalSession: () => Promise<void>
  getGoalSession: () => Promise<any>
  markGoalComplete: () => Promise<void>
  resumeGoal: () => Promise<void>
  snoozeGoal: () => Promise<void>
  advanceStep: () => Promise<void>
  getGoalHistory: () => Promise<any[]>
  resetGoalInactivity: () => void
  onOverlayUpdate: (callback: (data: { rect: any; label: string; actionType?: string }) => void) => () => void
  onOverlayClear: (callback: () => void) => () => void
  onFloatingUpdate: (callback: (data: FloatingProgress) => void) => () => void
}

declare global {
  interface Window {
    glintAPI: GlintAPI
  }
}
