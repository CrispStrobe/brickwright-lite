# Tutorial input authority

The optional `--editor-policy pxt-13.2.1` mode of the corpus collector and context
recovery tool uses the retained Arcade 4.2.1 target's actual `blocksprj` template
and records its target JSON SHA256. Missing or differently versioned target
snapshots fail explicitly. New tutorial-context campaigns should select this
mode; the default historical assembler remains available for reproduction.
Normal imported `.mkcd` projects retain their own files and configuration.

## Primary source policy

The selected SDK declares PXT 13.2.1. Its immutable primary-source tag
[v13.2.1](https://github.com/microsoft/pxt/tree/c40f412dc5bebb915a5891cd62fe956e198fb194)
resolves to `c40f412dc5bebb915a5891cd62fe956e198fb194`.
PXT is [MIT licensed](https://github.com/microsoft/pxt/blob/c40f412dc5bebb915a5891cd62fe956e198fb194/LICENSE).
This is a version join, not a source-to-worker reproducible-build certificate.

- [parseAssetJson](https://github.com/microsoft/pxt/blob/c40f412dc5bebb915a5891cd62fe956e198fb194/pxtlib/tutorial.ts#L540-L552)
  selects only tilemap/image JRES and generated TypeScript entries. Its saved
  `pxt.json`, `main.ts`, dependencies and other project files do not become the
  tutorial editor's initial authored project.
- [Tutorial creation](https://github.com/microsoft/pxt/blob/c40f412dc5bebb915a5891cd62fe956e198fb194/webapp/src/app.tsx#L5205-L5240)
  reads package fences. [Project creation](https://github.com/microsoft/pxt/blob/c40f412dc5bebb915a5891cd62fe956e198fb194/webapp/src/app.tsx#L3103-L3121)
  merges these dependency keys into the actual target template. This is not a
  repository-alias deduplication or a preference for an old saved version.
- [Custom helper loading](https://github.com/microsoft/pxt/blob/c40f412dc5bebb915a5891cd62fe956e198fb194/webapp/src/app.tsx#L2279-L2288)
  adds actual `tutorial.custom.ts`; [setContentAsync](https://github.com/microsoft/pxt/blob/c40f412dc5bebb915a5891cd62fe956e198fb194/webapp/src/package.ts#L388-L404)
  includes that file in the project configuration. Keep this code even when a
  selected snippet makes its declarations conflict.
- [Header loading](https://github.com/microsoft/pxt/blob/c40f412dc5bebb915a5891cd62fe956e198fb194/webapp/src/app.tsx#L1814-L1818)
  loads JRES, custom helpers and the tutorial template separately. Saved art
  input bytes do not establish the final regenerated TypeScript or source order.

The bounded helper follows first package fence / last asset, custom and JRES
fence selection. It preserves package alias keys independently and applies
same-key changes, including `remove`, without merging repository versions.
Unrecognized package syntax fails explicitly. The selected `main.ts` bytes are
retained; no template or ghost body is automatically substituted.

## Consequences for retained cases

Holiday's saved asset configuration supplied `carnival` while its package fence
supplied `arcade-carnival`. Combining both produced an artificial duplicate.
Rockscout's saved `tilemaps#v1.11.0` similarly conflicted with its unversioned
`pxt-tilemaps` package fence. The version-bound projection excludes those saved
configuration dependencies; actual package resolution still needs exact source
and ref evidence. A dependency with an unspecified ref is not silently pinned
from the discarded asset configuration.

Wakanda's custom `Guard` declaration must remain. A historical collector archive
without that helper is not authentic original-editor evidence and cannot justify
removing the duplicate declaration. It remains held for genuine step/source
assembly authority. None of these findings establishes new working projects.

## Qualification boundary

The result is a **selected-snippet projection with tutorial inputs**, not an
observed original-editor export. Its assembly record states
`originalEditorExport: false` and `assetCodeRegenerated: false`. It preserves the
four saved art inputs; actual editor JRES loading and code regeneration require
separate SDK qualification. Standalone JRES needs an explicit original tilemap
emitter; no guessed generated code is supplied.

Preserve previous projects, failing compiler envelopes, diagnostics and raw
census identities. Write corrected projections to new outputs. Pure assembly
controls do not qualify original SDK preparation, compilation, native gameplay,
visible Code/Blocks editing, save/reopen or current edited export/reimport.
Those operations need separately reviewed finite source-bound plans.
