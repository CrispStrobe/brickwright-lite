# Arcade event authoring acceptance

## Runtime and editable vocabulary

The merged control event contract is [ARCADE-CONTROL-EVENT-BUS.md](../ARCADE-CONTROL-EVENT-BUS.md).
The matching supplier provides nine forms for shared event-source allocation,
fixed controller source lookup, connected-state assignment, control and
multiplayer registration/hat pairs, raising events and waiting for events.
PLAYER is a fixed field, not a connected menu shadow. Numeric event arguments
remain live connections. CONNECTED preserves the selected SDK setter's primitive
value rather than introducing Boolean coercion.

Inline handlers retain live captures and actual target/scene ownership. Named
or dynamic handlers remain explicitly refused until canonical callable dispatch
is qualified. This target does not expose EventCreationMode, eventValue or
eventTimestamp. Arcade does not configure notify-one remapping: source 1022 does
not wake waiters on source 1023. The latter source broadcasts normally.

## Production GUI journey

`scripts/verify-arcade-event-authoring-gui.mjs` uses the owned MIT fixture
`test/fixtures/arcade-event-authoring-game.mjs`. It requires an admitted official
build receipt, the retained sole archive and an explicitly bound Git executable.
The harness verifies the exact source, supplier/Arrays pins, actual embedded SDK,
archive hash and served GET-body bytes. HEAD responses are observed separately.
No VM mutation, injected primitive calls, teleporting, clock changes or direct
Blockly mutations act as user controls.

The journey performs these real actions:

1. Import MakeCode through the Code file chooser and load Blocks.
2. Inspect the actual handler, wait, connection and allocation blocks.
3. Scroll the Arcade palette, drag a raise-event command into the workspace and
   delete the selected orphan through the keyboard.
4. Edit numeric VALUE fields consistently on register/raise/wait and choose
   PLAYER 3 from the actual fixed dropdown.
5. Run and press A in Game Console. Observe the waiter, handler and actual
   connection callback; compare stage pixels and values with the admitted SDK.
6. Convert Blocks to Code, edit the handler's message, then load Blocks again.
7. Save through File, reopen in a fresh browser context and run again.
8. Export MakeCode through the GUI, compile/run that actual export with the
   build's SDK, then reimport and repeat the controls.

Execution needs `PROOF_URL`, `BW_GUI_BUILD_RECEIPT`,
`BW_GUI_BUILD_ARCHIVE`, `BW_GUI_GIT_EXECUTABLE` and optionally
`BW_EVENT_GUI_REPORT_DIR`. `scripts/admit-official-gui-artifact.mjs` supplies
source-bound admission through the existing official build-artifact consumer.
Do not substitute a previous build or acquire another SDK. Workflow wiring and
execution must use the same official artifact as its successful build job.

## Gap ledger

| Surface | Status / remaining acceptance |
| --- | --- |
| Native events, scene contexts, queues, Stop/restart | Focused runtime and original-backed controls exist. |
| Code / native blocks / same and fresh SB3 / export | Representative focused routes qualified; not a whole-game census promotion. |
| Real palette, numeric fields and fixed PLAYER dropdown | Journey prepared; exact hosted execution pending. |
| Real function/handler authoring | Inline imported handlers editable; creating complete registrations and captures from scratch needs hosted operator acceptance. |
| Named / dynamic function handlers | Explicitly refused until canonical callable service is qualified. |
| Connection callback Player parameter | Covered by the prepared genuine A-button journey; hosted outcome pending. |
| Production save/reopen/export authoring | Prepared; must pass against the admitted matching artifact. |
| Debugger pause / background and idle handlers | Not qualified by this slice. |
| Controller menu / any-button getters | Named unsupported source boundary; no guessed menu implementation. |
| Graphics editor | Owned imported hero is observed; this journey does not claim complete pixel/tile authoring. |
| Multiple scene/reentrant queues in GUI | Native controls exist; broader operator journey remains open. |

Script syntax and fixture conversion checks are preparation. A passing
`test/arcade-event-authoring-fixture.test.mjs` does not mean the IDE journey ran.
