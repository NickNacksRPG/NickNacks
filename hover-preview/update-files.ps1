<#
update-html-files.ps1  –  PowerShell 5 edition
──────────────────────────────────────────────
• Copies helper scripts (hover-preview & mb-lite)
• Injects <link>/<script> tags into every exported *.html
• Appends sidebar-toggle code to webpage.js once
#>

# ---------- 0 · Paths ----------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$CssDir    = Join-Path $ScriptDir '..\lib\styles'
$JsDir     = Join-Path $ScriptDir '..\lib\scripts'

New-Item -Path $CssDir -ItemType Directory -Force | Out-Null
New-Item -Path $JsDir  -ItemType Directory -Force | Out-Null

# ---------- 1 · Copy helper assets ----------
Write-Host "▶ Copying helper assets …"
Copy-Item "$ScriptDir\hover-preview.css" "$CssDir\hover-preview.css" -Force
Copy-Item "$ScriptDir\hover-preview.js"  "$JsDir\hover-preview.js"  -Force
Copy-Item "$ScriptDir\mb-lite.js"        "$JsDir\mb-lite.js"        -Force
Write-Host "✔ Files copied.`n"

# ---------- 2 · Patch every HTML file ----------
$ExportRoot = Resolve-Path (Join-Path $ScriptDir '..')

Get-ChildItem -Path $ExportRoot -Recurse -Filter '*.html' | ForEach-Object {
    $Path = $_.FullName
    $Rel  = $Path.Substring($ExportRoot.Path.Length + 1)
    Write-Host "• Patching $Rel"

    $Html = (Get-Content $Path) -join "`n"

    # 2a · remove stale tags
    $Html = [regex]::Replace($Html, '(?m).*hover-preview\.css.*\r?\n?', '')
    $Html = [regex]::Replace($Html, '(?m).*hover-preview\.js.*\r?\n?',  '')
    $Html = [regex]::Replace($Html, '(?m).*mb-lite\.js.*\r?\n?',        '')
    $Html = [regex]::Replace($Html, '(?m).*mathjs@.*\r?\n?',             '')

    # 2b · inject CSS
    $CssBlock = '<link rel="stylesheet" href="lib/styles/hover-preview.css">'
    $Html = $Html -replace '</head>', "$CssBlock`r`n</head>"

    # 2c · inject JS
    $JsBlock = @"
<script src="https://cdn.jsdelivr.net/npm/mathjs@11/lib/browser/math.js"></script>
<script src="lib/scripts/mb-lite.js"></script>
<script src="lib/scripts/hover-preview.js"></script>
"@
    $Html = $Html -replace '</body>', "$JsBlock`r`n</body>"

    Set-Content -Path $Path -Value $Html -Encoding utf8
}

# ---------- 3 · Append sidebar code to webpage.js once ----------
Write-Host "`n▶ Waiting for lib/scripts/webpage.js …"
$WebPageJs = Join-Path $JsDir 'webpage.js'
while (-not (Test-Path $WebPageJs)) { Start-Sleep -Milliseconds 500 }

$Mark = '/* custom sidebar toggle  v1 */'
$Existing = Select-String -Path $WebPageJs -Pattern [regex]::Escape($Mark) -Quiet

if (-not $Existing) {
    Write-Host "• Appending sidebar toggle to webpage.js"

    $SidebarLines = Get-Content "$ScriptDir\webpage.js" |
                    ForEach-Object { "  $_" }            # indent

    Add-Content -Path $WebPageJs -Value "`r`n$Mark`r`n(function(){`r`n$($SidebarLines -join "`r`n")`r`n})();`r`n" -Encoding utf8
}
else {
    Write-Host "• Sidebar code already present — skipping"
}

Write-Host "`n✅  All HTML files and webpage.js updated."