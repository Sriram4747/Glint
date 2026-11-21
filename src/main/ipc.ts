import { ipcMain, BrowserWindow, app } from 'electron'
import { createSettingsWindow } from './windows/settings'
import { createSystemDetailsWindow } from './windows/system-details'
import { createAssistantWindow } from './windows/assistant'
import { CaptureService } from './services/capture'
import { GoalService } from './services/goal'
import { GuidanceSessionService, GuidanceSessionState } from './services/guidance-session'

import { roleOf } from './windows/roles'
import { SettingsStore } from './services/settings'
import { getSystemInfo } from './services/system-info'
import { settingsDestinations } from './services/settings-destinations'
import { routeSettingsIntent } from './services/settings-intent'
import { SettingsNavigationService } from './services/settings-navigation'
import { cancelVoice, prepareVoice, transcribeVoice } from './services/voice'
import { resolveGoalInput } from '../shared/input'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import * as fs from 'fs'

// Manually load .env file to guarantee process.env availability in Main process
try {
  const envPath = join(process.cwd(), '.env')
  if (!app.isPackaged && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8')
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const index = trimmed.indexOf('=')
        if (index > 0) {
          const key = trimmed.substring(0, index).trim()
          const val = trimmed.substring(index + 1).trim()
          if (key === 'GEMINI_API_KEY' && !process.env[key]) process.env[key] = val
        }
      }
    }
  }
} catch (err) {
  console.error('Failed to parse .env file manually:', err)
}

function checkSender(event: IpcMainInvokeEvent | IpcMainEvent, roles: string[]): void {
  const frame = event.senderFrame
  const location = new URL(frame?.url || 'about:blank')
  const page = !app.isPackaged && process.env.ELECTRON_RENDERER_URL
    ? new URL(process.env.ELECTRON_RENDERER_URL)
    : pathToFileURL(join(__dirname, '../renderer/index.html'))
  const role = location.searchParams.get('window') || ''
  location.search = ''
  location.hash = ''
  if (!frame || frame !== event.sender.mainFrame || location.href !== page.href || roleOf(event.sender) !== role || !roles.includes(role)) {
    throw new Error('This window cannot perform that operation.')
  }
}

export function registerIPC(): void {
  const settings = new SettingsStore()
  const settingsNavigation = new SettingsNavigationService()
  const assistant = ['assistant']
  const controls = ['assistant', 'floating-assistant']
  const windows = [...controls, 'settings', 'system-details']
  function clearGuidance() {
    if (GuidanceSessionService.getState() !== GuidanceSessionState.Inactive) GuidanceSessionService.cancel()
    GoalService.clearSession()
  }
  function handle(channel: string, roles: string[], fn: (...args: any[]) => unknown) {
    ipcMain.handle(channel, (event, ...args) => {
      checkSender(event, roles)
      return fn(...args)
    })
  }
  function on(channel: string, roles: string[], fn: (event: Electron.IpcMainEvent) => void) {
    ipcMain.on(channel, event => {
      try { checkSender(event, roles) } catch { return }
      fn(event)
    })
  }

  on('window:close', windows, event => BrowserWindow.fromWebContents(event.sender)?.close())
  on('window:minimize', windows, event => BrowserWindow.fromWebContents(event.sender)?.minimize())
  handle('system:get-info', ['system-details', 'assistant'], getSystemInfo)
  handle('settings:get', ['settings'], () => settings.view())
  handle('settings:save', ['settings'], (patch: unknown) => settings.update(patch))
  handle('screen:capture', assistant, () => CaptureService.capture())
  ipcMain.handle('voice:prepare', (event, id: unknown) => {
    checkSender(event, assistant)
    return prepareVoice(event.sender, id)
  })
  ipcMain.handle('voice:transcribe', (event, id: unknown, language: unknown, audio: unknown) => {
    checkSender(event, assistant)
    return transcribeVoice(event.sender, id, language, audio)
  })
  ipcMain.on('voice:cancel', (event, id: unknown) => {
    try { checkSender(event, assistant) } catch { return }
    if (typeof id === 'number') cancelVoice(event.sender, id)
  })

  handle('goal:execute', assistant, async (input: unknown) => {
    try {
      const { goal } = resolveGoalInput(input)
      const intent = routeSettingsIntent(goal)
      if (intent.kind === 'clarify') {
        const choices = intent.choices.map(destination => settingsDestinations[destination].label)
        const options = choices.length > 1 ? ` ${choices.join(' or ')}?` : ''
        const example = choices[0] || 'Wi-Fi'
        return { success: true, text: `Which Windows Settings page should I open?${options} Try “Open ${example} settings.”` }
      }
      if (intent.kind === 'open' && process.platform === 'win32') {
        clearGuidance()
        return await settingsNavigation.open(intent.destination)
      }
      const { key, visual, model } = settings.guidance()
      if (!key) return { success: false, error: 'Add a Gemini API key in Settings to start guidance.' }
      if (visual) {
        GoalService.clearSession()
        await GuidanceSessionService.start(goal, key, model)
        return { success: true, text: 'Visual guidance is ready.' }
      }
      if (GuidanceSessionService.getState() !== GuidanceSessionState.Inactive) GuidanceSessionService.cancel()
      const result = await GoalService.executeGoalStep(goal, key, model)
      return { ...result, text: result.data?.nextStep }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Guidance failed.' }
    }
  })
  handle('goal:clear', controls, clearGuidance)

  handle('goal:get-session', controls, async () => {
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

  handle('goal:mark-complete', controls, async () => {
    if (GuidanceSessionService.getState() !== GuidanceSessionState.Inactive) {
      GuidanceSessionService.complete()
      return
    }
    GoalService.markCompleted()
  })

  handle('goal:resume', controls, async () => {
    if (GuidanceSessionService.getState() !== GuidanceSessionState.Inactive) {
      return GuidanceSessionService.resume()
    }
    GoalService.resumeFromIdle()
  })

  handle('goal:snooze', controls, async () => {
    if (GuidanceSessionService.getState() !== GuidanceSessionState.Inactive) {
      return GuidanceSessionService.pause()
    }
    GoalService.snoozeGoal()
  })

  handle('goal:advance-step', controls, async () => {
    if (GuidanceSessionService.getState() !== GuidanceSessionState.Inactive) {
      await GuidanceSessionService.advanceStep()
    }
  })

  handle('goal:get-history', controls, async () => {
    return GoalService.getHistory()
  })

  on('goal:reset-inactivity', windows, () => {
    GoalService.resetInactivityTimer()
  })

  // Window navigation
  on('window:open-settings', windows, () => {
    createSettingsWindow()
  })

  on('window:open-system-details', windows, () => {
    createSystemDetailsWindow()
  })

  on('window:open-assistant', windows, () => {
    createAssistantWindow()
  })
}
