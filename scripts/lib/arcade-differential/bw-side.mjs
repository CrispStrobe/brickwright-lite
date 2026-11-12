// Brickwright side: the program as the importer translates it, run in the real
// Scratch VM with the Arcade extension on an injected discrete clock (the same
// "timed" authority the source-timer fixtures use), observed on the same
// sample grid and driven by the same input script as the original.
//
// The 160x120 frame is the Arcade extension's own composed scene frame
// (runtime.bwArcadeDeviceState.sceneFrame.pixels: palette indices, background,
// tilemap, sprites, particles, renderables and HUD), read after each sample.
// Nothing in the extension is modified or called to obtain it.
import {importProjectFiles} from '../../../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {runProgram, stepFrames, quitStrandedVMs, clearStrayTimers} from '../../../test/helpers/bw-vm.mjs';
import {createArcadeDiscreteTimers} from '../../../test/helpers/arcade-discrete-timers.mjs';
import {BW_KEY, sampleTimes} from './script.mjs';
import {PRNG_SOURCE} from './entropy.mjs';
import {packSamples} from './compare.mjs';
import {createRequire} from 'node:module';
import {VM_SRC} from '../../../test/helpers/bw-extensions.mjs';
// A privately issued Arcade exception signal is a program fault (PXT: an uncaught
// exception that ends one fiber). It is data for the comparison, not a harness error.
const exceptions = createRequire(import.meta.url)(VM_SRC + '/util/bw-arcade-exceptions.js');

const hex = n => (n & 0xffffff).toString(16).padStart(6, '0');

export function paletteHex(palette) {
    return Array.from(palette || [], c => typeof c === 'string' ? c.replace('#', '').toLowerCase().padStart(6, '0') : hex(Number(c)));
}

export function imageKey(image) {
    if (!image) return null;
    const w = image.width ?? image._width, h = image.height ?? image._height, px = image.pixels ?? image.data;
    if (!(w >= 0) || !(h >= 0) || !px) return null;
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < w * h; i++) hash = Math.imul(hash ^ (px[i] & 15), 16777619) >>> 0;
    return `${w}x${h}:${hash.toString(16)}`;
}

/** Read-only snapshot of the Arcade extension's scene, in the shape the original side reports. */
export function snapshotBrickwright(vm, globalsOf = []) {
    const state = vm.runtime.bwArcadeDeviceState || {};
    const out = {dead: false, draws: globalThis.__bwDraw ? globalThis.__bwDraw.count : null, sprites: [], globals: {}};
    const frame = state.sceneFrame?.pixels;
    if (frame) {
        let s = ''; for (let i = 0; i < frame.length; i++) s += (frame[i] & 15).toString(16);
        out.pix = s; out.palette = paletteHex(state.palette);
    } else if (state.palette) {
        // Nothing has been composed yet (the first update handler is still running): the display is blank, as the original's is.
        out.pix = '0'.repeat(160 * 120); out.palette = paletteHex(state.palette);
    }
    for (const sprite of Object.values(state.sprites || {})) {
        if (!sprite || sprite._destroyed) continue;
        out.sprites.push({id: sprite.pxtId, kind: sprite.kind, kindName: sprite.kindName, x: sprite.x, y: sprite.y, z: sprite.z,
            image: imageKey(sprite.image), visible: !sprite.invisible, flags: sprite.flags});
    }
    out.sprites.sort((a, b) => a.id - b.id);
    const p1 = state.players?.[0];
    out.score = typeof p1?.score === 'number' ? p1.score : (typeof state.score === 'number' ? state.score : 0);
    // Text entry (askForString/askForNumber) draws the original's prompt screen into the frame; the flag attributes frames shown while it is open.
    out.textPrompt = !!vm.runtime.bwArcadeTextPrompt;
    out.life = typeof p1?.life === 'number' ? p1.life : null;
    if (globalsOf.length) {
        const wanted = new Set(globalsOf);
        for (const target of vm.runtime.targets) for (const variable of Object.values(target.variables || {})) {
            if (!wanted.has(variable.name) || Object.hasOwn(out.globals, variable.name)) continue;
            const v = variable.value;
            if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out.globals[variable.name] = v;
        }
    }
    return out;
}

export function translateForBrickwright(source, name = 'differential') {
    const files = {'main.ts': source, 'pxt.json': JSON.stringify({name, dependencies: {device: '*'}, files: ['main.ts']})};
    const imported = importProjectFiles(files, {name, target: 'arcade'});
    return {code: imported.code, costumes: imported.costumes || [], unsupported: imported.unsupported || [], warnings: imported.warnings || []};
}

/**
 * The seeded stream the program draws from. Scratch's own id generators also call Math.random while
 * a program runs (clones, new blocks); they are served from a separate stream and are not counted.
 */
export function installProgramEntropy(seed, constant) {
    const draw = (0, eval)(PRNG_SOURCE)(seed, constant, 'util/uid\\.js|sb3-creator', 'new FastRandom');
    globalThis.__bwDraw = draw; Math.random = draw;
}

/**
 * Let every cooperative turn the VM owes at the current program time complete: queued continuations and
 * the remaining work of a callback that was spread over turns. The clock does not move meanwhile.
 */
async function settle(vm) {
    const phase = vm.runtime._arcadeFramePhase;
    for (let turn = 0; turn < 4 || (turn < 400 && (phase?.continuation || phase?.request || vm.runtime.threads.some(t => !t.isKilled && t.status === t.constructor.STATUS_RUNNING))); turn++) await new Promise(resolve => setImmediate(resolve));
}

/** Run `source` and return {status, samples, translation}. Guest errors are data. */
export async function recordBrickwright(source, {schedule, seconds, fps = 30, seed = 1, entropy = 'sequence', globalsOf = [], translated = null}) {
    let translation;
    try { translation = translated || translateForBrickwright(source); }
    catch (e) { return {status: 'import-error', error: String(e?.message || e).slice(0, 500), samples: []}; }
    const originalRandom = Math.random;
    let run;
    try {
        run = await runProgram(translation.code, {frames: 0, frameAuthority: 'timed', uploads: translation.costumes, storage: true});
        // Seed only now: loading the project draws Math.random for block, target and asset ids
        // (hundreds of draws the original never makes), which would shift every program draw.
        installProgramEntropy(seed, entropy === 'constant');
        const {vm} = run, clock = createArcadeDiscreteTimers();
        vm.stopAll();
        vm.runtime.bwArcadeProgramClock = clock;
        // The original simulator only posts a restart message on control.reset (nothing here restarts it), so the program stays on the game-over screen.
        vm.runtime.bwArcadeHoldControlReset = true;
        vm.runtime.updateCurrentMSecs = () => { vm.runtime.currentMSecs = clock.now(); };
        vm.greenFlag();
        await stepFrames(vm, 1, 0);
        const samples = [];
        const times = sampleTimes(seconds, fps);
        let error = null;
        for (let k = 0; k < times.length; k++) {
            for (const edge of schedule.edgesAt(k)) vm.postIOData('keyboard', {key: BW_KEY[edge.button], isDown: edge.down});
            // A real press is dispatched at its own program time. Let the edge's continuation turns run
            // before the clock moves, as they would between a keypress and the next timer in a browser.
            // A handler body is spread over one cooperative turn per loop iteration, all at the program time of the
            // press; PXT runs it to its first pause within the press itself, so its pause is armed at that time.
            if (schedule.edgesAt(k).length) await settle(vm);
            await clock.advanceTo(times[k]);
            // Continuations queued by the last frame (a resumed pause) complete before the observation.
            await settle(vm);
            const hard = run.errors.findIndex((_, i) => !exceptions.reported(vm.runtime, run.errorEvents[i]?.message));
            if (hard >= 0) { error = run.errors[hard]; }
            samples.push({k, t: times[k], ...snapshotBrickwright(vm, globalsOf)});
            if (error) break;
        }
        return {status: error ? 'error' : 'ok', error, ...packSamples(samples), unsupported: translation.unsupported, errors: run.errors.slice(0, 5),
            faults: run.errors.filter((_, i) => exceptions.reported(vm.runtime, run.errorEvents[i]?.message)).length};
    } catch (e) {
        return {status: 'error', error: String(e?.message || e).slice(0, 500), samples: [], unsupported: translation.unsupported};
    } finally {
        Math.random = originalRandom; delete globalThis.__bwDraw;
        try { run?.vm?.stopAll(); run?.vm?.quit(); } catch {}
        quitStrandedVMs(); clearStrayTimers();
    }
}
