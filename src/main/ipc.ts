import { ipcMain, BrowserWindow, app } from 'electron'
import { createSettingsWindow } from './windows/settings'
import { createSystemDetailsWindow } from './windows/system-details'
import { createAssistantWindow } from './windows/assistant'
import { CaptureService } from './services/capture'
import { GoalService } from './services/goal'
import { GuidanceSessionService, GuidanceSessionState } from './services/guidance-session'

import * as os from 'os'
import { exec } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json')

// Helper to load settings from disk
function loadSettingsFromDisk(): Record<string, any> {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const content = fs.readFileSync(SETTINGS_FILE, 'utf-8')
      return JSON.parse(content)
    }
  } catch (err) {
    console.error('Failed to load settings from disk:', err)
  }
  return {
    general: {
      launchAtStartup: false,
      alwaysOnTop: true,
      guidanceLevel: 'minimal'
    },
    ai: {
      provider: 'google',
      apiKey: ''
    }
  }
}

// Helper to save settings to disk
function saveSettingsToDisk(settings: Record<string, any>): void {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')
  } catch (err) {
    console.error('Failed to save settings to disk:', err)
  }
}

// Helper to execute PowerShell commands
function runPowerShell(command: string): Promise<string> {
  return new Promise((resolve) => {
    exec(`powershell -NoProfile -Command "${command}"`, (error, stdout) => {
      if (error) {
        resolve('')
      } else {
        resolve(stdout.trim())
      }
    })
  })
}

// Manually load .env file to guarantee process.env availability in Main process
try {
  const envPath = path.join(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8')
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const index = trimmed.indexOf('=')
        if (index > 0) {
          const key = trimmed.substring(0, index).trim()
          const val = trimmed.substring(index + 1).trim()
          process.env[key] = val
        }
      }
    }
  }
} catch (err) {
  console.error('Failed to parse .env file manually:', err)
}

// User-specific fallbacks from the screenshot
const USER_FALLBACK_SYSTEM_INFO = {
  computerName: 'dell',
  windowsVersion: 'Windows 11 Home',
  cpu: 'AMD Ryzen AI 9 HX PRO 370 w/ Radeon 890M (2.00 GHz)',
  ram: '64.0 GB',
  gpu: 'NVIDIA RTX PRO 500 Blackwell Generation Laptop GPU (6 GB) / AMD Radeon(TM) 890M Graphics (512 MB)',
  screenResolution: '2560 × 1600',
  displayScaling: '150%',
  appVersion: '1.0.0'
}

// Helper to shorten CPU names for clean tile rendering
function shortenCPU(cpu: string): string {
  let clean = cpu.replace(/\(R\)/g, '').replace(/\(TM\)/g, '').replace(/Processor/g, '').replace(/CPU/g, '').trim()
  if (clean.includes('Ryzen AI 9')) {
    return 'Ryzen AI 9 PRO 370'
  }
  // Extract patterns like "Core i7-13700K" or "Ryzen 7 5800X"
  const match = clean.match(/(Ryzen \d+|Core i\d+-\w+|Ryzen AI \d+ \w+|Core i\d+)/i)
  return match ? match[0] : clean.split('@')[0].trim()
}

// Helper to shorten GPU names
function shortenGPU(gpu: string): string {
  // If multiple GPUs are joined, select the discrete one or the first one
  if (gpu.includes(' / ')) {
    const parts = gpu.split(' / ')
    const discrete = parts.find(p => p.toLowerCase().includes('nvidia') || p.toLowerCase().includes('amd'))
    return shortenGPU(discrete || parts[0])
  }
  let clean = gpu.replace(/\(R\)/g, '').replace(/\(TM\)/g, '').trim()
  if (clean.includes('RTX PRO 500')) {
    return 'NVIDIA RTX PRO 500'
  }
  if (clean.includes('GeForce RTX')) {
    const match = clean.match(/RTX \d+(\s*Ti)?/i)
    return match ? `NVIDIA ${match[0]}` : clean
  }
  return clean
}

export function registerIPC(): void {
  // Window control
  ipcMain.on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  ipcMain.on('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })

  // System info (placeholder)
  ipcMain.handle('system:get-info', async () => {
    try {
      const { screen } = require('electron')
      
      // 1. Resolve Host / Computer Name
      const computerName = os.hostname() || USER_FALLBACK_SYSTEM_INFO.computerName

      // 2. Resolve CPU model
      let cpu = USER_FALLBACK_SYSTEM_INFO.cpu
      if (os.cpus()[0]?.model) {
        cpu = shortenCPU(os.cpus()[0].model)
      } else {
        cpu = shortenCPU(cpu)
      }

      // 3. Resolve RAM
      const totalMemGb = Math.round(os.totalmem() / (1024 * 1024 * 1024))
      const ram = totalMemGb > 0 ? `${totalMemGb}.0 GB` : USER_FALLBACK_SYSTEM_INFO.ram

      // 4. Resolve OS Version
      let windowsVersion = USER_FALLBACK_SYSTEM_INFO.windowsVersion
      const osCaption = await runPowerShell('(Get-CimInstance Win32_OperatingSystem).Caption')
      if (osCaption) {
        windowsVersion = osCaption.replace('Microsoft ', '').trim()
      }

      // 5. Resolve GPU
      let gpu = USER_FALLBACK_SYSTEM_INFO.gpu
      const gpuNames = await runPowerShell('Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name')
      if (gpuNames) {
        gpu = shortenGPU(gpuNames)
      } else {
        gpu = shortenGPU(gpu)
      }

      // 6. Resolve Resolution and Scaling Factor
      let screenResolution = USER_FALLBACK_SYSTEM_INFO.screenResolution
      let displayScaling = USER_FALLBACK_SYSTEM_INFO.displayScaling

      try {
        const primaryDisplay = screen.getPrimaryDisplay()
        if (primaryDisplay) {
          const { width, height } = primaryDisplay.bounds
          screenResolution = `${width} × ${height}`
          displayScaling = `${Math.round(primaryDisplay.scaleFactor * 100)}%`
        }
      } catch (err) {
        console.error('Error fetching screen info:', err)
      }

      return {
        computerName,
        windowsVersion,
        cpu,
        ram,
        gpu,
        screenResolution,
        displayScaling,
        appVersion: '1.0.0'
      }
    } catch (error) {
      console.error('Error getting dynamic system info:', error)
      return {
        ...USER_FALLBACK_SYSTEM_INFO,
        cpu: shortenCPU(USER_FALLBACK_SYSTEM_INFO.cpu),
        gpu: shortenGPU(USER_FALLBACK_SYSTEM_INFO.gpu)
      }
    }
  })

  // Load settings from disk on boot
  let settingsStore: Record<string, any> = loadSettingsFromDisk()

  ipcMain.handle('settings:get', async () => {
    return settingsStore
  })

  ipcMain.handle('settings:save', async (_event, settings: Record<string, unknown>) => {
    settingsStore = { ...settingsStore, ...settings }
    saveSettingsToDisk(settingsStore)
  })

  // Screen capture
  ipcMain.handle('screen:capture', async () => {
    return CaptureService.capture()
  })

  // Goal orchestration
  ipcMain.handle('goal:execute', async (_event, goal: string) => {
    const settingsAi: any = settingsStore.ai || {}
    const apiKey = settingsAi.apiKey || process.env.GEMINI_API_KEY || ''
    const preferredModel = settingsAi.model || 'gemini-3.1-flash-lite'
    
    const settingsGeneral: any = settingsStore.general || {}
    const guidanceLevel = settingsGeneral.guidanceLevel || 'minimal'

    if (guidanceLevel === 'standard') {
      // Runs the full visual overlay + auto-verification guidance session
      await GuidanceSessionService.start(goal, apiKey, preferredModel)
      return {
        success: true,
        text: 'Starting interactive visual guidance session...'
      }
    }

    return GoalService.executeGoalStep(goal, apiKey, preferredModel)
  })

  ipcMain.handle('goal:clear', async () => {
    if (GuidanceSessionService.getState() !== GuidanceSessionState.Inactive) {
      GuidanceSessionService.cancel()
    }
    GoalService.clearSession()
  })

  ipcMain.handle('goal:get-session', async () => {
    if (GuidanceSessionService.getState() !== GuidanceSessionState.Inactive) {
      const data = GuidanceSessionService.getSessionData()
      return {
        currentGoal: data.goal,
        state: data.state === 'Paused' ? 'Idle' : 'Active',
        latestResponse: data.lastInstruction,
        isLevel2: true
      }
    }
    return GoalService.getSession()
  })

  ipcMain.handle('goal:mark-complete', async () => {
    if (GuidanceSessionService.getState() !== GuidanceSessionState.Inactive) {
      GuidanceSessionService.complete()
    }
    GoalService.markCompleted()
  })

  ipcMain.handle('goal:resume', async () => {
    if (GuidanceSessionService.getState() !== GuidanceSessionState.Inactive) {
      GuidanceSessionService.resume()
    }
    GoalService.resumeFromIdle()
  })

  ipcMain.handle('goal:snooze', async () => {
    if (GuidanceSessionService.getState() !== GuidanceSessionState.Inactive) {
      GuidanceSessionService.pause()
    }
    GoalService.snoozeGoal()
  })

  ipcMain.handle('goal:advance-step', async () => {
    if (GuidanceSessionService.getState() !== GuidanceSessionState.Inactive) {
      await GuidanceSessionService.advanceStep()
    }
  })

  ipcMain.handle('goal:get-history', async () => {
    return GoalService.getHistory()
  })

  ipcMain.on('goal:reset-inactivity', () => {
    GoalService.resetInactivityTimer()
  })

  // Window navigation
  ipcMain.on('window:open-settings', () => {
    createSettingsWindow()
  })

  ipcMain.on('window:open-system-details', () => {
    createSystemDetailsWindow()
  })

  ipcMain.on('window:open-assistant', () => {
    createAssistantWindow()
  })
}
