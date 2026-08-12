import {test} from 'node:test';
import assert from 'node:assert/strict';

import SB3Creator from '../packages/scratch-gui/src/lib/sb3-creator.js';

test('stage-only pseudocode import creates and selects a sprite for Motion blocks', () => {
    const creator = new SB3Creator();
    creator.parse(`DEVICE STC12C5A60S2\nPIN led1 = P1.0 OUTPUT ACTIVE LOW\nWHEN flag clicked:\n  FOREVER:\n    turn on led1\n    wait 0.5 seconds`);
    const sprites = creator.project.targets.filter(target => !target.isStage);
    assert.equal(sprites.length, 1);
    assert.equal(sprites[0].name, 'Sprite1');
    assert.ok(Object.values(sprites[0].blocks).length > 0);
});
