cd "C:\Users\pc\Documents\deepseek-harness\default-workspace\tangyuan-vision"
# Screenshot with REAL time, not virtual time.
#
# --virtual-time-budget fast-forwards timers, which is right for a static page and
# wrong for a map: tiles are real network requests that need real milliseconds. Here
# the browser is left open for a wall-clock period and then asked for a screenshot.
#
# NOTE: this file is deliberately ASCII-only. Windows PowerShell 5.1 reads .ps1 files
# as CP936 on this machine unless they carry a BOM, so a multibyte character such as a
# typographic ellipsis corrupts the string it sits in and the script fails to parse.
# That is exactly what happened on the first attempt.

$out = [System.IO.Path]::GetFullPath("tools\_verify\map")
$browser = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$env:no_proxy=$null; $env:https_proxy=$null; $env:http_proxy=$null; $env:all_proxy=$null
$env:NO_PROXY='localhost,127.0.0.1'

function ShotSlow([string]$url, [string]$name, [int]$seconds) {
  $png = Join-Path $out $name
  if (Test-Path $png) { Remove-Item $png -Force }
  $prof = Join-Path $env:TEMP "tv-slow-$([guid]::NewGuid().ToString('N').Substring(0,8))"

  $args = @('--headless=new','--no-sandbox','--disable-extensions','--window-size=1440,1000',
            "--user-data-dir=$prof", '--hide-scrollbars',
            "--screenshot=$png", $url)
  $p = Start-Process -FilePath $browser -ArgumentList $args -PassThru -NoNewWindow `
    -RedirectStandardOutput ($png + '.out') -RedirectStandardError ($png + '.err')
  Write-Host ("  waiting for tiles... {0}s" -f $seconds)
  Start-Sleep -Seconds $seconds
  if (-not $p.HasExited) { $p.Kill() }
  if (Test-Path $png) {
    $kb = [int]((Get-Item $png).Length / 1KB)
    Write-Host ("  {0,-24} {1,7} KB" -f $name, $kb)
  } else {
    Write-Host ("  {0,-24} FAILED" -f $name)
  }
}

ShotSlow 'http://127.0.0.1:5183/earth' 'earth-map-slow.png' 55
