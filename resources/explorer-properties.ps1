# Open the fixed verb on the verified, selected Explorer item and check the new dialog.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class GlintProperties {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
}
"@
$path = $env:GLINT_PROPERTIES_PATH
$explorer = New-Object -ComObject Shell.Application
$initial = [GlintProperties]::GetForegroundWindow()
$matches = @(
    foreach ($window in $explorer.Windows()) {
        try {
            if ([IO.Path]::GetFileName([string]$window.FullName) -ine 'explorer.exe') { continue }
            $selected = @($window.Document.SelectedItems() | Where-Object { $_.Path -ieq $path })
            if ($selected.Count -eq 1) { @{ handle = [long]$window.HWND; item = $selected[0] } }
        } catch { continue }
    }
)
$foreground = @($matches | Where-Object { $_.handle -eq $initial.ToInt64() })
if ($foreground.Count -eq 1) { $matches = $foreground }
if ($matches.Count -ne 1 -or $matches[0].item.Path -ine $path) {
    'selection-unavailable'
    exit 0
}
$uia = [System.Windows.Automation.AutomationElement]
$source = $uia::FromHandle([IntPtr]::new($matches[0].handle)).Current.ProcessId
$dialogMatch = [System.Windows.Automation.AndCondition]::new(
    [System.Windows.Automation.PropertyCondition]::new($uia::ClassNameProperty, '#32770'),
    [System.Windows.Automation.PropertyCondition]::new($uia::ProcessIdProperty, [int]$source)
)
$children = [System.Windows.Automation.TreeScope]::Children
$previous = @($uia::RootElement.FindAll($children, $dialogMatch) | ForEach-Object { $_.Current.NativeWindowHandle })
[void]$matches[0].item.InvokeVerb('properties')
$deadline = [Diagnostics.Stopwatch]::StartNew()
do {
    try {
        foreach ($dialog in $uia::RootElement.FindAll($children, $dialogMatch)) {
            $info = $dialog.Current
            $base = [IO.Path]::GetFileNameWithoutExtension($path)
            $full = [IO.Path]::GetFileName($path)
            if ($info.NativeWindowHandle -notin $previous -and -not $info.IsOffscreen -and
                ($info.Name -ieq "$base Properties" -or $info.Name -ieq "$full Properties")) {
                [void][GlintProperties]::SetForegroundWindow([IntPtr]::new($info.NativeWindowHandle))
                'verified'
                exit 0
            }
        }
    } catch [System.Windows.Automation.ElementNotAvailableException] {}
    Start-Sleep -Milliseconds 160
} while ($deadline.ElapsedMilliseconds -lt 4500)
'dialog-unverified'
