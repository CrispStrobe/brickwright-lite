import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));

test('Circuit tab hard-coded index matches gui.jsx tab order', () => {
    const gui = readFileSync(resolve(here, '../overlay/scratch-gui/src/components/gui/gui.jsx'), 'utf8');
    const tlStart = gui.indexOf('<TabList');
    const tlEnd = gui.indexOf('</TabList>');
    const tabList = gui.slice(tlStart, tlEnd);
    const circuitPos = tabList.indexOf('gui.gui.circuitTab');
    assert.ok(circuitPos > 0, 'gui.gui.circuitTab not found in TabList');
    // Count <Tab (not <TabList/<TabPanel) up to AND including the circuit entry,
    // then subtract 1 for the circuit tab itself to get its 0-based index.
    const upTo = tabList.slice(0, circuitPos);
    const count = (upTo.match(/<Tab\b(?!List|Panel)/g) || []).length;
    // The <Tab containing circuitTab opens BEFORE the id string, so count
    // includes it. The 0-based index is count - 1.
    const circuitIndex = count - 1;

    const ct = readFileSync(resolve(here, '../overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx'), 'utf8');
    const m = ct.match(/activeTabIndex\s*===\s*(\d+)/);
    assert.ok(m, 'activeTabIndex not found');
    assert.strictEqual(parseInt(m[1], 10), circuitIndex,
        `circuit-tab.jsx expects ${m[1]} but Circuit is Tab #${circuitIndex} in gui.jsx`);
});
