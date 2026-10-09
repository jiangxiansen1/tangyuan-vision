cd "C:\Users\pc\Documents\deepseek-harness\default-workspace\tangyuan-vision"

# Remove the verification probes that leaked into public/.
#
# tools/audit-colors.cjs and friends write a temporary wrapper page into public/ so
# the served origin matches the origin under test. That is correct for the probe,
# but the wrappers must never be committed: they would be published to the live
# site as /__color-home.html and so on.
Write-Host "=== removing probe wrappers from public/ and dist/ ==="
Get-ChildItem public -File -Filter '__*' -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host ("  rm public/" + $_.Name)
  Remove-Item $_.FullName -Force
}
Get-ChildItem dist -File -Filter '__*' -ErrorAction SilentlyContinue | ForEach-Object {
  Remove-Item $_.FullName -Force
}

# Make the pattern self-documenting so the next probe does not reintroduce this.
$gi = ".gitignore"
$content = Get-Content $gi -Raw -Encoding UTF8
if ($content -notmatch 'public/__') {
  Add-Content -Path $gi -Encoding UTF8 -Value @'

# Temporary probe wrappers written into public/ by tools/audit-*.cjs and
# tools/verify-*.cjs while measuring a running site. They exist for the duration of
# a check and must never be published.
public/__*
'@
  Write-Host "  .gitignore updated"
}

# Also teach the probe tools to clean up after themselves.
foreach ($f in @('tools\audit-colors.cjs','tools\verify-glass.cjs','tools\verify-transition.cjs','tools\verify-earth-interaction.cjs','tools\audit-stack.cjs')) {
  if (-not (Test-Path $f)) { continue }
  $s = Get-Content $f -Raw -Encoding UTF8
  if ($s -match 'unlinkSync') { continue }
  # Insert a cleanup call right before the final summary of each probe.
  $patched = $s -replace '(?m)^(const dom = fs\.existsSync\(dump\))', @'
// Remove the probe wrapper from public/ as soon as the measurement is captured, so
// a published build can never contain it.
try {
  for (const f of fs.readdirSync(publicDir)) {
    if (f.startsWith('__')) fs.unlinkSync(path.join(publicDir, f));
  }
} catch { /* the directory is optional for dist-only runs */ }

$1
'@
  if ($patched -ne $s) {
    Set-Content -Path $f -Value $patched -Encoding UTF8 -NoNewline
    Write-Host ("  cleanup added to " + $f)
  }
}

Write-Host ""
Write-Host "=== staging and committing the cleanup ==="
git add -A
git commit -q -m @'
chore: stop verification probes leaking into public/

The audit and verify scripts write a temporary wrapper page into public/ so the
served origin matches the origin under test. Correct for the probe, wrong for the
repository: nine of them had been committed and would have shipped to the live site
as /__color-*.html.

They are now removed, .gitignore covers public/__*, and each probe deletes its own
wrapper immediately after capturing its measurement.
'@
git log --oneline -3
Write-Host ""
git show --stat --oneline HEAD | Select-Object -First 12
