cd "C:\Users\pc\Documents\deepseek-harness\default-workspace\tangyuan-vision"
# The commit message file staged itself before being deleted. Drop it from tracking.
git rm --cached tools/_msg.txt -q 2>$null
git add -A
git commit -q -m "chore: drop a message file that staged itself"
git status --short
git log --oneline -1
