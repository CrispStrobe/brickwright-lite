# Gallery worker compatibility sources

These are byte-exact source fixtures from `CrispStrobe/extensions` commit
`92cbcf94af01098502c13cd7695529596d378608`. Each source retains its upstream
license and attribution header. The compatibility test checks the bytes against
the corresponding `repo` SHA-256 in `gallery-pins.json` before executing them;
do not normalize line endings (in particular, `Clay/htmlEncode.js` is CRLF).

The fixtures make the runtime proof deterministic and offline. Adding a source
here does not migrate it: the case fixture and generator-owned
`RUNTIME_WORKER_PROVEN` policy must also name it, and all three are compared by
the test.
