import { ElectronAPI } from '@electron-toolkit/preload'

interface GlintAPI {
  closeWindow: () => void
  minimizeWindow: () => void
  getSystemInfo: () => Promise<Record<string, string>>
  getSettings: () => Promise<Record<string, unknown>>
  saveSettings: (settings: Record<string, unknown>) => Promise<void>
  openSettings: () => void
  openSystemDetails: () => void
  openAssistant: () => void
  captureScreen: () => Promise<any>
  executeGoalStep: (goal: string) => Promise<any>
  clearGoalSession: () => Promise<void>
  getGoalSession: () => Promise<any>
  markGoalComplete: () => Promise<void>
  resumeGoal: () => Promise<void>
  snoozeGoal: () => Promise<void>
  advanceStep: () => Promise<void>
  getGoalHistory: () => Promise<any[]>
  resetGoalInactivity: () => void
  onOverlayUpdate: (callback: (data: { rect: any; label: string; actionType?: string }) => void) => void
  onOverlayClear: (callback: () => void) => void
  onFloatingUpdate: (callback: (data: { step: string; goal: string }) => void) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    glintAPI: GlintAPI
  }
}
