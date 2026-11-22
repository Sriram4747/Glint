$ErrorActionPreference = 'Stop'
$voiceRoot = Join-Path (Split-Path -Parent $PSScriptRoot) 'resources\whisper'
$work = Join-Path $voiceRoot ([guid]::NewGuid().ToString('N'))
$bin = Join-Path $voiceRoot 'bin'
$model = Join-Path $voiceRoot 'ggml-small-q5_1.bin'
$modelHash = 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb'

function Get-Sha256($Path) {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    $file = [System.IO.File]::OpenRead($Path)
    try { return [BitConverter]::ToString($algorithm.ComputeHash($file)).Replace('-', '') }
    finally { $file.Dispose(); $algorithm.Dispose() }
}

function Get-VerifiedDownload($Url, $Path, $Hash) {
    curl.exe --fail --location --silent --show-error --retry 2 --output $Path $Url
    if ($LASTEXITCODE -ne 0) { throw "Download failed for $Url" }
    if ((Get-Sha256 $Path) -ne $Hash) {
        throw "SHA-256 verification failed for $Url"
    }
}

New-Item -ItemType Directory -Path $work -Force | Out-Null
try {
    if (-not (Test-Path -LiteralPath (Join-Path $bin 'whisper-cli.exe') -PathType Leaf)) {
        $zip = Join-Path $work 'whisper.zip'
        $expanded = Join-Path $work 'expanded'
        Get-VerifiedDownload 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.3/whisper-bin-x64.zip' $zip `
            'd824b1e37599f882b396e73f1ee0bfd5d0529f700314c48311dcbd00b803321d'
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $expanded)
        $cli = Get-ChildItem -LiteralPath $expanded -Recurse -File -Filter 'whisper-cli.exe' | Select-Object -First 1
        if (-not $cli) { throw 'The whisper.cpp archive did not contain whisper-cli.exe.' }
        New-Item -ItemType Directory -Path $bin -Force | Out-Null
        Get-ChildItem -LiteralPath $cli.DirectoryName -File -Filter '*.dll' | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $bin -Force
        }
        Copy-Item -LiteralPath $cli.FullName -Destination $bin -Force
    }

    if (-not (Test-Path -LiteralPath $model -PathType Leaf) -or (Get-Sha256 $model) -ne $modelHash) {
        $download = Join-Path $work 'model.bin'
        Get-VerifiedDownload 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin' $download $modelHash
        Copy-Item -LiteralPath $download -Destination $model -Force
    }
    Write-Host 'Glint local voice is ready.'
} finally {
    $rootPath = (Resolve-Path -LiteralPath $voiceRoot).ProviderPath
    $workPath = (Resolve-Path -LiteralPath $work).ProviderPath
    if ((Split-Path -Parent $workPath) -eq $rootPath) {
        Remove-Item -LiteralPath $workPath -Recurse -Force
    }
}
