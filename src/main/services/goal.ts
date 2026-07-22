import { Notification, BrowserWindow } from 'electron'
import { CaptureService } from './capture'
import { AIService, AIAnalysisResult } from './ai'
import { Logger } from './logger'

export type GoalState = 'Active' | 'Idle' | 'Completed' | 'Archived'

export interface GoalSession {
  id: string
  currentGoal: string | null
  state: GoalState
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  latestScreenshot: string | null
  latestResponse: string | null
  timestamp: number
  appContext: string | null
}

export class GoalService {
  private static session: GoalSession = {
    id: 'default',
    currentGoal: null,
    state: 'Active',
    conversationHistory: [],
    latestScreenshot: null,
    latestResponse: null,
    timestamp: 0,
    appContext: null
  }

  private static history: GoalSession[] = []
  private static inactivityTimeout: NodeJS.Timeout | null = null
  private static snoozeTimeout: NodeJS.Timeout | null = null
  private static INACTIVITY_DELAY = 120000 // 2 minutes in milliseconds

  static getSession(): GoalSession {
    return this.session
  }

  static getHistory(): GoalSession[] {
    return this.history
  }

  static updateSession(updates: Partial<GoalSession>): void {
    const prevState = this.session.state
    this.session = { ...this.session, ...updates, timestamp: Date.now() }
    
    Logger.info('Goal session updated:', {
      currentGoal: this.session.currentGoal,
      state: this.session.state,
      historyLength: this.session.conversationHistory.length
    })

    // If session becomes active, refresh inactivity timer
    if (this.session.currentGoal && this.session.state === 'Active') {
      this.resetInactivityTimer()
    }
  }

  static clearSession(): void {
    this.archiveCurrentGoal()
    this.session = {
      id: Math.random().toString(36).substring(7),
      currentGoal: null,
      state: 'Active',
      conversationHistory: [],
      latestScreenshot: null,
      latestResponse: null,
      timestamp: 0,
      appContext: null
    }
    this.clearInactivityTimer()
    Logger.info('Goal session cleared and archived')
  }

  static archiveCurrentGoal(): void {
    if (this.session.currentGoal) {
      const archivedSession: GoalSession = {
        ...this.session,
        state: this.session.state === 'Completed' ? 'Completed' : 'Archived'
      }
      this.history.push(archivedSession)
      Logger.info(`Goal archived to history: "${archivedSession.currentGoal}" in state: ${archivedSession.state}`)
    }
  }

  static markCompleted(): void {
    if (this.session.currentGoal) {
      this.session.state = 'Completed'
      this.archiveCurrentGoal()
      
      // Reset state for new inputs
      this.session = {
        id: Math.random().toString(36).substring(7),
        currentGoal: null,
        state: 'Active',
        conversationHistory: [],
        latestScreenshot: null,
        latestResponse: null,
        timestamp: 0,
        appContext: null
      }
      this.clearInactivityTimer()
      this.hideAssistantWindow()
      Logger.info('Goal explicitly marked completed')
    }
  }

  static async executeGoalStep(
    goal: string,
    apiKey: string,
    preferredModel = 'gemini-2.0-flash'
  ): Promise<AIAnalysisResult> {
    try {
      this.resetInactivityTimer()
      Logger.info(`Executing goal step for goal: "${goal}" using model: "${preferredModel}"`)

      // Temporarily hide the assistant window so it is not captured in the screenshot
      const win = this.getAssistantWindow()
      let wasVisible = false
      if (win && !win.isDestroyed() && win.isVisible()) {
        wasVisible = true
        win.hide()
        // Wait 150ms to ensure the window manager completely removes it from the screen
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
      
      // 1. Capture screen
      const captureResult = await CaptureService.capture()

      // Restore the assistant window immediately after the capture completes
      if (win && !win.isDestroyed() && wasVisible) {
        win.show()
        win.focus()
        win.webContents.send('window:shown')
      }
      
      // 2. Analyze screen using AIService
      const result = await AIService.analyzeInitial(goal, captureResult.image, apiKey, preferredModel)
      
      const responseText = result.data?.nextStep || ''
      if (result.success && responseText) {
        // Update session
        const history = [...this.session.conversationHistory]
        history.push({ role: 'user', content: goal })
        history.push({ role: 'assistant', content: responseText })
        
        this.updateSession({
          currentGoal: goal,
          state: 'Active',
          conversationHistory: history,
          latestScreenshot: captureResult.image,
          latestResponse: responseText,
          appContext: captureResult.displayId
        })
      }
      
      return result
    } catch (error: any) {
      Logger.error('Goal step execution failed:', error)
      return { success: false, error: error?.message || 'Goal step execution failed' }
    }
  }

  // --- Inactivity & Notification Logic ---

  static resetInactivityTimer(): void {
    this.clearInactivityTimer()
    if (!this.session.currentGoal || this.session.state !== 'Active') return

    this.inactivityTimeout = setTimeout(() => {
      this.transitionToIdle()
    }, this.INACTIVITY_DELAY)

    Logger.info('Inactivity timer reset (2 minutes)')
  }

  private static clearInactivityTimer(): void {
    if (this.inactivityTimeout) {
      clearTimeout(this.inactivityTimeout)
      this.inactivityTimeout = null
    }
    if (this.snoozeTimeout) {
      clearTimeout(this.snoozeTimeout)
      this.snoozeTimeout = null
    }
  }

  private static transitionToIdle(): void {
    if (this.session.state !== 'Active') return
    
    this.session.state = 'Idle'
    Logger.warn(`Goal transitioned to Idle due to inactivity: "${this.session.currentGoal}"`)
    
    // Hide the floating assistant window
    this.hideAssistantWindow()

    // Show native Windows notification
    this.showIdleNotification()
  }

  private static showIdleNotification(): void {
    if (!this.session.currentGoal) return

    const notification = new Notification({
      title: 'Glint',
      body: `Need help continuing your goal?\nGoal: ${this.session.currentGoal}`,
      // Define button action triggers (macOS / Win10+ compatible)
      actions: [
        { type: 'button', text: 'Continue' },
        { type: 'button', text: 'Mark Complete' },
        { type: 'button', text: 'Snooze' }
      ]
    })

    notification.on('action', (_event, index) => {
      Logger.info(`Notification action clicked: index ${index}`)
      if (index === 0) {
        this.resumeFromIdle()
      } else if (index === 1) {
        this.markCompleted()
      } else if (index === 2) {
        this.snoozeGoal()
      }
    })

    // Standard click acts as Continue
    notification.on('click', () => {
      Logger.info('Notification body clicked - resuming goal')
      this.resumeFromIdle()
    })

    notification.show()
  }

  static resumeFromIdle(): void {
    Logger.info('Resuming goal from Idle state')
    this.session.state = 'Active'
    this.resetInactivityTimer()
    
    // Restore and show the assistant window
    const win = this.getAssistantWindow()
    if (win) {
      win.show()
      win.focus()
      win.webContents.send('window:shown')
      win.webContents.send('goal:session-restored', this.session)
    }
  }

  static snoozeGoal(): void {
    Logger.info('Goal reminder snoozed')
    // Set a snooze timer to remind the user again in 2 minutes if still Idle
    this.snoozeTimeout = setTimeout(() => {
      if (this.session.state === 'Idle') {
        Logger.info('Snooze timer expired - re-notifying user')
        this.showIdleNotification()
      }
    }, this.INACTIVITY_DELAY)
  }

  // --- Window helper methods ---

  private static hideAssistantWindow(): void {
    const win = this.getAssistantWindow()
    if (win && !win.isDestroyed()) {
      win.hide()
    }
  }

  private static getAssistantWindow(): BrowserWindow | null {
    const windows = BrowserWindow.getAllWindows()
    // Find the assistant window (skip settings/details if any)
    const assistantWin = windows.find(w => {
      const url = w.webContents.getURL()
      return url.includes('window=assistant') || url.includes('assistant.html')
    })
    return assistantWin || null
  }
}
