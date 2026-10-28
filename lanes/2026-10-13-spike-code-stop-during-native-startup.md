## SPIKE Code Stop during native startup — 2026-10-13

DONE — Codex SPIKE integration, `fix/spike-startup-stop-feedback-20261013`.
Envelope: `overlay/scratch-gui/src/lib/spike-arena/code-run-feedback.js`,
`overlay/scratch-gui/src/components/tw-pseudocode/spike-arena-pane.jsx`,
`test/spike-code-run-feedback.test.mjs`, `test/spike-arena-pane-units.test.mjs`,
this ledger and the SPIKE status guide; preserve tracked mirrors only where they
still exist. The installed bb293 startup observation exposes Arena Stop but
hides Code Stop until firmware feedback becomes active. Add an explicit starting
notification through the existing feedback callbacks and arena pane, after
validation and with the stop handler already installed. Show Code Stop while
starting without reporting guest execution as RUNNING. Preserve terminal and
cancellation guards, invalid-program refusal, existing retained uploads and
cleanup ownership. Qualify the actual Code Stop action during pending native
startup on a freshly built installed consumer, followed by cleanup and a new
run; host controls alone do not close this lane. No importer, painter, peer,
firmware, Runtime/model pin or workflow edits.

At source candidate publication, localized cold-start feedback exposed Code Stop
after session startup invocation. Fourteen Node 22 feedback controls passed;
four notification, terminal and retained-upload mutants failed. Hosted and fresh
installed qualification remained pending then; host controls alone did not close
this claim.

Closed by PR860, merge5e69e8ac85c006a0d5724e3be17bc3d03729f88b; tested source
da37339468a1080d22812b8747eb9659ac85d6c5. All seven enabled checks passed;
actual installed Code Stop before first frame, no upload, deferred cleanup,
restoration and fresh successful run passed. Original failures remain preserved.
Reviewed and actual merge trees match; broader G02 and distribution stay open.
