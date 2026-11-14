# Robot Lab catalogue optional keywords

Owner: Robot Lab palette correction lane. Base: `36e2d3b`.
Status: implementation complete locally; publication and hosted checks pending.

Scope: `overlay/scratch-gui/src/lib/bw-sim/editor/palette.js` and
`test/bw-sim-palette-search.test.mjs`. Treat absent catalogue keywords as empty
text so searches cannot match the JavaScript words `undefined` or `null` unless
they occur in actual catalogue text.

Qualification: three focused source-unit tests pass; unchanged catalogue-search
ranking control passes in isolation. Both absent-keyword regressions fail on the
original source. Broad catalogue/palette suites require unavailable local test
inputs and dependencies. No browser, built GUI, guest, OS clipboard, physical
device or physical-accuracy qualification is claimed.
