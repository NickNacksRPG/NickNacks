#!/usr/bin/env bash
set -euo pipefail

# 0 · Paths
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CSS_DIR="$SCRIPT_DIR/../lib/styles"
JS_DIR="$SCRIPT_DIR/../lib/scripts"
mkdir -p "$CSS_DIR" "$JS_DIR"

# 1 · Copy helper assets
cp "$SCRIPT_DIR"/hover-preview.{css,js}   "$CSS_DIR" 2>/dev/null
cp "$SCRIPT_DIR"/hover-preview.js         "$JS_DIR"
cp "$SCRIPT_DIR"/mb-lite.js               "$JS_DIR"
cp "$SCRIPT_DIR"/add-expressions.js       "$JS_DIR"

# 2 · sed flavour
if sed --version &>/dev/null; then SED=("sed" "-i"); else SED=("sed" "-i" ""); fi

# 3 · Patch *.html
find "$SCRIPT_DIR/.." -type f -name '*.html' | while read -r file; do
  "${SED[@]}" '/hover-preview\.css/d;/hover-preview\.js/d;/mb-lite\.js/d;/add-expressions\.js/d;/mathjs@/d' "$file"
  "${SED[@]}" "s#</head>#<link rel=\"stylesheet\" href=\"lib/styles/hover-preview.css\">\n</head>#g" "$file"
  "${SED[@]}" "s#</body>#\
<script src=\"https://cdn.jsdelivr.net/npm/mathjs@11/lib/browser/math.js\"></script>\n\
<script src=\"lib/scripts/add-expressions.js\"></script>\n\
<script src=\"lib/scripts/mb-lite.js\"></script>\n\
<script src=\"lib/scripts/hover-preview.js\"></script>\n\
</body>#g" "$file"
done

# 4 · Sidebar patch (unchanged)
MARK='/* custom sidebar toggle  v1 */'
JS="$JS_DIR/webpage.js"; until [[ -f $JS ]]; do sleep 0.5; done
grep -qF "$MARK" "$JS" || {
  printf '\n%s\n(function(){\n' "$MARK" >>"$JS"
  sed 's/^/  /' "$SCRIPT_DIR/webpage.js" >>"$JS"
  printf '})();\n' >>"$JS"
}

echo "✅  Update complete."