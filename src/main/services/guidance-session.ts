import { 
  createFloatingAssistantWindow, 
  destroyFloatingAssistantWindow, 
  showFloatingAssistantWindow, 
  hideFloatingAssistantWindow,
  updateFloatingAssistantProgress
} from '../windows/floating-assistant'
import { getAssistantWindow } from '../windows/assistant'
import { AccessibilityService } from './accessibility'
import { OverlayService } from './overlay'
import { AIService, AIResponseContract, AIGoalPlanStep } from './ai'
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
  private static generation = 0
  private static request?: AbortController
  private static initializing = false
  private static state: GuidanceSessionState = GuidanceSessionState.Inactive
  private static currentGoal = ''
  private static currentApiKey = ''
  private static stepIndex = 0
  private static lastStepInstruction = ''
  private static lastStepTargetLabel = ''
  private static lastScreenshot = ''

  // Upfront Multi-Step Plan fields
  private static activePlanSteps: AIGoalPlanStep[] = []
  private static activePlanIndex = 0
  private static localFailedCount = 0

  // Timer-based automatic verification (5 second loop between steps)
  private static autoTimer: NodeJS.Timeout | null = null
  private static isProcessingVerification = false
  private static readonly AUTO_CHECK_INTERVAL_MS = 5000 // 5 seconds between step verification checks

  private static preferredModel = 'gemini-3.1-flash-lite'

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
   * Starts a visual guidance session with Local-First Hybrid Architecture.
   */
  static async start(goal: string, apiKey: string, fallbackReason: string, preferredModel = 'gemini-3.1-flash-lite'): Promise<void> {
    Logger.info('GuidanceSession: Starting visual guidance session')
    
    this.cancelAutoCheck()
    OverlayService.clear()
    this.request?.abort()
    this.request = new AbortController()
    const generation = ++this.generation
    this.initializing = true
    this.isProcessingVerification = false
    this.lastStepInstruction = ''
    this.lastStepTargetLabel = ''
    this.lastScreenshot = ''
    this.state = GuidanceSessionState.Guiding
    this.currentGoal = goal
    this.currentApiKey = apiKey
    this.preferredModel = preferredModel
    this.stepIndex = 1
    this.activePlanSteps = []
    this.activePlanIndex = 0
    this.localFailedCount = 0

    // 1. Initialize floating assistant widget and overlay
    createFloatingAssistantWindow()
    showFloatingAssistantWindow()
    updateFloatingAssistantProgress('Generating guidance plan...', goal, fallbackReason)

    // Hide main assistant window to focus on visual guidance
    const assistantWin = getAssistantWindow()
    if (assistantWin && !assistantWin.isDestroyed()) {
      assistantWin.hide()
    }

    // 2. Perform upfront multi-step plan generation (Single API Call)
    try {
      const captureResult = await CaptureService.capture()
      if (generation !== this.generation) throw new Error('Guidance interrupted.')
      this.lastScreenshot = captureResult.image

      const planResult = await AIService.analyzeGoalPlan(goal, captureResult.image, apiKey, this.preferredModel, this.request.signal)
      if (generation !== this.generation) throw new Error('Guidance interrupted.')
      
      if (planResult.success && planResult.data && planResult.data.steps.length > 0) {
        this.activePlanSteps = planResult.data.steps
        this.activePlanIndex = 0
        Logger.info(`GuidanceSession: Multi-step plan initialized with ${this.activePlanSteps.length} steps.`)
        await this.applyPlanStep(this.activePlanSteps[0])
      } else {
        // Fallback to single step initial analysis if plan generation fails
        Logger.warn('GuidanceSession: Upfront plan generation failed, falling back to initial step analysis...')
        const aiResult = await AIService.analyzeInitial(goal, captureResult.image, apiKey, this.preferredModel, this.request.signal)
        if (generation !== this.generation) throw new Error('Guidance interrupted.')
        if (aiResult.success && aiResult.data) {
          await this.applyNewStep(aiResult.data)
        } else {
          throw new Error(aiResult.error || 'AI analysis failed')
        }
      }
    } catch (err: any) {
      Logger.error('GuidanceSession: Failed to initialize first step:', err)
      if (generation === this.generation) this.cancel()
      throw err
    }

    if (generation !== this.generation) throw new Error('Guidance interrupted.')
    this.initializing = false
    // 3. Start automatic 5-second verification timer loop
    this.scheduleNextAutoCheck()
  }

  /**
   * Pauses guidance session.
   */
  static pause(): void {
    if (this.state !== GuidanceSessionState.Guiding) return
    Logger.info('GuidanceSession: Pausing guidance session')
    
    if (this.initializing) {
      this.cancel()
      return
    }
    this.request?.abort()
    const generation = ++this.generation
    this.isProcessingVerification = false
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
      if (generation !== this.generation) return
      if (index === 0) void this.resume()
      else if (index === 1) this.complete()
    })
    notification.on('click', () => { if (generation === this.generation) void this.resume() })
    notification.show()
  }

  /**
   * Resumes paused guidance session.
   */
  static async resume(): Promise<void> {
    if (this.state !== GuidanceSessionState.Paused) return
    this.request = new AbortController()
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
      await this.resolveAndHighlightTarget(this.lastStepTargetLabel, this.lastStepActionType)
    }

    this.scheduleNextAutoCheck()
  }

  /**
   * Completes the session.
   */
  static complete(): void {
    Logger.info('GuidanceSession: Goal completed successfully')
    this.request?.abort()
    this.generation++
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

    this.currentApiKey = ''
    this.lastScreenshot = ''
    this.state = GuidanceSessionState.Inactive
  }

  /**
   * Manual "Next ▸" button trigger.
   * Immediately runs verification without waiting for the 5s timer.
   */
  static async advanceStep(): Promise<void> {
    if (this.state !== GuidanceSessionState.Guiding) return
    if (this.initializing || this.isProcessingVerification) return
    Logger.info('GuidanceSession: Manual step advancement requested')

    this.cancelAutoCheck()

    // If an upfront plan is active and there are remaining steps, advance to the next step immediately
    if (this.activePlanSteps.length > 0 && this.activePlanIndex < this.activePlanSteps.length - 1) {
      this.activePlanIndex += 1
      this.stepIndex = this.activePlanIndex + 1
      this.localFailedCount = 0
      Logger.info(`GuidanceSession: Manual Next clicked. Advancing to Plan Step ${this.stepIndex} locally!`)
      const generation = this.generation
      this.isProcessingVerification = true
      try {
        await this.applyPlanStep(this.activePlanSteps[this.activePlanIndex])
      } finally {
        if (generation === this.generation) {
          this.isProcessingVerification = false
          this.scheduleNextAutoCheck()
        }
      }
      return
    }

    await this.runVerification()
  }

  /**
   * Cancels guidance session.
   */
  static cancel(): void {
    this.request?.abort()
    this.generation++
    this.initializing = false
    Logger.info('GuidanceSession: Cancelling goal session')
    this.currentApiKey = ''
    this.lastScreenshot = ''
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
   * Local-First Hybrid Verification Check:
   * 1. First tries zero-cost local UIA resolution to see if user completed current step or reached next step target.
   * 2. Only invokes Vision Model API as a fallback if local UIA progress cannot be resolved after 2 attempts.
   */
  private static async runVerification(): Promise<void> {
    const generation = this.generation
    this.isProcessingVerification = true
    updateFloatingAssistantProgress(`Step ${this.stepIndex}: ${this.lastStepInstruction}`, this.currentGoal)

    try {
      // 1. If we have an active upfront plan, check if the NEXT step target is visible locally in UIA
      if (this.activePlanSteps.length > 0 && this.activePlanIndex < this.activePlanSteps.length - 1) {
        const nextStepCandidate = this.activePlanSteps[this.activePlanIndex + 1]
        
        if (nextStepCandidate && nextStepCandidate.targetLabel) {
          const localCheck = await AccessibilityService.search(nextStepCandidate.targetLabel)
          if (generation !== this.generation) return
          if (localCheck.found && localCheck.visible && localCheck.enabled) {
            // Local UIA detected that the user navigated to the next step target!
            Logger.info('GuidanceSession: Local UIA detected next target')
            this.activePlanIndex += 1
            this.stepIndex = this.activePlanIndex + 1
            this.localFailedCount = 0
            
            await this.applyPlanStep(this.activePlanSteps[this.activePlanIndex])
            return
          }
        }
      }

      // Check if current step target is still on screen or lost
      if (this.lastStepTargetLabel && !OverlayService.hasActiveHighlight()) {
        await this.resolveAndHighlightTarget(this.lastStepTargetLabel)
        if (generation !== this.generation) return
      }

      // 2. Increment local failed count. If < 2 ticks, give user time without calling Vision API
      this.localFailedCount += 1

      if (this.localFailedCount < 2 && this.activePlanSteps.length > 0) {
        Logger.info(`GuidanceSession: Waiting for user action locally (Tick ${this.localFailedCount})...`)
        return
      }

      // 3. Fallback: Query Vision Model if local UIA has not resolved progress after 2 ticks (~10s)
      Logger.info('GuidanceSession: Invoking Vision AI model fallback to verify outcome...')
      this.localFailedCount = 0
      const captureResult = await CaptureService.capture()
      if (generation !== this.generation) return

      const result = await AIService.verifyStep(
        this.currentGoal,
        this.lastStepInstruction,
        this.lastStepTargetLabel,
        this.lastScreenshot,
        captureResult.image,
        this.currentApiKey,
        this.preferredModel,
        this.request?.signal
      )

      if (generation !== this.generation) return
      if (result.success && result.data) {
        const contract = result.data

        // Check if Vision AI sees that the step completed OR if the target label returned by AI is visible on screen
        let isStepDone = contract.previousStepCompleted
        if (!isStepDone && contract.targetLabel && contract.targetLabel !== this.lastStepTargetLabel) {
          const liveCheck = await AccessibilityService.search(contract.targetLabel)
          if (generation !== this.generation) return
          if (liveCheck.found && liveCheck.visible && liveCheck.enabled) {
            Logger.info('GuidanceSession: Vision returned new visible target')
            isStepDone = true
          }
        }

        if (isStepDone) {
          this.stepIndex += 1
          this.lastScreenshot = captureResult.image

          if (contract.goalCompleted) {
            this.complete()
            return
          } else {
            // Live Plan Self-Healing: If AI provided a specific visible enabled target on screen, apply it directly!
            if (contract.targetLabel && contract.nextStep) {
              const liveCheck = await AccessibilityService.search(contract.targetLabel)
              if (generation !== this.generation) return
              if (liveCheck.found && liveCheck.visible && liveCheck.enabled) {
                Logger.info('GuidanceSession: Plan self-healed to live verified target')
                await this.applyNewStep(contract)
                return
              }
            }

            // Fallback to next plan step if valid
            if (this.activePlanSteps.length > 0 && this.activePlanIndex < this.activePlanSteps.length - 1) {
              this.activePlanIndex += 1
              await this.applyPlanStep(this.activePlanSteps[this.activePlanIndex])
            } else {
              await this.applyNewStep(contract)
            }
          }
        } else {
          Logger.info(`GuidanceSession: Vision verification negative for Step ${this.stepIndex}. Keeping highlight.`)
          updateFloatingAssistantProgress(`Step ${this.stepIndex}: ${this.lastStepInstruction}`, this.currentGoal)
          this.lastScreenshot = captureResult.image
        }
      }
    } catch (err) {
      Logger.error('GuidanceSession: Verification run failed:', err)
    } finally {
      if (generation === this.generation) {
        this.isProcessingVerification = false
        this.scheduleNextAutoCheck()
      }
    }
  }

  private static lastStepActionType = 'click'

  /**
   * Applies a step from the upfront multi-step plan.
   */
  private static async applyPlanStep(step: AIGoalPlanStep): Promise<void> {
    this.lastStepInstruction = step.instruction
    this.lastStepTargetLabel = step.targetLabel
    this.lastStepActionType = step.actionType || 'click'
    
    Logger.info('GuidanceSession: Applying Plan Step')
    updateFloatingAssistantProgress(`Step ${step.stepIndex}: ${step.instruction}`, this.currentGoal)

    await this.resolveAndHighlightTarget(step.targetLabel, this.lastStepActionType)
  }

  // ── Screen Capture & Highlight Helpers ─────────────────────────────

  private static async applyNewStep(step: AIResponseContract): Promise<void> {
    this.lastStepInstruction = step.nextStep
    this.lastStepTargetLabel = step.targetLabel
    this.lastStepActionType = step.actionType || 'click'
    
    Logger.info('GuidanceSession: Applying Step')
    updateFloatingAssistantProgress(`Step ${this.stepIndex}: ${step.nextStep}`, this.currentGoal)

    await this.resolveAndHighlightTarget(step.targetLabel, this.lastStepActionType)
  }

  private static async resolveAndHighlightTarget(label: string, actionType = 'click'): Promise<boolean> {
    if (!label) {
      OverlayService.clear()
      return false
    }

    const generation = this.generation
    try {
      const searchResult = await AccessibilityService.search(label)
      if (generation !== this.generation) return false
      if (searchResult.found && searchResult.visible && searchResult.enabled) {
        return OverlayService.highlight(searchResult.rectangle, label, actionType)
      } else if (searchResult.found && searchResult.visible && !searchResult.enabled) {
        Logger.warn('GuidanceSession: Disabled target')
        updateFloatingAssistantProgress(`⚠️ "${label}" is currently greyed out / disabled`, this.currentGoal)
        OverlayService.clear()
        return false
      } else if (searchResult.found && searchResult.isOffscreen) {
        Logger.info('GuidanceSession: Offscreen target')
        updateFloatingAssistantProgress(`⏬ Scroll down to find "${label}"`, this.currentGoal)
        OverlayService.clear()
        return false
      } else {
        Logger.warn('GuidanceSession: Target unavailable')
        updateFloatingAssistantProgress(this.lastStepInstruction + ' (Control not located)', this.currentGoal)
        OverlayService.clear()
        return false
      }
    } catch (err) {
      if (generation !== this.generation) return false
      Logger.error('GuidanceSession: Target highlight search failed:', err)
      OverlayService.clear()
      return false
    }
  }

}
