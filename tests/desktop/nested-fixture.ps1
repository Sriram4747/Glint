param([ValidateSet('close', 'add-tab', 'selected-tab')][string]$Mode)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class GlintNavigationFixture {
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
}
"@
$uia = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]
if ($Mode -eq 'close') {
    foreach ($window in $uia::RootElement.FindAll($scope::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
        try {
            $info = $window.Current
            if ($info.ClassName -eq '#32770' -and $info.Name -ceq $env:GLINT_FIXTURE_NAME -and
                (Get-Process -Id $info.ProcessId).ProcessName -eq $env:GLINT_FIXTURE_PROCESS) {
                [void][GlintNavigationFixture]::PostMessage([IntPtr]::new($info.NativeWindowHandle), 0x10, [IntPtr]::Zero, [IntPtr]::Zero)
            }
        } catch [System.Windows.Automation.ElementNotAvailableException] {}
    }
    exit 0
}

$shell = New-Object -ComObject Shell.Application
for ($attempt = 0; $attempt -lt 12; $attempt++) {
    $windows = @($shell.Windows() | Where-Object {
        [IO.Path]::GetFileName([string]$_.FullName) -ieq 'explorer.exe' -and
        [string]$_.Document.Folder.Self.Path -ieq $env:GLINT_FIXTURE_FOLDER
    })
    if ($windows.Count -eq 1) { break }
    Start-Sleep -Milliseconds 150
}
if ($windows.Count -ne 1) { throw 'Expected a single Explorer fixture window for the target folder' }
$handle = [IntPtr]::new([long]$windows[0].HWND)
$explorer = $uia::FromHandle($handle)
if ($explorer.Current.ClassName -ne 'CabinetWClass') { throw 'Expected Explorer window' }
$tabType = [System.Windows.Automation.PropertyCondition]::new($uia::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)
function Read-Tabs {
    foreach ($tab in $explorer.FindAll($scope::Descendants, $tabType)) {
        if ($tab.Current.IsOffscreen) { continue }
        $selection = $null
        if ($tab.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$selection)) {
            @{ name = $tab.Current.Name; selected = $selection.Current.IsSelected }
        }
    }
}
$before = @(Read-Tabs)
if ($Mode -eq 'selected-tab') {
    if (@($before | Where-Object { $_.name -like "*$env:GLINT_FIXTURE_NAME*" -and $_.selected }).Count -ne 1) {
        throw 'The target Explorer tab is not selected'
    }
    'verified'
    exit 0
}

if (@($before | Where-Object { $_.name -like "*$env:GLINT_FIXTURE_NAME*" -and $_.selected }).Count -ne 1) {
    throw 'Expected the fixture tab to be selected before opening a second tab'
}
$condition = [System.Windows.Automation.AndCondition]::new(
    [System.Windows.Automation.PropertyCondition]::new($uia::AutomationIdProperty, 'AddButton'),
    [System.Windows.Automation.PropertyCondition]::new($uia::NameProperty, 'Add New Tab'),
    [System.Windows.Automation.PropertyCondition]::new($uia::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
)
$add = $explorer.FindAll($scope::Descendants, $condition)
if ($add.Count -ne 1 -or -not $add[0].Current.IsEnabled -or $add[0].Current.IsOffscreen) {
    throw 'Expected an enabled New Tab button in the fixture window'
}
$add[0].GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 150
    $tabs = @(Read-Tabs)
    $old = @($tabs | Where-Object { $_.name -like "*$env:GLINT_FIXTURE_NAME*" })
    if ($tabs.Count -gt $before.Count -and $old.Count -eq 1 -and -not $old[0].selected) {
        'verified'
        exit 0
    }
}
throw 'Explorer did not open and select a different tab'
