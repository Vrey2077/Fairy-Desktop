$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
$releaseVersion = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
if ($releaseVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version' }
$sourceList = & node (Join-Path $PSScriptRoot 'source-files.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Source manifest failed' }
& node (Join-Path $PSScriptRoot 'audit.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Privacy audit failed' }
$stageRoot = Join-Path $projectRoot ('work\release-' + [guid]::NewGuid().ToString('N'))
$sourceStage = Join-Path $stageRoot 'Fairy-Desktop-source'
$portableStage = Join-Path $stageRoot 'Fairy-Desktop'
New-Item -ItemType Directory -Path $sourceStage,$portableStage | Out-Null
foreach ($sourceFile in $sourceList) {
    $destination = [IO.Path]::GetFullPath((Join-Path $sourceStage $sourceFile))
    if (-not $destination.StartsWith($sourceStage + [IO.Path]::DirectorySeparatorChar)) { throw 'Unsafe source path' }
    New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot $sourceFile) -Destination $destination
}
New-Item -ItemType Directory -Path (Join-Path $portableStage 'release') | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'release\Fairy-win32-x64') -Destination (Join-Path $portableStage 'release\Fairy-win32-x64') -Recurse
foreach ($publicFile in @('启动 Fairy.cmd','README.md','README.en.md','CHANGELOG.md','LICENSE.txt','NOTICE','THIRD-PARTY-NOTICES.md','PRIVACY.md')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $publicFile) -Destination (Join-Path $portableStage $publicFile)
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs') -Destination (Join-Path $portableStage 'docs') -Recurse
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sourceZip = Join-Path $projectRoot "release\Fairy-Desktop-v$releaseVersion-source.zip"
$portableZip = Join-Path $projectRoot "release\Fairy-Desktop-v$releaseVersion-win32-x64.zip"
foreach ($archivePath in @($sourceZip,$portableZip)) { if (Test-Path -LiteralPath $archivePath) { throw "Archive already exists: $archivePath" } }
[IO.Compression.ZipFile]::CreateFromDirectory($sourceStage,$sourceZip,[IO.Compression.CompressionLevel]::Optimal,$true)
[IO.Compression.ZipFile]::CreateFromDirectory($portableStage,$portableZip,[IO.Compression.CompressionLevel]::Optimal,$true)
$checksumLines = @($sourceZip,$portableZip) | ForEach-Object { $hash=Get-FileHash -LiteralPath $_ -Algorithm SHA256; $hash.Hash.ToLowerInvariant() + '  ' + [IO.Path]::GetFileName($_) }
[IO.File]::WriteAllLines((Join-Path $projectRoot 'release\SHA256SUMS.txt'),$checksumLines,[Text.UTF8Encoding]::new($false))
Write-Output $checksumLines
