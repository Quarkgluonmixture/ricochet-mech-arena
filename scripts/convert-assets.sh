#!/usr/bin/env bash
# Convert generated PNG originals (assets-src/) into the JPEGs the game loads (public/textures/).
# Idempotent; skips names that have no original yet.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/textures
for name in floor wall-side wall-top hull sky keyart; do
  src="assets-src/$name.png"
  [ -f "$src" ] || { echo "skip $name (no original)"; continue; }
  sips -s format jpeg -s formatOptions 82 "$src" --out "public/textures/$name.jpg" >/dev/null
  printf '%-10s %6s KB  %s\n' "$name" "$(( $(stat -f%z "public/textures/$name.jpg") / 1024 ))" "$(sips -g pixelWidth -g pixelHeight "public/textures/$name.jpg" | awk '/pixel/ {printf "%s ", $2}')"
done
