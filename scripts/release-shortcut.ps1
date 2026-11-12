param([Parameter(Mandatory=$true)][string]$Version)
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid version' }
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../release'))
$target = (Resolve-Path -LiteralPath (Join-Path $releaseRoot "windows-$Version/win-unpacked/J人日程APP.exe")).Path
if (-not $target.StartsWith($releaseRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Target outside release' }
$launcher = Join-Path $releaseRoot 'launch-current.vbs'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'launch-current.vbs') -Destination $launcher -Force
[IO.File]::WriteAllText((Join-Path $releaseRoot 'current-version.txt'), "windows-$Version\win-unpacked\J人日程APP.exe", [Text.Encoding]::Unicode)
# Use a persona-specific path so Explorer does not reuse the old app.ico cache.
$persona = 'ISTJ'
$config = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'j-personal-schedule/data/appearance.json'
if (Test-Path -LiteralPath $config) {
  try {
    $candidate = (Get-Content -LiteralPath $config -Raw | ConvertFrom-Json).persona
    if ($candidate -in @('INTJ','ENTJ','INFJ','ENFJ','ISTJ','ESTJ','ISFJ','ESFJ')) { $persona = $candidate }
  } catch { Write-Warning 'Cannot read local appearance; using default icon.' }
}
$iconFolder = Join-Path $releaseRoot 'icons'
New-Item -ItemType Directory -Force -Path $iconFolder | Out-Null
$icon = Join-Path $iconFolder ($persona + '.ico')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot ("../assets/personas/$persona/app.ico")) -Destination $icon -Force
$hostExe = Join-Path $env:WINDIR 'System32/wscript.exe'
$shell = New-Object -ComObject WScript.Shell
function Set-AppLink($path) {
  $link = $shell.CreateShortcut($path)
  $link.TargetPath = $hostExe
  $link.Arguments = '"' + $launcher + '"'
  $link.WorkingDirectory = $releaseRoot
  $link.Description = 'J人日程APP · 始终启动当前版本'
  $link.IconLocation = "$icon,0"
  $link.Save()
  if ($shell.CreateShortcut($path).TargetPath -ne $hostExe) { throw 'Shortcut verification failed' }
}
Set-AppLink (Join-Path $releaseRoot 'J人日程APP.lnk')
# Migrate copies belonging to this installation only, preserving unrelated links.
$desktop = [Environment]::GetFolderPath('Desktop')
foreach ($file in Get-ChildItem -LiteralPath $desktop -Filter '*.lnk') {
  $old = $shell.CreateShortcut($file.FullName)
  if ($old.TargetPath.StartsWith($releaseRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or $old.Arguments -eq ('"' + $launcher + '"')) { Set-AppLink $file.FullName }
}
$standard = Join-Path $desktop 'J人日程APP.lnk'
if (-not (Test-Path -LiteralPath $standard)) { Set-AppLink $standard }
Write-Output "Stable launcher updated to $Version"
