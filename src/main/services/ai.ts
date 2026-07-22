import { Logger } from './logger'
import { PromptService } from './prompt'

export interface AIResponseContract {
  nextStep: string
  targetLabel: string
  goalCompleted: boolean
  previousStepCompleted?: boolean
  reason?: string
}

export interface AIAnalysisResult {
  success: boolean
  data?: AIResponseContract
  error?: string
}

export class AIService {
  // Verified active model cascade (3.1 & 3.5 Flash Lite series - high RPM, fast vision response)
  private static readonly FALLBACK_MODELS = [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite-preview',
    'gemini-2.5-flash',
    'gemini-3.6-flash'
  ]

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
      
      if (typeof parsed.nextStep !== 'string' || typeof parsed.targetLabel !== 'string' || typeof parsed.goalCompleted !== 'boolean') {
        throw new Error('Required JSON contract keys (nextStep, targetLabel, goalCompleted) are missing or invalid type.')
      }

      return {
        nextStep: parsed.nextStep,
        targetLabel: parsed.targetLabel,
        goalCompleted: parsed.goalCompleted,
        previousStepCompleted: parsed.previousStepCompleted,
        reason: parsed.reason
      }
    } catch (err: any) {
      Logger.error('JSON parsing failed for AI response text:', cleanText)
      throw new Error(`Failed to validate response contract: ${err.message}`)
    }
  }

  /**
   * Core request executor with automatic model failover / fallback.
   */
  private static async executeWithFallback(
    payload: any,
    apiKey: string,
    preferredModel = 'gemini-3.1-flash-lite'
  ): Promise<string> {
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
      try {
        Logger.info(`AIService: Querying model "${model}"...`)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        if (!response.ok) {
          const errText = await response.text()
          const status = response.status
          lastErrorMsg = `Model ${model} returned status ${status}: ${errText}`

          // Failover to next candidate model if 503, 429, 404, or 500
          if (status === 503 || status === 429 || status === 404 || status === 500) {
            Logger.warn(`AIService: ${model} unavailable (status ${status}). Failing over to next model...`)
            continue
          }

          throw new Error(lastErrorMsg)
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
    preferredModel = 'gemini-3.1-flash-lite'
  ): Promise<AIAnalysisResult> {
    try {
      Logger.info(`AIService: Sending initial goal request for: "${goal}"`)

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

      const textResponse = await this.executeWithFallback(payload, apiKey, preferredModel)
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
    preferredModel = 'gemini-3.1-flash-lite'
  ): Promise<AIAnalysisResult> {
    try {
      Logger.info(`AIService: Verifying previous step outcome: "${previousStep}"`)

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

      const textResponse = await this.executeWithFallback(payload, apiKey, preferredModel)
      const parsedData = this.parseJsonContract(textResponse)

      Logger.info('AIService: Step outcome verified successfully. Completed =', parsedData.previousStepCompleted)
      return { success: true, data: parsedData }
    } catch (error: any) {
      Logger.error('AIService: Step verification failed:', error)
      return { success: false, error: error?.message || 'Gemini verification query failed' }
    }
  }
}
