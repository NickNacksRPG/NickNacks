<#
update-html-files.ps1  –  Windows PowerShell 5
──────────────────────────────────────────────
• Copies helper scripts (hover-preview, mb-lite, add-expressions)
• Injects <link>/<script> tags into every exported *.html
• Appends sidebar-toggle code to webpage.js once
#>

# ---------- 0 · Paths ----------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$CssDir    = Join-Path $ScriptDir '..\lib\styles'
$JsDir     = Join-Path $ScriptDir '..\lib\scripts'

New-Item $CssDir -ItemType Directory -Force | Out-Null
New-Item $JsDir  -ItemType Directory -Force | Out-Null

# ---------- 1 · Copy helper assets ----------
Copy-Item "$ScriptDir\hover-preview.css"  "$CssDir" -Force
Copy-Item "$ScriptDir\hover-preview.js"   "$JsDir"  -Force
Copy-Item "$ScriptDir\mb-lite.js"         "$JsDir"  -Force
Copy-Item "$ScriptDir\add-expressions.js" "$JsDir"  -Force

# ---------- 2 · Patch every .html ----------
$ExportRoot = Resolve-Path (Join-Path $ScriptDir '..')

Get-ChildItem -Path $ExportRoot -Recurse -Filter '*.html' | ForEach-Object {

    $Path = $_.FullName
    $Html = (Get-Content $Path) -join "`n"

    # —­ remove stale tags from previous runs
    $Html = [regex]::Replace($Html,'(?m).*hover-preview\.css.*\r?\n?','')
    $Html = [regex]::Replace($Html,'(?m).*hover-preview\.js.*\r?\n?','')
    $Html = [regex]::Replace($Html,'(?m).*mb-lite\.js.*\r?\n?','')
    $Html = [regex]::Replace($Html,'(?m).*add-expressions\.js.*\r?\n?','')
    $Html = [regex]::Replace($Html,'(?m).*mathjs@.*\r?\n?','')

    # —­ inject CSS right before </head>
    $CssBlock = '<link rel="stylesheet" href="lib/styles/hover-preview.css">'+"`r`n</head>"
    $Html     = $Html -replace '</head>', $CssBlock         # 2-argument form

    # —­ inject JS (mathjs → add-expr → mb-lite → hover-preview) before </body>
    $JsBlock = @"
<script src="https://cdn.jsdelivr.net/npm/mathjs@11/lib/browser/math.js"></script>
<script src="lib/scripts/add-expressions.js"></script>
<script src="lib/scripts/mb-lite.js"></script>
<script src="lib/scripts/hover-preview.js"></script>
</body>
"@
    $Html = $Html -replace '</body>', $JsBlock              # 2-argument form

    Set-Content -Path $Path -Value $Html -Encoding utf8
}

# ---------- 3 · Append sidebar-toggle code once ----------
$WebPageJs = Join-Path $JsDir 'webpage.js'
while (-not (Test-Path $WebPageJs)) { Start-Sleep -Milliseconds 500 }

$Mark = '/* custom sidebar toggle  v1 */'
if (-not (Select-String -Path $WebPageJs -Pattern [regex]::Escape($Mark) -Quiet)) {

    $Indented = Get-Content "$ScriptDir\webpage.js" | ForEach-Object { "  $_" }

    Add-Content -Path $WebPageJs -Value `
        "`r`n$Mark`r`n(function(){`r`n$($Indented -join "`r`n")`r`n})();`r`n" `
        -Encoding utf8
}

Write-Host '✅  Update complete.'