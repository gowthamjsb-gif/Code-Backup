$bytes = [System.IO.File]::ReadAllBytes('client_script.js')
$content = [System.Text.Encoding]::UTF8.GetString($bytes)

# Replace the block
$pattern = '(?s)// â• â• .*?SLITTING: Silent auto-assign BOM \(no dialog â€” base fabric only\).*?// â• â• [^\n]*'
$replacement = @"
// ═══════════════════════════════════════════════════════════════════════
// SLITTING: Silent auto-assign BOM (no dialog — base fabric only)
// ═══════════════════════════════════════════════════════════════════════
"@

$newContent = $content -replace $pattern, $replacement

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Resolve-Path 'client_script.js').Path, $newContent, $utf8NoBom)
Write-Host "SUCCESS"
