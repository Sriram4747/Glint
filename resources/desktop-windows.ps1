# Observe current-session application windows, or focus a previously observed window.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class GlintDesktop {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
}
'@
$session = [Diagnostics.Process]::GetCurrentProcess().SessionId
$windows = @(Get-Process | Where-Object {
    $_.SessionId -eq $session -and $_.MainWindowHandle -ne [IntPtr]::Zero -and $_.MainWindowTitle
})
if (-not $env:GLINT_WINDOW_HANDLE) {
    $query = $env:GLINT_WINDOW_QUERY
    $matches = @($windows | Where-Object {
        $_.ProcessName.IndexOf($query, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
        $_.MainWindowTitle.IndexOf($query, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } | Select-Object -First 8 | ForEach-Object {
        @{ process = $_.Id; handle = $_.MainWindowHandle.ToInt64().ToString(); label = $_.MainWindowTitle }
    })
    ConvertTo-Json -Compress -InputObject $matches
    exit 0
}
$window = $windows | Where-Object {
    $_.Id -eq [int]$env:GLINT_WINDOW_PROCESS -and $_.MainWindowHandle.ToInt64().ToString() -eq $env:GLINT_WINDOW_HANDLE
} | Select-Object -First 1
if (-not $window) { 'window-closed'; exit 0 }
$handle = $window.MainWindowHandle
$observed = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
if (-not $observed -or $observed.Current.ProcessId -ne $window.Id) { 'window-changed'; exit 0 }
if ([GlintDesktop]::IsIconic($handle)) { [void][GlintDesktop]::ShowWindowAsync($handle, 9) }
[void][GlintDesktop]::SetForegroundWindow($handle)
try { $observed.SetFocus() } catch [InvalidOperationException] {}
for ($attempt = 0; $attempt -lt 5; $attempt++) {
    if ([GlintDesktop]::GetForegroundWindow() -eq $handle) { 'verified'; exit 0 }
    Start-Sleep -Milliseconds 100
}
'focus-blocked'
