#!/usr/bin/env bash
# Build the BASIC oracle's SECOND, truly-foreign reference engine: Matrix Brandy
# (stardot/MatrixBrandy, GPL-2) as a host console `tbrandy`. BBCSDL and the
# emulated Z80 .COM are both R.T. Russell's BBC BASIC; Brandy is a DIFFERENT
# codebase by DIFFERENT authors, so adding it makes the twin-run oracle a
# THREE-engine, cross-AUTHOR agreement (scripts/verify-basic-oracle.mjs).
#
# Brandy is GPL. Like the GPL ngspice circuit oracle, it is NOT part of the
# browser bundle and is NOT a deployable: it is built on demand, HERE, for the
# oracle only, and never vendored or linked. ([[licence-regime]]: GPL oracle-only.)
#
# The reference is pinned to an IMMUTABLE commit: the clone is checked out to
# BRANDY_COMMIT and the script refuses to build unless HEAD equals that full
# 40-hex SHA (the fetch-pinning census classes this row `sha-const`).
#
# Output: tools/brandy/tbrandy (+ the upstream READ.ME beside it for the licence).
# Use it:  BRANDY_BASIC=tools/brandy/tbrandy node scripts/verify-basic-oracle.mjs
# (tools/ is gitignored; the binary holds NUL bytes and is never committed.)
set -euo pipefail

BRANDY_REPO="https://github.com/stardot/MatrixBrandy.git"
# Matrix Brandy BASIC VI. GPL-2 (see READ.ME + every src/*.c header).
BRANDY_COMMIT=737d89583e2faf77bccbf1038ccf12f454518a48

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/tools/brandy"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "[brandy] cloning $BRANDY_REPO @ $BRANDY_COMMIT"
git clone --filter=blob:none "$BRANDY_REPO" "$WORK/MatrixBrandy"
git -C "$WORK/MatrixBrandy" checkout --quiet "$BRANDY_COMMIT"
HEAD="$(git -C "$WORK/MatrixBrandy" rev-parse HEAD)"
if [ "$HEAD" != "$BRANDY_COMMIT" ]; then
  echo "[brandy] REFUSED: HEAD $HEAD != pinned $BRANDY_COMMIT" >&2
  exit 1
fi

# The TEXT target (makefile.text) is console-only — plain gcc, NO SDL — so it
# builds anywhere a C compiler is present, with no X/graphics dependencies.
echo "[brandy] building the text console (tbrandy) — gcc, no SDL"
make -C "$WORK/MatrixBrandy" text

mkdir -p "$OUT"
cp "$WORK/MatrixBrandy/tbrandy" "$OUT/tbrandy"
cp "$WORK/MatrixBrandy/READ.ME" "$OUT/READ.ME"
chmod +x "$OUT/tbrandy"

echo "[brandy] done: $OUT/tbrandy"
echo "[brandy] licence: GPL-2 (READ.ME beside the binary; Matrix Brandy BASIC VI)"
echo "[brandy] verify:  BRANDY_BASIC=$OUT/tbrandy node scripts/verify-basic-oracle.mjs"
