#!/usr/bin/env bash
# Build ACK's msdos86 platform, the compiler this endpoint shells out to.
#
# This mirrors the media-lab projects/ack/fetch.sh recipe (same pinned commit),
# but stops after the build: it produces the staging tree at
# $ACK_WORK/ack/.obj/staging and prints the ACKDIR/ACK_BIN to export. The
# endpoint (lib/compile-pascal.js) reads ACKDIR + ACK_BIN from the environment.
#
# Build deps (Debian/Ubuntu): build-essential flex bison ninja-build lua5.3
# lua-posix python3. ACK's ab build checks for ninja/cmp/python3 and its Makefile
# calls `lua` (Debian ships it as `lua5.3` — symlink or set LUA=lua5.3).
# Cost: ~1 GB of build tree, a few minutes. Set ACK_WORK to a roomy scratch dir.
set -euo pipefail

ACK_REPO="https://github.com/davidgiven/ack.git"
ACK_COMMIT="7afa32a0a0f13e865fa2e8104e442689005cd627"
work="${ACK_WORK:-$(cd "$(dirname "$0")" && pwd)/.ack-build}"
jobs="${ACK_JOBS:-$(nproc)}"

mkdir -p "$work" "$work/tmp"
if [ ! -d "$work/ack/.git" ]; then
	git clone --filter=blob:none "$ACK_REPO" "$work/ack"
fi
git -C "$work/ack" fetch --depth 1 origin "$ACK_COMMIT"
git -C "$work/ack" checkout -q "$ACK_COMMIT"

sed -i 's/^DEFAULT_PLATFORM ?= .*/DEFAULT_PLATFORM ?= msdos86/' "$work/ack/Makefile"
sed -i 's/^PLATS = all/PLATS = msdos86/'                        "$work/ack/Makefile"

( cd "$work/ack" && TMPDIR="$work/tmp" make -j"$jobs" )

ACKDIR="$work/ack/.obj/staging"
echo
echo "ACK built. Export these for the endpoint:"
echo "  export ACKDIR=$ACKDIR"
echo "  export ACK_BIN=$ACKDIR/bin/ack"
echo
echo "Smoke test:"
echo "  ACKDIR=$ACKDIR $ACKDIR/bin/ack -mmsdos86 -O -o /tmp/x.com <a .pas file>"
