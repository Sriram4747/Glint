# UIA reports virtualized rectangles to a DPI-unaware Windows PowerShell client.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class GlintUiaDpi {
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
"@
[void][GlintUiaDpi]::SetThreadDpiAwarenessContext([intptr]::new(-4))
