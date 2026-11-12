# Circuit UI toolbar scroll row + German package adoption

CLAIMED and IMPLEMENTED in the same PR (#1633, Circuit-tab unification). The owner approved this on 2026-11-02. Branch `feat/circuit-tab-unify-20261102`.

## Why

Owner request: the Circuit tab's main toolbar should be one horizontally scrollable row, consistent with the Robots tab, with "⋯" keeping the rarely used items. The designer should also be complete in German.

## Supplier

bw-circuit-ui [PR134](https://github.com/CrispStrobe/bw-circuit-ui/pull/134), lane commit `64351efcf2e1b0c93a9778814646bd55fe6b628a`. Its only parent is the previous pin, `4b65f15485abbc039958d8e1a8a29ac3459b75f9`, so the delta is exactly this change. The PR's merge-master commit is not pinned, because the ESP32-4848S040 work on master keeps its own qualification step.

## Owned paths

The pin identity moves in:
- `vendor-pins.json`
- both `package.json`/`package-lock.json` pairs
- both `bw-packages.sources.json`
- `scripts/lib/instrument-regression-cases.mjs`
- the two circuit workflows
- the current-pin expectation in the package-adoption and source tests

Under the owner's standing approval for the x86 pin-move chain:
- the live F10 CUI entry in `scripts/run-i80386-hdd-gui-actual.py` and `scripts/read-i80386-hdd-gui-originals.py` (`LIVE_X86_CUI`)
- the re-stamped `HISTORICAL_X86_SOURCE_PROFILES` sha256 values
- the sha256/gitBlob of the two x86 rows of `docs/receipts/frozen-control-pin-admissions.json`; span and value are unchanged

No other receipt changes.

The behavior change is the toolbar: one row that scrolls sideways instead of wrapping. In `scripts/verify-circuit-ux.mjs`, the three wrap assertions become the equivalent single-row assertions:
- the row does not wrap
- the controls scroll
- "⋯" stays pinned and reachable
- the row is not cropped

## Qualification

Every enabled exact-head check on PR #1633 must pass, including the Circuit UX browser gate.
