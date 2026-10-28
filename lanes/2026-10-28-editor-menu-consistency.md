# Editor menu consistency

Owner: shared menu UX maintainer. Status: CLAIMED.

Base: c450e75265674d9f10bc1ccdc5ed819a57726240.

Scope: the shared menu bar, its MenuItem disabled behavior, CodeMirror menu
command routing, their overlay/package mirrors, menu translations in bw-chrome-messages.js,
and focused menu controls in verify-chrome-sweep.mjs and menu tests.
Expose Undo and Redo through Edit using the existing active-editor history;
show Circuit file operations in the Circuit context; expose Find/Replace,
Go to line and Select all in the Code context using actual CodeMirror commands.
Keep project file actions available in every editor. Ignore Code commands while
its editor is hidden or disposed. Do not alter history transactions, autosave,
project-history services, editor keyboard qualification, pins or model behavior.

Qualification: bounded command-routing and disabled-state controls, mirror and
source-policy checks, then hosted affected GUI/build checks before product merge.
Documentation registration uses the operator-approved normal direct-main route.
Product changes retain their normal exact-head qualification gates.


Implementation checkpoint: contextual Circuit actions, active-editor Edit Undo
and Redo, Code search/line navigation/selection, disabled callbacks and listener
cleanup are implemented. Focused controls pass; hosted GUI qualification is
pending in PR #1536. The existing chrome sweep exercises actual menu actions.
Do not merge on the focused host controls alone.

Follow-up scope, after this change qualifies: inventory each editor toolbar and
its callable handlers before adding further File/Edit commands, prioritizing
Code import/export and asset-editor commands. Reuse the same handlers and enabled
states, add real browser acceptance, and coordinate owned editor files before
implementation. This checkpoint does not claim complete menu coverage.
