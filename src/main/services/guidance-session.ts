import { getOverlayWindow, destroyOverlayWindow } from '../windows/overlay'
import { 
  createFloatingAssistantWindow, 
  destroyFloatingAssistantWindow, 
  getFloatingAssistantWindow,
  showFloatingAssistantWindow, 
  hideFloatingAssistantWindow,
  updateFloatingAssistantProgress
} from '../windows/floating-assistant'
import { getAssistantWindow } from '../windows/assistant'
import { AccessibilityService } from './accessibility'
import { OverlayService } from './overlay'
import { AIService, AIResponseContract } from './ai'
import { CaptureService } from './capture'
import { Logger } from './logger'
import { Notification } from 'electron'

export enum GuidanceSessionState {
  Inactive = 'Inactive',
  Guiding = 'Guiding',
  Paused = 'Paused',
  Completed = 'Completed'
}

export class GuidanceSessionService {
  private static state: GuidanceSessionState = GuidanceSessionState.Inactive
  private static currentGoal = ''
  private static currentApiKey = ''
  private static stepIndex = 0
  private static lastStepInstruction = ''
  private static lastStepTargetLabel = ''
  private static lastScreenshot = ''

  // Timer-based automatic verification (5 second loop between steps)
  private static autoTimer: NodeJS.Timeout | null = null
  private static isProcessingVerification = false
  private static readonly AUTO_CHECK_INTERVAL_MS = 5000 // 5 seconds between step verification checks

  private static preferredModel = 'gemini-2.0-flash'

  static getState(): GuidanceSessionState {
    return this.state
  }

  static getSessionData() {
    return {
      state: this.state,
      goal: this.currentGoal,
      stepIndex: this.stepIndex,
      lastInstruction: this.lastStepInstruction,
      lastTargetLabel: this.lastStepTargetLabel
    }
  }

  /**
   * Starts a visual guidance session.
   */
  static async start(goal: string, apiKey: string, preferredModel = 'gemini-2.0-flash'): Promise<void> {
    Logger.info(`GuidanceSession: Starting visual guidance session for goal: "${goal}" using model: "${preferredModel}"`)
    
    this.state = GuidanceSessionState.Guiding
    this.currentGoal = goal
    this.currentApiKey = apiKey
    this.preferredModel = preferredModel
    this.stepIndex = 1

    // 1. Initialize floating assistant widget and overlay
    createFloatingAssistantWindow()
    showFloatingAssistantWindow()
    updateFloatingAssistantProgress(`Analyzing step...`, goal)

    // Hide main assistant window to focus on visual guidance
    const assistantWin = getAssistantWindow()
    if (assistantWin && !assistantWin.isDestroyed()) {
      assistantWin.hide()
    }

    // 2. Initial step generation
    try {
      const captureResult = await this.captureCleanScreen()
      this.lastScreenshot = captureResult.image

      const aiResult = await AIService.analyzeInitial(goal, captureResult.image, apiKey, this.preferredModel)
      if (aiResult.success && aiResult.data) {
        await this.applyNewStep(aiResult.data)
      } else {
        throw new Error(aiResult.error || 'AI analysis failed')
      }
    } catch (err: any) {
      Logger.error('GuidanceSession: Failed to initialize first step:', err)
      this.handleGracefulDegradation(`Error: ${err.message}. Click to retry.`)
    }

    // 3. Start automatic 5-second verification timer loop
    this.scheduleNextAutoCheck()
  }

  /**
   * Pauses guidance session.
   */
  static pause(): void {
    if (this.state !== GuidanceSessionState.Guiding) return
    Logger.info('GuidanceSession: Pausing guidance session')
    
    this.state = GuidanceSessionState.Paused
    this.cancelAutoCheck()

    OverlayService.clear()
    hideFloatingAssistantWindow()
    
    const assistantWin = getAssistantWindow()
    if (assistantWin && !assistantWin.isDestroyed()) {
      assistantWin.hide()
    }

    const notification = new Notification({
      title: 'Guidance Paused',
      body: `Do you need help continuing: "${this.currentGoal}"?`,
      closeButtonText: 'Dismiss',
      actions: [
        { type: 'button', text: 'Resume Guidance' },
        { type: 'button', text: 'Mark Complete' }
      ]
    })

    notification.on('action', (_, index) => {
      if (index === 0) this.resume()
      else if (index === 1) this.complete()
    })
    notification.on('click', () => this.resume())
    notification.show()
  }

  /**
   * Resumes paused guidance session.
   */
  static async resume(): Promise<void> {
    if (this.state !== GuidanceSessionState.Paused) return
    Logger.info('GuidanceSession: Resuming guidance session')
    
    this.state = GuidanceSessionState.Guiding
    showFloatingAssistantWindow()
    
    const assistantWin = getAssistantWindow()
    if (assistantWin && !assistantWin.isDestroyed()) {
      assistantWin.show()
      assistantWin.focus()
      assistantWin.webContents.send('window:shown')
    }

    if (this.lastStepTargetLabel) {
      await this.resolveAndHighlightTarget(this.lastStepTargetLabel)
    }

    this.scheduleNextAutoCheck()
  }

  /**
   * Completes the session.
   */
  static complete(): void {
    Logger.info('GuidanceSession: Goal completed successfully')
    this.state = GuidanceSessionState.Completed
    this.cancelAutoCheck()

    OverlayService.clear()
    destroyFloatingAssistantWindow()

    const assistantWin = getAssistantWindow()
    if (assistantWin && !assistantWin.isDestroyed()) {
      assistantWin.show()
      assistantWin.focus()
      assistantWin.webContents.send('window:shown')
    }

    new Notification({
      title: '🎉 Goal Completed!',
      body: `Successfully finished: "${this.currentGoal}"`
    }).show()

    this.state = GuidanceSessionState.Inactive
  }

  /**
   * Manual "Next ▸" button trigger.
   * Immediately runs verification without waiting for the 5s timer.
   */
  static async advanceStep(): Promise<void> {
    if (this.state !== GuidanceSessionState.Guiding) return
    if (this.isProcessingVerification) return
    Logger.info('GuidanceSession: Manual step advancement requested')

    this.cancelAutoCheck()
    await this.runVerification()
  }

  /**
   * Cancels guidance session.
   */
  static cancel(): void {
    Logger.info('GuidanceSession: Cancelling goal session')
    this.state = GuidanceSessionState.Inactive
    this.cancelAutoCheck()

    OverlayService.clear()
    destroyFloatingAssistantWindow()

    const assistantWin = getAssistantWindow()
    if (assistantWin && !assistantWin.isDestroyed()) {
      assistantWin.show()
      assistantWin.focus()
      assistantWin.webContents.send('window:shown')
    }
  }

  // ── Automatic Timer Loop Methods ───────────────────────────────────

  private static scheduleNextAutoCheck(): void {
    this.cancelAutoCheck()
    if (this.state !== GuidanceSessionState.Guiding) return

    this.autoTimer = setTimeout(async () => {
      if (this.state !== GuidanceSessionState.Guiding || this.isProcessingVerification) return
      await this.runVerification()
    }, this.AUTO_CHECK_INTERVAL_MS)
  }

  private static cancelAutoCheck(): void {
    if (this.autoTimer) {
      clearTimeout(this.autoTimer)
      this.autoTimer = null
    }
  }

  /**
   * Core verification check — runs every 5s automatically or when "Next" is clicked.
   */
  private static async runVerification(): Promise<void> {
    this.isProcessingVerification = true
    updateFloatingAssistantProgress('Checking your screen...', this.currentGoal)

    try {
      // Redraw highlight if lost
      if (this.lastStepTargetLabel && !OverlayService.hasActiveHighlight()) {
        await this.resolveAndHighlightTarget(this.lastStepTargetLabel)
      }

      const captureResult = await this.captureCleanScreen()

      const result = await AIService.verifyStep(
        this.currentGoal,
        this.lastStepInstruction,
        this.lastStepTargetLabel,
        this.lastScreenshot,
        captureResult.image,
        this.currentApiKey,
        this.preferredModel
      )

      if (result.success && result.data) {
        const contract = result.data
        if (contract.previousStepCompleted) {
          // Action detected & verified! Move to next step
          this.stepIndex += 1
          this.lastScreenshot = captureResult.image

          if (contract.goalCompleted) {
            this.complete()
            return
          } else {
            await this.applyNewStep(contract)
          }
        } else {
          // Step not completed yet — keep current target highlighted
          Logger.info(`GuidanceSession: Step ${this.stepIndex} not completed yet. Retrying in 5s...`)
          updateFloatingAssistantProgress(`Step ${this.stepIndex}`, this.currentGoal)
          this.lastScreenshot = captureResult.image
        }
      } else {
        updateFloatingAssistantProgress(`Step ${this.stepIndex}`, this.currentGoal)
      }
    } catch (err) {
      Logger.error('GuidanceSession: Verification run failed:', err)
      updateFloatingAssistantProgress(`Step ${this.stepIndex}`, this.currentGoal)
    } finally {
      this.isProcessingVerification = false
      // Schedule the next 5-second check
      if (this.state === GuidanceSessionState.Guiding) {
        this.scheduleNextAutoCheck()
      }
    }
  }

  // ── Screen Capture & Highlight Helpers ─────────────────────────────

  /**
   * Fast, smooth screen capture using opacity toggle to avoid window manager overhead.
   */
  private static async captureCleanScreen(): Promise<{ image: string }> {
    const overlayWin = getOverlayWindow()
    const floatingWin = getFloatingAssistantWindow()
    
    if (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) {
      overlayWin.setOpacity(0)
    }
    if (floatingWin && !floatingWin.isDestroyed() && floatingWin.isVisible()) {
      floatingWin.setOpacity(0)
    }

    try {
      const result = await CaptureService.capture()
      return { image: result.image }
    } finally {
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.setOpacity(1)
      }
      if (floatingWin && !floatingWin.isDestroyed()) {
        floatingWin.setOpacity(1)
      }
    }
  }

  private static async applyNewStep(step: AIResponseContract): Promise<void> {
    this.lastStepInstruction = step.nextStep
    this.lastStepTargetLabel = step.targetLabel
    
    Logger.info(`GuidanceSession: Applying Step ${this.stepIndex}: "${step.nextStep}" (Target: "${step.targetLabel}")`)
    updateFloatingAssistantProgress(`Step ${this.stepIndex}: ${step.nextStep}`, this.currentGoal)

    await this.resolveAndHighlightTarget(step.targetLabel)
  }

  private static async resolveAndHighlightTarget(label: string): Promise<boolean> {
    if (!label) {
      OverlayService.clear()
      return false
    }

    try {
      const searchResult = await AccessibilityService.search(label)
      if (searchResult.found && searchResult.visible) {
        return OverlayService.highlight(searchResult.rectangle, label)
      } else if (searchResult.found && searchResult.isOffscreen) {
        Logger.info(`GuidanceSession: Target "${label}" found but off-screen. Displaying scroll prompt.`)
        updateFloatingAssistantProgress(`⏬ Scroll down to find "${label}"`, this.currentGoal)
        OverlayService.clear()
        return false
      } else {
        Logger.warn(`GuidanceSession: Target "${label}" not resolved by UIA. Hiding overlay.`)
        OverlayService.clear()
        return false
      }
    } catch (err) {
      Logger.error('GuidanceSession: Target highlight search failed:', err)
      OverlayService.clear()
      return false
    }
  }

  private static handleGracefulDegradation(message: string): void {
    updateFloatingAssistantProgress(message, this.currentGoal)
    OverlayService.clear()
  }
}
