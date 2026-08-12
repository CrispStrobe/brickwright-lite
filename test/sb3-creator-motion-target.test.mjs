import {test} from 'node:test';
import assert from 'node:assert/strict';

import SB3Creator from '../packages/scratch-gui/src/lib/sb3-creator.js';

test('device pseudocode import produces blocks on a target', () => {
    const creator = new SB3Creator();
    creator.parse(`DEVICE STC12C5A60S2\nPIN led1 = P1.0 OUTPUT ACTIVE LOW\nWHEN flag clicked:\n  FOREVER:\n    turn on led1\n    wait 0.5 seconds`);
    // Blocks land on whichever target sb3-creator chooses (Stage or Sprite1);
    // the important thing is that they exist somewhere.
    const allBlocks = creator.project.targets.flatMap(
        t => Object.values(t.blocks));
    assert.ok(allBlocks.length > 0, 'parsed pseudocode should produce blocks');
});
