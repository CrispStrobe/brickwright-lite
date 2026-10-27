#!/bin/bash
# SPDX-License-Identifier: BSD-3-Clause
# Copyright (c) 2026 Brickwright contributors
#
# Installed-app test of the signed macOS app's SPIKE runtime on a hosted runner.
#   spike-installed-test.sh APP IDENTITY RESULTS_DIR
# APP is the installed Brickwright.app. Using the app's own signed Renode child and
# own NuttX profile (copied with their signatures intact), a sandboxed launcher signed
# with the same Mac App Store identity starts the child exactly as the app's
# supervisor does (container TMPDIR, shipped tlib, loopback bind) and must read a live
# state snapshot from the own guest. Further variants re-sign copies of the child with
# the same identity to measure which hardened-runtime entitlements are needed.
# Nothing is uploaded; no reference firmware is used.
set -u
APP=$1; IDENTITY=$2; R=$3; mkdir -p "$R"
HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); STATE_PORT=39555; MON_PORT=39554
clang -O2 -o "$T/launcher" "$HERE/spike-probe-launcher.c" || exit 1

codesign --verify --deep --strict --verbose=2 "$APP" > "$R/app-verify.txt" 2>&1; echo "app verify exit $?" >> "$R/app-verify.txt"
codesign -dv "$APP/Contents/Resources/renode/renode" > "$R/child-codesign.txt" 2>&1
codesign -d --entitlements - --xml "$APP/Contents/Resources/renode/renode" 2>/dev/null | plutil -p - >> "$R/child-codesign.txt" 2>&1
cat "$R/app-verify.txt" "$R/child-codesign.txt"

ent() { f="$T/ent-$1.plist"; shift
  { echo '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>'
    for k in "$@"; do echo "<key>$k</key><true/>"; done; echo '</dict></plist>'; } > "$f"; echo "$f"; }
SB=com.apple.security.app-sandbox; NS=com.apple.security.network.server; NC=com.apple.security.network.client
JIT=com.apple.security.cs.allow-jit; DLV=com.apple.security.cs.disable-library-validation; INH=com.apple.security.inherit

fail=0
variant() { # name child-mode(shipped|resign|resign-noruntime|adhoc) expect(boot|measure) timeout-seconds [child entitlement keys...]
  v=$1; mode=$2; expect=$3; limit=$4; shift 4; id=org.brickwright.spike-installed.$v
  sign=(--sign "$IDENTITY"); runtime=(--options runtime); [ "$mode" = adhoc ] && { sign=(--sign -); runtime=(); }
  a="$T/apps/$v/SpikeInstalled.app"; mkdir -p "$a/Contents/MacOS" "$a/Contents/Resources" "$R/$v"
  ditto "$APP/Contents/Resources/renode" "$a/Contents/Resources/renode"
  ditto "$APP/Contents/Resources/nuttx" "$a/Contents/Resources/nuttx"
  cp "$T/launcher" "$a/Contents/MacOS/launcher"
  cat > "$a/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>$id</string><key>CFBundleExecutable</key><string>launcher</string>
<key>CFBundlePackageType</key><string>APPL</string><key>CFBundleName</key><string>SpikeInstalled</string></dict></plist>
EOF
  [ "$mode" = resign-noruntime ] && runtime=()
  if [ "$mode" != shipped ]; then
    if [ "$mode" = adhoc ]; then
      find "$a/Contents/Resources/renode" -type f ! -path '*/renode/renode' -print0 | while IFS= read -r -d '' f; do
        file -b "$f" | grep -q '^Mach-O' && codesign --force --sign - "$f" >/dev/null 2>&1; done
    fi
    codesign --force ${runtime[@]+"${runtime[@]}"} --timestamp=none "${sign[@]}" --entitlements "$(ent $v-child "$@")" "$a/Contents/Resources/renode/renode" >/dev/null 2>&1 || echo "child resign failed" >> "$R/$v/notes.txt"
  fi
  codesign --force ${runtime[@]+"${runtime[@]}"} --timestamp=none "${sign[@]}" --identifier "$id" --entitlements "$(ent $v $SB $NS $NC $JIT)" "$a" >/dev/null 2>&1 || echo "launcher sign failed" >> "$R/$v/notes.txt"
  codesign -dv "$a/Contents/Resources/renode/renode" 2>&1 | grep -E 'TeamIdentifier|flags' > "$R/$v/codesign.txt"
  codesign -d --entitlements - --xml "$a/Contents/Resources/renode/renode" 2>/dev/null | plutil -p - >> "$R/$v/codesign.txt" 2>&1
  c="$HOME/Library/Containers/$id/Data"; res="$a/Contents/Resources/nuttx"; host="$a/Contents/Resources/renode"
  stack=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["boot"]["stack"])' "$res/state-config.json")
  reset=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["boot"]["reset"])' "$res/state-config.json")
  since=$(date '+%Y-%m-%d %H:%M:%S')
  ( cd "$res" && exec env HOME="$c" TMPDIR="$c/tmp/" DOTNET_DefaultStackSize=0x4000000 \
      RENODE_TLIB_DIRECTORY="$host/tlib" RENODE_SERVER_BIND_ADDRESS=127.0.0.1 \
      "$a/Contents/MacOS/launcher" --disable-gui -P $MON_PORT \
      -e "include @$res/nuttx.resc" -e "sysbus LoadELF @$res/nuttx-user.elf" -e "sysbus LoadELF @$res/nuttx-kernel.elf" \
      -e 'cpu VectorTableOffset 0x08008000' -e "cpu SP $stack" -e "cpu PC $reset" -e 'emulation RunFor "1.0"' \
      -e "include @$res/scripts/spike-state-server.py" -e "spike_state_start \"127.0.0.1\" $STATE_PORT @$res/state-config.json" \
      > "$R/$v/renode.log" 2>&1 ) & pid=$!
  python3 "$HERE/spike-probe-client.py" $STATE_PORT $MON_PORT $limit "$R/$v/client.json" > "$R/$v/client.out" 2>&1; crc=$?
  for i in $(seq 1 30); do kill -0 $pid 2>/dev/null || break; sleep 1; done
  kill -0 $pid 2>/dev/null && { kill -TERM $pid; sleep 3; kill -KILL $pid 2>/dev/null; }
  wait $pid; prc=$?
  pkill -f "apps/$v/SpikeInstalled.app" 2>/dev/null; sleep 2
  sudo log show --style compact --start "$since" --predicate 'process == "renode" OR process == "launcher" OR eventMessage CONTAINS "renode(" OR eventMessage CONTAINS "launcher("' 2>/dev/null | head -n 600 > "$R/$v/system-log.txt"
  mkdir -p "$R/$v/crash"; find "$HOME/Library/Logs/DiagnosticReports" -newermt "$since" \( -iname 'renode*' -o -iname 'launcher*' \) -exec cp {} "$R/$v/crash/" \; 2>/dev/null
  shipped=$(grep -c 'Using shipped translation library' "$R/$v/renode.log")
  # Wall time of the first emulation RunFor "1.0": machine start to first pause.
  python3 - "$R/$v/renode.log" > "$R/$v/runfor-wall.txt" <<'PY'
import re, sys
t = {}
for line in open(sys.argv[1], errors='replace'):
    m = re.match(r'(\d\d):(\d\d):(\d\d\.\d+) \[INFO\] machine-0: Machine (started|paused)', line)
    if m and m.group(4) not in t:
        t[m.group(4)] = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
print(round(t['paused'] - t['started'], 1) if len(t) == 2 else 'n/a')
PY
  printf '{"variant":"%s","expect":"%s","clientExit":%s,"processExit":%s,"shippedTlibLines":%s,"runFor1sWallSeconds":"%s","denyLines":%s,"crashReports":%s}\n' \
    "$v" "$expect" "$crc" "$prc" "$shipped" "$(cat "$R/$v/runfor-wall.txt")" "$(grep -c 'deny(' "$R/$v/system-log.txt")" "$(ls "$R/$v/crash" | wc -l | tr -d ' ')" | tee "$R/$v/summary.json"
  tail -n 12 "$R/$v/renode.log"; cat "$R/$v/client.out"
  if [ "$expect" = boot ]; then [ $crc = 0 ] && [ "$shipped" -ge 1 ] || fail=1; fi
}
# The child exactly as signed inside the installed app.
# Run 40485901116: every Team-ID hardened variant booted the guest but the first
# emulated second took ~9 min of wall time, so the 240 s client limit expired.
# Same runner, same files: separate the signing mode from the runner's speed.
variant adhoc-no-runtime adhoc measure 300 $SB $INH
variant installed-child shipped boot 900
variant teamid-no-runtime resign-noruntime measure 600 $SB $INH $JIT
variant teamid-runtime-sandbox-inherit-only resign measure 300 $SB $INH

# Does the installed Mac App Store-signed app itself launch on this runner?
since=$(date '+%Y-%m-%d %H:%M:%S')
open -a "$APP" > "$R/app-open.txt" 2>&1; echo "open exit $?" >> "$R/app-open.txt"
sleep 20
pgrep -fl "$APP/Contents/MacOS" >> "$R/app-open.txt" 2>&1 && echo "app process running after 20 s" >> "$R/app-open.txt" || echo "app process not running after 20 s" >> "$R/app-open.txt"
pkill -f "$APP/Contents/MacOS" 2>/dev/null
sudo log show --style compact --start "$since" --predicate 'eventMessage CONTAINS[c] "brickwright" AND (eventMessage CONTAINS[c] "deny" OR eventMessage CONTAINS[c] "profile" OR eventMessage CONTAINS[c] "amfi" OR eventMessage CONTAINS[c] "not valid")' 2>/dev/null | head -n 200 >> "$R/app-open.txt"
cat "$R/app-open.txt" | head -n 40
cat "$R"/*/summary.json > "$R/all-summaries.jsonl"; cat "$R/all-summaries.jsonl"
exit $fail
