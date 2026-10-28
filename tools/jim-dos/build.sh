#!/usr/bin/env bash
# build.sh — build static/roms/jim.exe: Jim Tcl as a 16-bit MS-DOS .EXE for
# the 8086 DOS bench (the code tab's Tcl route).
#
#   tools/jim-dos/build.sh [out.exe]      (default: overlay/scratch-gui/static/roms/jim.exe)
#
# Needs ia16-elf-gcc (tkchia's GCC port: the build-ia16 PPA, packages
# gcc-ia16-elf libnewlib-ia16-elf libi86-ia16-elf) and python3. The toolchain
# is GPL and build-time only; the binary is BSD-2 Jim Tcl linked against
# newlib + libi86. jim.provenance.json records what the shipped bytes were
# built from; a different toolchain build may produce different bytes.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
out="${1:-$root/overlay/scratch-gui/static/roms/jim.exe}"
JIMTCL_COMMIT=5bac7c99ad65864c87da513e22e2f01703fa4e03
JIMSH0_SHA256=$(python3 -c "import json;print(json.load(open('$root/overlay/scratch-gui/static/roms/jim.provenance.json'))['jimsh0Sha256'])" 2>/dev/null || true)
# Stack kept below the heap (bytes); the heap gets the rest of the segment.
STACK=${JIM_DOS_STACK:-12288}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
git clone -q --filter=blob:none --no-checkout https://github.com/msteveb/jimtcl.git "$tmp/jimtcl"
git -C "$tmp/jimtcl" checkout -q "$JIMTCL_COMMIT" -- autosetup/jimsh0.c jim-namespace.c LICENSE
got=$(sha256sum "$tmp/jimtcl/autosetup/jimsh0.c" | cut -d' ' -f1)
if [ -n "$JIMSH0_SHA256" ] && [ "$got" != "$JIMSH0_SHA256" ]; then
  echo "jimsh0.c at $JIMTCL_COMMIT is $got, provenance says $JIMSH0_SHA256" >&2; exit 1
fi
python3 "$here/mkdos.py" "$tmp/jimtcl/autosetup/jimsh0.c" "$tmp/jimdos.c" "$tmp/jimtcl/jim-namespace.c"
# Compiled by relative name: assert() embeds __FILE__, and a temp path
# would make every build's bytes different.
(cd "$tmp" && ia16-elf-gcc -mcmodel=medium -march=any_186 -Os -ffunction-sections -fdata-sections \
  -mcs-jump-tables -DJIM_DOS_STACK="$STACK" -DJIM_DOS_STACK_MARGIN=1536 -DJIM_MATH_FUNCTIONS -w \
  jimdos.c -o jim.exe -lm -Wl,--gc-sections)
cp "$tmp/jim.exe" "$out"
echo "jimtcl $JIMTCL_COMMIT, jimsh0.c sha256 $got"
echo "$(ia16-elf-gcc --version | head -1)"
sha256sum "$out"
stat -c '%s bytes' "$out"
