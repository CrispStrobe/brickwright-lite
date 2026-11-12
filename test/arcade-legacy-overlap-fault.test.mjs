// A hat-based (legacy) overlap handler is a fiber like any other: an uncaught PXT exception ends it and
// the pair stays marked overlapping, so the handler never runs for that pair again. The healthy twin
// runs on every frame the pair overlaps. (The fault itself is measured against the original in
// arcade-fatal-faults.test.mjs; hat-based handlers have no TypeScript spelling to compare against.)
import test from 'node:test';
import assert from 'node:assert/strict';
import {runProgram, quitStrandedVMs} from './helpers/bw-vm.mjs';

const program = body => `DEVICE ARCADE
SPRITE Game:
WHEN flag clicked:
  hide
  set hits to 0
  set missing to (null value)
  set hero to arcade spawn template "Game" kind "Player" x 80 y 60 width 16 height 16
  set foe to arcade spawn template "Game" kind "Enemy" x 84 y 60 width 16 height 16
WHEN arcade kinds "Player" and "Enemy" overlap:
  change hits by 1
${body}
`;
async function hitsOf(body) {
    const run = await runProgram(program(body), {frames: 40});
    try {
        for (const target of run.vm.runtime.targets) for (const variable of Object.values(target.variables)) if (variable.name === 'hits') return Number(variable.value);
        throw new Error('hits variable missing');
    } finally { run.vm.quit(); quitStrandedVMs(); }
}

test('a legacy overlap handler that dies keeps its pair locked; a healthy one fires every frame', async () => {
    const dead = await hitsOf('  arcade set x of missing to 5');
    const alive = await hitsOf('  arcade set x of hero to 80');
    assert.equal(dead, 1);
    assert.ok(alive > 1, 'healthy twin fired ' + alive);
});
