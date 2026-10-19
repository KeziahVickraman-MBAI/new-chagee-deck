#!/bin/sh
# Export the storyboard deck to PDF with headless Chrome: one 1280 x 720 page per slide, every step shown.
#   sh storyboard/export_pdf.sh
# Writes storyboard/chagee_storyboard.pdf and storyboard/chagee_storyboard_notes.pdf (each slide, then its notes).
set -e
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
python3 build_storyboard.py
URL="file://$PWD/chagee_storyboard.html"
for spec in "chagee_storyboard.pdf|?print=1" "chagee_storyboard_notes.pdf|?print=1&notes=1"; do
  out="${spec%%|*}"; query="${spec#*|}"
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=8000 \
    --print-to-pdf="$PWD/$out" "$URL$query" 2>/dev/null
  echo "wrote storyboard/$out"
done
