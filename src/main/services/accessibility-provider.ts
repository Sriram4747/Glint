import { exec } from 'child_process'
import { Logger } from './logger'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

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
      // Escape single-quotes to prevent variable expansions inside PowerShell single-quoted strings
      const escapedLabel = targetLabel.replace(/'/g, "''")
      const escapedHint = windowTitleHint ? windowTitleHint.replace(/'/g, "''") : ''

      Logger.info(`AccessibilityProvider: Searching dynamically for: "${targetLabel}" (Hint: "${windowTitleHint || 'None'}")`)

      const scriptContent = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$targetLabel = '${escapedLabel}'
$windowTitleHint = '${escapedHint}'

function Fix-Coord($val) {
    if ([double]::IsNaN($val) -or [double]::IsInfinity($val)) { return 0.0 }
    return [double]$val
}

$root = [System.Windows.Automation.AutomationElement]::RootElement

# 1. Find target window
$winElement = $null
if ($windowTitleHint) {
    $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($w in $windows) {
        if ($w.Current.Name -like "*$windowTitleHint*" -or $w.Current.ClassName -like "*$windowTitleHint*") {
            $winElement = $w
            break
        }
    }
}

if (-not $winElement) {
    $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    $activeWindows = @()
    foreach ($w in $windows) {
        $rect = $w.Current.BoundingRectangle
        if ($w.Current.Name -and $rect.Width -gt 100 -and $rect.Height -gt 100 -and (-not [double]::IsInfinity($rect.X))) {
            $activeWindows += $w
        }
    }
} else {
    $activeWindows = @($winElement)
}

# 2. Search target element inside resolved windows
$matches = @()

foreach ($win in $activeWindows) {
    # Tier 1: Exact NameProperty Match
    $prop = [System.Windows.Automation.AutomationElement]::NameProperty
    $cond = New-Object System.Windows.Automation.PropertyCondition($prop, $targetLabel)
    $allMatches = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
    foreach ($el in $allMatches) {
        $matches += $el
    }
}

# Tier 2: Whole-word regex matching fallback if Tier 1 yields nothing
if ($matches.Count -eq 0) {
    $cleanLabel = [regex]::Escape($targetLabel.Trim())
    # Require whole-word match for short words (<=4 chars) to prevent 'On' matching 'Personalization'
    $regexPattern = if ($targetLabel.Length -le 4) { "(?i)^\s*$cleanLabel\s*$" } else { "(?i)\b$cleanLabel\b" }

    foreach ($win in $activeWindows) {
        $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($el in $all) {
            $name = $el.Current.Name
            if ($name -and ($name -match $regexPattern)) {
                $matches += $el
            }
        }
    }
}

# Select best candidate: Prioritize interactive controls and controls with TogglePattern / InvokePattern / SelectionItemPattern
$foundElement = $null
$bestScore = -1

foreach ($m in $matches) {
    $r = $m.Current.BoundingRectangle
    if ([double]::IsInfinity($r.X) -or $r.Width -le 0) { continue }
    if ($m.Current.ControlType.ProgrammaticName -eq "ControlType.MenuBar") { continue }

    $score = 10

    # Boost interactive control types
    $cType = $m.Current.ControlType.ProgrammaticName
    if ($cType -in @("ControlType.Button", "ControlType.CheckBox", "ControlType.RadioButton", "ControlType.Custom", "ControlType.ListItem", "ControlType.SplitButton", "ControlType.MenuItem")) {
        $score += 50
    }

    # Boost controls supporting TogglePattern (e.g. Remote Desktop Toggle Switch)
    try {
        if ($m.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern) -ne $null) {
            $score += 100
        }
    } catch {}

    # Boost exact name match
    if ($m.Current.Name.Trim().ToLower() -eq $targetLabel.Trim().ToLower()) {
        $score += 40
    }

    if ($score -gt $bestScore) {
        $bestScore = $score
        $foundElement = $m
    }
}
if (-not $foundElement -and $matches.Count -gt 0) {
    $foundElement = $matches[0]
}

if ($foundElement) {
    # Try automatic ScrollIntoView if target element is inside a scroll view or list
    try {
        $scrollPattern = $foundElement.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern)
        if ($scrollPattern -ne $null) {
            $scrollPattern.ScrollIntoView()
            Start-Sleep -Milliseconds 100
        }
    } catch {}

    $rect = $foundElement.Current.BoundingRectangle
    $isOffscreen = $foundElement.Current.IsOffscreen
    $hasFiniteRect = (-not [double]::IsInfinity($rect.X)) -and (-not [double]::IsInfinity($rect.Y)) -and ($rect.Width -gt 0) -and ($rect.Height -gt 0)
    $confidence = if ($matches.Count -eq 1) { 1.0 } else { 0.65 }
    
    $result = [PSCustomObject]@{
        found = $true
        confidence = $confidence
        controlName = $foundElement.Current.Name
        controlType = $foundElement.Current.ControlType.ProgrammaticName
        enabled = $foundElement.Current.IsEnabled
        visible = (-not $isOffscreen -and $hasFiniteRect)
        isOffscreen = $isOffscreen
        rectangle = @{
            x = Fix-Coord $rect.X
            y = Fix-Coord $rect.Y
            width = Fix-Coord $rect.Width
            height = Fix-Coord $rect.Height
        }
    }
} else {
    $result = [PSCustomObject]@{
        found = $false
        confidence = 0.0
        controlName = ""
        controlType = ""
        enabled = $false
        visible = $false
        isOffscreen = $false
        rectangle = @{ x = 0; y = 0; width = 0; height = 0 }
    }
}

$result | ConvertTo-Json -Compress
`

      // Write script content to a temporary .ps1 script inside OS tmpdir
      const tempScriptPath = path.join(os.tmpdir(), `glint-uia-${Date.now()}.ps1`)
      try {
        fs.writeFileSync(tempScriptPath, scriptContent, 'utf8')
      } catch (err: any) {
        Logger.error(`AccessibilityProvider: Failed to write temp PowerShell script: ${err.message}`)
        resolve(this.getEmptyResult())
        return
      }

      const command = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tempScriptPath}"`

      exec(command, (error, stdout, stderr) => {
        // Clean up temporary script file asynchronously
        try {
          fs.unlinkSync(tempScriptPath)
        } catch {}

        if (error) {
          Logger.error(`AccessibilityProvider: PowerShell error: ${error.message}`)
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
          Logger.info(`AccessibilityProvider: Element "${targetLabel}" resolution success: ${parsed.found} (Visible: ${parsed.visible})`)
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
          Logger.error(`AccessibilityProvider: JSON parse fail on stdout: "${output}". Error: ${err.message}`)
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
