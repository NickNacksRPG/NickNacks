#!/usr/bin/env bash
# update-html-files.sh  –  macOS & Linux, idempotent
set -euo pipefail

### 0 ·  Paths ------------------------------------------------------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CSS_DIR="$SCRIPT_DIR/../lib/styles"
JS_DIR="$SCRIPT_DIR/../lib/scripts"
mkdir -p "$CSS_DIR" "$JS_DIR"

echo "Setting paths..."

### 1 ·  Copy helper assets ----------------------------------------
cp -f "$SCRIPT_DIR"/hover-preview.css          "$CSS_DIR/"
cp -f "$SCRIPT_DIR"/hover-preview.js           "$JS_DIR/"
cp -f "$SCRIPT_DIR"/offense-calculator.js      "$JS_DIR/"

echo "Copied assets..."

### 2 ·  Blocks to inject ------------------------------------------

echo "Setting blocks to inject..."

CSS_LINE='<link rel="stylesheet" href="lib/styles/hover-preview.css">'

JS_BLOCK=$(cat <<'EOF'
<script src="lib/scripts/offense-calculator.js"></script>
<script src="lib/scripts/hover-preview.js"></script>
EOF
)
# Escape new-lines for BSD-sed “\” continuation
JS_ESCAPED=$(printf '%s\n' "$JS_BLOCK" | sed '$!s/$/\\/' )

echo "Patching HTML files..."

### 3 ·  Patch every HTML file -------------------------------------
find "$SCRIPT_DIR/.." -type f -name '*.html' | while read -r f; do
  # 3a · scrub any previous helper lines
  sed -i.bak \
      '/hover-preview\.css/d;/hover-preview\.js/d;/offense-calculator\.js/d;/mb-lite\.js/d;/add-expressions\.js/d;/mathjs@/d' \
      "$f" && rm -f "$f.bak"

  # 3b · inject CSS once
  grep -qF "$CSS_LINE" "$f" || \
    sed -i.bak "/<\/head>/i\\
$CSS_LINE" "$f" && rm -f "$f.bak"

  # 3c · inject JS once
  grep -qF 'lib/scripts/offense-calculator.js' "$f" || \
    sed -i.bak "/<\/body>/i\\
$JS_ESCAPED" "$f" && rm -f "$f.bak"
done
echo "✔ HTML patched."

### 4 ·  Sidebar-toggle once ---------------------------------------
MARK='/* custom sidebar toggle  v1 */'
WEB_JS="$JS_DIR/webpage.js"
until [[ -f $WEB_JS ]]; do sleep 0.5; done
grep -qF "$MARK" "$WEB_JS" || {
  {
    printf '\n%s\n(function(){\n' "$MARK"
    sed 's/^/  /' "$SCRIPT_DIR/webpage.js"
    echo '})();'
  } >> "$WEB_JS"
}
echo "✅  All done."