// pxtsim's cooperative yield, measured against the original simulator with the
// behavioural-differential harness (children run each side; no GUI-scope import).
// A fiber that is started after a quiet 20 ms and runs past its first compiled steps sleeps 5 ms
// before it continues (Runtime.maybeYield). A wake that waited over 3 ms stamps the same clock, so
// a running frame loop keeps every fiber from yielding. Two observable effects:
//  - a button handler's pause(500) ends 5 ms later, one sample later when the deadline straddles a sample;
//  - game.ask pops its event context, and the scene's frame loop restarts only on the next poll tick.
// Each scenario also runs the original against a twin that lacks the effect and expects a divergence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {analyzeProgram} from '../scripts/lib/arcade-differential/analyze.mjs';

const OPTIONS = {seconds: 8, fps: 30, seed: 3, entropy: 'sequence', scripts: ['ab'], timeoutMs: {original: 120000, brickwright: 60000}, entropyProbe: false};
const BLOCK = 'img`\n    2 2 2 2\n    2 . . 2\n    2 . . 2\n    2 2 2 2\n`';

async function compare(program, twin) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-yield-timing-'));
    try {
        const same = await analyzeProgram(program, {...OPTIONS, workDir: dir});
        const other = await analyzeProgram(program, {...OPTIONS, workDir: dir, brickwrightSource: twin});
        return {same: same.class, scripts: same.scripts, twin: other.class};
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
function scenario(name, program, twin) {
    test(name, {timeout: 600000}, async () => {
        const result = await compare(program, twin);
        assert.equal(result.same, 'identical', JSON.stringify(result.scripts));
        assert.equal(result.twin, 'diverges', 'the original must differ from a twin without the effect');
    });
}

const HANDLER = body => `let ticks = 0
let total = 0
let nul: Image = null
let mover = sprites.create(${BLOCK}, SpriteKind.Player)
mover.setPosition(20, 60)
game.onUpdate(function () {
    ticks += 1
    if (ticks >= 8) {
        nul.fillRect(0, 0, 2, 2, 2)
    }
})
controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
${body}
    pause(500)
    mover.x += 10
})
`;
scenario('a long handler started after the frame loop died yields 5 ms before its pause', HANDLER(`    for (let i = 0; i < 400; i++) {
        total += i
    }`), HANDLER(`    total += 1`));

const ASK = confirm => `info.setLife(2)
controller.A.onEvent(ControllerButtonEvent.Pressed, function () { info.changeScoreBy(1) })
controller.B.onEvent(ControllerButtonEvent.Pressed, function () { info.changeLifeBy(-1) })
info.onLifeZero(function () {
    if (${confirm}) {
        info.setLife(2)
    } else {
        game.gameOver(false)
    }
})
`;
scenario('game.ask restores the frame loop on the next condition-poll tick', ASK('game.ask("Again?")'), ASK('true'));
