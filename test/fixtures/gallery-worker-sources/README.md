# Gallery worker compatibility sources

These are byte-exact source fixtures from `CrispStrobe/extensions` commit
`9f74ed9faccb24d4366c6bb781cde5c6892ecedb`. Each source retains its upstream
license and attribution header. The compatibility test checks the bytes against
the corresponding `repo` SHA-256 in `gallery-pins.json` before executing them;
do not normalize line endings (in particular, `Clay/htmlEncode.js` is CRLF).

The fixtures make the runtime proof deterministic and offline. Adding a source
here does not migrate it: the case fixture and generator-owned
`RUNTIME_WORKER_PROVEN` policy must also name it, and all three are compared by
the test.
