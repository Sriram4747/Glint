# Receives only the current user's known folder from Electron main, or an empty
# value for This PC. Observes Explorer and emits a fixed verification token.
$ErrorActionPreference = 'Stop'
$path = $env:GLINT_EXPLORER_FOLDER
$item = $env:GLINT_EXPLORER_ITEM
$shell = New-Object -ComObject Shell.Application
if ([string]::IsNullOrEmpty($path)) {
    $destination = 0x11 # ssfDRIVES (This PC)
} else {
    $destination = $path
}
$folder = $shell.NameSpace($destination)
$expectedPath = [string]$folder.Self.Path
if (-not $expectedPath) { exit 0 }

$deadline = [Diagnostics.Stopwatch]::StartNew()
do {
    try {
        foreach ($window in $shell.Windows()) {
            try {
                if ([IO.Path]::GetFileName([string]$window.FullName) -ieq 'explorer.exe' -and
                    [string]$window.Document.Folder.Self.Path -ieq $expectedPath) {
                    if ($item) {
                        $selected = @($window.Document.SelectedItems() | ForEach-Object { [string]$_.Path })
                        if ($selected -inotcontains $item) { continue }
                    }
                    'verified'
                    exit 0
                }
            } catch {
                # A tab can close or change documents while Windows is enumerating it.
            }
        }
    } catch {
        # Shell windows also change during startup and Explorer restarts.
    }
    Start-Sleep -Milliseconds 150
} while ($deadline.ElapsedMilliseconds -lt 3000)
