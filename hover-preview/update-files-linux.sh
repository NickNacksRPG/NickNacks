#!/usr/bin/env bash
# update-html-files.sh – Linux-only, idempotent, CI‑safe, with optional DEBUG chatter.
# v1.2  — Fixed pipeline‑exit bug that surfaced on GitHub Actions.

set -euo pipefail

#############################################
# 0 · Utilities & configuration
#############################################
log() { printf '[%(%F %T)T] %s\n' -1 "$*"; }
# DBG now **always** returns 0 so that piping into it never breaks set -e -o pipefail
DBG() { [[ -n ${DEBUG:-} ]] && log "DEBUG: $*"; return 0; }

TIMEOUT_SEC=30           # seconds to wait for $WEB_JS to appear
POLL_INTERVAL=0.5        # seconds between checks

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CSS_DIR="$SCRIPT_DIR/../lib/styles"
JS_DIR="$SCRIPT_DIR/../lib/scripts"
mkdir -p "$CSS_DIR" "$JS_DIR"

log "Paths set: SCRIPT_DIR=$SCRIPT_DIR, CSS_DIR=$CSS_DIR, JS_DIR=$JS_DIR"

#############################################
# 1 · Copy helper assets
#############################################
required_assets=(hover-preview.css styles.css hover-preview.js offense-calculator.js)
for asset in "${required_assets[@]}"; do
  src="$SCRIPT_DIR/$asset"
  [[ -f $src ]] || { log "❌ Missing asset: $src"; exit 1; }
done

log "Copying helper assets …"
cp -fv "$SCRIPT_DIR"/hover-preview.css      "$CSS_DIR/"
DBG "Copied hover-preview.css"
cp -fv "$SCRIPT_DIR"/styles.css             "$CSS_DIR/meta-bind.css"   # ← NEW
DBG "Copied styles.css as meta-bind.css"
cp -fv "$SCRIPT_DIR"/hover-preview.js       "$JS_DIR/"
DBG "Copied hover-preview.js"
cp -fv "$SCRIPT_DIR"/offense-calculator.js  "$JS_DIR/"
DBG "Copied offense-calculator.js"
log "Assets copied."

#############################################
# 2 · Blocks to inject
#############################################
CSS_LINE1='<link rel="stylesheet" href="lib/styles/hover-preview.css">'
CSS_LINE2='<link rel="stylesheet" href="lib/styles/meta-bind.css">'
read -r -d '' JS_BLOCK <<'EOF'
<script src="lib/scripts/offense-calculator.js"></script>
<script src="lib/scripts/hover-preview.js"></script>
EOF
log "Injection blocks prepared."

#############################################
# 3 · Patch every HTML file (space‑safe)
#############################################
log "Scanning for HTML files …"
count_html=0
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

if ! find "$SCRIPT_DIR/.." -type f -name '*.html' -print0 | grep -q .; then
    log "❌ No HTML files found in $SCRIPT_DIR/.."; exit 1
fi

log "Found HTML files, beginning patch process …"
find "$SCRIPT_DIR/.." -type f -name '*.html' -print0 |
while IFS= read -r -d '' f; do
    ((count_html++)) || true
    DBG "Processing file $count_html: $f"

    tmp_file="$TMP_DIR/$(basename "$f").tmp"

    # 3a · purge old helper lines
    sed '/hover-preview\.css\|meta-bind\.css\|hover-preview\.js\|offense-calculator\.js\|mb-lite\.js\|add-expressions\.js\|mathjs@/d' "$f" > "$tmp_file"

    # 3b · Inject CSS once each
    grep -qF "$CSS_LINE1" "$tmp_file" || awk -v css="$CSS_LINE1" '/<\/head>/ {print css} {print}' "$tmp_file" > "$f.tmp" && mv "$f.tmp" "$f" && cp "$f" "$tmp_file"
    grep -qF "$CSS_LINE2" "$tmp_file" || awk -v css="$CSS_LINE2" '/<\/head>/ {print css} {print}' "$tmp_file" > "$f.tmp" && mv "$f.tmp" "$f" && cp "$f" "$tmp_file"

    # 3c · Inject JS block once
    grep -qF 'lib/scripts/offense-calculator.js' "$tmp_file" || awk -v js="$JS_BLOCK" '/<\/body>/ {print js} {print}' "$tmp_file" > "$f.tmp" && mv "$f.tmp" "$f"

    DBG "Successfully processed $f"
done

if [ "$count_html" -eq 0 ]; then
    log "❌ No HTML files were processed"; exit 1
fi

log "✔ Patched $count_html HTML file(s)."

#############################################
# 4 · Sidebar toggle once (guarded wait)
#############################################
MARK='/* custom sidebar toggle  v1 */'
WEB_JS="$JS_DIR/webpage.js"
SOURCE_WEB_JS="$SCRIPT_DIR/webpage.js"
[[ -f $SOURCE_WEB_JS ]] || { log "❌ Missing source: $SOURCE_WEB_JS"; exit 1; }

log "Ensuring sidebar toggle in $WEB_JS (timeout ${TIMEOUT_SEC}s) …"
elapsed=0
while [[ ! -f $WEB_JS && $(printf '%.0f' "$elapsed") -lt $TIMEOUT_SEC ]]; do
  sleep "$POLL_INTERVAL"
  elapsed=$(awk "BEGIN{print $elapsed+$POLL_INTERVAL}")
  DBG "Waiting for $WEB_JS … ${elapsed}s elapsed"
 done
[[ -f $WEB_JS ]] || { log "❌ Timeout waiting for $WEB_JS"; exit 1; }

grep -qF "$MARK" "$WEB_JS" && log "Sidebar toggle already present." || {
  log "Injecting sidebar toggle …"
  {
    printf '\n%s\n(function(){\n' "$MARK"
    sed 's/^/  /' "$SOURCE_WEB_JS"
    echo '})();'
  } >> "$WEB_JS"
}

log "✅ Script finished successfully."
