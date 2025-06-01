#!/usr/bin/env bash
# Idempotent helper-injection script for Obsidian export
set -euo pipefail

### 0 · Paths -------------------------------------------------------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CSS_DIR="$SCRIPT_DIR/../lib/styles"
JS_DIR="$SCRIPT_DIR/../lib/scripts"

mkdir -p "$CSS_DIR" "$JS_DIR"

### 1 · Copy helper assets -----------------------------------------
cp -f "$SCRIPT_DIR"/hover-preview.css              "$CSS_DIR/"
cp -f "$SCRIPT_DIR"/hover-preview.js               "$JS_DIR/"
cp -f "$SCRIPT_DIR"/mb-lite.js                     "$JS_DIR/"
cp -f "$SCRIPT_DIR"/add-expressions.js             "$JS_DIR/"

### 2 · Configure sed (GNU vs BSD) -------------------------------
if sed --version &>/dev/null; then SED=(sed -i)
else                               SED=(sed -i '')
fi

### 3 · Build helper blocks ----------------------------------------
read -r -d '' CSS_BLOCK <<'CSS'
<!-- helper-css-start -->
<link rel="stylesheet" href="lib/styles/hover-preview.css">
<!-- helper-css-end -->
CSS

read -r -d '' JS_BLOCK <<'JS'
<!-- helper-js-start -->
<script src="https://cdn.jsdelivr.net/npm/mathjs@11/lib/browser/math.js"></script>
<script src="lib/scripts/add-expressions.js"></script>
<script src="lib/scripts/mb-lite.js"></script>
<script src="lib/scripts/hover-preview.js"></script>
<!-- helper-js-end -->
JS

### 4 · Patch every HTML file --------------------------------------
find "$SCRIPT_DIR/.." -type f -name '*.html' | while read -r file; do
  echo "· Patching ${file#$SCRIPT_DIR/../}"

  # 4a · Remove old helper blocks, if present
  "${SED[@]}" '/<!-- helper-css-start -->/,/<!-- helper-css-end -->/d' "$file"
  "${SED[@]}" '/<!-- helper-js-start -->/,/<!-- helper-js-end -->/d'   "$file"

  # 4b · Inject fresh blocks
  "${SED[@]}" "0,</head>{s#</head>#$CSS_BLOCK\n</head>#}" "$file"
  "${SED[@]}" "0,</body>{s#</body>#$JS_BLOCK\n</body>#}"  "$file"
done

### 5 · Sidebar-toggle once ----------------------------------------
JS_WEB="$JS_DIR/webpage.js"; MARK='/* custom sidebar toggle  v1 */'
until [[ -f $JS_WEB ]]; do sleep 0.5; done

if ! grep -qF "$MARK" "$JS_WEB"; then
  {
    echo; echo "$MARK"; echo "(function(){"
    sed 's/^/  /' "$SCRIPT_DIR/webpage.js"
    echo "})();"
  } >> "$JS_WEB"
fi

echo "✅  Update complete."