# Reusable screenshot helper.
#
# Two host quirks are handled here, both of which produced silent failures earlier:
#
#  1. PowerShell's environment provider is CASE-INSENSITIVE, so having both
#     `https_proxy` and `HTTPS_PROXY` set makes Start-Process throw
#     "Item has already been added" before it launches anything. The duplicates are
#     cleared.
#  2. Edge needs an ABSOLUTE path for --screenshot. A relative one fails with
#     "系统找不到指定的路径" and no image is written.
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Width = 1440,
  [int]$Height = 1000,
  [int]$Budget = 22000
)

$env:no_proxy = $null
$env:https_proxy = $null
$env:http_proxy = $null
$env:all_proxy = $null
$env:NO_PROXY = 'localhost,127.0.0.1'

$browser = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$png = [System.IO.Path]::GetFullPath($Out)
$dir = [System.IO.Path]::GetDirectoryName($png)
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
if (Test-Path $png) { Remove-Item $png -Force }

$prof = Join-Path $env:TEMP ("tv-shot-" + [guid]::NewGuid().ToString('N').Substring(0, 8))

$arguments = @(
  '--headless=new', '--no-sandbox', '--disable-extensions',
  "--window-size=$Width,$Height",
  "--user-data-dir=$prof",
  "--virtual-time-budget=$Budget",
  "--screenshot=$png",
  $Url
)

$p = Start-Process -FilePath $browser -ArgumentList $arguments -PassThru -NoNewWindow `
  -RedirectStandardOutput ($png + '.out') -RedirectStandardError ($png + '.err')
if (-not $p.WaitForExit(170000)) { $p.Kill() }

if (Test-Path $png) {
  Write-Host ("  OK   {0}  ({1} KB)" -f (Split-Path $png -Leaf), [int]((Get-Item $png).Length / 1KB))
} else {
  Write-Host ("  FAIL {0}" -f (Split-Path $png -Leaf))
  Get-Content ($png + '.err') -ErrorAction SilentlyContinue |
    Where-Object { $_ -match 'Failed|error' } | Select-Object -First 3 | ForEach-Object { Write-Host ("       " + $_) }
}
