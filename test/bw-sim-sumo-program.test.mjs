// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Robot Lab's sumo example program, run for real: the DEVICE SPIKE text
 * shipped at static/sim-lab/programs/sumo.bw drives through the real Scratch
 * VM, the spikeprime extension and the virtual hub (test/helpers/sim-lab-vm.mjs)
 * on the shipped Colour explorer model, placed on the Sumo ring mat as the pane
 * would place it (the mat's start pose is the ring centre, heading +x). Nothing
 * here commands a motor: the program's FOREVER loop drives forward until the
 * colour sensor's ray sees the ring's black band, backs up a little and turns
 * a quarter turn away, then drives again — for the whole run.
 *
 * The judge works on the same carried points the other program tests use: after
 * every frame the helper carries the drive-axle midpoint and the colour
 * sensor's ray origin by the hub body's pose (runOnSimLab's `track`), and this
 * test samples every one of those frames.
 *
 * Thresholds, derived from the Sumo ring mat's published dimensions (mats.js
 * `sumo`, hand-derived in test/bw-sim-mats-b.test.mjs — Outer diameter 0.77 m,
 * band 0.05 m wide):
 *   - The ring's edge is at r = 0.77/2 = 0.385 m. The robot "stays inside" as
 *     long as its drive-axle midpoint never reaches that radius.
 *   - The band spans 0.77/2 - 0.05 = 0.335 m to 0.385 m. The colour sensor sits
 *     centred 32 mm ahead of the drive axle (docs/SIM-LAB.md), so when its spot
 *     first reaches the band's inner edge the axle is at least
 *     0.335 - 0.032 = 0.303 m from the centre: a band touch means the axle
 *     has crossed r = 0.30 m. Counting entries into r >= 0.30 m counts band
 *     touches the robot really drove to (not sensor noise near the centre).
 *   - 1.5 m of travel: each band approach crosses most of the 0.67 m inner
 *     disc, so three grounded approaches are ~1 m; 1.5 m asks for more than
 *     that — the program habitually makes over 6 m in 40 s (measured, see
 *     diagnostics), well clear.
 *
 * The judge is shown able to fail: the same program waiting for a colour the
 * mat does not have (blue — the Sumo ring has white and black only) just
 * drives forward and leaves the ring within seconds.
 *
 * Why there is no MODELS entry checked here: MODELS (sim-session.js) cannot
 * list the same model file twice with a different example — the pane keys the
 * Model list by the file name (sim-lab-pane.jsx `key={m.file}` /
 * `shippedModel()` / `openShipped` all look an entry up by its file), and
 * test/bw-sim-models.test.mjs pins the exact list of shipped files. The Colour
 * explorer's own entry therefore stays the one for colour-zones, and this test
 * reads the sumo program straight from PROGRAMS_BASE and the model from the
 * shipped Colour explorer entry's file.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const SIM = path.join(GUI, 'src/lib/bw-sim');
const {MODELS, MODELS_BASE, PROGRAMS_BASE, prepareModel, catalogFrom} = await import(path.join(SIM, 'sim-session.js'));

const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));
const ENTRY = MODELS.find(m => m.file === 'colour-explorer.ldr');
const MODEL_TEXT = readFileSync(path.join(GUI, MODELS_BASE, ENTRY.file), 'utf8');
const PROGRAM = readFileSync(path.join(GUI, PROGRAMS_BASE, 'sumo.bw'), 'utf8');
const BUDGET_MS = 40000;

/** mats.js sumo: outer diameter 0.77 m / 2 — the ring's edge, never reached. */
const RING_EDGE_M = 0.385;
/** Band entry marker: inner band radius 0.335 m (= 0.77/2 - 0.05) minus the sensor's 32 mm lead. */
const BAND_ENTRY_M = 0.3;
const NEED_ENTRIES = 3;
const NEED_TRAVEL_M = 1.5;

const radiusOf = p => Math.hypot(...[p[0], p[2]]);
const where = p => `(${p[0].toFixed(3)}, ${p[2].toFixed(3)})`;

/**
 * The judge over the helper's per-frame track: the axle's largest radius (it
 * must stay inside the ring), the number of entries into the band-approach
 * radius (it must really drive to the band), and the total path length of the
 * axle midpoint (it must travel). Each entry counts a frame-to-frame crossing
 * from below the threshold to at or above it.
 */
const judge = track => {
    let maxR = 0;
    let entries = 0;
    let travel = 0;
    let prev = null;
    for (const p of track) {
        const r = radiusOf(p.axle);
        if (r > maxR) maxR = r;
        if (prev) {
            travel += Math.hypot(p.axle[0] - prev[0], p.axle[2] - prev[2]);
            if (radiusOf(prev) < BAND_ENTRY_M && r >= BAND_ENTRY_M) entries++;
        }
        prev = p.axle;
    }
    return {maxR, entries, travel, sawBlack: track.some(p => p.color === 0),
        startWhite: track[0].color === 10, startR: radiusOf(track[0].axle)};
};

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    // A missing tree FAILS rather than skips (docs/GATES-THAT-CANNOT-FAIL.md).
    test('the Robot Lab program run: its inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOnSimLab} = await import('./helpers/sim-lab-vm.mjs');
    const run = source => runOnSimLab(source, {modelText: MODEL_TEXT, mat: 'sumo', timeLimitMs: BUDGET_MS});

    test('sumo.bw ships a DEVICE SPIKE example for the Colour explorer on the Sumo ring, and the robot compiles on that mat', () => {
        assert.match(PROGRAM, /^DEVICE SPIKE\s*$/m);
        assert.match(PROGRAM, /^  FOREVER:\s*$/m, 'the drive-and-turn loop runs FOREVER');
        assert.match(PROGRAM, /wait until spike color C is black/, 'it drives until it sees the ring band');
        assert.match(PROGRAM, /move backward \d+ cm/, 'a band touch backs the robot up a little');
        assert.match(PROGRAM, /start tank \S+ \S+/, 'and turns away with the tank drive');
        // The program is written for the Colour explorer (wheels on A and B,
        // colour sensor on C); the shipped model file still compiles cleanly
        // standing on the sumo mat's start pose.
        assert.ok(ENTRY, 'the Colour explorer entry ships');
        assert.equal(ENTRY.example, 'colour-explorer.bw', 'the Model list still offers the Colour Zones example (see header)');
        const {issues} = prepareModel(MODEL_TEXT, CATALOG, {mat: 'sumo'});
        assert.deepEqual(issues, [], 'the model compiles with no notes on the sumo mat');
    });

    test('the sumo program keeps the Colour explorer inside the ring, driving to the band, for the whole 40 s', async t => {
        const result = await run(PROGRAM);
        assert.deepEqual(result.issues, []);
        assert.deepEqual(result.run.unsupported, [], 'every command the program sent was understood by the hub');
        assert.ok(result.run.calls.get('isColor') > 100,
            `the program read the colour sensor steadily: ${JSON.stringify([...result.run.calls])}`);
        const r = judge(result.track);
        t.diagnostic(`max radius ${(r.maxR * 1000).toFixed(0)} mm of ${RING_EDGE_M * 1000} mm, band entries ${r.entries}, ` +
            `travel ${r.travel.toFixed(2)} m, saw black: ${r.sawBlack}, starts white at r ${(r.startR * 1000).toFixed(0)} mm`);
        assert.ok(r.startR < 0.05, 'the robot starts at the ring centre');
        assert.ok(r.startWhite, 'the sensor starts over white');
        assert.ok(r.sawBlack, 'the sensor really saw the black band');
        assert.ok(r.maxR < RING_EDGE_M,
            `the axle left the ring: max radius ${(r.maxR * 1000).toFixed(0)} mm of the ${(RING_EDGE_M * 1000).toFixed(0)} mm edge`);
        assert.ok(r.entries >= NEED_ENTRIES,
            `only ${r.entries} entries into r >= ${BAND_ENTRY_M} m in ${BUDGET_MS / 1000} s`);
        assert.ok(r.travel >= NEED_TRAVEL_M, `it only travelled ${r.travel.toFixed(2)} m`);
    });

    test('the judge can fail: the same program waiting for blue drives straight out of the ring', async t => {
        const blind = PROGRAM.replace('spike color C is black', 'spike color C is blue');
        assert.notEqual(blind, PROGRAM);
        const {track} = await run(blind);
        const firstOut = track.find(p => radiusOf(p.axle) > RING_EDGE_M);
        t.diagnostic(firstOut ? `waiting for blue: left the ring at ${(firstOut.t / 1000).toFixed(1)} s, ` +
            `ends at ${where(track.at(-1).axle)}` : 'waiting for blue never left the ring');
        // The sumo mat has no blue surface, so the blind program never steadies
        // on a colour: it rolls forward past the band and out of the ring
        // within the budget — proving the black check is what keeps it in.
        assert.ok(firstOut, 'the blind program stayed inside the ring the whole 40 s');
        assert.ok(firstOut.t <= BUDGET_MS, 'it left the ring within the budget');
    });
}
