#!/usr/bin/env bash
#
# pybricks-wasm-mutation-check.sh — proves test/pybricks-wasm-sim.test.mjs
# can see each subject it claims to test.
#
# For each mutant: copy firmware/pybricks-wasm with one subject removed,
# relink against a copy of the last build (only the mutated file recompiles),
# put the mutant wasm in place of the shipped one, run the tests, and require
# the named test to FAIL. The shipped assets are restored on every exit path.
#
# Needs a previous ./build-pybricks-wasm.sh (its build and source trees under
# out/). Same pinned emsdk.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="${PYBRICKS_SRC_DIR:-$ROOT/out/pybricks-micropython}"
BASE_BUILD="${PYBRICKS_BUILD_DIR:-$ROOT/out/pybricks-wasm-build}"
EMSDK="${EMSDK:-$HOME/emsdk}"
STATIC="$ROOT/overlay/scratch-gui/static/pybricks-sim"
WORK="$ROOT/out/pybricks-mutants"

[[ -f "$BASE_BUILD/pybricks-hub.wasm" ]] || { echo "FATAL: run ./build-pybricks-wasm.sh first" >&2; exit 1; }
# shellcheck disable=SC1091
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1

backup="$WORK/shipped"
mkdir -p "$backup"
cp -p "$STATIC/pybricks-hub.js" "$STATIC/pybricks-hub.wasm" "$backup/"
restore() { cp -p "$backup/pybricks-hub.js" "$backup/pybricks-hub.wasm" "$STATIC/"; }
trap restore EXIT

# name | file | exact line to replace | replacement | test that must fail
MUTANTS=(
  "matrix|hal/pwm_wasm.c|        duty[p->id][ch] = value;|        (void)value;|light matrix: pixels the program sets are the pixels the page reads"
  "motor|hal/motor_sim.c|    driver->voltage = pbio_battery_get_voltage_from_duty(duty_cycle);|    driver->voltage = 0 * duty_cycle;|motor: run_target moves the simulated shaft to the target and angle() reads it back"
  "distance|hal/uart_lump_sim.c|        uarts[port].distance_mm = (int16_t)clamp(mm, -1, 2000);|        (void)mm;|sensor: a program waiting on the distance sensor wakes when the page changes it"
)

status=0
for entry in "${MUTANTS[@]}"; do
  IFS='|' read -r name file from to must_fail <<<"$entry"
  src="$WORK/$name/src"
  build="$WORK/$name/build"
  rm -rf "$WORK/$name"
  mkdir -p "$WORK/$name"
  cp -a "$ROOT/firmware/pybricks-wasm" "$src"
  cp -a "$BASE_BUILD" "$build"
  python3 - "$src/$file" "$from" "$to" <<'EOF'
import sys
path, old, new = sys.argv[1:]
text = open(path).read()
assert text.count(old + "\n") == 1, f"mutation site not found exactly once in {path}: {old!r}"
open(path, "w").write(text.replace(old + "\n", new + "\n"))
EOF
  touch "$src/$file"
  make -C "$src" -j1 PBTOP="$SRC_DIR" BUILD="$build" >"$WORK/$name/make.log" 2>&1
  cmp -s "$build/pybricks-hub.wasm" "$BASE_BUILD/pybricks-hub.wasm" && { echo "MUTANT $name: wasm unchanged, mutation did not compile in" >&2; status=1; continue; }
  cp "$build/pybricks-hub.js" "$build/pybricks-hub.wasm" "$STATIC/"
  tap="$WORK/$name/tap.txt"
  node --test --test-reporter=tap --import "$ROOT/scripts/lib/register-gui-scope.mjs" \
    "$ROOT/test/pybricks-wasm-sim.test.mjs" >"$tap" 2>&1 || true
  restore
  failed=$(grep -E '^not ok [0-9]+ - ' "$tap" | sed -E 's/^not ok [0-9]+ - //' || true)
  if grep -qxF "$must_fail" <<<"$failed"; then
    echo "MUTANT $name: KILLED — failing tests:"
  else
    echo "MUTANT $name: SURVIVED — '$must_fail' did not fail" >&2
    status=1
  fi
  sed 's/^/    /' <<<"${failed:-<none>}"
done
exit $status
