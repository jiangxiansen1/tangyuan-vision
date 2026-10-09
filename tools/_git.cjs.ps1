cd "C:\Users\pc\Documents\deepseek-harness\default-workspace\tangyuan-vision"

Write-Host "=== git available? ==="
$git = (Get-Command git -ErrorAction SilentlyContinue)
if ($git) { Write-Host ("  " + $git.Source) } else { Write-Host "  no git on PATH" }

Write-Host ""
Write-Host "=== Phase 0: create a rollback point ==="
if (-not (Test-Path ".git")) {
  git init -q
  git config user.email "build@tangyuan.local"
  git config user.name "tangyuan-build"
  Write-Host "  git init done"
} else {
  Write-Host "  .git already present"
}

Write-Host ""
Write-Host "=== commit the V4 baseline (preserves every existing change) ==="
git add -A
$msg = "chore: V4 baseline before the V5 dark-theme refactor (checkpoint)"
git commit -q -m $msg
Write-Host "  commit recorded"

Write-Host ""
Write-Host "=== log ==="
git log --oneline -3

Write-Host ""
Write-Host "=== working tree (empty means clean) ==="
git status --short
