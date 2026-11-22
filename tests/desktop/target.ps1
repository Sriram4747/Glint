# A controlled Windows UIA target for the desktop regression suite.
param([string]$ProfilePath)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class GlintFixtureWindow {
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
"@
[void][GlintFixtureWindow]::SetThreadDpiAwarenessContext([intptr]::new(-4))
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.ShowInTaskbar = $true
$form.Text = 'Glint guidance test'
$form.StartPosition = 'Manual'
$form.Location = New-Object System.Drawing.Point(80,80)
$form.Size = New-Object System.Drawing.Size(320,180)
$button = New-Object System.Windows.Forms.Button
$button.Text = 'Glint audit target'
$button.AccessibleName = $button.Text
$button.Dock = 'Fill'
$form.Controls.Add($button)
$button.Add_Click({
    $button.Text = 'Glint audit result'
    $button.AccessibleName = $button.Text
})
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 100
$timer.Add_Tick({
    if (Test-Path -LiteralPath (Join-Path $ProfilePath 'fixture-click')) {
        $point = Get-Content -Raw (Join-Path $ProfilePath 'fixture-click') | ConvertFrom-Json
        if ($point) {
            [void][GlintFixtureWindow]::SetThreadDpiAwarenessContext([intptr]::new(-4))
            [void][GlintFixtureWindow]::SetWindowPos($form.Handle, [intptr]::Zero, $point.x, $point.y, 0, 0, 0x15)
        }
        $button.PerformClick()
        $timer.Stop()
    }
})
$form.Add_Shown({
    $form.Activate()
    $timer.Start()
    [IO.File]::WriteAllText((Join-Path $ProfilePath 'fixture-handle'), $button.Handle.ToInt64().ToString())
    [IO.File]::WriteAllText((Join-Path $ProfilePath 'fixture-ready'), 'ready')
})
[void]$form.ShowDialog()
