#!/usr/bin/env bash
# SPDX-License-Identifier: BSD-3-Clause
# Copyright (c) 2026 Brickwright contributors
# Read-only check of an installed Brickwright Linux package layout (files, modes,
# ownership, notices). Run inside the installed system, for example:
#   docker run --rm --network none -v "$PWD/scripts:/check:ro" --entrypoint bash IMAGE /check/verify-spike-linux-installed-layout.sh
# Prints only check names and PASS/FAIL; never prints file contents. Exit 0 only if all pass.
set -u
R=/usr/lib/Brickwright; D=/usr/share/doc/brickwright; fail=0
check () { if eval "$2" >/dev/null 2>&1; then echo "PASS $1"; else echo "FAIL $1"; fail=1; fi; }
mode () { [ "$(stat -c %a:%U:%G "$1")" = "$2:root:root" ]; }
check executable "mode /usr/bin/brickwright-tauri 755 && [ \"\$(head -c4 /usr/bin/brickwright-tauri | od -An -tx1 | tr -d ' ')\" = 7f454c46 ]"
check renode-executable "mode $R/renode/renode 755"
for lib in libMono.Unix.so libSystem.Globalization.Native.so libSystem.IO.Compression.Native.so libSystem.Native.so \
  libSystem.Net.Security.Native.so libSystem.Security.Cryptography.Native.OpenSsl.so libclrjit.so libcoreclr.so \
  libcoreclrtraceptprovider.so libhostfxr.so libhostpolicy.so libllvm-disas.so libmscordaccore.so libmscordbi.so; do
  check "native-$lib" "mode $R/renode/$lib 644 && [ -s $R/renode/$lib ]"
done
for n in renode-license tlib-license dotnet-runtime-0-license dotnet-runtime-1-license mono-unix-pinned-license libllvm-disas-license llvm-license; do
  check "runtime-notice-$n" "[ -s $R/renode/licenses/$n ] && mode $R/renode/licenses/$n 644"
done
for n in renode-models-MIT.txt brickwright-BSD-3-Clause.txt; do check "support-notice-$n" "[ -s $R/micropython/licenses/$n ]"; done
check no-links "[ -z \"\$(find $R -type l -print -quit)\" ]"
check only-regular "[ -z \"\$(find $R ! -type f ! -type d -print -quit)\" ]"
check data-modes "[ -z \"\$(find $R -type f ! -perm 644 ! -path $R/renode/renode -print -quit)\" ]"
check dir-modes "[ -z \"\$(find $R -type d ! -perm 755 -print -quit)\" ]"
check root-owned "[ -z \"\$(find $R /usr/bin/brickwright-tauri ! -user root -print -quit)\" ]"
check desktop-entry "[ -s /usr/share/applications/brickwright.desktop ]"
for n in LICENSE THIRD-PARTY-NOTICES.md spike-linux-crate-inventory.json spike-linux-licence-review.json; do check "doc-$n" "[ -s $D/$n ]"; done
check rust-crate-notices "[ \"\$(find $D/rust-crates -mindepth 1 -maxdepth 1 -type d | wc -l)\" -gt 300 ]"
exit $fail
