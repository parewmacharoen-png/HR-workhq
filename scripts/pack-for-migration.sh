#!/usr/bin/env bash
# บีบอัดโปรเจกต์ WorkHQ สำหรับย้ายเครื่อง (ไม่รวม node_modules)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$HOME/Desktop/workhq-full-handoff.tar.gz}"

echo "Packing from: $ROOT"
echo "Output: $OUT"

tar -czf "$OUT" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='backend/dist' \
  --exclude='backend/dist.bak.*' \
  --exclude='web/dist' \
  --exclude='web/tsconfig.tsbuildinfo' \
  --exclude='.cursor' \
  -C "$(dirname "$ROOT")" \
  "$(basename "$ROOT")"

echo ""
echo "Done: $OUT"
echo ""
echo "IMPORTANT: Copy these separately (secrets, not always in tar if excluded):"
echo "  - backend/.env"
echo "  - .env (root, if exists)"
echo ""
echo "On new machine:"
echo "  tar -xzf workhq-full-handoff.tar.gz"
echo "  Read HANDOFF_MACHINE_MIGRATION.md and RESUME_PROMPT.md"
