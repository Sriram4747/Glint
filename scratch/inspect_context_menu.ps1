Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = [System.Windows.Automation.Condition]::TrueCondition
$children = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)

Write-Host "--- TOP LEVEL WINDOWS ---"
foreach ($c in $children) {
    $cls = $c.Current.ClassName
    $name = $c.Current.Name
    $rect = $c.Current.BoundingRectangle
    if ($cls -eq "#32768" -or $cls -like "*Menu*" -or $cls -like "*Popup*" -or $name -like "*Explorer*") {
        Write-Host "Window: Name='$name', Class='$cls', Rect=$rect"

        $desc = $c.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
        foreach ($d in $desc) {
            if ($d.Current.Name) {
                Write-Host "   Element: Name='$($d.Current.Name)', Type='$($d.Current.ControlType.ProgrammaticName)', Class='$($d.Current.ClassName)'"
            }
        }
    }
}
