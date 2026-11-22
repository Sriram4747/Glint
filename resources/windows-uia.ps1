# Scoped UI Automation reads and actions for the Windows agent.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase
. (Join-Path $PSScriptRoot 'enable-uia-dpi.ps1')
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class GlintUiaWindow {
    [StructLayout(LayoutKind.Sequential)] public struct POINT {
        public int X;
        public int Y;
        public POINT(int x, int y) { X = x; Y = y; }
    }
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(POINT point);
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr window, uint flags);
    public static bool IsForegroundAt(int x, int y) {
        IntPtr hit = WindowFromPoint(new POINT(x, y));
        IntPtr foreground = GetForegroundWindow();
        return hit != IntPtr.Zero && foreground != IntPtr.Zero &&
            (GetAncestor(hit, 2) == foreground || GetAncestor(hit, 3) == foreground);
    }
}
"@

$inputData = ConvertFrom-Json -InputObject $env:GLINT_UIA_REQUEST
$uia = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]
$trueCondition = [System.Windows.Automation.Condition]::TrueCondition
$propertyCondition = [System.Windows.Automation.PropertyCondition]
$ignoreCase = [System.Windows.Automation.PropertyConditionFlags]::IgnoreCase
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$headingProperty = [System.Windows.Automation.AutomationProperty]::LookupById(30173)
$session = [Diagnostics.Process]::GetCurrentProcess().SessionId
$patterns = @{
    Invoke = [System.Windows.Automation.InvokePattern]::Pattern
    SelectionItem = [System.Windows.Automation.SelectionItemPattern]::Pattern
    ExpandCollapse = [System.Windows.Automation.ExpandCollapsePattern]::Pattern
    ScrollItem = [System.Windows.Automation.ScrollItemPattern]::Pattern
    Scroll = [System.Windows.Automation.ScrollPattern]::Pattern
    Selection = [System.Windows.Automation.SelectionPattern]::Pattern
    Toggle = [System.Windows.Automation.TogglePattern]::Pattern
    Value = [System.Windows.Automation.ValuePattern]::Pattern
}

function Write-Result($result) {
    ConvertTo-Json -InputObject $result -Depth 9 -Compress
}

function Get-Pattern($element, [string]$name) {
    $pattern = $null
    if ($element.TryGetCurrentPattern($patterns[$name], [ref]$pattern)) { $pattern }
}

function Get-Ancestors($element, $window) {
    $parent = $walker.GetParent($element)
    for ($depth = 0; $parent -and -not $parent.Equals($window) -and $depth -lt 12; $depth++) {
        $parentInfo = $parent.Current
        @{
            name = $parentInfo.Name; automationId = $parentInfo.AutomationId
            type = $parentInfo.ControlType.ProgrammaticName.Substring(12)
        }
        $parent = $walker.GetParent($parent)
    }
}

function Get-ElementInfo($element, $window, [bool]$withState) {
    $info = $element.Current
    $rect = $info.BoundingRectangle
    $bounds = if (-not $rect.IsEmpty -and -not [double]::IsInfinity($rect.X) -and
        -not [double]::IsInfinity($rect.Y) -and $rect.Width -gt 0 -and $rect.Height -gt 0) {
        @{ x = [int][Math]::Round($rect.X); y = [int][Math]::Round($rect.Y)
            width = [int][Math]::Round($rect.Width); height = [int][Math]::Round($rect.Height) }
    }
    $state = @{}
    $supported = @()
    if ($withState) {
        $supported = @($element.GetSupportedPatterns() | ForEach-Object { $_.ProgrammaticName -replace 'PatternIdentifiers.Pattern$','' })
        foreach ($name in @('Toggle', 'SelectionItem', 'ExpandCollapse', 'Value')) {
            $pattern = Get-Pattern $element $name
            if (-not $pattern) { continue }
            switch ($name) {
                'Toggle' { $state.toggle = [string]$pattern.Current.ToggleState }
                'SelectionItem' { $state.selected = $pattern.Current.IsSelected }
                'ExpandCollapse' { $state.expanded = [string]$pattern.Current.ExpandCollapseState }
                'Value' {
                    $state.valueReadOnly = $pattern.Current.IsReadOnly
                    if ($inputData.readValue -and $inputData.window.kind -eq 'settings' -and $info.ControlType -ne [System.Windows.Automation.ControlType]::Edit -and -not $info.IsPassword) {
                        $state.value = $pattern.Current.Value
                    }
                }
            }
        }
        if ($inputData.readValue -and $inputData.window.kind -eq 'settings' -and
            $info.ControlType -eq [System.Windows.Automation.ControlType]::ComboBox) {
            $selection = Get-Pattern $element 'Selection'
            if ($selection) { $state.selection = @($selection.Current.GetSelection() | ForEach-Object { $_.Current.Name }) }
        }
    }
    @{
        runtimeId = ($element.GetRuntimeId() -join '.'); process = $info.ProcessId
        name = $info.Name; automationId = $info.AutomationId; className = $info.ClassName
        type = $info.ControlType.ProgrammaticName.Substring(12)
        enabled = $info.IsEnabled; visible = (-not $info.IsOffscreen -and $null -ne $bounds)
        bounds = $bounds; parents = @(Get-Ancestors $element $window)
        heading = $(if ($headingProperty) { [string]$element.GetCurrentPropertyValue($headingProperty, $true) })
        state = $state; patterns = $supported
    }
}

function Resolve-Window {
    $front = [GlintUiaWindow]::GetForegroundWindow()
    if ($inputData.window.kind -eq 'foreground') {
        if ($front -ne [IntPtr]::Zero) { $uia::FromHandle($front) }
        return
    }
    if ($inputData.window.kind -eq 'observed') {
        $handle = [IntPtr]::new([long]$inputData.window.handle)
        if ($front -ne $handle) { return }
        $window = $uia::FromHandle($handle)
        if ($window -and $window.Current.ProcessId -eq $inputData.window.process) { $window }
        return
    }
    if ($inputData.window.kind -ne 'settings') { return }
    $settings = @(Get-Process -Name SystemSettings -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $session })
    # UWP Settings may live below a window hosted by ApplicationFrameHost.
    if ($front -eq [IntPtr]::Zero) { return }
    $window = $uia::FromHandle($front)
    foreach ($process in $settings) {
        if ($window.Current.ProcessId -eq $process.Id) { return $window }
        if ($window.Current.ClassName -eq 'ApplicationFrameWindow') {
            $byProcess = $propertyCondition::new($uia::ProcessIdProperty, [int]$process.Id)
            if ($window.FindFirst($scope::Descendants, $byProcess)) { return $window }
        }
    }
}

function New-MatchCondition($query) {
    $properties = @()
    if ($query.names) {
        $names = @($query.names | ForEach-Object { $propertyCondition::new($uia::NameProperty, [string]$_, $ignoreCase) })
        if ($names.Count -eq 1) { $properties += $names[0] }
        else { $properties += [System.Windows.Automation.OrCondition]::new([System.Windows.Automation.Condition[]]$names) }
    }
    if ($query.automationId) {
        $properties += $propertyCondition::new($uia::AutomationIdProperty, [string]$query.automationId, $ignoreCase)
    }
    if ($query.types) {
        $types = @($query.types | ForEach-Object {
            $type = [System.Windows.Automation.ControlType].GetField([string]$_).GetValue($null)
            $propertyCondition::new($uia::ControlTypeProperty, $type)
        })
        if ($types.Count -eq 1) { $properties += $types[0] }
        else { $properties += [System.Windows.Automation.OrCondition]::new([System.Windows.Automation.Condition[]]$types) }
    }
    if ($properties.Count -eq 0) { return $trueCondition }
    if ($properties.Count -eq 1) { return $properties[0] }
    [System.Windows.Automation.AndCondition]::new([System.Windows.Automation.Condition[]]$properties)
}

function Find-Elements($window, $query) {
    $searchScope = if ($query.children) { $scope::Children } else { $scope::Descendants }
    $found = $window.FindAll($searchScope, (New-MatchCondition $query))
    $limit = if ($inputData.operation -eq 'inspect') { 220 } else { 80 }
    if ($found.Count -gt $limit -and $inputData.operation -ne 'inspect') { throw 'Query too broad' }
    for ($index = 0; $index -lt [Math]::Min($limit, $found.Count); $index++) {
        $element = $found[$index]
        if ($query.ancestor -and -not @(Get-Ancestors $element $window | Where-Object {
            $_.name -eq $query.ancestor -or $_.automationId -eq $query.ancestor
        }).Count) { continue }
        $element
    }
}

function Test-Window($window) {
    $front = [GlintUiaWindow]::GetForegroundWindow()
    $front -ne [IntPtr]::Zero -and $window.Equals($uia::FromHandle($front)) -and
        (-not $inputData.binding -or
            ($front.ToInt64().ToString() -eq $inputData.binding.handle -and $window.Current.ProcessId -eq $inputData.binding.process))
}

function Test-Exposed($element, $window) {
    $info = $element.Current
    $rect = $info.BoundingRectangle
    if ($info.IsOffscreen -or $rect.IsEmpty) { return $false }
    # XAML card text can be a sibling of its transparent action button.
    # Clip against the accessible scroll viewport and verify the native
    # foreground window covers the target center without using a mouse click.
    $x = [int][Math]::Round(($rect.Left + $rect.Right) / 2)
    $y = [int][Math]::Round(($rect.Top + $rect.Bottom) / 2)
    $parent = $walker.GetParent($element)
    for ($depth = 0; $parent -and $depth -lt 12; $depth++) {
        if ($parent.Equals($window) -or $parent.Current.AutomationId -match 'ScrollViewer$') {
            $clip = $parent.Current.BoundingRectangle
            if (-not $clip.IsEmpty -and -not $clip.Contains($x, $y)) { return $false }
        }
        if ($parent.Equals($window)) { break }
        $parent = $walker.GetParent($parent)
    }
    [GlintUiaWindow]::IsForegroundAt($x, $y)
}

try {
    $window = Resolve-Window
    if (-not $window -or $window.Current.IsOffscreen -or -not (Test-Window $window)) {
        Write-Result @{ status = 'window-unavailable' }
        exit 0
    }
    $context = @{
        handle = [GlintUiaWindow]::GetForegroundWindow().ToInt64().ToString()
        process = $window.Current.ProcessId
        name = $window.Current.Name
        className = $window.Current.ClassName
        executable = (Get-Process -Id $window.Current.ProcessId).ProcessName
    }
    $elements = @(Find-Elements $window $inputData.query)
    if ($inputData.operation -in @('inspect', 'find')) {
        $items = @(foreach ($element in $elements) {
            Get-ElementInfo $element $window ($inputData.operation -eq 'find')
        })
        if (-not (Test-Window $window)) { Write-Result @{ status = 'window-unavailable' }; exit 0 }
        Write-Result @{ status = 'observed'; window = $context; items = $items }
        exit 0
    }

    # An action is bound to a previous observation. Repeat all identity checks
    # inside the worker immediately before touching the live element.
    $matching = @($elements | Where-Object {
        ($_.GetRuntimeId() -join '.') -eq $inputData.element.runtimeId -and
        $_.Current.ProcessId -eq $inputData.element.process -and
        $_.Current.AutomationId -ceq $inputData.element.automationId -and
        $_.Current.Name -ceq $inputData.element.name -and
        $_.Current.ControlType.ProgrammaticName -ceq ('ControlType.' + $inputData.element.type) -and
        (@(Get-Ancestors $_ $window | ForEach-Object { $_.type + '|' + $_.name + '|' + $_.automationId }) -join [char]31) -ceq $inputData.element.hierarchy
    })
    if ($matching.Count -ne 1 -or -not (Test-Window $window)) { Write-Result @{ status = 'stale' }; exit 0 }
    $element = $matching[0]
    if ($inputData.operation -eq 'bounds') {
        if (-not (Test-Exposed $element $window)) { Write-Result @{ status = 'not-visible' }; exit 0 }
        Write-Result @{ status = 'observed'; window = $context; items = @(Get-ElementInfo $element $window $true) }
        exit 0
    }
    if ($inputData.operation -eq 'scroll') {
        $pattern = Get-Pattern $element 'ScrollItem'
        if ($pattern) { $pattern.ScrollIntoView() }
        else {
            # Windows Settings often provides Scroll on the enclosing page only.
            $parent = $walker.GetParent($element)
            for ($depth = 0; $parent -and $depth -lt 12; $depth++) {
                $pattern = Get-Pattern $parent 'Scroll'
                if ($pattern -and $pattern.Current.VerticallyScrollable) { break }
                $pattern = $null
                if ($parent.Equals($window)) { break }
                $parent = $walker.GetParent($parent)
            }
            if (-not $pattern) { Write-Result @{ status = 'unsupported-pattern' }; exit 0 }
            $rect = $element.Current.BoundingRectangle
            $parentRect = $parent.Current.BoundingRectangle
            $direction = if ((-not $rect.IsEmpty -and $rect.Top -lt $parentRect.Top) -or
                ($rect.IsEmpty -and $pattern.Current.VerticalScrollPercent -ge 99)) {
                [System.Windows.Automation.ScrollAmount]::LargeDecrement
            } else { [System.Windows.Automation.ScrollAmount]::LargeIncrement }
            $pattern.Scroll([System.Windows.Automation.ScrollAmount]::NoAmount, $direction)
        }
        Write-Result @{ status = 'dispatched'; window = $context }
        exit 0
    }
    if (-not $element.Current.IsEnabled -or -not (Test-Exposed $element $window) -or -not (Test-Window $window)) {
        Write-Result @{ status = 'not-actionable' }
        exit 0
    }
    if ($inputData.operation -eq 'navigate') {
        # This operation is only called by main with a policy-owned transition.
        $type = $element.Current.ControlType
        if (($inputData.action -notin @('expand', 'collapse') -or $type -ne [System.Windows.Automation.ControlType]::ComboBox) -and
            $type -notin @([System.Windows.Automation.ControlType]::Button,
            [System.Windows.Automation.ControlType]::Hyperlink, [System.Windows.Automation.ControlType]::TabItem,
            [System.Windows.Automation.ControlType]::TreeItem, [System.Windows.Automation.ControlType]::ListItem,
            [System.Windows.Automation.ControlType]::MenuItem)) { Write-Result @{ status = 'unsupported-pattern' }; exit 0 }
        if ((Get-Pattern $element 'Toggle') -or ($inputData.action -eq 'invoke' -and (Get-Pattern $element 'Value'))) {
            Write-Result @{ status = 'unsupported-pattern' }; exit 0
        }
        if ($inputData.action -in @('expand', 'collapse')) {
            $pattern = Get-Pattern $element 'ExpandCollapse'
            if (-not $pattern) { Write-Result @{ status = 'unsupported-pattern' }; exit 0 }
            if ($inputData.action -eq 'expand' -and $pattern.Current.ExpandCollapseState -eq [System.Windows.Automation.ExpandCollapseState]::Collapsed) {
                $pattern.Expand()
            } elseif ($inputData.action -eq 'collapse' -and $pattern.Current.ExpandCollapseState -eq [System.Windows.Automation.ExpandCollapseState]::Expanded) {
                $pattern.Collapse()
            }
        } elseif ($inputData.action -eq 'select') {
            $pattern = Get-Pattern $element 'SelectionItem'
            if (-not $pattern) { Write-Result @{ status = 'unsupported-pattern' }; exit 0 }
            $pattern.Select()
        } else {
            $pattern = Get-Pattern $element 'Invoke'
            if (-not $pattern) { Write-Result @{ status = 'unsupported-pattern' }; exit 0 }
            $pattern.Invoke()
        }
        Write-Result @{ status = 'dispatched'; window = $context }
        exit 0
    }
    if ($inputData.operation -eq 'toggle' -and $inputData.window.kind -eq 'settings') {
        $pattern = Get-Pattern $element 'Toggle'
        if (-not $pattern -or [string]$pattern.Current.ToggleState -ne $inputData.expectedState) {
            Write-Result @{ status = 'state-changed' }; exit 0
        }
        $pattern.Toggle()
        Write-Result @{ status = 'dispatched'; window = $context }
        exit 0
    }
    Write-Result @{ status = 'unsupported-operation' }
} catch [System.Windows.Automation.ElementNotAvailableException] {
    Write-Result @{ status = 'stale' }
} catch [System.Windows.Automation.ElementNotEnabledException] {
    Write-Result @{ status = 'not-actionable' }
} catch {
    Write-Result @{ status = 'provider-error' }
}
