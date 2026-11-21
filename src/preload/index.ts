import { contextBridge, ipcRenderer } from 'electron'
import type { GoalInput } from '../shared/input'
import type { TranscriptionResult, VoiceLanguage, VoiceResult } from '../shared/voice'

function subscribe<T>(channel: string, callback: (data: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, data: T) => callback(data)
  ipcRenderer.on(channel, listener)
  return () => { ipcRenderer.removeListener(channel, listener) }
}

const glintAPI = {
  onWindowShown: (callback: () => void) => subscribe('window:shown', callback),
  onWindowHidden: (callback: () => void) => subscribe('window:hidden', callback),
  onSessionRestored: (callback: (session: unknown) => void) => subscribe('goal:session-restored', callback),
  prepareVoice: (id: number): Promise<VoiceResult> => ipcRenderer.invoke('voice:prepare', id),
  transcribeVoice: (id: number, language: VoiceLanguage, audio: ArrayBuffer): Promise<TranscriptionResult> =>
    ipcRenderer.invoke('voice:transcribe', id, language, audio),
  cancelVoice: (id: number): void => ipcRenderer.send('voice:cancel', id),
  // Window control
  closeWindow: (): void => {
    ipcRenderer.send('window:close')
  },
  minimizeWindow: (): void => {
    ipcRenderer.send('window:minimize')
  },

  // System info
  getSystemInfo: (): Promise<Record<string, string>> => {
    return ipcRenderer.invoke('system:get-info')
  },

  // Settings
  getSettings: (): Promise<Record<string, unknown>> => {
    return ipcRenderer.invoke('settings:get')
  },
  saveSettings: (settings: Record<string, unknown>): Promise<void> => {
    return ipcRenderer.invoke('settings:save', settings)
  },

  // Navigation
  openSettings: (): void => {
    ipcRenderer.send('window:open-settings')
  },
  openSystemDetails: (): void => {
    ipcRenderer.send('window:open-system-details')
  },
  openAssistant: (): void => {
    ipcRenderer.send('window:open-assistant')
  },

  // Screen capture
  captureScreen: (): Promise<import('../main/services/capture').CaptureResult> => {
    return ipcRenderer.invoke('screen:capture')
  },

  // Goal orchestration
  executeGoalStep: (goal: string | GoalInput): Promise<any> => {
    return ipcRenderer.invoke('goal:execute', goal)
  },
  clearGoalSession: (): Promise<void> => {
    return ipcRenderer.invoke('goal:clear')
  },
  getGoalSession: (): Promise<any> => {
    return ipcRenderer.invoke('goal:get-session')
  },
  markGoalComplete: (): Promise<void> => {
    return ipcRenderer.invoke('goal:mark-complete')
  },
  resumeGoal: (): Promise<void> => {
    return ipcRenderer.invoke('goal:resume')
  },
  snoozeGoal: (): Promise<void> => {
    return ipcRenderer.invoke('goal:snooze')
  },
  advanceStep: (): Promise<void> => {
    return ipcRenderer.invoke('goal:advance-step')
  },
  getGoalHistory: (): Promise<any[]> => {
    return ipcRenderer.invoke('goal:get-history')
  },
  resetGoalInactivity: (): void => {
    ipcRenderer.send('goal:reset-inactivity')
  },
  
  // Overlay communication
  onOverlayUpdate: (callback: (data: { rect: any; label: string }) => void) => subscribe('overlay:update', callback),
  onOverlayClear: (callback: () => void) => subscribe('overlay:clear', callback),
  onFloatingUpdate: (callback: (data: { step: string; goal: string }) => void) => subscribe('floating:update', callback)
}

contextBridge.exposeInMainWorld('glintAPI', glintAPI)
