# tools/watch-photos.ps1
#
# 监听一个文件夹，照片有变动时自动导入网站。
#
# 为什么需要这个脚本
# ------------------
# 网站部署在 GitHub Pages，内容只能来自 git 仓库；而素材文件夹在你本地磁盘上，
# GitHub 访问不到它。所以「文件夹一变网站就变」没有别的实现方式：
#
#     素材文件夹变化 -> 本脚本 -> 压缩导入 -> git 提交 -> GitHub Actions 部署
#
# 原图不进仓库：几百 MB 的原图会撑爆仓库，网页只需要长边 1920 的成品。
#
# 为什么用轮询而不是 FileSystemWatcher
# ------------------------------------
# FileSystemWatcher 的回调跑在别的作用域里（脚本变量读不到），内部缓冲默认只有
# 8KB（相机连拍会直接溢出丢事件），还要额外处理重命名。每 5 秒比对一次
# 「文件数 + 最新修改时间」既简单又不会漏，代价可以忽略。
#
# 用法
# ----
#   powershell -File tools\watch-photos.ps1                    监听 + 自动提交，不推送
#   powershell -File tools\watch-photos.ps1 -Push              全自动（含推送）
#   powershell -File tools\watch-photos.ps1 -Once              只处理一次，不常驻
#
# 默认不自动推送：提交留在本地，你看过 git log 再推。加 -Push 才是全自动。

[CmdletBinding()]
param(
    [string]$Source = 'F:\样片',
    [int]$DebounceSeconds = 25,
    [int]$PollSeconds = 5,
    [switch]$Push,
    [switch]$Once
)

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$python = 'C:\Users\pc\.dsh\dsh-runtimes\dsh-plugin-desktop-primary-runtime\dependencies\python\python.exe'
$importScript = Join-Path $PSScriptRoot 'import-photos.py'
$imageExt = '\.(jpe?g|png|webp|heic|tiff?)$'

# 只提交这些路径。早先用的是 git add -A，那会把工作区里任何未提交的改动
# （临时脚本、半成品代码）一起卷进自动提交 —— 已经发生过一次，不该再发生。
$photoPaths = @(
    'public/assets/photography',
    'src/content/data/photography.json',
    'src/content/data/travel-photos.json',
    'src/content/data/travels.json',
    'src/content/data/.photo-imports.json'
)

if (-not (Test-Path $Source)) {
    Write-Host "找不到素材文件夹：$Source" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $python)) {
    Write-Host "找不到 Python：$python" -ForegroundColor Red
    exit 1
}

function Write-Step([string]$text, [string]$color = 'Cyan') {
    Write-Host ("[{0:HH:mm:ss}] {1}" -f (Get-Date), $text) -ForegroundColor $color
}

function Get-Signature {
    $files = @(Get-ChildItem -LiteralPath $Source -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match $imageExt })
    if ($files.Count -eq 0) { return '0|none' }
    $newest = ($files | Measure-Object -Property LastWriteTime -Maximum).Maximum
    return "$($files.Count)|$($newest.Ticks)"
}

function Invoke-Import {
    Write-Step '开始导入…'

    Push-Location $repo
    try {
        $output = & $python $importScript $Source --apply 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Step "导入失败（退出码 $LASTEXITCODE），未改动任何内容。" 'Red'
            $output | Select-Object -Last 15 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
            return $false
        }

        $changed = @(git status --porcelain -- $photoPaths)
        if ($changed.Count -eq 0) {
            Write-Step '没有新作品需要提交。' 'DarkGray'
            return $false
        }

        Write-Step "检测到 $($changed.Count) 处变化，提交中…"
        $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
        git add -- $photoPaths | Out-Null
        git commit -m "content(photos): auto-import at $stamp" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Step '提交失败（git 身份未配置？）。' 'Red'
            return $false
        }

        if ($Push) {
            Write-Step '推送…'
            git push origin master 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Step '已推送，约 2-3 分钟后网站更新。' 'Green'
            }
            else {
                Write-Step '推送失败（网络/凭据）。提交仍在本地，稍后手动 git push。' 'Yellow'
            }
        }
        else {
            Write-Step '已提交（未推送）。确认后执行：git push' 'Green'
        }
        return $true
    }
    finally {
        Pop-Location
    }
}

if ($Once) {
    Invoke-Import | Out-Null
    exit 0
}

Write-Step "监听：$Source" 'Green'
Write-Step "防抖 ${DebounceSeconds}s · 轮询 ${PollSeconds}s · 自动推送：$(if ($Push) { '是' } else { '否' })"
Write-Host '按 Ctrl+C 停止。' -ForegroundColor DarkGray

$signature = Get-Signature
$pendingSince = $null
Write-Step "基线：$($signature.Split('|')[0]) 张图片" 'DarkGray'

while ($true) {
    Start-Sleep -Seconds $PollSeconds

    $now = Get-Signature
    if ($now -ne $signature) {
        $signature = $now
        $pendingSince = Get-Date
        Write-Step '检测到变动，等待稳定…' 'DarkGray'
        continue
    }

    if ($pendingSince) {
        if (((Get-Date) - $pendingSince).TotalSeconds -ge $DebounceSeconds) {
            Invoke-Import | Out-Null
            $signature = Get-Signature
            $pendingSince = $null
        }
    }
}