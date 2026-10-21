## iPad chrome fit, menu localization and WeDo acceptance — 2026-10-17

SOURCE LANDED — Codex root, claim branch `docs/ipad-chrome-wedo-claim-20261017`; implementation PR1050 merged as `fc385cada4d2ff6aab21e22bdcc38dc696d9c787`. Signed delivery and physical acceptance remain in this lane.
User reports cramped touch-screen editor tabs, invisible collapsed-toolbar
ellipsis, untranslated menus, dim 88005 and silent clone piezo after installing
the qualified local candidate. Preserve the completed H1–H5 Code-toolbar owner
changes; no edits to their pseudocode toolbar/status/Animation implementation.

Own bounded editor chrome in `components/gui/{gui.jsx,chrome-toggle.jsx,compact-chrome.css}`,
`lib/phone-chrome.js`, narrowly necessary menu labels in `components/menu-bar/`
and their EN/DE catalog entries, canonical generated mirrors, and the existing
touch/chrome/menu localization tests and actual responsive browser gate. Tab
labels remain visible when they fit, otherwise real icons with localized
accessible names/tooltips; keep every tab and the expand control reachable,
32px minimum touch targets, no hidden overflow or overlap with menu actions.
Use the selected app locale, not an independent browser-language guess.
Qualify portrait/landscape iPad and wide/narrow desktop, expanded/collapsed,
English/German, including actual tab switching and menu activation. Localized
labels must not change actions, serialized settings or extension identifiers.
No engine, supplier pin, workflow budget, Code-toolbar takeover or release.
Merge this claim before product edits; qualify final enabled source-head checks
before normal matching-head source merge and a fresh signed iPad build.

WeDo hardware diagnostics use the already owned LED/piezo acceptance scope:
connect from the Mac only after the iPad releases BLE; inspect battery and
known IO announcements, compare documented full-power versus dimmed light,
and run the bounded acknowledged short-note pattern with quiet gaps on the
announced piezo port. Record actual user light/audibility observations. No
unbounded output, unknown-port experiment, firmware flash or silent host-audio
substitution. Any demonstrated extension fix belongs upstream first, with a
separate exact-pin adoption claim if necessary. All machine/device details
and raw receipts stay in ignored local context. Acknowledge a working external
LED separately from hub RGB; current user reports LED works but is too dim.

Implementation checkpoint: claim PR1048 merged as `1e8c271e2` before source
edits; source branch `fix/ipad-chrome-l10n-20261017` is locally qualified.
Tabs now use measured label fit, separate icons and localized accessible names;
the collapsed touch strip keeps its ellipsis visible. Settings and native File
labels use the selected app's EN/DE catalog, including regional German locales.
The catalog is applied through the existing locales reducer and preserved on
catalog replacement. No action or serialized setting values were changed.
The production build passed with two existing size warnings. All 77 focused and
integration controls passed, followed by the complete Chromium responsive gate:
22 browser observations, zero page errors, including actual tab switching,
portrait/landscape touch contexts, icon-only desktop keyboard reach and EN/DE
Settings/File actions with an English browser locale. These receipts describe
the locally built working tree; final published-head CI, source merge and a
fresh signed native build/install remain pending. Keep the A13 CPX/File candidate
when composing that native build; do not replace it with the older main pins.

Physical acceptance remains separate: full reversed LED power on numeric port
2 was visibly brighter, but the prior iPad brightness value is unknown. Correct
legacy piezo writes with and without response remained silent. LWP3 endpoints
were absent from complete discovery; no valid LWP3 tone was sent. The actual
node-poweredup encoder matches those bytes. Its independent Bluetooth retry
connected, discovered the piezo and sent its own short low/high/low sequence;
the user again reported no sound. The earlier scan-only failure remains separate.
See [protocol findings and bounded next experiments](docs/WEDO-HUB-PROTOCOL-NOTES.md).
Hardware/model identification or a genuine-hub comparison remains open; do not
claim a new buzzer fix or change supplier pins without demonstrated evidence.

Touch-size follow-up: the previously delivered native app predates this source
candidate. Touch tabs now require 44px targets, 20px icons and 14px labels;
the browser gate checks that visible icon/text boxes remain within each tab.
Layout measurement loads in a local deferred chunk, and English defaults stay
in the actual message descriptors instead of a duplicate catalog. This addresses
the original startup-size failure without relaxing its budget. The solo-dock
contract now checks the localized descriptor while retaining the stored `solo`
value; the initial failed hosted receipts remain part of the record. About and
8086 menu labels are localized too. Final production size/browser/native receipts
and exact-head hosted qualification remain required for this follow-up.

Delivery checkpoint: candidate `f869cb229` normally composes GUI `5aeddbc12`
with the published A13 CPX/File candidate. Its production frontend passed with
zero errors and two size warnings; initial JavaScript is 4,464,144 bytes against
the unchanged 4,467,136-byte production ownership limit. The physical iOS archive
passed strict signature/platform checks, contains the fresh frontend entrypoint,
and contains neither duplicate frontend resources nor a bundled static archive.
All 97 focused controls and 20 Chromium observations passed, including fresh
iPad-sized contexts, EN/DE menus, visible-content containment and actual tab
switching. The browser reader now waits for project-loading coverage to clear
and creates fresh contexts for each orientation. WebKit's scaled automation
coordinates require separate qualification; do not call its full matrix passed.

The candidate was installed successfully over WLAN. Its launch command was
blocked by the locked iPad; visible UI and hardware acceptance remain pending.
The full-power LED implementation is included: this observed clone's physical A
requires logical B, 100%, reversed polarity. No additional brightness defect or
buzzer success is claimed. Source PR1050 and the earlier integration ownership
still require final enabled exact-head hosted qualification before main landing.

The user confirmed that the delivered tabs are much better, but reported a blank
collapse button on iPad. Replace both font glyphs with explicit centered SVG
chevron/dots, preserving the localized button name, pressed state and hit target.
The browser reader now requires a visible 20px SVG with nonempty drawing bounds
in both states. Qualify the rendering and send a fresh native candidate; physical
icon acceptance remains pending that delivery.

Physical follow-up: SVG candidate `9ba9a2e89` was installed over WLAN, but the
user still sees a blank collapse button with a small white bar. Its desktop
WebKit/Chromium SVG checks do not establish physical iPad rendering success.
Replace the icon with CSS border/box-shadow shapes and disable native button
appearance, keeping both 20px icon states and the existing 44px touch target.
The reader checks the actual pseudo-element, and the delivery proof must also
inspect painted pixels in both states before building/installing the next
identified candidate. Ask for physical confirmation after delivery; do not
claim the cause or the visual defect resolved from geometry checks alone.

Direct physical-screen evidence now shows the button's left edge clipped at
the scrolling tab-list boundary, with its remaining area missing. Reopening
the app did not change it. The CSS-only candidate was stopped before delivery.
Portal the toggle to the document body, outside the overflow container, and
reserve space beside the compact tabs; keep tab measurement attached to the
actual tab list. Explicitly hide the portaled control in stage fullscreen.
Qualify both icon states, tab scrolling, hit targets, label fit and fullscreen
entry/exit, then capture the installed iPad toolbar directly to check the
result. Direct screenshots and machine-specific capture tooling stay ignored.

Delivery checkpoint: candidate `bc5685b9e` normally composes this portal fix
with the existing A13 candidate and is installed and launched on the physical
iPad over WLAN. Strict signing/platform/fresh-frontend checks pass; app size
remains 84.05 MiB. Eight EN/DE Chromium/WebKit icon paint checks pass with forced
tab-strip clipping/scrolling and fullscreen entry/exit, plus twelve actual
Chromium responsive tab/menu observations. Direct device screenshots now work.
The post-install screenshot has a floating video covering the toggle, so final
physical chevron acceptance is pending an unobstructed expanded toolbar capture.
This is an installed candidate; final hosted source qualification/main landing
remains separate. No connection-recovery supplier adoption is included.
