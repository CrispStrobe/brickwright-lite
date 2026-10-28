#!/usr/bin/env bash
# Build the BASIC oracle's REFERENCE engine: BBCSDL (R.T. Russell, zlib) as a
# host console `bbcbasic`. This is the independent second engine the twin-run
# oracle (scripts/verify-basic-oracle.mjs) compares the emulated BBC BASIC (Z80)
# machine against. It is NOT part of the browser bundle and is NOT a deployable
# — it exists only so a real reference can run in CI/dev, exactly like the
# CI-only ACK build in .github/workflows/ack-z80-cpm.yml.
#
# The reference is pinned to an IMMUTABLE commit: the clone is checked out to
# BBCSDL_COMMIT and the script refuses to build unless HEAD equals that full
# 40-hex SHA (the fetch-pinning census classes this row `sha-const`).
#
# Output: tools/bbcsdl/bbcbasic (+ the upstream licence.txt beside it).
# Use it:  BBCSDL_BBCBASIC=tools/bbcsdl/bbcbasic node scripts/verify-basic-oracle.mjs
# (tools/ is gitignored; the binary holds NUL bytes and is never committed.)
set -euo pipefail

BBCSDL_REPO="https://github.com/rtrussell/BBCSDL.git"
# BBC BASIC for SDL 2.0 @ "box2dlib updated for Apple Silicon". zlib-licensed.
BBCSDL_COMMIT=6c302988ee2a08c5f9a65fa3eb8e76bcacc6079f

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/tools/bbcsdl"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "[bbcsdl] cloning $BBCSDL_REPO @ $BBCSDL_COMMIT"
git clone --filter=blob:none "$BBCSDL_REPO" "$WORK/BBCSDL"
git -C "$WORK/BBCSDL" checkout --quiet "$BBCSDL_COMMIT"
HEAD="$(git -C "$WORK/BBCSDL" rev-parse HEAD)"
if [ "$HEAD" != "$BBCSDL_COMMIT" ]; then
  echo "[bbcsdl] REFUSED: HEAD $HEAD != pinned $BBCSDL_COMMIT" >&2
  exit 1
fi

# The x86_64 console build assembles one data file with nasm; everything else is
# gcc. Prefer a system nasm; on a box without root, fetch the versioned package
# and extract its binary locally (no build-tree writes, no URL literal).
NASM_BIN=""
if command -v nasm >/dev/null 2>&1; then
  NASM_BIN="$(command -v nasm)"
elif command -v apt-get >/dev/null 2>&1; then
  echo "[bbcsdl] nasm absent — fetching the versioned package locally"
  ( cd "$WORK" && apt-get download nasm )
  dpkg -x "$WORK"/nasm_*.deb "$WORK/nasmroot"
  NASM_BIN="$WORK/nasmroot/usr/bin/nasm"
fi
if [ -z "$NASM_BIN" ] || [ ! -x "$NASM_BIN" ]; then
  echo "[bbcsdl] REFUSED: nasm not available (install nasm, e.g. 'apt-get install -y nasm')" >&2
  exit 1
fi
export PATH="$(dirname "$NASM_BIN"):$PATH"

echo "[bbcsdl] building console (gcc + nasm $("$NASM_BIN" --version))"
make -C "$WORK/BBCSDL/console/linux"

mkdir -p "$OUT"
cp "$WORK/BBCSDL/console/linux/bbcbasic" "$OUT/bbcbasic"
cp "$WORK/BBCSDL/licence.txt" "$OUT/licence.txt"
chmod +x "$OUT/bbcbasic"

echo "[bbcsdl] done: $OUT/bbcbasic"
echo "[bbcsdl] licence: $OUT/licence.txt (zlib, R.T. Russell)"
echo "[bbcsdl] verify:  BBCSDL_BBCBASIC=$OUT/bbcbasic node scripts/verify-basic-oracle.mjs"
