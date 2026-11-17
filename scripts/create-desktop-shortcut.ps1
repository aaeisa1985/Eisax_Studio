$ErrorActionPreference = 'Stop'
$studioRoot = Split-Path -Parent $PSScriptRoot
$studioExecutable = Join-Path $studioRoot 'node_modules\electron\dist\electron.exe'
if (!(Test-Path -LiteralPath $studioExecutable)) { throw 'Run npm install first.' }
if (!(Test-Path -LiteralPath (Join-Path $studioRoot '.next\standalone\server.js'))) { throw 'Run npm run desktop:prepare first.' }

# ICO supports a PNG payload. Reuse the project's existing icon without redrawing it.
$studioIcon = Join-Path $studioRoot 'desktop\studio.ico'
$iconBytes = [IO.File]::ReadAllBytes((Join-Path $studioRoot 'public\icons\icon-192.png'))
$iconStream = [IO.File]::Create($studioIcon)
$iconWriter = [IO.BinaryWriter]::new($iconStream)
try {
    $iconWriter.Write([uint16]0)
    $iconWriter.Write([uint16]1)
    $iconWriter.Write([uint16]1)
    $iconWriter.Write([byte]192)
    $iconWriter.Write([byte]192)
    $iconWriter.Write([byte]0)
    $iconWriter.Write([byte]0)
    $iconWriter.Write([uint16]1)
    $iconWriter.Write([uint16]32)
    $iconWriter.Write([uint32]$iconBytes.Length)
    $iconWriter.Write([uint32]22)
    $iconWriter.Write($iconBytes)
} finally { $iconWriter.Dispose() }

$studioDesktop = [Environment]::GetFolderPath('Desktop')
$studioShortcutPath = Join-Path $studioDesktop 'EISAX Studio.lnk'
$studioShell = New-Object -ComObject WScript.Shell
$studioShortcut = $studioShell.CreateShortcut($studioShortcutPath)
$studioShortcut.TargetPath = $studioExecutable
$studioShortcut.Arguments = '"' + $studioRoot + '"'
$studioShortcut.WorkingDirectory = $studioRoot
$studioShortcut.IconLocation = $studioIcon + ',0'
$studioShortcut.Description = 'EISAX Studio — Documents and presentations'
$studioShortcut.WindowStyle = 1
$studioShortcut.Save()
Write-Output $studioShortcutPath
