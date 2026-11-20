. (Join-Path $PSScriptRoot 'enable-uia-dpi.ps1')
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$targetLabel = $env:GLINT_UIA_LABEL
$windowTitleHint = $env:GLINT_UIA_HINT

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
        $cls = $w.Current.ClassName
        $isPopup = ($cls -eq "#32768") -or ($cls -like "*ContextMenu*") -or ($cls -like "*Popup*") -or ($cls -like "*Flyout*")
        $rect = $w.Current.BoundingRectangle

        if ($isPopup) {
            $activeWindows += $w
        } elseif ($w.Current.Name -and $rect.Width -gt 20 -and $rect.Height -gt 20 -and (-not [double]::IsInfinity($rect.X))) {
            $activeWindows += $w
        }
    }
} else {
    $activeWindows = @($winElement)
}

# Always append any active context menus, flyouts, or top-level popups from root
$popups = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
foreach ($p in $popups) {
    $cls = $p.Current.ClassName
    $isPopup = ($cls -eq "#32768") -or ($cls -like "*ContextMenu*") -or ($cls -like "*Popup*") -or ($cls -like "*Flyout*")
    if ($isPopup) {
        if ($activeWindows -notcontains $p) {
            $activeWindows += $p
        }
    }
}

# 2. Search target element inside resolved windows
$candidates = @()

foreach ($win in $activeWindows) {
    # Tier 1: Exact NameProperty Match
    $prop = [System.Windows.Automation.AutomationElement]::NameProperty
    $cond = New-Object System.Windows.Automation.PropertyCondition($prop, $targetLabel)
    $allMatches = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
    foreach ($el in $allMatches) {
        $candidates += $el
    }
}

# Tier 1.5: Desktop Root Search if active windows yielded no matches
if ($candidates.Count -eq 0) {
    $prop = [System.Windows.Automation.AutomationElement]::NameProperty
    $cond = New-Object System.Windows.Automation.PropertyCondition($prop, $targetLabel)
    $rootMatches = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
    foreach ($el in $rootMatches) {
        $candidates += $el
    }
}

# Tier 2: Whole-word regex matching fallback if Tier 1 & 1.5 yield nothing
if ($candidates.Count -eq 0) {
    $cleanLabel = [regex]::Escape($targetLabel.Trim())
    $regexPattern = if ($targetLabel.Length -le 4) { "(?i)^\s*$cleanLabel\s*$" } else { "(?i)\b$cleanLabel\b" }

    foreach ($win in $activeWindows) {
        $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($el in $all) {
            $name = $el.Current.Name
            if ($name -and ($name -match $regexPattern)) {
                $candidates += $el
            }
        }
    }
}

# Tier 3: Substring & Alias matching fallback if targetLabel contains extra words/symbols (e.g. 'Give access to' vs 'Grant access to' vs 'Share')
if ($candidates.Count -eq 0) {
    $cleanLabel = [regex]::Escape($targetLabel.Trim())
    $aliases = @($cleanLabel)
    if ($targetLabel -imatch "Give access" -or $targetLabel -imatch "Grant access") {
        $aliases += "Grant access", "Give access", "Share with", "Share"
    }

    foreach ($win in $activeWindows) {
        $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($el in $all) {
            $name = $el.Current.Name
            if ($name) {
                foreach ($alias in $aliases) {
                    if ($name -match "(?i)$alias") {
                        $candidates += $el
                        break
                    }
                }
            }
        }
    }
}


# Select best candidate: Prioritize interactive controls and controls with TogglePattern / InvokePattern / SelectionItemPattern
$foundElement = $null
$bestScore = -1

foreach ($m in $candidates) {
    $r = $m.Current.BoundingRectangle
    if ([double]::IsInfinity($r.X) -or $r.Width -le 0) { continue }
    if ($m.Current.ControlType.ProgrammaticName -eq "ControlType.MenuBar") { continue }

    $score = 10

    # Boost interactive control types
    $cType = $m.Current.ControlType.ProgrammaticName
    if ($cType -in @("ControlType.Button", "ControlType.CheckBox", "ControlType.RadioButton", "ControlType.Custom", "ControlType.ListItem", "ControlType.SplitButton", "ControlType.MenuItem")) {
        $score += 50
    }

    # Heavily penalize disabled (greyed out) controls so active controls are always prioritized
    if (-not $m.Current.IsEnabled) {
        $score -= 200
    } else {
        $score += 100
    }

    # Penalize offscreen controls
    if ($m.Current.IsOffscreen) {
        $score -= 100
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
if (-not $foundElement -and $candidates.Count -gt 0) {
    $foundElement = $candidates[0]
}

if ($foundElement) {
    $rect = $foundElement.Current.BoundingRectangle
    $isOffscreen = $foundElement.Current.IsOffscreen
    $hasFiniteRect = (-not [double]::IsInfinity($rect.X)) -and (-not [double]::IsInfinity($rect.Y)) -and ($rect.Width -gt 0) -and ($rect.Height -gt 0)
    $confidence = if ($candidates.Count -eq 1) { 1.0 } else { 0.65 }

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
