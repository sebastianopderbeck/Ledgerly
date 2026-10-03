#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/scripts/icons"
out="$root/client/public"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

qlmanage -t -s 512 -o "$tmp" "$src/icon.svg" "$src/icon-maskable.svg" >/dev/null
cp "$tmp/icon.svg.png" "$out/icon-512.png"
cp "$tmp/icon-maskable.svg.png" "$out/icon-maskable-512.png"
sips -z 192 192 "$tmp/icon.svg.png" --out "$out/icon-192.png" >/dev/null
