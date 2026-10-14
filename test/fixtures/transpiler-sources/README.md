# Transpiler source fixtures

A byte-exact copy of each LEGO transpiler whose generated code this suite
compiles with the real vendor toolchain. The copy exists because these
extensions are **gallery-pinned, not bundled**, so there is no in-tree source
for a test to read, and a test that fetched from the gallery at run time would
be neither offline nor deterministic.

`test/transpiler-codegen.test.mjs` checks each fixture's bytes against the
corresponding `repo` SHA-256 in `gallery-pins.json` before running it, exactly
as `gallery-worker-sources` does. A fixture that drifts from the pin fails
there rather than silently testing something we do not ship.
