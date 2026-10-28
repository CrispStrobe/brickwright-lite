# Cross-editor menu coverage and keyboard navigation

Owner: shared editor-menu UX maintainer. Status: CLAIMED.
Base: main 1a10d5e3c16; continue existing product PR #1536.

Expose existing Pixel and Tilemap commands through contextual File/Edit sections.
Group transforms, layers and frames into submenus rather than a long flat list.
Reuse existing localized labels, callbacks, confirmations, history and format
policies; keep save-to-editor distinct from project save. Preserve locked-layer,
selection, frame-limit, legacy-map and active-editor restrictions.

Own shared editor-menu-actions registry, menu keyboard helper/components/container,
menu bar and settings keyboard entry, Pixel/Tilemap provider/lifecycle wiring and
minimal extraction of toolbar callbacks shared with menus, localized UI labels,
mirrors, focused controls and existing affected browser acceptance scripts.
No renderer, artwork model, history/autosave service, compiler, physics, Robot,
FPGA engine, supplier pin or SDK policy changes. Other owners retain those scopes.

Keyboard: focusable triggers, Arrow/Home/End navigation, submenu entry/exit,
Enter/Space activation, Escape dismissal/focus return, disabled-item refusal.
Check routing/currentness and actual editor effects; run build/browser suites in
hosted CI or on an available Mac, not this shared VPS. Normal direct-main docs
registration only; all enabled final-head product checks still required to merge.


Implemented in the existing menu PR: 26 Pixel actions and 10 Tilemap actions,
with transforms/layers/frames/tile tools grouped in submenus. File save labels
identify artwork or tile-map destinations; project save stays separate. Import
inputs stay mounted so menu actions work without first opening a hidden panel.
Callbacks, confirmations, artwork algorithms and map serialization stay intact.

File/Edit/Settings have real buttons. Shared menu roles, disabled semantics,
Arrow/Home/End movement, root-menu cycling, submenu entry/exit, Enter/Space,
Escape focus return and Tab exit are implemented. Native form fields retain
cursor keys. Existing menu section classes are preserved.

44 focused controls pass, and a bounded actual React DOM control exercises
activation, disabled items, submenus and focus. It is not product qualification.
Hosted chrome, Pixel crop and Tilemap painter journeys now exercise the actual
menu routes while retaining their existing toolbar/save/reopen assertions.
A separate animation-resource test needs the normal installed GUI/VM dependency
tree and remains deferred to CI in a sparse source-only checkout.

Next: refresh exact final-head PR #1536 and qualify every enabled build/browser
check. Preserve any original failures; fix source causes without relaxed gates.
Then matched-head merge and verify parents/tree. Further coverage (FPGA, widget,
vector and sound editor commands) needs an actual-handler inventory and separate
owner-boundary agreement; this checkpoint does not claim those menus complete.

Pixel transform toolbar buttons and menu entries share one availability predicate,
including locked layers in other animation frames and selection bounds. Existing
transform algorithms and undo recording remain unchanged.
