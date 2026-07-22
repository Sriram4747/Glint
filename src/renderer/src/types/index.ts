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
  voice: {
    enabled: boolean
  }
  hotkeys: {
    activationShortcut: string
  }
  ai: {
    provider: 'openai' | 'anthropic' | 'google' | 'local'
    apiKey: string
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
  voice: {
    enabled: false
  },
  hotkeys: {
    activationShortcut: 'Ctrl+Shift+G'
  },
  ai: {
    provider: 'openai',
    apiKey: ''
  }
}

export const PLACEHOLDER_SYSTEM_INFO: SystemInfo = {
  computerName: 'DESKTOP-GLINT',
  windowsVersion: 'Windows 11 Pro 23H2',
  cpu: 'Intel Core i7-13700K',
  ram: '32 GB DDR5',
  gpu: 'NVIDIA GeForce RTX 4070',
  screenResolution: '2560 × 1440',
  displayScaling: '125%',
  appVersion: '1.0.0'
}
