#!/usr/bin/env bash
#
# update-html-files.sh
# --------------------
# • Copies helper scripts (hover-preview & mb-lite)
# • Injects <link>/<script> tags into every exported *.html
# • Appends sidebar-toggle code to webpage.js once
# ------------------------------------------------------------------

set -euo pipefail

### 0 · Paths -------------------------------------------------------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CSS_DIR="$SCRIPT_DIR/../lib/styles"
JS_DIR="$SCRIPT_DIR/../lib/scripts"

mkdir -p "$CSS_DIR" "$JS_DIR"

### 1 · Copy helper assets -----------------------------------------
echo "▶ Copying helper assets …"
cp "$SCRIPT_DIR/hover-preview.css" "$CSS_DIR/hover-preview.css"
cp "$SCRIPT_DIR/hover-preview.js"  "$JS_DIR/hover-preview.js"
cp "$SCRIPT_DIR/mb-lite.js"        "$JS_DIR/mb-lite.js"     # ← NEW

echo "✔ Files copied."

### 2 · Choose sed flavour -----------------------------------------
if sed --version &>/dev/null; then SED_INPLACE=(sed -i)
else                               SED_INPLACE=(sed -i '')
fi

### 3 · Patch every HTML file --------------------------------------
find "$SCRIPT_DIR/.." -type f -name '*.html' | while read -r file; do
  REL="${file#"${SCRIPT_DIR}/../"}"
  echo "• Patching ${REL}"

  # 3a · Remove stale tags from previous runs
  "${SED_INPLACE[@]}" '/hover-preview\.css/d' "$file"
  "${SED_INPLACE[@]}" '/hover-preview\.js/d'  "$file"
  "${SED_INPLACE[@]}" '/mb-lite\.js/d'        "$file"
  "${SED_INPLACE[@]}" '/mathjs@/d'            "$file"

  # 3b · Inject CSS
  "${SED_INPLACE[@]}" "s#</head>#\
<link rel=\"stylesheet\" href=\"lib/styles/hover-preview.css\">\
\n</head>#g" "$file"

  # 3c · Inject JS  (order: mathjs → mb-lite → hover-preview)
  "${SED_INPLACE[@]}" "s#</body>#\
<script src=\"https://cdn.jsdelivr.net/npm/mathjs@11/lib/browser/math.js\"></script>\
\n<script src=\"lib/scripts/mb-lite.js\"></script>\
\n<script src=\"lib/scripts/hover-preview.js\"></script>\
\n</body>#g" "$file"
done

### 4 · Append sidebar code to webpage.js (wrapped & only once) -----
echo "▶ Waiting for lib/scripts/webpage.js …"
until [[ -f "$JS_DIR/webpage.js" ]]; do sleep 0.5; done

MARK='/* custom sidebar toggle  v1 */'
if ! grep -qF "$MARK" "$JS_DIR/webpage.js"; then
  echo "• Appending sidebar toggle to webpage.js"
  {
    echo "$MARK"
    echo "(function(){"
    sed 's/^/  /' "$SCRIPT_DIR/webpage.js"
    echo "})();"
  } >> "$JS_DIR/webpage.js"
else
  echo "• Sidebar code already present — skipping"
fi

echo "✅  All HTML files and webpage.js updated."