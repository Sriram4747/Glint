$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$voice = Join-Path $root 'resources/whisper'
$stagedVoice = Join-Path $root 'dist/portable-resources/whisper'
$relayFile = Join-Path $root '.glint-release/relay.json'
$stagedRelay = Join-Path $root 'dist/portable-resources/gemini-relay.json'

$voiceFiles = @('ggml-small-q5_1.bin', 'bin/whisper-cli.exe', 'bin/whisper.dll', 'bin/ggml.dll',
    'bin/ggml-base.dll', 'bin/ggml-cpu.dll')
foreach ($file in $voiceFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $voice $file) -PathType Leaf)) {
        throw "Missing local voice file $file. Run npm run setup:voice before packaging."
    }
}

# Copy the official x64 app-local redistributables needed by Whisper, including
# the OpenMP runtime. The test PC then needs no separate VC++ installation.
$redist = $env:VCToolsRedistDir
if (-not $redist) {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
    if (Test-Path -LiteralPath $vswhere -PathType Leaf) {
        $vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Redist.14.Latest -property installationPath
        if ($vs) {
            $redistRoot = Join-Path $vs 'VC/Redist/MSVC'
            $redist = Get-ChildItem -LiteralPath $redistRoot -Directory |
                Where-Object Name -Match '^\d+\.\d+\.\d+$' |
                Sort-Object { [version]$_.Name } -Descending |
                Select-Object -First 1 -ExpandProperty FullName
        }
    }
}
if (-not $redist) {
    throw 'Visual Studio C++ x64 redistributable files are required on the build PC. Install the VC++ redistributable component or use a Visual Studio developer prompt.'
}

$runtimeFiles = @('msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll', 'vcomp140.dll')
$bin = Join-Path $stagedVoice 'bin'
New-Item -ItemType Directory -Path $bin -Force | Out-Null
if (Test-Path -LiteralPath $relayFile -PathType Leaf) {
    $relay = Get-Content -LiteralPath $relayFile -Raw | ConvertFrom-Json
    $endpoint = [Uri]$relay.endpoint
    if (-not $endpoint.IsAbsoluteUri -or $endpoint.Scheme -ne 'https' -or $endpoint.AbsolutePath -ne '/' -or
        $endpoint.UserInfo -or $endpoint.Query -or $endpoint.Fragment -or $relay.token -cnotmatch '^glint_[A-Za-z0-9_-]{43}$') {
        throw 'Invalid locally provisioned Glint relay configuration.'
    }
    $config = @{ endpoint = $endpoint.GetLeftPart([UriPartial]::Authority); token = $relay.token } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($stagedRelay, $config, [Text.UTF8Encoding]::new($false))
} elseif (Test-Path -LiteralPath $stagedRelay -PathType Leaf) {
    Remove-Item -LiteralPath $stagedRelay
}
$redistX64 = Join-Path $redist 'x64'
foreach ($name in $runtimeFiles) {
    $dll = Get-ChildItem -LiteralPath $redistX64 -Directory |
        Where-Object Name -Match '^Microsoft\.VC\d+\.(CRT|OpenMP)$' |
        ForEach-Object { Get-Item -LiteralPath (Join-Path $_.FullName $name) -ErrorAction SilentlyContinue } |
        Select-Object -First 1
    if (-not $dll) { throw "The x64 Visual Studio redistributable directory is missing $name." }
    Copy-Item -LiteralPath $dll.FullName -Destination $bin -Force
}

$licenses = @{
    'LICENSE.whisper.cpp.txt' = 'https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.8.3/LICENSE'
    'LICENSE.whisper-model.txt' = 'https://raw.githubusercontent.com/openai/whisper/v20250625/LICENSE'
}
foreach ($name in $licenses.Keys) {
    $license = Join-Path $stagedVoice $name
    if (-not (Test-Path -LiteralPath $license -PathType Leaf)) {
        $download = "$license.download"
        curl.exe --fail --location --silent --show-error --retry 2 --output $download $licenses[$name]
        if ($LASTEXITCODE -ne 0) { throw "Could not download the upstream license $name." }
        Move-Item -LiteralPath $download -Destination $license
    }
}

Push-Location -LiteralPath $root
try {
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & (Join-Path $root 'node_modules/.bin/electron-builder.cmd') --config electron-builder.yml
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Copy-Item -LiteralPath (Join-Path $root 'dist/portable/Glint.exe') -Destination (Join-Path $root 'Glint.exe') -Force
    Write-Host "Portable release ready: $(Join-Path $root 'Glint.exe')"
} finally {
    Pop-Location
}
