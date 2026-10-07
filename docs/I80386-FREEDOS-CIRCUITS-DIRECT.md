# FreeDOS direct Circuit input gate

**Guest unrun at the current source checkpoint.** The optional browser gate extends the accepted
[FreeDOS interaction probe](I80386-FREEDOS-INTERACTION.md) from its exact
source bytes. It keeps the same owned marker HDD, FreeDOS floppy, Widgets
boot/listing/fullscreen/PS/2 steps and Code roundtrip. While the Circuit tab
remains selected, it focuses the visible VDP face, sends the physical browser
keys for `echo circuitok`, and requires `circuitok` to appear as a separate
guest shell output line in the Circuit VDP **canvas pixels**. The observation
reads rendered pixels; it does not write guest memory or call the diagnostic
target's input API. After returning to Code, the probe requires both that
output and `PS2 DONE` to remain visible, a working `tabok` command, and
nondecreasing guest time.

The source-only control authenticates the earlier probe SHA-256
`0cb78e14ac17c882fa4bfe62d65320f5fe27d66891d76ccaa1cd01436d75fc92`,
proves a reversible derivative and parses the generated module. It does not
prove the Circuit VDP receives a key in a running browser. Run the actual
gate only from an exact reviewed pull-request head with the dedicated
`x86-freedos-circuits-actual` label. The hosted workflow builds that same app
head, verifies the installed board and Circuit UI pins, authenticates the
official FreeDOS 1.4 floppy and owned HDD, then keeps original screenshots,
guest text, clocks and first-failure logs. It uploads no guest media or app
bundle. The result must be audited against the original artifact before any
acceptance claim.

The [first hosted attempt](https://github.com/CrispStrobe/brickwright-lite/actions/runs/37627418944)
stopped before build completion or guest launch. The installed-package verifier
rejected the exact GitHub HTTPS checkout origin without the optional `.git`
suffix. The narrow correction accepts that exact owner/repository URL while
retaining the pinned commit, package payload and single-engine checks. The
first artifact's inventory named the generated probe, but its upload omitted
the `.mjs` file; the corrected workflow retains it for independent rehashing.
That attempt establishes no Circuit key or guest result.

The [second hosted attempt](https://github.com/CrispStrobe/brickwright-lite/actions/runs/37629972190)
built the app and authenticated the free media, but stopped at the preguest
build admission. Webpack stamped the ambient pull-request merge revision in
its seven-character build manifest, while the gate expected the reviewed
pull-request head. The corrected build supplies the exact checked-out head
to Webpack at build time and verifies its seven-character manifest projection
against that full head. The original second failure remains a failure; no
guest input or Circuit pixel response was observed in it.

The [third hosted attempt](https://github.com/CrispStrobe/brickwright-lite/actions/runs/37632115411)
passed source, build and free-media admission and booted the guest, retaining
the listing and PS/2 output. It stopped before sending Circuit keys: the
probe tried to click the VDP parent while the Controller pane's AT canvas
covered its click point. The correction uses the visible Debugger view button
to show the full VDP while keeping the Circuit tab selected, clicks the VDP
canvas through the browser pointer path, and checks actual VDP focus before
typing. The third attempt does not establish a Circuit input response; the
corrected source has not yet passed the hosted guest gate.

The [fourth hosted attempt](https://github.com/CrispStrobe/brickwright-lite/actions/runs/37640159639)
passed the physical Debugger-button and VDP-canvas focus checks. Its retained
screen visibly shows FreeDOS and `PS2 DONE`, but the probe stopped before
Circuit keys because its pixel observer was supplied to Playwright as a
string containing an arrow function. The locator evaluated that string as a
function value without invoking it on the canvas, so the pixel assertion
received no decoded text. The correction supplies an actual callable canvas
observer. A deterministic source control verifies that it decodes rendered
glyph pixels and rejects changed pixels and frame dimensions. The fourth
attempt remains a failure, and the corrected probe still requires a fresh
hosted pixel-response result.

The [fifth hosted attempt](https://github.com/CrispStrobe/brickwright-lite/actions/runs/37643740464)
at `50f12bdf215b1a572cbade711c4fd2d6b773004f` reached the corrected
pixel observer. The Circuit VDP decoded the prior FreeDOS prompt and `PS2 DONE`,
and the visible canvas accepted a physical click and retained focus. After
physical `echo circuitok` keys, guest time advanced from 68.2 to 99.9 seconds,
but the before/after Circuit canvas pixel SHA-256 and decoded text were
identical. The run therefore failed the real guest-response gate. Its
[original artifact 11494886005](https://api.github.com/repos/CrispStrobe/brickwright-lite/actions/artifacts/11494886005)
is 245,565 bytes, SHA-256
`ebee7c6199b94d90c0511cbdb70074ba533d95b8fcd1dcf1573a17e078c16e10`.
The retained Widgets-keyboard scan list observes only the Widgets mirror
callback, so its lack of new scans does not establish whether the Circuit VDP
forwarded keys. This follow-up records trusted VDP DOM key events and actual
target `keyIn` calls while forwarding the original method with the same
receiver and return value. It still requires visible guest pixels to change;
the fifth failure is not a passing result.

The [sixth hosted attempt](https://github.com/CrispStrobe/brickwright-lite/actions/runs/37647337533)
at `780b7a7ff7c737f632a90152f0d9ca38890aec10` retained
[original artifact 11496105114](https://api.github.com/repos/CrispStrobe/brickwright-lite/actions/artifacts/11496105114)
(247,016 bytes, SHA-256
`c5123adaa338ebaac36584f734fd76cb30f07e966b1fd74aa9df1e2aeb28e785`).
All 30 physical VDP keydown/up events were trusted and targeted the focused
screen, but the wrapped target method received zero `keyIn` calls; the guest
pixels were unchanged as time advanced. The route between focused DOM events
and the observed target remains unresolved: a missing React callback prop,
an unhandled React key event, or a changed runner/target remain possible. The
next probe records those route facts without synthesizing input or relaxing
the pixel gate.

This bounded input check does not establish drag capture beyond the canvas,
browser-reserved key handling, an INT33 mouse application, disk writeback,
or a general native 386 backend. A live terminal CLI scenario remains a
separate acceptance task.
