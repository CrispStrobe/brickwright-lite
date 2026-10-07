# FreeDOS browser interaction probe

The optional interaction mode extends `scripts/verify-i80386-freedos-real-browser.mjs`. It boots actual FreeDOS through Machine Manager, types `dir c:`, expands the Widgets pane, enters/exits fullscreen, switches Circuits/Code, and runs an owned DOS program that enables the PS/2 auxiliary device and prints one received packet. The program polls hardware; it is not an INT33 mouse driver or a general mouse application compatibility test.

## Reproduce

Use a bw-board checkout matching the application's dependency and an already built Lite app. FreeDOS media stays outside the repository. Obtain FreeDOS 1.4 from the [official release directory](https://download.freedos.org/1.4/): `FD14-FloppyEdition.zip`, member `120m/x86BOOT.img`. The expected archive SHA-256 is `45b1fa7c52dd996c3bfa5e352ffcd410781b952a6ad629f15a4c9ec4bbaefc5a`; the 1,228,800-byte floppy SHA-256 is `03df6088be016e57a6c44275f5bb9ab0244db71de1360957fd76ba83243b6a77`. Review the exact distribution's component terms before redistributing media; this probe does not bundle it.

From the Lite repository root, with the board checkout alongside it:

```sh
mkdir -p media evidence
node scripts/prepare-i80386-freedos-interaction.mjs ../bw-board media/type1-hdd.img
FREEDOS_IMAGE=media/x86BOOT-1200.img \
FREEDOS_HDD=media/type1-hdd.img \
FREEDOS_GUI_BUILD=packages/scratch-gui/build \
FREEDOS_PROBE_OUTPUT=evidence/freedos-interaction \
FREEDOS_INTERACTION=1 \
npm run verify:i80386-freedos-real-browser
```

Install the repository's Playwright/Chromium prerequisites first. The media preparer creates the owned type-1 FAT16 marker disk with SHA-256 `2fa9c252f22cec4f8c5bdc82d1587293ffcaed791e0982384628d19a7316a851` and refuses to overwrite an output. Interaction mode copies this disk in memory and adds `MOUSE.COM`, assembled from `test/fixtures/i80386-freedos-interaction/mouse.asm`; neither input disk is modified. The floppy supplies DOS. A focused GNU binutils test checks that the embedded program exactly matches its source.

## Observation and acceptance boundary

Guest text is decoded from actual mode-3 video pixels using the installed board's fixed font. This observation does not read guest VGA memory or change VGA latches. It deliberately accepts only complete 720×400 frames. The mouse gate requires both a successful input callback and guest output `PS2 PACKET 09 00 00`, followed by `PS2 DONE`. Merely displaying a canvas or observing a host callback is insufficient.

The report records the app build commit, index hash, media hashes, keyboard scancodes, pane dimensions, fullscreen bounds, tab identity, mouse events and screenshot hashes. Keep exact app/build and probe revisions separate: running a new probe against an earlier hosted app does not qualify newly changed application source. Reports and screenshots are operator output; review them before publishing. Failure diagnostics preserve the guest text and observed input.

Remaining acceptance work includes drag capture outside the canvas, browser-reserved keys, an actual guest mouse driver/application, and an explicit input response after each tab transition. ISO/ATAPI, arbitrary DOSBox packages and disk writeback remain separate loading tasks.

## Current observed state

The [October 7 observation](receipts/2026-10-07-freedos-tab-reboot.json) records a failure on exact hosted app source `6351f8ee42ecd39719c27f80af2ff4e816791f23`: after the Circuits/Code roundtrip, media events increased from two to three, guest time restarted, and the screen returned to the FreeDOS language menu. A stable debugger wrapper identity had concealed runtime recreation. The harness now requires an actual shell response after switching, nondecreasing guest time and unchanged media-event count. A lifetime correction needs its own built-app guest rerun before this task can pass.
