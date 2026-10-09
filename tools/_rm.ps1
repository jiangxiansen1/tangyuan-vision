cd "C:\Users\pc\Documents\deepseek-harness\default-workspace\tangyuan-vision"
# The auto-commit script had committed itself before deleting; drop it from tracking
# now that the scratch files are gone.
git rm --cached tools/_commit2.ps1 -q 2>$null
git add -A
git commit -q -m "chore: drop a scratch script that committed itself"
git log --oneline -1
git status --short
