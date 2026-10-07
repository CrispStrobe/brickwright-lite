# Gallery-served extension bytes (task E5)

The exact bytes `https://crispstrobe.github.io/extensions/<slug>.js` served on
2026-10-06 for three pins, each matching its `served` SHA-256 in
`overlay/scratch-vm/src/extension-support/gallery-pins.json` (gallery commit
`a1dd6cbc3da4b690d00aa61710198353989616b8`). They are the reviewed repository
source with the gallery build's generated l10n prelude, which is why they are
not the `repo` bytes in `../gallery-worker-sources/`.

`test/gallery-project-extensions.test.mjs` serves them from a stubbed `fetch`
so the real loaders (fetch, SHA-256 check, worker or adapter) run with no
network, and asserts each file still hashes to its pin before using it.

| file | pin path | licence (header kept) |
| --- | --- | --- |
| `encoding.js` | worker | MIT (-SIPC-) |
| `Clay/htmlEncode.js` | worker; its `// ID:` header (clayhtmlencode) is not its id (claytonhtmlencode) | MIT (clay-rip) |
| `JeremyGamer13/tween.js` | adapter (deferred: runtime) | MIT (JeremyGamer13) |

Only MIT files are kept here. Do not normalise line endings (`.gitattributes`).
