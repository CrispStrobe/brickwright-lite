// SPDX-License-Identifier: BSD-3-Clause
// Explicit diagnostic contracts for held models; membership here is not promotion.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync, lstatSync, realpathSync, statSync} from 'node:fs';
import {resolve, relative, isAbsolute, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const Q5_HELD = Object.freeze({
    'solstice-pumpjack': Object.freeze({
        id: 'solstice-pumpjack', judge: 'walking-beam-v1', parts: 93,
        ports: Object.freeze(['A']), coldMs: 500, timeLimitMs: 90000, afterMs: 500,
        frameMs: 25, frozenOutput: 'walking_beam', disconnect: Object.freeze(['pin_P']),
        disconnectInputDeg: 350, disconnectLoss: 'r4'
    })
});

/** Held cases run only when explicitly requested; they never join the promoted list. */
export const selectedHeldQ5Models = requested => Object.keys(Q5_HELD).filter(id => requested.includes(id));
export const heldUsesR4Control = id => Object.hasOwn(Q5_HELD, id) && Q5_HELD[id].disconnectLoss === 'r4';
export const heldBrowserOptions = id => Object.hasOwn(Q5_HELD, id) ? {includeExperimental: true} : {};
export const heldQ5Contract = id => {
    assert.ok(Object.hasOwn(Q5_HELD, id), `No reviewed held Q5 contract: ${id}`);
    return Q5_HELD[id];
};

/** A held manual run must actually exercise exactly the contract's ports. */
export function assertHeldManualCoverage(id, manual, contract) {
    const ports = manual?.[id];
    assert.ok(ports && typeof ports === 'object', 'held manual result is present');
    assert.deepEqual(Object.keys(ports).sort(), [...contract.ports].sort(), 'held manual run exercises the contract ports');
    for (const value of Object.values(ports)) assert.ok(Number.isFinite(value) && value !== 0, 'held manual motion is observed');
}

/** Private evidence only: preserve nested original action and cleanup errors without changing them. */
export function heldErrorDetails(error) {
    return {
        name: error?.name || 'Error', message: error?.message || String(error), stack: error?.stack,
        ...(Array.isArray(error?.errors) ? {errors: error.errors.map(heldErrorDetails)} : {})
    };
}

/** Run every cleanup and preserve the action failure before any cleanup failures. */
export async function finishHeldCleanup(primary, actions, hasPrimary = primary !== undefined) {
    const failures = [];
    for (const action of actions) {
        try { await action(); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(hasPrimary ? [primary, ...failures] : failures, 'Held Q5 cleanup failed');
}

/** Persist held-page errors even if the action throws, without hiding its failure. */
export async function withHeldPageErrors(page, persist, run) {
    const errors = [];
    const record = error => errors.push(error.stack || error.message);
    page.on('pageerror', record);
    let primary, hasPrimary = false;
    try {
        const result = await run();
        assert.deepEqual(errors, [], 'held page errors');
        return result;
    } catch (error) {
        primary = error;
        hasPrimary = true;
        throw error;
    } finally {
        await finishHeldCleanup(primary, [() => persist(errors), () => page.off('pageerror', record)], hasPrimary);
    }
}

/** Record both actual held observations even when the ordinary law fails. */
export async function runHeldQ5Checks(mainCheck, controlCheck, contract) {
    let main, control;
    const failures = [];
    try {
        main = await mainCheck();
        assert.ok(main && Number.isFinite(main.beamErrorDeg) && Number.isFinite(main.pistonErrorMm) &&
            Number.isInteger(main.frames) && main.frames > 0, 'held base case must return measured frames');
    } catch (error) { failures.push(error); }
    try {
        control = await controlCheck();
        assert.ok(control && Number.isFinite(control.inputTravelDeg) && control.inputTravelDeg > contract.disconnectInputDeg &&
            control.loss?.lost === true, 'held causal control must report actual input and law loss');
    } catch (error) { failures.push(error); }
    if (failures.length) {
        const failure = new AggregateError(failures, 'Held Q5 base or causal control failed');
        failure.observations = {main, control};
        throw failure;
    }
    return {main, control};
}

/** Dedicated diagnostic requests fail before browser launch; ordinary filters keep their semantics. */
export function requestedHeldQ5Models(examples, diagnostics = []) {
    for (const id of diagnostics) assert.ok(Object.hasOwn(Q5_HELD, id), `No reviewed held Q5 diagnostic: ${id}`);
    return [...new Set([...selectedHeldQ5Models(examples), ...diagnostics])];
}

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const heldSourceFiles = [
    'scripts/verify-sim-lab-browser.mjs', 'scripts/lib/sim-lab-q5-held.mjs',
    'scripts/lib/sim-lab-q5-browser-gate.mjs', 'scripts/lib/sim-lab-intake-roundtrip.mjs',
    'scripts/lib/sim-lab-mechanics-gate.mjs', 'scripts/lib/sim-lab-browser-recorder.mjs',
    'scripts/lib/sim-lab-r4-judges.mjs',
    'overlay/scratch-gui/static/sim-lab/models/solstice-pumpjack.ldr',
    'overlay/scratch-gui/static/sim-lab/programs/solstice-pumpjack.bw'
];

/** Observation only: a matching self-reported stamp cannot prove who produced these bytes. */
export function heldBuildInventory(buildDir, commit) {
    assert.match(commit, /^[0-9a-f]{40}$/);
    const stamp = JSON.parse(readFileSync(resolve(buildDir, 'brickwright-build.json')));
    assert.equal(stamp.schema, 2, 'held frontend receipt schema');
    assert.equal(stamp.product, 'Brickwright', 'held frontend receipt product');
    assert.equal(stamp.commit, commit.slice(0, 7), 'held frontend was built from this source');
    const files = {};
    function visit(dir) {
        for (const entry of readdirSync(dir).sort()) {
            const path = resolve(dir, entry), stat = lstatSync(path);
            assert.ok(!stat.isSymbolicLink(), 'held build inventory refuses symlinks');
            if (stat.isDirectory()) visit(path);
            else { assert.ok(stat.isFile(), 'held build inventory accepts regular files'); files[relative(buildDir, path)] = hash(readFileSync(path)); }
        }
    }
    visit(resolve(buildDir));
    assert.ok(Object.keys(files).some(p => /\.js$/.test(p)), 'held frontend has built executable JavaScript');
    return {qualification: 'not-admitted-observation-only', producerSourceBinding: false, stamp: {schema: stamp.schema, product: stamp.product, commit: stamp.commit}, files};
}

/** Record a clean local source observation. No producer receipt is admitted here; no qualification follows. */
export function heldDiagnosticIdentity(buildDir) {
    const git = args => execFileSync('git', args, {cwd: sourceRoot, encoding: 'utf8'}).trim();
    const commit = git(['rev-parse', 'HEAD']);
    assert.equal(git(['status', '--porcelain', '--untracked-files=normal']), '', 'held diagnostic requires clean committed source');
    const source = Object.fromEntries(heldSourceFiles.map(p => {
        const bytes = readFileSync(resolve(sourceRoot, p));
        assertHeldSourceBytes(bytes, execFileSync('git', ['show', `HEAD:${p}`], {cwd: sourceRoot}));
        return [p, hash(bytes)];
    }));
    assert.equal(source[heldSourceFiles.at(-2)], '096fee118bbbb3cd89030fa1f6f58330cba3be8b6ad8fb4f992d9abf9b360a71', 'reviewed held model bytes');
    assert.equal(source[heldSourceFiles.at(-1)], '77ebf25fd16693953e719959294c28d9bfe23690a06f3d31f2c4e0686c513a41', 'reviewed held program bytes');
    return {schema: 1, qualification: 'not-admitted-observation-only', producerSourceBinding: false, commit, tree: git(['rev-parse', 'HEAD^{tree}']), source, build: heldBuildInventory(buildDir, commit)};
}

/** Read only: retain incomplete startup observations too, before any cleanup or failing assertion. */
export function heldRuntimeSnapshot() {
    const pane = window.__bwSimLab?._pane;
    const targets = pane?.props.vm.runtime.targets ?? [];
    const track = window.__bwMechanics ?? window.__bwQ5;
    const allowedStatus = ['ready', 'running', 'paused', 'failed', 'loading'];
    const resources = {script: 0, fetch: 0, xmlhttprequest: 0, other: 0};
    for (const r of performance.getEntriesByType('resource')) resources[Object.hasOwn(resources, r.initiatorType) ? r.initiatorType : 'other']++;
    return {
        status: allowedStatus.includes(window.__bwSimLab?.status) ? window.__bwSimLab.status : 'other',
        selectedHeldModel: pane?.state.modelFile === 'solstice-pumpjack.ldr',
        shippedHeldModel: pane?.state.shipped === 'solstice-pumpjack.ldr',
        workerPresent: Boolean(pane?.session?.worker),
        program: {targets: targets.length, blocks: targets.reduce((n, t) => n + Object.keys(t.blocks?._blocks ?? {}).length, 0)},
        observations: {frames: Array.isArray(track?.track) ? track.track.length : 0}, resources
    };
}

/** Explicit private evidence boundary: outside checkout, no symlink routing, owned and mode 0700. */
export function assertHeldPrivateDirectory(directory) {
    assert.ok(typeof directory === 'string' && isAbsolute(directory), 'held diagnostic requires an absolute private output directory');
    const path = resolve(directory), rel = relative(sourceRoot, path);
    assert.ok(rel === '..' || rel.startsWith('..' + sep), 'held evidence must be outside the source checkout');
    assert.equal(realpathSync(path), path, 'held private output refuses symlink routing');
    const stat = statSync(path);
    assert.ok(stat.isDirectory() && (stat.mode & 0o777) === 0o700, 'held output must be a private mode 0700 directory');
    if (process.getuid) assert.equal(stat.uid, process.getuid(), 'held output must be owned by the runner');
    return path;
}

export function assertHeldSourceBytes(actual, committed) {
    assert.equal(hash(actual), hash(committed), 'consumed held source bytes must equal the exact git blob');
}

/** Held input is module-root owned, independently of the launcher working directory. */
export function heldModelSource(id) {
    heldQ5Contract(id);
    const path = `overlay/scratch-gui/static/sim-lab/models/${id}.ldr`;
    const bytes = readFileSync(resolve(sourceRoot, path));
    assertHeldSourceBytes(bytes, execFileSync('git', ['show', `HEAD:${path}`], {cwd: sourceRoot}));
    assert.equal(hash(bytes), '096fee118bbbb3cd89030fa1f6f58330cba3be8b6ad8fb4f992d9abf9b360a71', 'reviewed held model bytes');
    return bytes.toString('utf8');
}

/** This exact preflight is invoked by the real CLI before opening its server or browser. */
export function heldCLIRequest(argv) {
    const value = flag => (argv.find(a => a.startsWith(flag + '=')) || '').slice(flag.length + 1);
    const examples = value('--examples').split(',').filter(Boolean);
    const diagnostics = value('--held-examples').split(',').filter(Boolean);
    const models = requestedHeldQ5Models(examples, diagnostics);
    assert.ok(!models.length || !process.env.GITHUB_ACTIONS, 'held raw diagnostics cannot use public Actions logs or artifacts');
    assert.ok(!models.length || value('--part') === 'examples', 'held diagnostics require explicit --part=examples');
    return {examples, diagnostics, models, requested: [...examples, ...diagnostics], privateOutput: value('--held-private-output')};
}

/** A closing browser cannot hide the original failure or prevent server cleanup. */
export function finishHeldDriver(primary, hasPrimary, browser, server) {
    return finishHeldCleanup(primary, [() => browser?.close(), () => new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    })], hasPrimary);
}
