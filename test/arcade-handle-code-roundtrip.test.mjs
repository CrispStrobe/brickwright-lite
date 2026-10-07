import test from 'node:test';
import assert from 'node:assert/strict';
import {SB3Creator, projectOpcodes, runProgram} from './helpers/bw-vm.mjs';

// Ported from the parked Codex WIP (task F3 of docs/OPEN-TASKS-2026-09-29.md).
// One change: the WIP's program made \`hero\` ghost through sprites BEFORE asking
// whether it overlaps \`foe\`. A ghost overlaps nothing (arcade-sprite-handles
// "GhostThroughSprites blocks reporters…"), so the kind change could never run.
// The ghost line now follows the overlap; every opcode is still covered.

const program = `DEVICE ARCADE
GLOBAL hero
GLOBAL foe
SPRITE Game:
WHEN flag clicked:
  set hero to arcade spawn template "Game" kind "Player" x 80 y 60 width 16 height 16
  set foe to arcade spawn template "Game" kind "Enemy" x 84 y 60 width 16 height 16
  arcade set vx of hero to 30
  arcade set costume of hero to 1
  arcade keep hero in screen 1
  arcade bounce hero on wall 1
  arcade auto destroy foe outside screen 1
  arcade start countdown 3
  arcade stop countdown
  arcade log "sprite ready"
  IF arcade hero overlaps foe THEN:
    arcade set kind of foe to "Friend"
  set count to arcade count kind "Friend"
  arcade destroy foe
  arcade ghost hero through sprites 1
WHEN arcade kind "Enemy" created:
  set lastCreated to arcade event first
WHEN arcade kinds "Player" and "Enemy" overlap:
  set lastOverlap to arcade event second
WHEN arcade countdown ends:
  set countdownEnded to 1
`;

test('Arcade handle syntax survives Code, Blocks, and Code with every opcode', () => {
    const first = new SB3Creator();
    first.parse(program);
    assert.deepEqual(first.warnings, []);
    const code = first.decompile();
    const second = new SB3Creator();
    second.parse(code);
    assert.deepEqual(second.warnings, []);
    assert.deepEqual(projectOpcodes(second.project), projectOpcodes(first.project));
    for (const opcode of ['arcade_spawnSprite', 'arcade_destroySprite', 'arcade_setSpriteProperty',
        'arcade_setSpriteCostume',
        'arcade_setSpriteStayInScreen', 'arcade_setSpriteAutoDestroy', 'arcade_setSpriteBounceOnWall',
        'arcade_setSpriteGhostThroughSprites',
        'arcade_startCountdown', 'arcade_stopCountdown', 'arcade_log',
        'arcade_setSpriteKind', 'arcade_spriteOverlaps', 'arcade_spriteCount',
        'arcade_eventSprite', 'arcade_whenSpriteCreated', 'arcade_whenSpritesOverlap',
        'arcade_whenCountdownEnds']) {
        assert.ok(projectOpcodes(second.project).has(opcode), opcode);
    }
});

test('Arcade handle Code reaches its sprite blocks in the real VM', async () => {
    const result = await runProgram(program, {frames: 4});
    assert.equal(result.errors.length, 0);
    assert.ok(result.calls.get('arcade_spawnSprite') >= 2);
    assert.ok(result.calls.get('arcade_spriteOverlaps') >= 1);
    assert.ok(result.calls.get('arcade_setSpriteKind') >= 1);
    assert.ok(result.calls.get('arcade_destroySprite') >= 1);
});

test('Arcade creation and overlap event handles are usable by scripts', async () => {
    const code = `DEVICE ARCADE
GLOBAL hero
GLOBAL foe
GLOBAL created
GLOBAL hit
SPRITE Game:
WHEN flag clicked:
  set hero to arcade spawn template "Game" kind "Player" x 80 y 60 width 16 height 16
  set foe to arcade spawn template "Game" kind "Enemy" x 82 y 60 width 16 height 16
WHEN arcade kind "Enemy" created:
  set created to arcade event first
WHEN arcade kinds "Player" and "Enemy" overlap:
  set hit to arcade event second
`;
    const result = await runProgram(code, {frames: 8});
    assert.deepEqual(result.errors, []);
    const values = new Map(result.vm.runtime.targets.flatMap(t =>
        Object.values(t.variables || {}).map(v => [v.name, v.value])));
    assert.match(String(values.get('foe')), /^arcade:/);
    assert.equal(values.get('created'), values.get('foe'));
    assert.equal(values.get('hit'), values.get('foe'));
});
