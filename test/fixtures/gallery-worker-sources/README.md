# Gallery worker compatibility sources

These are byte-exact source fixtures from `CrispStrobe/extensions`, captured at
commit `92cbcf94af01098502c13cd7695529596d378608`. Each source retains its
upstream license and attribution header. The compatibility test checks the bytes
against the corresponding `repo` SHA-256 in `gallery-pins.json` before executing
them; do not normalize line endings (in particular, `Clay/htmlEncode.js` is
CRLF).

**The capture commit above is history; the SHA-256s are the check.** The
`commit` field in `gallery-worker-compat.json` is a different thing again — it
ties this corpus to the gallery pin set it was last reconciled against, and the
test requires the two to be equal. When the gallery is re-pinned, that field
moves with it, and moving it is only honest once the 25 sources still match
their `repo` SHA-256s at the new pin — which is precisely what the per-case
assertion proves on the next run. On 2026-09-21 the pin moved to `34fafc86`
(Lite's own upstream EV3 fixes changed the served bytes of other files) and all
25 were unchanged.

The fixtures make the runtime proof deterministic and offline. Adding a source
here does not migrate it: the case fixture and generator-owned
`RUNTIME_WORKER_PROVEN` policy must also name it, and all three are compared by
the test.
