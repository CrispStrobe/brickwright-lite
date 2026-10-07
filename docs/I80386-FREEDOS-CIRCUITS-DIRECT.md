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

This bounded input check does not establish drag capture beyond the canvas,
browser-reserved key handling, an INT33 mouse application, disk writeback,
or a general native 386 backend. A live terminal CLI scenario remains a
separate acceptance task.
