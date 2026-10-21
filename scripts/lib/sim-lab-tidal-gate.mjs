// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mechanicsInteractions, manualMechanicsInteractions} from './sim-lab-mechanics-gate.mjs';
import {TIDAL_PRESETS, judgeTidalRun} from './sim-lab-tidal-judge.mjs';
export const tidalInteractions = async (page, opts) => {
    const presets=opts.presets||TIDAL_PRESETS;
    const results = await mechanicsInteractions(page, {...opts,
        models: presets.map(p => p.id), fileFor: () => 'tidal-trio.ldr',
        keyFor: id => TIDAL_PRESETS.find(p => p.id === id).key,
        programMarker: id => `# Example: ${id}`, judge: judgeTidalRun, simulatedMs: 36000});
    await manualMechanicsInteractions(page, {...opts, models: ['tidal-trio']});
    if(opts.instructions!==false)await tidalInstructionsInteractions(page, opts);
    return results;
};

export const tidalInstructionsInteractions = async (page, opts) => {
    const piecesExpected = opts.pieces || 226;
    const prefix = opts.prefix || 'tidal';
    await page.getByTestId('bw-sim-lab-instructions').click();
    const dialog = page.getByTestId('bw-sim-instructions');
    await dialog.waitFor();
    await page.waitForFunction(() => window.__bwSimLabInstructions?.status === 'ready' &&
        window.__bwSimLabInstructions.stats?.step === 0, null, {timeout: 30000}).catch(async error => {
        console.error('Instruction readiness failure', await page.evaluate(() => {
            const i=window.__bwSimLabInstructions, p=window.__bwSimLab?._pane;
            return {instructions:i&&{status:i.status,page:i.page,steps:i.steps,stats:i.stats,error:i.error},
                model:p?.state.modelFile,status:p?.state.status,programLoading:p?.state.programLoading,
                alerts:[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent)};
        }));
        throw error;
    });
    const steps = await page.evaluate(() => window.__bwSimLabInstructions.steps);
    assert.ok(steps > (opts.minSteps ?? 30) && steps < piecesExpected);
    await dialog.screenshot({path: resolve(opts.shotsDir, `${prefix}-instructions-first.png`)});
    for(let n=1;n<=steps;n++){
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(want => {
            const i=window.__bwSimLabInstructions;
            return i.page===want && (want>=i.steps || i.stats?.step===want);
        },n,{timeout:15000});
    }
    const bom=page.getByTestId('bw-sim-instructions-bom');await bom.waitFor();
    const pieces=await bom.getByTestId('bw-sim-instructions-part').evaluateAll(es=>es.reduce((n,e)=>n+Number(e.dataset.count),0));
    assert.equal(pieces,piecesExpected);
    await dialog.screenshot({path:resolve(opts.shotsDir,`${prefix}-instructions-bom.png`)});
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
    console.log(`PASS ${prefix} instructions: ${steps} connected pages and ${pieces}-piece bill of materials`);
};
