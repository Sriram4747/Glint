import { execFile } from 'child_process'
import { Logger } from './logger'
import * as path from 'path'

export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

export interface AccessibilitySearchResult {
  found: boolean
  confidence: number
  controlName: string
  controlType: string
  enabled: boolean
  visible: boolean
  isOffscreen?: boolean
  rectangle: Rectangle
  automationId?: string
}

export interface IAccessibilityProvider {
  search(targetLabel: string, windowTitleHint?: string): Promise<AccessibilitySearchResult>
}

export class PowerShellAccessibilityProvider implements IAccessibilityProvider {
  async search(targetLabel: string, windowTitleHint?: string): Promise<AccessibilitySearchResult> {
    return new Promise((resolve) => {
      const file = path.join(__dirname, '../../resources/find-control.ps1')
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], {
        windowsHide: true, timeout: 6000, encoding: 'utf8',
        env: { ...process.env, GLINT_UIA_LABEL: targetLabel, GLINT_UIA_HINT: windowTitleHint || '' }
      }, (error, stdout) => {
        if (error) {
          Logger.warn('Windows Accessibility search failed or timed out.')
          resolve(this.getEmptyResult())
          return
        }

        const output = stdout.trim()
        if (!output) {
          Logger.warn('AccessibilityProvider: Received empty stdout from PowerShell execution.')
          resolve(this.getEmptyResult())
          return
        }

        try {
          // Sanitize raw Infinity or NaN values in stdout string to guarantee valid JSON parse
          const cleanOutput = output
            .replace(/: \b-?Infinity\b/g, ': 0')
            .replace(/: \bNaN\b/g, ': 0')

          const parsed = JSON.parse(cleanOutput)
          Logger.info('Accessibility search complete', Boolean(parsed.found))
          resolve({
            found: parsed.found,
            confidence: parsed.confidence,
            controlName: parsed.controlName,
            controlType: parsed.controlType,
            enabled: parsed.enabled,
            visible: parsed.visible,
            isOffscreen: parsed.isOffscreen,
            rectangle: parsed.rectangle
          })
        } catch (err: any) {
          Logger.warn('Invalid Windows Accessibility response.')
          resolve(this.getEmptyResult())
        }
      })
    })
  }

  private getEmptyResult(): AccessibilitySearchResult {
    return {
      found: false,
      confidence: 0.0,
      controlName: '',
      controlType: '',
      enabled: false,
      visible: false,
      rectangle: { x: 0, y: 0, width: 0, height: 0 }
    }
  }
}
