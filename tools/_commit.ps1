cd "C:\Users\pc\Documents\deepseek-harness\default-workspace\tangyuan-vision"

$msg = @'
feat(theme): restore the dark ground and fix the inline-shell colour leak

The site is dark-first again. The V2 palette is restored from the backup and the
defects that were hiding behind the light theme are fixed.

Why the dark ground did not take effect at first, and what actually caused it:
the `--color-canvas` token resolved correctly to #05070a, yet the page still
painted #F4F6F8, because index.html carries a LITERAL `background: {{SHELL_BG}}`
inside an inline <style>. An inline declaration beats a custom property that
nobody reads there, so the shell had to be pointed at the same source of truth as
everything else (settings.json themeColor / shell*) rather than hand-edited.

Three further layers were independently painting light and each had to be fixed:
  - theme.css opened with `:root, [data-ground='light']`, so the root default WAS
    the light override; the two had to be split
  - a duplicate `[data-ground='dark']` block sat later in the file and would have
    overridden the new defaults with the old light-era glass values
  - vision-backdrop's wash used white at 82%, which is a light theme, not an overlay

Contrast, measured in a real browser against the dark canvas:
  --c-fog    #6d7885 -> 4.49:1  FAILED AA by 0.01, and it is the most widely used
                                tertiary colour
  projects   #2f6ea8 -> 3.76:1  a scene accent authored for a light ground
  journal    #2e3641 -> 1.65:1  effectively invisible on obsidian
All three brightened; luminance is what carries contrast on a dark ground.
Result: 9/9 routes have no low-contrast text (was 1/9).

Also adds maplibre-gl 6.13.0 for the Earth map work, and tools/shot.ps1, which
handles two host quirks that were producing silent screenshot failures: the
case-insensitive duplicate proxy variables, and Edge requiring an absolute path
for --screenshot.
'@

git add -A
git commit -q -m $msg
Write-Host "=== log ==="
git log --oneline -3
Write-Host ""
Write-Host "=== changed files in this commit ==="
git show --stat --oneline HEAD | Select-Object -First 20
