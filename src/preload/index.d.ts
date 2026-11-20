import type { GoalInput } from '../shared/input'
import type { Settings } from '../renderer/src/types'

interface GlintAPI {
  onWindowShown: (callback: () => void) => () => void
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
  onFloatingUpdate: (callback: (data: { step: string; goal: string }) => void) => () => void
}

declare global {
  interface Window {
    glintAPI: GlintAPI
  }
}
