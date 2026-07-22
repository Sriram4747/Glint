import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const glintAPI = {
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
  captureScreen: (): Promise<string> => {
    return ipcRenderer.invoke('screen:capture')
  },

  // Goal orchestration
  executeGoalStep: (goal: string): Promise<any> => {
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
  onOverlayUpdate: (callback: (data: { rect: any; label: string }) => void): void => {
    ipcRenderer.on('overlay:update', (_, data) => callback(data))
  },
  onOverlayClear: (callback: () => void): void => {
    ipcRenderer.on('overlay:clear', () => callback())
  },
  onFloatingUpdate: (callback: (data: { step: string; goal: string }) => void): void => {
    ipcRenderer.on('floating:update', (_, data) => callback(data))
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('glintAPI', glintAPI)
  } catch (error) {
    console.error('Failed to expose APIs:', error)
  }
} else {
  // @ts-ignore (for fallback in development)
  window.electron = electronAPI
  // @ts-ignore
  window.glintAPI = glintAPI
}
