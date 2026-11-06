// PXT TileMap.getImageType reads the scene's tilemap data. After
// tiles.setTilemap(null) the scene has a TileMap whose data is cleared, so an
// image lookup (getTilesByType, getRandomTileByType, placeOnRandomTile) faults
// the calling fiber: main stops there, while frames and other fibers go on.
// Measured with the behavioural-differential harness against the original
// simulator; each scenario also runs a twin that never clears the map, so a
// pass cannot come from a program where neither side faulted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {analyzeProgram} from '../scripts/lib/arcade-differential/analyze.mjs';

const OPTIONS = {seconds: 3, fps: 30, seed: 3, entropy: 'sequence', scripts: ['arrows'], timeoutMs: {original: 120000, brickwright: 60000}, entropyProbe: false};
const HEAD = `let ticks = 0
let after = 0
let mover = sprites.create(img\`
    2 2 2 2
    2 . . 2
    2 2 2 2
\`, SpriteKind.Player)
controller.moveSprite(mover, 80, 80)
game.onUpdate(function () { ticks += 1 })
`;
const TILE = 'img`\n    1 1\n    1 1\n`';

async function compare(program, twin) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-cleared-tilemap-'));
    try {
        const same = await analyzeProgram(program, {...OPTIONS, workDir: dir});
        const other = await analyzeProgram(program, {...OPTIONS, workDir: dir, brickwrightSource: twin});
        return {same: same.class, scripts: same.scripts, twin: other.class};
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

for (const [name, lookup] of [
    ['tiles.placeOnRandomTile', `tiles.placeOnRandomTile(mover, ${TILE})`],
    ['tiles.getRandomTileByType', `let found = tiles.getRandomTileByType(${TILE})`],
    ['tiles.getTilesByType', `let count = tiles.getTilesByType(${TILE}).length`]
]) {
    test(`${name} on a cleared tilemap ends main as in PXT; frames and input live on`, {timeout: 400000}, async () => {
        const tail = `\n${lookup}\nafter = 1\ninfo.startCountdown(10)\n`;
        const result = await compare(`${HEAD}tiles.setTilemap(null)${tail}`, `${HEAD}${tail}`);
        assert.equal(result.same, 'identical', JSON.stringify(result.scripts));
        assert.equal(result.twin, 'diverges', 'the original must differ from a twin whose lookup never faults');
    });
}
