# Gallery worker compatibility sources

These are byte-exact source fixtures from `CrispStrobe/extensions` commit
`9f74ed9faccb24d4366c6bb781cde5c6892ecedb`. Each source retains its upstream
license and attribution header. The compatibility test checks the bytes against
the corresponding `repo` SHA-256 in `gallery-pins.json` before executing them;
do not normalize line endings (in particular, `Clay/htmlEncode.js` is CRLF).

**Three different commits are cited around this corpus and they mean three
different things.** The one above is the gallery pin set these bytes were last
reconciled against, and `gallery-worker-compat.json` carries the same value —
the test requires the two to be equal, and that is a *freshness tie*, not the
check. The SHA-256s in `gallery-pins.json` are the check, asserted per case
before each source is executed. When the gallery is re-pinned, the tie moves
with it, and moving it is only honest once the sources still match their
`repo` SHA-256s at the new pin — which the next run proves. Said out loud
because on 2026-09-21 a re-pin moved one and not the other and CI went red for
a stale label while every byte was correct.

The fixtures make the runtime proof deterministic and offline. Adding a source
here does not migrate it: the case fixture and generator-owned
`RUNTIME_WORKER_PROVEN` policy must also name it, and all three are compared by
the test.
