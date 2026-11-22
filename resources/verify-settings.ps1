# Observe the Settings process and its current page through Windows UI Automation.
$ErrorActionPreference = 'Stop'
if ($env:GLINT_SETTINGS_RETRY -eq '1') {
    if ($env:GLINT_SETTINGS_URI -cnotmatch '^ms-settings:[a-z0-9-]*$') { throw 'Invalid Settings URI' }
    Start-Process -FilePath $env:GLINT_SETTINGS_URI
}
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
if ($env:GLINT_SETTINGS_FOREGROUND -eq '1') {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class GlintSettingsFocus {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
}
'@
}
# Windows PowerShell 5.1 emits the JSON array as a single pipeline object.
$names = ConvertFrom-Json -InputObject $env:GLINT_SETTINGS_HEADINGS
$elementType = [System.Windows.Automation.AutomationElement]
$conditionType = [System.Windows.Automation.PropertyCondition]
$scope = [System.Windows.Automation.TreeScope]
$root = $elementType::RootElement
$headingLevel = [System.Windows.Automation.AutomationProperty]::LookupById(30173)
$deadline = [Diagnostics.Stopwatch]::StartNew()
$status = 'no-window'
$focusAttempted = $false
function Confirm-Foreground($window) {
    if ($env:GLINT_SETTINGS_FOREGROUND -ne '1') { return $true }
    $handle = [IntPtr]::new($window.Current.NativeWindowHandle)
    if ($handle -eq [IntPtr]::Zero) { return $false }
    if ([GlintSettingsFocus]::GetForegroundWindow() -eq $handle) { return $true }
    if (-not $script:focusAttempted) {
        $script:focusAttempted = $true
        [void][GlintSettingsFocus]::SetForegroundWindow($handle)
    }
    [GlintSettingsFocus]::GetForegroundWindow() -eq $handle
}
do {
    $settings = @(Get-Process -Name SystemSettings -ErrorAction SilentlyContinue | Where-Object {
        $_.SessionId -eq [Diagnostics.Process]::GetCurrentProcess().SessionId
    })
    foreach ($process in $settings) {
        try {
            if (-not $process.Responding) { $status = 'unresponsive'; continue }
            $byProcess = $conditionType::new($elementType::ProcessIdProperty, [int]$process.Id)
            $windows = $root.FindAll($scope::Children, [System.Windows.Automation.Condition]::TrueCondition)
            foreach ($window in $windows) {
                if ($window.Current.IsOffscreen) { continue }
                if ($window.Current.ProcessId -eq $process.Id) {
                    $view = $window
                } elseif ($window.Current.ClassName -eq 'ApplicationFrameWindow') {
                    if (-not $window.FindFirst($scope::Descendants, $byProcess)) { continue }
                    $view = $window
                } else { continue }
                if (-not $view -or $view.Current.IsOffscreen) { continue }
                if ($env:GLINT_SETTINGS_HOME -eq '1') {
                    # The bare request asks for the Settings application, including an existing page.
                    'verified'
                    exit 0
                }
                $status = 'wrong-page'
                foreach ($name in $names) {
                    $byName = $conditionType::new($elementType::NameProperty, [string]$name,
                        [System.Windows.Automation.PropertyConditionFlags]::IgnoreCase)
                    foreach ($control in $view.FindAll($scope::Descendants, $byName)) {
                        $info = $control.Current
                        if ($info.IsOffscreen -or $info.ProcessId -ne $process.Id) { continue }
                        $level = if ($headingLevel) { $control.GetCurrentPropertyValue($headingLevel, $true) }
                        if (([string]$level -eq 'Level1' -or $level -eq 80051) -or
                            ($info.ControlType -eq [System.Windows.Automation.ControlType]::Text -and
                                ($info.AutomationId -match '(?i)(page|breadcrumb|header).*title|pageheader|breadcrumb' -or
                                 $info.ClassName -match '(?i)breadcrumb|heading'))) {
                            if (Confirm-Foreground $window) { 'verified'; exit 0 }
                            $status = 'focus-blocked'
                        }
                    }
                }
            }
        } catch [System.Windows.Automation.ElementNotAvailableException] {
            # The previous page can disappear while the new page is loading.
        }
    }
    Start-Sleep -Milliseconds 200
} while ($deadline.ElapsedMilliseconds -lt 4500)
$status
