// Sprite placements the tile map painter edits (lib/bw-makecode/tilemap-placements.js):
// ordinary `place Arcade sprite on tile` blocks after a map's `set Arcade tilemap`,
// checked against the running game and the MakeCode export.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    findMapPlacements, placeableSprites, stagePlacement, unstagePlacement, placementsChanged, writePlacements
} from '../overlay/scratch-gui/src/lib/bw-makecode/tilemap-placements.js';
import {findTilemapBlocks} from '../overlay/scratch-gui/src/lib/bw-makecode/tilemap-editor.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames} from './helpers/bw-vm.mjs';

const MAP = tiles => `tiles.setTilemap(tiles.createTilemap(hex\`${tiles}\`, img\`
    . . .
    . . .
\`, [img\`
    . . . .
    . . . .
    . . . .
    . . . .
\`, img\`
    7 7 7 7
    7 7 7 7
    7 7 7 7
    7 7 7 7
\`], TileScale.Four))`;

// Two levels in one script. The first level places the hero on a literal cell
// and the villain on a computed one; the second level's placement is its own.
const SOURCE = `let hero = sprites.create(img\`2\`, SpriteKind.Player)
let villain = sprites.create(img\`3\`, SpriteKind.Enemy)
let hx0 = hero.x
let hy0 = hero.y
${MAP('03000200000001000000')}
tiles.placeOnTile(hero, tiles.getTileLocation(2, 1))
tiles.placeOnTile(villain, tiles.getTileLocation(hero.x - hero.x, 0))
let hx = hero.x
let hy = hero.y
let vx = villain.x
let vy = villain.y
${MAP('03000200010000000000')}
tiles.placeOnTile(villain, tiles.getTileLocation(1, 1))
`;

const vars = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables))
    .map(v => [v.name.replace(/^Game_/, ''), v.value]));

const load = async () => {
    const r = arcadeToPseudocode(SOURCE);
    assert.deepEqual(r.unsupported, []);
    const run = await runProgram(r.code, {frames: 2, uploads: r.costumes, storage: true});
    const [first, second] = findTilemapBlocks(run.vm);
    assert.ok(first?.editable && second?.editable, 'both levels are editable maps');
    return {run, first, second};
};

const rerun = async run => {
    run.vm.greenFlag();
    await stepFrames(run.vm, 3);
    return vars(run);
};

test('a map lists the placements that run after it, up to the next map; computed ones are not editable', async () => {
    const {run, first, second} = await load();
    try {
        const placed = findMapPlacements(run.vm, first);
        assert.deepEqual(placed.map(p => [p.sprite?.name, p.column, p.row, p.editable]),
            [['hero', 2, 1, true], ['villain', null, 0, false]]);
        assert.deepEqual(findMapPlacements(run.vm, second).map(p => [p.sprite?.name, p.column, p.row]), [['villain', 1, 1]],
            'the second level owns the placement after it');
        assert.deepEqual(placeableSprites(run.vm, first).map(s => s.name), ['hero', 'villain']);
        assert.deepEqual(findMapPlacements(run.vm, {...first, kind: 'legacyLayout'}), [], 'legacy layouts have no modern placements');
    } finally {
        run.vm.quit?.();
    }
});

test('staging moves a sprite\'s placement or adds one, and removal drops only the staged entry', () => {
    const hero = {id: 'h', name: 'hero'}, villain = {id: 'v', name: 'villain'};
    const original = [{blockId: 'b1', sprite: hero, column: 2, row: 1, editable: true},
        {blockId: 'b2', sprite: villain, column: null, row: null, editable: false}];
    const moved = stagePlacement(original, hero, 0, 1);
    assert.deepEqual(moved.map(p => [p.blockId, p.column, p.row]), [['b1', 0, 1], ['b2', null, null]]);
    assert.equal(placementsChanged(original, moved), true);
    assert.equal(placementsChanged(original, stagePlacement(moved, hero, 2, 1)), false, 'moving back is no change');
    const added = stagePlacement(moved, villain, 1, 0);
    assert.equal(added.length, 3, 'the villain\'s computed placement stays; a literal one is added');
    assert.deepEqual(added[2], {targetId: null, blockId: null, sprite: villain, column: 1, row: 0, editable: true, added: true});
    assert.equal(stagePlacement(added, villain, 0, 0)[2].column, 0, 'placing the sprite again moves the added placement');
    assert.equal(unstagePlacement(added, 2).length, 2, 'an added placement is simply dropped');
    assert.equal(unstagePlacement(added, 0)[0].removed, true, 'an existing one is marked for removal');
    assert.equal(unstagePlacement(added, 1), added, 'a computed placement cannot be removed from the painter');
    assert.equal(stagePlacement(added, villain, -1, 0), added, 'cells are not negative');
});

test('written placements are what the game runs: a moved hero and an added villain', async () => {
    const {run, first, second} = await load();
    try {
        assert.deepEqual([vars(run).hx, vars(run).hy], [10, 6], 'tile (2, 1) of a 4-pixel map, before editing');
        const original = findMapPlacements(run.vm, first);
        const [hero, villain] = placeableSprites(run.vm, first);
        let staged = stagePlacement(original, hero, 0, 1);
        staged = stagePlacement(staged, villain, 1, 0);
        const written = writePlacements(run.vm, first, original, staged);
        assert.deepEqual(written.map(p => [p.sprite?.name, p.column, p.row, p.editable]),
            [['villain', 1, 0, true], ['hero', 0, 1, true], ['villain', null, 0, false]],
            'the added placement runs right after the map');
        assert.deepEqual(findMapPlacements(run.vm, second).map(p => [p.sprite?.name, p.column, p.row]), [['villain', 1, 1]]);
        const after = await rerun(run);
        assert.deepEqual([after.hx, after.hy], [2, 6], 'the hero stands on tile (0, 1)');
        assert.deepEqual([after.vx, after.vy], [2, 2], 'the computed placement still runs after the added one');
        const ts = projectToArcade(JSON.parse(run.vm.toJSON())).ts;
        assert.match(ts, /tiles\.placeOnTile\(hero, tiles\.getTileLocation\(0, 1\)\)/);
        assert.match(ts, /tiles\.placeOnTile\(villain, tiles\.getTileLocation\(1, 0\)\)/);
    } finally {
        run.vm.quit?.();
    }
});

test('removing a placement keeps the rest of the script; a stale list writes nothing', async () => {
    const {run, first} = await load();
    try {
        const original = findMapPlacements(run.vm, first);
        const stale = original.map(p => p.editable ? {...p, column: 1} : p);
        assert.equal(writePlacements(run.vm, first, stale, stale), null, 'the blocks no longer hold what was staged from');
        assert.deepEqual(findMapPlacements(run.vm, first).map(p => p.column), [2, null], 'nothing changed');
        const written = writePlacements(run.vm, first, original, unstagePlacement(original, 0));
        assert.deepEqual(written.map(p => p.sprite?.name), ['villain']);
        const after = await rerun(run);
        // The first run left hx at 10; only the statements after the removed
        // block, run again, can record the hero where it was created.
        assert.notDeepEqual([after.hx0, after.hy0], [10, 6]);
        assert.deepEqual([after.hx, after.hy], [after.hx0, after.hy0], 'unplaced, the hero stays where it was created');
        assert.deepEqual([after.vx, after.vy], [2, 2]);
        assert.doesNotMatch(projectToArcade(JSON.parse(run.vm.toJSON())).ts, /placeOnTile\(hero/);
    } finally {
        run.vm.quit?.();
    }
});
