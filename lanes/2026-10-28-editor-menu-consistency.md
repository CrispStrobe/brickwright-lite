# Editor menu consistency

Owner: shared menu UX maintainer. Status: CLAIMED.

Base: c450e75265674d9f10bc1ccdc5ed819a57726240.

Scope: the shared menu bar, its MenuItem disabled behavior, CodeMirror menu
command routing, their overlay/package mirrors, and focused menu controls.
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
