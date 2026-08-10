# bw-bundle — blocked items (campaign: circuit parity)

## OPEN: loadExample must fill both code AND circuit

**Owner:** coordinator (circuit-tab.jsx is the coordinator's file)

`circuit-tab.jsx:167 loadExample()` sets `circuitData` only — it fetches
`circuit.json` and passes it to the designer. The owner directive says it
must ALSO run the example's pseudocode (`program.bw`) through the importer
path to set `vm.runtime.stc` + blocks. bw-cfront's gallery ships both files.

**File:** `overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx`
**Method:** `loadExample(ex)` — needs to also fetch `examples/${ex.files.program}`,
call the importer's `loadProject` or equivalent to set stc + blocks.

## OPEN: debugger visibility in production

The DebugPanel (flag/pause/step) renders in the Circuit tab when a project
has PIN declarations. Owner wants it discoverable from the Code tab too.
Not verified on production yet.

## OPEN: example crash — cannot reproduce headlessly

Owner reports loading an example crashes the browser window. Playwright
tests show 0 page errors on clicking examples. May be:
- Browser-version-specific
- A stale SW cache (now fixed: e695dd6 network-first for documents)
- An interaction the headless context doesn't trigger

SW cache verified correct: fresh page loads get current deploy hashes.
The one-shot recovery handler covers tabs open across deploys.

## RESOLVED items moved to bottom

### ~~Slice 1: debugState.bwMs~~ — RESOLVED (ceafc8d)
### ~~Slice 3: project.stc persistence~~ — IN PROGRESS (sb3.js patches + stage comment)
### ~~STC89 12T timing~~ — RESOLVED (ba6e001)
### ~~Naming rule: competitor name~~ — RESOLVED (b787135 + 956fab6)
