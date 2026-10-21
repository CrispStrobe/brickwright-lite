## Code-tab optional languages, Arcade scoreboard, on-demand MakeCode extensions — 2026-10-10

DONE — Claude (opus), owner request, three sequential lanes from the Arcade
integration session (merged: #786, #787, #788):
1. `lane/code-tab-optional-languages-20261010`: the fe and Tcl code-tab languages
   move behind a "+" control in the language row (shown once chosen or when their
   buffer has text). Envelope: pseudocode-importer.jsx (overlay + tracked twin),
   its tests, this ledger. No change to the DOS toolchains themselves.
2. Arcade scoreboard: draw score, lives and countdown with PXT's own info HUD code
   transpiled from the pinned bundle; pixel comparison against the original.
   Envelope: arcade VM extension, a new generator, its test, generated-sources and
   bundle lists.
3. On-demand MakeCode extensions: fetch a project's GitHub extension at compile
   time for the original simulator, with the existing licence verdict; vendored
   pins stay preferred. Envelope: pxt-runtime.js, a fetch helper, tests, docs.
