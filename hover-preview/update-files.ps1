# update-html-files.ps1  (PowerShell 5-compatible)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$CssDir    = Join-Path $ScriptDir '..\lib\styles'
$JsDir     = Join-Path $ScriptDir '..\lib\scripts'
New-Item $CssDir -ItemType Directory -Force | Out-Null
New-Item $JsDir  -ItemType Directory -Force | Out-Null

Copy-Item "$ScriptDir\hover-preview.css" "$CssDir" -Force
Copy-Item "$ScriptDir\hover-preview.js"  "$JsDir"  -Force
Copy-Item "$ScriptDir\mb-lite.js"        "$JsDir"  -Force
Copy-Item "$ScriptDir\add-expressions.js" "$JsDir" -Force

$ExportRoot = Resolve-Path (Join-Path $ScriptDir '..')
Get-ChildItem -Path $ExportRoot -Recurse -Filter '*.html' | ForEach-Object {
    $p  = $_.FullName
    $tx = (Get-Content $p) -join "`n"
    $tx = [regex]::Replace($tx, '(?m).*?(hover-preview|mb-lite|add-expressions).*?\n', '')
    $tx = [regex]::Replace($tx, '(?m).*mathjs@.*\n', '')
    $tx = $tx -replace '</head>', '<link rel="stylesheet" href="lib/styles/hover-preview.css">'+"`r`n</head>"
    $js  = @"
<script src="https://cdn.jsdelivr.net/npm/mathjs@11/lib/browser/math.js"></script>
<script src="lib/scripts/add-expressions.js"></script>
<script src="lib/scripts/mb-lite.js"></script>
<script src="lib/scripts/hover-preview.js"></script>
"@
    $tx = $tx -replace '</body>', "$js`r`n</body>"
    Set-Content -Path $p -Value $tx -Encoding utf8
}

$WebJS = Join-Path $JsDir 'webpage.js'
while (-not (Test-Path $WebJS)) { Start-Sleep -Milliseconds 500 }
$Mark  = '/* custom sidebar toggle  v1 */'
if (-not (Select-String -Path $WebJS -Pattern [regex]::Escape($Mark))) {
    $patch = (Get-Content "$ScriptDir\webpage.js") | ForEach-Object { "  $_" }
    Add-Content $WebJS "`r`n$Mark`r`n(function(){`r`n$($patch -join "`r`n")`r`n})();`r`n" -Encoding utf8
}

Write-Host '✅  Update complete.'