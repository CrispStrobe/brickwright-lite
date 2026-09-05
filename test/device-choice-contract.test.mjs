/**
 * Choosing hardware in the GUI: one list, one button, one pane.
 *
 * The path from "I have a Calliope" to seeing it work runs through three
 * files that know nothing about each other, and every one of them has to
 * agree or the device is listed and unreachable:
 *
 *   DEVICE_GROUPS      pseudocode-importer.jsx — the dropdown, and the
 *                      `DEVICE <id>` line it writes into the program
 *   the stage header   stage-header.jsx — which console button appears
 *                      for the selected device
 *   dockMode           gui.jsx — which pane that button opens
 *
 * A device added to the list and nowhere else is the failure this file
 * exists for: it shows up, you select it, and nothing happens — which
 * reads as a broken simulator rather than a missing three-line wiring.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

import {REPO} from './helpers/bw-integrated.mjs';

const read = rel => readFileSync(join(REPO, 'overlay/scratch-gui/src', rel), 'utf8');
const importer = read('components/tw-pseudocode/pseudocode-importer.jsx');
const header = read('components/stage-header/stage-header.jsx');
const gui = read('components/gui/gui.jsx');
// The dropdown is DERIVED from this table (T7); it no longer carries a device
// list of its own, so these read the table rather than regex-parsing the JSX.
const {DEVICES} = await import('../overlay/scratch-gui/src/lib/bw-matrix/capabilities.js');

test('every device the dropdown offers has an id the program can carry', () => {
    // The dropdown writes `DEVICE <ID>` into the pseudocode, so an id with
    // a space or punctuation would produce a line the parser cannot read.
    const ids = DEVICES.map(d => d.id);
    assert.ok(ids.length > 15, `only ${ids.length} devices in the matrix — the table moved`);
    for (const id of ids) {
        assert.match(id, /^[a-z0-9-]+$/, `${id} is not a usable DEVICE id`);
    }
    assert.ok(ids.includes('microbit'));
    assert.ok(ids.includes('calliopemini'), 'the Calliope is not offered');
    assert.ok(ids.includes('arduboy'), 'the Arduboy is not offered');
});

test('the Calliope reaches the micro:bit simulator, not a pane of its own', () => {
    // It runs the same MicroPython on the same simulator. A second button
    // would be two controls for one pane.
    assert.match(header, /MICROPYTHON_DEVICES\s*=\s*\['microbit',\s*'calliopemini'\]/,
        'the header does not treat the Calliope as a MicroPython device');
    assert.match(gui, /\['microbit', 'calliopemini'\]\.includes/,
        'gui.jsx will not restore the sim pane for a Calliope project');
});

test('the Arduboy has a button, a dock mode and a pane', () => {
    assert.match(header, /deviceIsArduboy/, 'no Arduboy state in the header');
    assert.match(header, /dock: 'arduboy'/, 'the button opens no dock');
    assert.match(header, /if \(dock === 'arduboy'\) return 'arduboy';/,
        'viewForDock does not know the arduboy dock, so the button never looks selected');
    assert.match(gui, /dockMode === 'arduboy'/, 'gui.jsx renders no pane for it');
    assert.match(gui, /ArduboyPane/, 'the pane is not imported');
});

test('the Arduboy is not offered as a compile target', () => {
    // There is no path from blocks to an Arduboy binary: that needs
    // avr-gcc, which is GPL and cannot ship in this repo. Listing it as
    // compilable would promise something the licence forbids, and the
    // failure would surface as a build button that never works.
    const entry = DEVICES.find(d => d.id === 'arduboy');
    assert.ok(entry, 'no arduboy row in the matrix');
    assert.equal(Boolean(entry.pickerCompile), false, 'arduboy must not claim to compile');
    assert.equal(entry.pickerEmulator, 'arduboy');
});

test('a restored dock cannot strand the user on an empty console', () => {
    // localStorage remembers the dock across sessions. Restoring 'arduboy'
    // with no program gives a blank screen someone then has to work out how
    // to leave, so the restore is gated on the device or a pending program.
    assert.match(gui, /dock === 'arduboy' && props\.vm\?\.runtime\?\.bwDeviceId !== 'arduboy'/,
        'the arduboy dock restores unconditionally');
});
