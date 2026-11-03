# Circuit UI German (DRC findings, canvas notes, remaining chrome) package adoption

CLAIMED and IMPLEMENTED in the same PR. Owner request (2026-11-03): finish the German translation of the Circuit designer, then adopt it in Lite. Branch `feat/circuit-german-drc-20261103`.

## Why

After bw-circuit-ui#134 (adopted by #1633), several parts of the designer were still English with German selected:
- the design-rule (DRC) finding texts in the warnings popover and the Warnings panel
- the canvas example annotation
- the two debugger-dock tooltips
- smaller pieces found by switching the language to German

## Supplier

bw-circuit-ui [PR136](https://github.com/CrispStrobe/bw-circuit-ui/pull/136), lane commit `15416c7e11efaa52c68244fcf36ee31f1f6e99e4`. Its only parent is the previous pin, `64351efcf2e1b0c93a9778814646bd55fe6b628a`, so the delta is exactly this change. The PR's merge-master commit is not pinned, because the ESP32-4848S040 work on master keeps its own qualification step (as in #1633).

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

Host change: `circuit-panels.jsx` hands the designer's language to the vendor `DrcPanel` (the Warnings panel) and `BomPanel` (the Parts list), through one `designerLang(locale)` helper that the Examples panel also uses. Tests:
- `test/circuit-designer-ux-contract.test.mjs` checks the two debugger-dock tooltips per language (English exactly as `verify-circuit-ux.mjs` finds them, German, and the per-language lookup)
- `test/circuit-panels-model.test.mjs` and `test/fpga-gate-packing.test.mjs` follow the `lang` prop

## Gates stay English

The browser gates run in English. English DRC text, notes, titles, aria names and test ids are unchanged in the supplier; `localizeDrcWarning(w, 'en')` returns the warning object itself. The exact English strings the gates and tests match were checked statically:
- `verify-drc-current.mjs`: "Total circuit current … exceeding the … limit", "Largest consumers:"
- `verify-circuit-ux.mjs`: the two dock titles
- `circuit-engine-surface.test.mjs`: "cannot be rated"
- `seated-buzzer-equivalence.test.mjs`: "driven directly, no series resistor"

## Qualification

Every enabled exact-head check on the PR must pass, including the Circuit UX browser gate. The German texts load with the designer chunk (`bw-circuit-ui` is imported lazily), not at first load; `verify-boot-payload` checks this.
