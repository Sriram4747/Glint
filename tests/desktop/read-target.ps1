# Test-only lookup for hosts where the desktop UIA root omits the fixture window.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class GlintFixtureDpi {
    [StructLayout(LayoutKind.Sequential)] public struct Bounds { public int left, top, right, bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Bounds rect);
}
"@
. (Join-Path $PSScriptRoot '../../resources/enable-uia-dpi.ps1')
Add-Type -AssemblyName UIAutomationClient
$handleId = [long][IO.File]::ReadAllText((Join-Path $env:GLINT_FIXTURE_PROFILE 'fixture-handle'))
$element = [System.Windows.Automation.AutomationElement]::FromHandle([intptr]::new($handleId))
$physical = New-Object GlintFixtureDpi+Bounds
[void][GlintFixtureDpi]::GetWindowRect([intptr]::new($handleId), [ref]$physical)
$info = $element.Current
$r = $info.BoundingRectangle
[pscustomobject]@{
    nativeRect = $physical
    found = $info.Name -eq $env:GLINT_UIA_LABEL
    visible = -not $info.IsOffscreen
    enabled = $info.IsEnabled
    confidence = 1
    controlName = $info.Name
    controlType = $info.ControlType.ProgrammaticName
    rectangle = @{ x = $r.X; y = $r.Y; width = $r.Width; height = $r.Height }
} | ConvertTo-Json -Compress
