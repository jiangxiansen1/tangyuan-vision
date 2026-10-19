# tools/watch-photos.ps1
#
# 监听一个文件夹，照片有变动时自动导入网站。
#
# 为什么需要这个脚本
# ------------------
# 网站部署在 GitHub Pages，内容只能来自 git 仓库；而 F:\样片 在你本地磁盘上，
# GitHub 访问不到它。所以"文件夹一变网站就变"没有别的实现方式：
#
#     F:\样片 变化 → 本脚本 → 压缩导入 → git 提交 → GitHub Actions 部署
#
# 原图不进仓库：几百 MB 的原图会撑爆仓库，网页也只需要长边 1920 的成品。
#
# 为什么用轮询而不是 FileSystemWatcher
# ------------------------------------
# FileSystemWatcher 看起来更"实时"，但它的回调跑在别的作用域里：脚本变量读不到，
# 内部缓冲默认只有 8KB（相机的连拍会直接溢出丢事件），还要额外处理重命名事件。
# 每 5 秒比对一次「文件数 + 最新修改时间」既简单又不会漏，代价可以忽略。
#
# 用法
# ----
#   powershell -File tools\watch-photos.ps1                 # 监听并自动提交，不推送
#   powershell -File tools\watch-photos.ps1 -Push           # 监听 + 自动提交 + 自动推送
#   powershell -File tools\watch-photos.ps1 -Once           # 只处理一次，不常驻
#
# 默认不自动推送：提交留在本地，你看过 `git log` 再推。加 -Push 才是全自动。

[CmdletBinding()]
param(
    # 被监听的文件夹
    [string]$Source = 'F:\样片',

    # 停止变动多少秒后才动手。连拍会连续产生几十张图，
    # 每变一次就导入一次会让脚本和 git 都过载。
    [int]$DebounceSeconds = 25,

    # 多久检查一次
    [int]$PollSeconds = 5,

    # 全自动：导入后直接提交并推送
    [switch]$Push,

    # 只跑一次（给计划任务用，或者手动补一次）
    [switch]$Once
)

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$python = 'C:\Users\pc\.dsh\dsh-runtimes\dsh-plugin-desktop-primary-runtime\dependencies\python\python.exe'
$importScript = Join-Path $PSScriptRoot 'import-photos.py'
$imageExt = '\.(jpe?g|png|webp|heic|tiff?)$'

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

# 「文件数 + 最新修改时间」足以代表一次变动，比逐个文件做哈希便宜得多
function Get-Signature {
    $files = @(Get-ChildItem -LiteralPath $Source -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match $imageExt })
    if ($files.Count -eq 0) { return '0|none' }
    $newest = ($files | Measure-Object -Property LastWriteTime -Maximum).Maximum
    return "$($files.Count)|$($newest.Ticks)"
}

# 真正的处理流程。返回 $true 表示产生了新的提交。
function Invoke-Import {
    Write-Step '开始导入…'

    Push-Location $repo
    try {
        # 1) 导入（脚本自己会跳过已经导过的文件）
        $output = & $python $importScript $Source --apply 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Step "导入失败（退出码 $LASTEXITCODE），未改动任何内容。" 'Red'
            $output | Select-Object -Last 15 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
            return $false
        }

        # 2) 有变化才提交。以 git 为准，不信脚本的输出。
        $changed = @(git status --porcelain)
        if ($changed.Count -eq 0) {
            Write-Step '没有新作品需要提交。' 'DarkGray'
            return $false
        }

        Write-Step "检测到 $($changed.Count) 处变化，提交中…"
        $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
        git add -A | Out-Null
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

# ---- 一次性模式 ----------------------------------------------------------
if ($Once) {
    Invoke-Import | Out-Null
    exit 0
}

# ---- 常驻监听 ------------------------------------------------------------
Write-Step "监听：$Source" 'Green'
Write-Step "防抖 ${DebounceSeconds}s · 轮询 ${PollSeconds}s · 自动推送：$(if ($Push) { '是' } else { '否' })"
Write-Host '按 Ctrl+C 停止。' -ForegroundColor DarkGray

$signature = Get-Signature
$pendingSince = $null
Write-Step "当前基线：$($signature.Split('|')[0]) 张图片" 'DarkGray'

while ($true) {
    Start-Sleep -Seconds $PollSeconds

    $now = Get-Signature
    if ($now -ne $signature) {
        # 还在变：重置计时，等它稳定下来
        $signature = $now
        $pendingSince = Get-Date
        Write-Step '检测到变动，等待稳定…' 'DarkGray'
        continue
    }

    if ($pendingSince) {
        $quiet = ((Get-Date) - $pendingSince).TotalSeconds
        if ($quiet -ge $DebounceSeconds) {
            Invoke-Import | Out-Null
            # 导入后重新取基线：导入过程本身会写 public/assets，但那不在被监听目录里，
            # 所以基线只有素材文件夹的变化。
            $signature = Get-Signature
            $pendingSince = $null
        }
    }
}
