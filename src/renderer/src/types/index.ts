export type WindowType = 'assistant' | 'settings' | 'system-details' | 'overlay' | 'floating-assistant'

export interface SystemInfo {
  computerName: string
  windowsVersion: string
  cpu: string
  ram: string
  gpu: string
  screenResolution: string
  displayScaling: string
  appVersion: string
}

export interface Settings {
  general: {
    launchAtStartup: boolean
    alwaysOnTop: boolean
    guidanceLevel?: 'minimal' | 'standard'
  }
  appearance: {
    theme: 'light' | 'dark' | 'system'
    accentColor: string
  }
  ai: {
    provider: 'openai' | 'anthropic' | 'google' | 'local'
    model?: string
    hasApiKey: boolean
  }
}

export interface ServiceStatus {
  name: string
  status: 'idle' | 'running' | 'error' | 'not-implemented'
  description: string
}

export const DEFAULT_SETTINGS: Settings = {
  general: {
    launchAtStartup: false,
    alwaysOnTop: true,
    guidanceLevel: 'minimal'
  },
  appearance: {
    theme: 'dark',
    accentColor: '#0078D4'
  },
  ai: {
    provider: 'google',
    hasApiKey: false
  }
}
