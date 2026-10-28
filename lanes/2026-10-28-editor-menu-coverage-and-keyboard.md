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
