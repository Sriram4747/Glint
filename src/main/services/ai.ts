import { Logger } from './logger'
import { PromptService } from './prompt'
import { bundledRelay, requestGeminiRelay } from './gemini-relay'

export type ActionType = 'click' | 'right_click' | 'double_click' | 'scroll' | 'type'

export interface AIResponseContract {
  nextStep: string
  targetLabel: string
  actionType?: ActionType
  goalCompleted: boolean
  previousStepCompleted?: boolean
  reason?: string
}

export interface AIAnalysisResult {
  success: boolean
  data?: AIResponseContract
  error?: string
}

export interface AIGoalPlanStep {
  stepIndex: number
  instruction: string
  targetLabel: string
  actionType?: ActionType
}

export interface AIGoalPlan {
  goal: string
  steps: AIGoalPlanStep[]
}

export interface AIGoalPlanResult {
  success: boolean
  data?: AIGoalPlan
  error?: string
}

export class AIService {
  static async planWindowsAction(
    instructions: string, input: unknown, schema: object, apiKey: string, model: string | undefined, signal: AbortSignal
  ): Promise<unknown> {
    const text = await this.executeWithFallback({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0 }
    }, apiKey, model, signal)
    return JSON.parse(text)?.decision
  }

  // Verified active model cascade (3.1 & 3.5 Flash Lite series - high RPM, fast vision response)
  private static readonly FALLBACK_MODELS = [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite-preview',
    'gemini-2.5-flash',
    'gemini-3.6-flash'
  ]

  private static sanitizeActionType(val: any): ActionType {
    if (typeof val === 'string') {
      const lower = val.toLowerCase().trim()
      if (['click', 'right_click', 'double_click', 'scroll', 'type'].includes(lower)) {
        return lower as ActionType
      }
      if (lower.includes('right')) return 'right_click'
      if (lower.includes('double')) return 'double_click'
      if (lower.includes('type') || lower.includes('enter')) return 'type'
      if (lower.includes('scroll')) return 'scroll'
    }
    return 'click'
  }

  /**
   * Cleans and parses raw text response into a structured AIResponseContract JSON.
   */
  private static parseJsonContract(text: string): AIResponseContract {
    let cleanText = text.trim()
    
    // Extract JSON block between first '{' and last '}' to strip markdown wraps or intro text
    const start = cleanText.indexOf('{')
    const end = cleanText.lastIndexOf('}')
    
    if (start !== -1 && end !== -1) {
      cleanText = cleanText.substring(start, end + 1).trim()
    }

    try {
      const parsed = JSON.parse(cleanText)
      
      if (typeof parsed.nextStep !== 'string' || typeof parsed.targetLabel !== 'string' || typeof parsed.goalCompleted !== 'boolean' ||
          (!parsed.goalCompleted && !parsed.nextStep.trim()) ||
          (parsed.previousStepCompleted !== undefined && typeof parsed.previousStepCompleted !== 'boolean')) {
        throw new Error('Required JSON contract keys (nextStep, targetLabel, goalCompleted) are missing or invalid type.')
      }

      return {
        nextStep: parsed.nextStep,
        targetLabel: parsed.targetLabel,
        actionType: this.sanitizeActionType(parsed.actionType),
        goalCompleted: parsed.goalCompleted,
        previousStepCompleted: parsed.previousStepCompleted,
        reason: parsed.reason
      }
    } catch (err: any) {
      Logger.error('JSON parsing failed for AI response text:')
      throw new Error('Invalid response contract from provider.')
    }
  }

  /**
   * Parses raw text into a structured AIGoalPlan containing a multi-step sequence.
   */
  private static parseGoalPlanJson(text: string, userGoal: string): AIGoalPlan {
    let cleanText = text.trim()
    const start = cleanText.indexOf('{')
    const end = cleanText.lastIndexOf('}')
    
    if (start !== -1 && end !== -1) {
      cleanText = cleanText.substring(start, end + 1).trim()
    }

    try {
      const parsed = JSON.parse(cleanText)
      const rawSteps = Array.isArray(parsed)
        ? parsed
        : (Array.isArray(parsed.steps)
            ? parsed.steps
            : (Array.isArray(parsed.plan)
                ? parsed.plan
                : (Array.isArray(parsed.guidanceSteps) ? parsed.guidanceSteps : [])))
      
      const steps: AIGoalPlanStep[] = rawSteps.map((s: any, idx: number) => ({
        stepIndex: typeof s.stepIndex === 'number' ? s.stepIndex : idx + 1,
        instruction: typeof s.instruction === 'string' ? s.instruction : (s.nextStep || ''),
        targetLabel: typeof s.targetLabel === 'string' ? s.targetLabel : '',
        actionType: this.sanitizeActionType(s.actionType)
      })).filter((s: AIGoalPlanStep) => s.instruction.length > 0)

      if (steps.length === 0) {
        throw new Error('Goal plan contains no valid steps.')
      }

      return {
        goal: parsed.goal || userGoal,
        steps
      }
    } catch (err: any) {
      Logger.error('JSON parsing failed for Goal Plan text:')
      throw new Error('Invalid goal plan from provider.')
    }
  }

  /**
   * Core request executor with automatic model failover / fallback.
   */
  private static async executeWithFallback(
    payload: any,
    apiKey: string,
    preferredModel = 'gemini-3.1-flash-lite',
    signal?: AbortSignal
  ): Promise<string> {
    if (bundledRelay) return requestGeminiRelay(payload, signal)
    if (!apiKey) {
      throw new Error('Gemini API Key is missing. Set it in Settings or GEMINI_API_KEY environment variable.')
    }

    // Prepare list of models to attempt, starting with preferred model
    const candidateModels = [
      preferredModel,
      ...this.FALLBACK_MODELS.filter(m => m !== preferredModel)
    ]

    let lastErrorMsg = ''

    for (const model of candidateModels) {
      signal?.throwIfAborted()
      try {
        Logger.info(`AIService: Querying model "${model}"...`)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
          body: JSON.stringify(payload)
        })

        if (!response.ok) {
          const status = response.status
          lastErrorMsg = `Model ${model} returned status ${status}`

          // Failover to next candidate model if 503, 429, 404, or 500
          if (status === 503 || status === 429 || status === 404 || status === 500) {
            Logger.warn(`AIService: ${model} unavailable (status ${status}). Failing over to next model...`)
            continue
          }

          break
        }

        const resJson: any = await response.json()
        const contentText = resJson.candidates?.[0]?.content?.parts?.[0]?.text

        if (!contentText) {
          throw new Error(`Empty response from Gemini API model ${model}`)
        }

        Logger.info(`AIService: Request succeeded using model "${model}".`)
        return contentText
      } catch (err: any) {
        lastErrorMsg = err?.message || 'Unknown network error'
        Logger.warn(`AIService: Error with model ${model}: ${lastErrorMsg}`)
      }
    }

    throw new Error(`All Gemini models failed. Last error: ${lastErrorMsg}`)
  }

  /**
   * Triggers initial goal analysis to generate the first visual guidance step.
   */
  static async analyzeInitial(
    goal: string,
    screenshotBase64: string,
    apiKey: string,
    preferredModel = 'gemini-3.1-flash-lite',
    signal?: AbortSignal
  ): Promise<AIAnalysisResult> {
    try {
      Logger.info('AIService: Sending initial goal request')

      const base64Data = screenshotBase64.includes(',')
        ? screenshotBase64.split(',')[1]
        : screenshotBase64

      const payload = {
        contents: [
          {
            parts: [
              {
                text: `${PromptService.getSystemInstructions()}\n\n${PromptService.formatInitialPrompt(goal)}`
              },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: base64Data
                }
              }
            ]
          }
        ]
      }

      const textResponse = await this.executeWithFallback(payload, apiKey, preferredModel, signal)
      const parsedData = this.parseJsonContract(textResponse)
      
      Logger.info('AIService: Initial goal resolved successfully.')
      return { success: true, data: parsedData }
    } catch (error: any) {
      Logger.error('AIService: Initial goal query failed:', error)
      return { success: false, error: error?.message || 'Gemini initial analysis failed' }
    }
  }

  /**
   * Triggers outcome verification by comparing previous and current screenshots.
   */
  static async verifyStep(
    goal: string,
    previousStep: string,
    targetLabel: string,
    prevScreenshotBase64: string,
    currScreenshotBase64: string,
    apiKey: string,
    preferredModel = 'gemini-3.1-flash-lite',
    signal?: AbortSignal
  ): Promise<AIAnalysisResult> {
    try {
      Logger.info('AIService: Verifying previous step outcome')

      const prevData = prevScreenshotBase64.includes(',') ? prevScreenshotBase64.split(',')[1] : prevScreenshotBase64
      const currData = currScreenshotBase64.includes(',') ? currScreenshotBase64.split(',')[1] : currScreenshotBase64

      const payload = {
        contents: [
          {
            parts: [
              {
                text: `${PromptService.getSystemInstructions()}\n\n${PromptService.formatVerificationPrompt(goal, previousStep, targetLabel)}`
              },
              {
                text: "PREVIOUS SCREENSHOT (Before user performed the action):"
              },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: prevData
                }
              },
              {
                text: "CURRENT SCREENSHOT (After user performed the action):"
              },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: currData
                }
              }
            ]
          }
        ]
      }

      const textResponse = await this.executeWithFallback(payload, apiKey, preferredModel, signal)
      const parsedData = this.parseJsonContract(textResponse)

      Logger.info('AIService: Step outcome verified successfully. Completed =', parsedData.previousStepCompleted)
      return { success: true, data: parsedData }
    } catch (error: any) {
      Logger.error('AIService: Step verification failed:', error)
      return { success: false, error: error?.message || 'Gemini verification query failed' }
    }
  }

  /**
   * Generates a complete multi-step guidance plan up front in a single API call.
   */
  static async analyzeGoalPlan(
    goal: string,
    screenshotBase64: string,
    apiKey: string,
    preferredModel = 'gemini-3.1-flash-lite',
    signal?: AbortSignal
  ): Promise<AIGoalPlanResult> {
    try {
      Logger.info('AIService: Requesting upfront multi-step goal plan')

      const base64Data = screenshotBase64.includes(',')
        ? screenshotBase64.split(',')[1]
        : screenshotBase64

      const payload = {
        contents: [
          {
            parts: [
              {
                text: `${PromptService.getSystemInstructions()}\n\n${PromptService.formatGoalPlanPrompt(goal)}`
              },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: base64Data
                }
              }
            ]
          }
        ]
      }

      const textResponse = await this.executeWithFallback(payload, apiKey, preferredModel, signal)
      const parsedPlan = this.parseGoalPlanJson(textResponse, goal)
      
      Logger.info(`AIService: Upfront plan generated successfully with ${parsedPlan.steps.length} steps.`)
      return { success: true, data: parsedPlan }
    } catch (error: any) {
      Logger.error('AIService: Goal plan query failed:', error)
      return { success: false, error: error?.message || 'Gemini goal plan generation failed' }
    }
  }
}
