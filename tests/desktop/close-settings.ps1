# Close the Settings window opened by the integration suite to exercise a cold launch.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class GlintSettingsFixture {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
'@
$type = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]
$session = [Diagnostics.Process]::GetCurrentProcess().SessionId
$settings = @(Get-Process SystemSettings -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $session })
$windows = $type::RootElement.FindAll($scope::Children, [System.Windows.Automation.Condition]::TrueCondition)
$closed = 0
foreach ($window in $windows) {
    $bySettings = $false
    foreach ($process in $settings) {
        if ($window.Current.ProcessId -eq $process.Id) { $bySettings = $true; break }
        if ($window.Current.ClassName -ne 'ApplicationFrameWindow') { continue }
        $pidCondition = [System.Windows.Automation.PropertyCondition]::new($type::ProcessIdProperty, [int]$process.Id)
        if ($window.FindFirst($scope::Descendants, $pidCondition)) { $bySettings = $true; break }
    }
    if (-not $bySettings) { continue }
    $handle = [IntPtr]::new($window.Current.NativeWindowHandle)
    if ($handle -ne [IntPtr]::Zero -and
        [GlintSettingsFixture]::PostMessage($handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) {
        $closed++
    }
}
if (-not $closed) { throw 'The test could not close the Settings window.' }
