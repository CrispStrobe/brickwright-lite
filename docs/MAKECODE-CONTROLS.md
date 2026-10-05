# MakeCode simulator and Arcade controller checks

`npm run verify:makecode-controls` drives the production GUI with Playwright. Build it first with `npm run build:gui:force`. The gate uses genuine MakeCode projects from `test/fixtures/makecode/` and checks these paths:

| Project | Path exercised | Observable result |
|---|---|---|
| `arcade-assets.hex` | Import → To blocks → green flag → Arcade pane ▲ | Imported `mySprite` moves 30 stage units. |
| `arcade-assets.hex` | Controller D-pad widget ▲ | The same imported sprite moves another 30 units. |
| `arcade-assets.hex` | Run original MakeCode Arcade simulator → pane ▲ and inline D-pad ▲ | The original simulator paints a 160×120 screen and receives a key press and release from each control. |
| `arcade-taco-move.ts` | Run original MakeCode Arcade simulator → hold pane ▶ and inline D-pad ▶ | A stable game screen changes after each hold as the controller moves the taco sprite. |
| `arcade-created-asteroids.ts` | Import → To blocks → green flag | A timed sprite creation fires its `onCreated` callback, which positions the new handle and selects one of two imported costumes. |
| `arcade-fire-overlap.ts` | Import → To blocks → A, Controller D-pad, overlap | A stops its countdown; a widget moves the named player handle; a fire collision runs the overlap callback and destroys that fire handle. |
| `arcade-side-projectile.ts` | Import → To blocks → green flag | The projectile starts at the incoming edge, moves at its imported velocity, and disappears after leaving the screen. |
| `arcade-console-log.ts` | Import → To blocks → green flag → Arcade pane | Both serial messages appear in order in the console log. |
| `calliope-images.hex` | Run original Calliope simulator → pane A | The simulator receives the A press and release. |
| `microbit-button-score.ts` | Import embedded-source HEX → run original micro:bit simulator → pane A | The button handler runs and changes the 5×5 LED image to display the new score. |

The MakeCode pane supplies held A/B buttons on all supported targets and arrows on Arcade. Its Widgets drawer shows the same Controller panel widgets used elsewhere. A default D-pad and A/B widgets are created when needed. On a translated Arcade project, Controller D-pad, joystick, and named A/B widgets use the Scratch VM keyboard input and Arcade button event path. In the original MakeCode simulator, those widgets send keys to its own simulator iframe.

This gate does **not** establish general MakeCode conversion parity. The [compatibility audit](COMPATIBILITY-AUDIT.md) lists unsupported project constructs. In particular, the Arcade translator still uses fixed Scratch targets for many sprites; dynamic sprite references, projectile creation, tile maps, game intervals, and several event callbacks need dedicated translation and behavior tests. An original MakeCode program can run in its simulator while its translated blocks remain partial.
