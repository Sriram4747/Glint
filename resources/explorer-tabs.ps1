# Only SelectionItem on a TabItem within the user's File Explorer windows is supported.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$element = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]
$tabs = [System.Windows.Automation.PropertyCondition]::new(
    $element::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem
)
$windows = $element::RootElement.FindAll($scope::Children, [System.Windows.Automation.Condition]::TrueCondition)
$found = @(
    foreach ($window in $windows) {
        if ($window.Current.ClassName -ne 'CabinetWClass' -or $window.Current.IsOffscreen) { continue }
        $process = Get-Process -Id $window.Current.ProcessId -ErrorAction SilentlyContinue
        if (-not $process -or $process.ProcessName -ne 'explorer') { continue }
        foreach ($tab in $window.FindAll($scope::Descendants, $tabs)) {
            if (-not $tab.Current.IsEnabled -or $tab.Current.IsOffscreen) { continue }
            if ($tab.Current.Name.IndexOf($env:GLINT_TAB_QUERY, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
            $id = ($tab.GetRuntimeId() -join '.')
            if ($env:GLINT_TAB_ID -and $id -ne $env:GLINT_TAB_ID) { continue }
            $pattern = $null
            if ($tab.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$pattern)) {
                @{ id = $id; label = $tab.Current.Name; pattern = $pattern }
            }
        }
    }
)
if (-not $env:GLINT_TAB_ID) {
    ConvertTo-Json -Compress -InputObject @($found | Select-Object -First 8 | ForEach-Object {
        @{ id = $_.id; label = $_.label }
    })
    exit 0
}
if ($found.Count -ne 1) { 'tab-unavailable'; exit 0 }
$found[0].pattern.Select()
for ($attempt = 0; $attempt -lt 5; $attempt++) {
    if ($found[0].pattern.Current.IsSelected) { 'verified'; exit 0 }
    Start-Sleep -Milliseconds 100
}
'selection-unverified'
