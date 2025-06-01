#!/usr/bin/env bash
#
# update-html-files.sh
# --------------------
# • Copies helper scripts (hover-preview, mb-lite, add-expressions)
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
cp "$SCRIPT_DIR/hover-preview.css"  "$CSS_DIR/hover-preview.css"
cp "$SCRIPT_DIR/hover-preview.js"   "$JS_DIR/hover-preview.js"
cp "$SCRIPT_DIR/mb-lite.js"         "$JS_DIR/mb-lite.js"
cp "$SCRIPT_DIR/add-expressions.js" "$JS_DIR/add-expressions.js"

echo "✔ Helper assets copied."

### 2 · Choose sed flavour (GNU vs BSD) ----------------------------
if sed --version &>/dev/null; then SED=(sed -i)
else                               SED=(sed -i '')
fi

### 3 · Patch every HTML file --------------------------------------
find "$SCRIPT_DIR/.." -type f -name '*.html' | while read -r file; do
  echo "• Patching ${file#$SCRIPT_DIR/../}"

  # 3a · Remove stale injections from earlier runs
  "${SED[@]}" '/hover-preview\.css/d;/hover-preview\.js/d;/mb-lite\.js/d;/add-expressions\.js/d;/mathjs@/d' "$file"

  # 3b · Inject CSS just before </head>
  "${SED[@]}" "s#</head>#<link rel=\"stylesheet\" href=\"lib/styles/hover-preview.css\">\
</head>#g" "$file"

  # 3c · Inject JS (mathjs → add-expr → mb-lite → hover-preview) before </body>
  "${SED[@]}" "s#</body>#<script src=\"https://cdn.jsdelivr.net/npm/mathjs@11/lib/browser/math.js\"></script>\
<script src=\"lib/scripts/add-expressions.js\"></script>\
<script src=\"lib/scripts/mb-lite.js\"></script>\
<script src=\"lib/scripts/hover-preview.js\"></script>\
</body>#g" "$file"
done

### 4 · Append sidebar-toggle code to webpage.js (only once) -------
JS_WEB="$JS_DIR/webpage.js"
echo "▶ Waiting for $JS_WEB …"
until [[ -f $JS_WEB ]]; do sleep 0.5; done

MARK='/* custom sidebar toggle  v1 */'
if ! grep -qF "$MARK" "$JS_WEB"; then
  echo "• Appending sidebar toggle to webpage.js"
  {
    echo -e "\n$MARK"
    echo "(function(){"
    sed 's/^/  /' "$SCRIPT_DIR/webpage.js"
    echo "})();"
  } >> "$JS_WEB"
else
  echo "• Sidebar code already present — skipping"
fi

echo "✅  All HTML files and webpage.js updated."