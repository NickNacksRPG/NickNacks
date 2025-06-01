#!/usr/bin/env bash
# update-html-files.sh  –  very-verbose debug build
set -euo pipefail
trap 'echo "❌  ERROR line $LINENO : command [$BASH_COMMAND]"' ERR


### 0 · Paths -------------------------------------------------------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CSS_DIR="$SCRIPT_DIR/../lib/styles"
JS_DIR="$SCRIPT_DIR/../lib/scripts"
echo "SCRIPT_DIR=$SCRIPT_DIR"
echo "CSS_DIR=$CSS_DIR"
echo "JS_DIR=$JS_DIR"

mkdir -p "$CSS_DIR" "$JS_DIR"

### 1 · Copy helper assets -----------------------------------------
echo "↪ copying helper files"
cp -fv "$SCRIPT_DIR"/hover-preview.css              "$CSS_DIR/"
cp -fv "$SCRIPT_DIR"/hover-preview.js               "$JS_DIR/"
cp -fv "$SCRIPT_DIR"/mb-lite.js                     "$JS_DIR/"
cp -fv "$SCRIPT_DIR"/add-expressions.js             "$JS_DIR/"
echo "✔ Helper assets copied."

### 2 · Blocks to inject -------------------------------------------
CSS_LINE='<link rel="stylesheet" href="lib/styles/hover-preview.css">'

JS_BLOCK=$(
cat <<'EOF'
<script src="https://cdn.jsdelivr.net/npm/mathjs@11/lib/browser/math.js"></script>
<script src="lib/scripts/add-expressions.js"></script>
<script src="lib/scripts/mb-lite.js"></script>
<script src="lib/scripts/hover-preview.js"></script>
EOF
)
# Escape for BSD sed insertion
JS_ESCAPED=$(printf '%s\n' "$JS_BLOCK" | sed '$!s/$/\\/' )

### 3 · Process every .html ----------------------------------------
echo "🔍 find HTML files …"
find "$SCRIPT_DIR/.." -type f -name '*.html' | while read -r file; do
  echo "⤷ Patching ${file#$SCRIPT_DIR/../}"

  # remove any old helper lines
  sed -i.bak '/hover-preview\.css/d;/hover-preview\.js/d;/mb-lite\.js/d;/add-expressions\.js/d;/mathjs@/d' "$file"
  rm -f "${file}.bak"

  # inject CSS once
  if ! grep -qF "$CSS_LINE" "$file"; then
    sed -i.bak "/<\/head>/i\\
$CSS_LINE" "$file"
    rm -f "${file}.bak"
  else
    echo "  · CSS line already present"
  fi

  # inject JS block once
  if ! grep -qF 'lib/scripts/hover-preview.js' "$file"; then
    sed -i.bak "/<\/body>/i\\
$JS_ESCAPED" "$file"
    rm -f "${file}.bak"
  else
    echo "  · JS block already present"
  fi
done
echo "✔ HTML patching done."

### 4 · Sidebar-toggle once ----------------------------------------
JS_WEB="$JS_DIR/webpage.js"
MARK='/* custom sidebar toggle  v1 */'
echo "⏳ waiting for $JS_WEB"
until [[ -f $JS_WEB ]]; do sleep 0.2; done

if ! grep -qF "$MARK" "$JS_WEB"; then
  echo "➕ appending sidebar code"
  {
    printf '\n%s\n(function(){\n' "$MARK"
    sed 's/^/  /' "$SCRIPT_DIR/webpage.js"
    echo '})();'
  } >> "$JS_WEB"
else
  echo "✔ sidebar code already present"
fi

echo "✅  Update complete."
set +x