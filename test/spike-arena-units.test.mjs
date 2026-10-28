// SPDX-License-Identifier: BSD-3-Clause
/**
 * The SPIKE arena units after "Rover basics" (task D2): Sensors in depth, Gyro
 * turns, Mapping and the Capstone. Each mission is run for real, like the
 * starter unit in test/spike-arena-challenges.test.mjs: the program is
 * executed in the real Scratch VM through the real spikeprime extension and
 * the virtual hub (test/helpers/spike-arena-vm.mjs), and the arena judges.
 *
 *   - every reference solution PASSES, and every deliberately wrong one FAILS
 *     for the reason written beside it below (a wrong solution that fails for
 *     some other reason is not testing what its comment says);
 *   - every program parses without a warning: the dialect drops a line it
 *     does not understand with only a warning, and a dropped line can turn a
 *     wrong solution into one that fails for the wrong reason;
 *   - the one-clock contract: each reference solution also passes, with the
 *     same finishing time, through the browser pane's frame loop with the VM
 *     stalled past the time limit (the rule of test/spike-arena-starved-vm);
 *   - the checker is mutation-checked: each evaluator these units use,
 *     replaced by always-false and always-true, changes some verdict; and the
 *     capstone's partial credit is held against a run that delivers the crate
 *     and then pushes it off the depot again.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const ARENA_DIR = path.join(REPO, 'overlay', 'scratch-gui', 'static', 'spike-arena');
const LIB = path.join(REPO, 'overlay', 'scratch-gui', 'src', 'lib', 'spike-arena');
const {validateWorld} = await import(path.join(LIB, 'arena-world.js'));
const {ArenaChecker, EVALUATORS, REASONS} = await import(path.join(LIB, 'arena-checker.js'));
const {ARENA_L10N} = await import(path.join(LIB, 'l10n.js'));

/** Every new mission, and why its wrong solution must fail. */
const WRONG_REASON = {
    'sd01-blue-beacon': 'fail.timeLimit', // stops on the first colour, yellow
    'sd02-trail-to-the-flag': 'fail.leftZone', // no exit from the follower
    'sd03-docking-distance': 'fail.hitWall', // waits for EXACTLY 20 cm
    'sd04-door-in-the-wall': 'fail.hitWall', // turns at the door's first edge
    'sd05-crate-maze': 'fail.timeLimit', // turns without backing off: jammed
    'gt01-half-a-right-angle': 'fail.timeLimit', // full speed overshoots 45
    'gt02-worn-wheel': 'fail.leftZone', // no gyro correction on the worn wheel
    'gt03-hexagon-patrol': 'fail.enteredZone', // inside angle 120: into the pond
    'gt04-about-turn': 'fail.timeLimit', // yaw > 180 never happens
    'mp01-count-the-finds': 'fail.hitWall', // counts readings, not markers
    'mp02-back-to-the-find': 'fail.stoppedIn', // measures back from the start
    'mp03-replay-the-route': 'fail.hitWall', // one variable, not a list
    'cp01-supply-run': 'fail.timeLimit' // no back-off at the button: jammed
};
const NEW_UNITS = ['sensors-in-depth', 'gyro-turns', 'mapping', 'capstone'];

const index = JSON.parse(readFileSync(path.join(ARENA_DIR, 'units.json'), 'utf8'));
const units = NEW_UNITS.map(id => ({id, dir: path.join(ARENA_DIR, id), unit: JSON.parse(readFileSync(path.join(ARENA_DIR, id, 'unit.json'), 'utf8'))}));
const missions = units.flatMap(({id, dir, unit}) => unit.challenges.map(cid => ({
    unit: id, dir, world: JSON.parse(readFileSync(path.join(dir, `${cid}.json`), 'utf8'))
})));
const source = (m, which) => readFileSync(path.join(m.dir, m.world[which]), 'utf8');

test('units.json lists every unit folder, in order, starting with the starter unit', () => {
    const folders = readdirSync(ARENA_DIR, {withFileTypes: true}).filter(d => d.isDirectory()).map(d => d.name).sort();
    assert.deepEqual([...index.units].sort(), folders, 'a unit folder the pane cannot offer, or an index entry with no folder');
    assert.equal(index.units[0], 'rover-basics');
    for (const id of NEW_UNITS) assert.ok(index.units.includes(id), id);
    for (const id of index.units) {
        assert.equal(JSON.parse(readFileSync(path.join(ARENA_DIR, id, 'unit.json'), 'utf8')).id, id);
    }
});

test('every new mission is in the table above, and every table entry is a mission', () => {
    assert.deepEqual(missions.map(m => m.world.id).sort(), Object.keys(WRONG_REASON).sort());
});

for (const {id, dir, unit} of units) {
    test(`${id}: the unit lists every file in its folder, and nothing else`, () => {
        const files = readdirSync(dir).sort();
        const expected = ['unit.json', ...unit.challenges.flatMap(c => [`${c}.json`, `${c}.bw`, `${c}.wrong.bw`])].sort();
        assert.deepEqual(files, expected);
        assert.ok(unit.title.en && unit.title.de && unit.intro.en && unit.intro.de);
        assert.notEqual(unit.intro.en, unit.intro.de);
    });
}

test('every mission is a valid world with EN and DE text, hints, and a DEVICE SPIKE solution pair', () => {
    for (const {world, dir} of missions) {
        assert.deepEqual(validateWorld(world), [], world.id);
        assert.equal(world.solution, `${world.id}.bw`);
        assert.equal(world.wrong, `${world.id}.wrong.bw`);
        assert.ok(world.intro.en.length > 80 && world.intro.de.length > 80, `${world.id}: an intro in both languages`);
        assert.notEqual(world.intro.en, world.intro.de, `${world.id}: DE is not a copy of EN`);
        assert.ok((world.hints || []).length >= 1, `${world.id}: at least one hint`);
        for (const hint of world.hints) assert.notEqual(hint.en, hint.de, `${world.id}: a hint's DE is not a copy`);
        for (const zone of world.zones || []) assert.ok(zone.label && zone.label.en && zone.label.de, `${world.id}: zone ${zone.id} has a label`);
        const reference = readFileSync(path.join(dir, world.solution), 'utf8');
        const wrong = readFileSync(path.join(dir, world.wrong), 'utf8');
        for (const [file, text] of [[world.solution, reference], [world.wrong, wrong]]) {
            assert.match(text, /^DEVICE SPIKE\s*$/m, file);
            assert.doesNotMatch(text, /^\s*wait \d+(?:\.\d+)? seconds?\s*$/m, `${file} sleeps a fixed time`);
        }
        assert.notEqual(reference, wrong);
    }
});

test('every failure reason a mission can give has words in both languages', () => {
    const used = new Set(missions.flatMap(({world}) => (world.failure || []).map(c => REASONS[c.type])));
    used.add(REASONS.timeLimit);
    for (const reason of used) {
        for (const locale of ['en', 'de']) assert.ok(ARENA_L10N[locale][reason], `${locale} ${reason}`);
    }
    for (const locale of ['en', 'de']) assert.ok(ARENA_L10N[locale].stagesDone.includes('{done}'), locale);
});

test('each unit teaches what it promises', () => {
    const text = unitId => missions.filter(m => m.unit === unitId).map(m => source(m, 'solution')).join('\n');
    const worlds = unitId => missions.filter(m => m.unit === unitId).map(m => m.world);
    const promises = {
        'sensors-in-depth': [/spike color C is (?!black)\w+/, /REPEAT UNTIL spike color C is red:/, /spike distance D </,
            /spike distance D >/, /spike force sensor E pressed/, /^DEFINE /m],
        'gyro-turns': [/reset yaw/, /spike angle yaw > 43/, /start moving steering \(spike angle yaw \* -\d+\)/,
            /set turn to \(360 \/ 6\)/, /abs of spike angle yaw/],
        mapping: [/^GLOBAL \w+/m, /^GLOBAL LIST route/m, /change \w+ by 1/, /add \(spike color C\) to route/,
            /item i of route/, /length of route/],
        capstone: [/start tank/, /spike angle yaw/, /spike force sensor E pressed/, /spike distance D/]
    };
    for (const [unitId, patterns] of Object.entries(promises)) {
        for (const pattern of patterns) assert.match(text(unitId), pattern, `${unitId}: no reference solution uses ${pattern}`);
    }
    // The sensors the model has, used by the missions (not only mentioned).
    assert.ok(worlds('sensors-in-depth').some(w => w.robot && w.robot.sensors.some(s => s.kind === 'distance' && s.heading === -90)),
        'a mission with a side-mounted distance sensor');
    assert.ok(worlds('gyro-turns').some(w => w.robot && w.robot.left && w.robot.left.wheelDiameter < 5.6),
        'a mission with a worn wheel, so driving straight needs the gyro');
    assert.ok(worlds('mapping').some(w => w.failure.some(c => c.type === 'noStopIn')), 'a report by parking in a numbered bay');
    const [capstone] = worlds('capstone');
    assert.equal(capstone.stages.length, capstone.success.length);
    assert.ok(capstone.stages.length >= 4, 'the capstone is judged in stages');
});

// ── the runs ─────────────────────────────────────────────────────────────────

const vmSrc = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(vmSrc)) {
    // A missing tree FAILS rather than skips (docs/GATES-THAT-CANNOT-FAIL.md).
    test('the arena units gate: its inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, vmSrc)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOnArena, SB3Creator} = await import('./helpers/spike-arena-vm.mjs');
    const FRAME_MS = 1000 / 30;
    const runs = new Map();
    const run = async (m, which) => {
        const key = `${m.world.id}/${which}`;
        if (!runs.has(key)) runs.set(key, await runOnArena(source(m, which), m.world, {record: true}));
        return runs.get(key);
    };

    test('every program parses without a warning (a dropped line would change what it tests)', () => {
        for (const m of missions) {
            for (const which of ['solution', 'wrong']) {
                const creator = new SB3Creator();
                creator.parse(source(m, which));
                assert.deepEqual(creator.warnings || [], [], `${m.world[which]}`);
                assert.deepEqual(creator.errors || [], [], `${m.world[which]}`);
            }
        }
    });

    for (const m of missions) {
        test(`${m.world.id}: the reference solution passes in the real VM`, async () => {
            const result = await run(m, 'solution');
            assert.equal(result.verdict.status, 'pass',
                `${m.world.id}: ${JSON.stringify(result.verdict)} at ${JSON.stringify(result.snapshot.pose)}`);
            assert.deepEqual(result.unsupported, [], 'every command the program sent was understood by the hub');
        });
        test(`${m.world.id}: the deliberately wrong solution fails with ${WRONG_REASON[m.world.id]}`, async () => {
            const result = await run(m, 'wrong');
            assert.deepEqual([result.verdict.status, result.verdict.reason], ['fail', WRONG_REASON[m.world.id]],
                `${m.world.id}: ${JSON.stringify(result.verdict)} at ${JSON.stringify(result.snapshot.pose)}`);
            assert.deepEqual(result.unsupported, []);
        });
    }

    test('the capstone gives partial credit: the wrong solution completes two stages of four', async () => {
        const m = missions.find(x => x.world.id === 'cp01-supply-run');
        assert.deepEqual((await run(m, 'solution')).verdict.stages, [true, true, true, true]);
        assert.deepEqual((await run(m, 'wrong')).verdict.stages, [true, true, false, false]);
    });

    // Partial credit counts a stage as the run LEAVES it, like the pass itself.
    // This run pushes the crate onto the depot, on past it, backs away and
    // parks: every stage but the crate holds at the end. It is also the run
    // that tells a broken `push` evaluator from the real one (with only the
    // reference and the wrong solution, push/always survived).
    const pastTheDepot = m => source(m, 'solution')
        .replace(/^(\s*)move forward 40 cm$/m, '$1move forward 65 cm\n$1move backward 25 cm');
    test('partial credit is the stages met at the end: a crate pushed past the depot is not delivered', async () => {
        const m = missions.find(x => x.world.id === 'cp01-supply-run');
        const program = pastTheDepot(m);
        assert.notEqual(program, source(m, 'solution'), 'the edit applied');
        const result = await runOnArena(program, m.world, {record: true});
        runs.set('cp01-supply-run/past-the-depot', result);
        assert.deepEqual([result.verdict.status, result.verdict.reason], ['fail', 'fail.timeLimit'], JSON.stringify(result.verdict));
        assert.deepEqual(result.verdict.stages, [true, true, false, true]);
        const crate = result.snapshot.objects.find(o => o.id === 'crate');
        const depot = m.world.zones.find(z => z.id === 'depot').shape;
        assert.ok(crate.centre[0] > depot.x + depot.w / 2, `the crate ended past the depot, at ${crate.centre}`);
        // ...and it WAS on the depot on the way: the stage was met, then undone.
        assert.ok(result.views.some(view => {
            const c = view.objects.find(o => o.id === 'crate').centre;
            return Math.abs(c[0] - depot.x) <= depot.w / 2 && Math.abs(c[1] - depot.y) <= depot.h / 2;
        }), 'the crate crossed the depot');
    });

    test('runs are reproducible: the same program gives the same pose, bit for bit', async () => {
        const m = missions.find(x => x.world.id === 'gt02-worn-wheel');
        const a = await runOnArena(source(m, 'solution'), m.world);
        const b = await runOnArena(source(m, 'solution'), m.world);
        assert.deepEqual(a.snapshot.pose, b.snapshot.pose);
        assert.equal(a.frames, b.frames);
        assert.deepEqual(a.verdict, b.verdict);
    });

    // ONE CLOCK (docs/SPIKE-ARENA.md): simulated time is what the VM stepped.
    // The pane's own frame rule, with the VM stalled past the whole time limit
    // and then stepped every other frame, must give the lockstep verdict.
    for (const m of missions) {
        test(`${m.world.id}: one clock — the reference passes the same with the VM stalled, then halved`, async () => {
            const stall = Math.round((m.world.timeLimitMs + 5000) / FRAME_MS);
            const starved = await runOnArena(source(m, 'solution'), m.world, {
                vmStepsOn: frame => frame >= stall && frame % 2 === 0,
                maxFrames: stall + 2 * Math.ceil((m.world.timeLimitMs + 1000) / FRAME_MS)
            });
            const lockstep = await run(m, 'solution');
            assert.equal(starved.verdict.status, 'pass', `${m.world.id}: ${JSON.stringify(starved.verdict)}`);
            assert.equal(starved.verdict.reason, lockstep.verdict.reason);
            assert.equal(starved.verdict.timeMs, lockstep.verdict.timeMs, 'the same simulated finishing time');
        });
    }

    // ── mutation check of the checker ───────────────────────────────────────

    const replay = (world, views, evaluators) => {
        const checker = new ArenaChecker(world, {evaluators});
        let verdict = checker.verdict;
        for (const view of views) verdict = checker.evaluate(view);
        return verdict;
    };
    const key = verdict => `${verdict.status}:${verdict.reason}`;

    test('the checker is mutation-checked: every evaluator these units use is load-bearing', async () => {
        const recorded = [];
        for (const m of missions) {
            for (const which of ['solution', 'wrong']) recorded.push({m, which, views: (await run(m, which)).views});
        }
        const capstone = missions.find(x => x.world.id === 'cp01-supply-run');
        if (!runs.has('cp01-supply-run/past-the-depot')) {
            runs.set('cp01-supply-run/past-the-depot', await runOnArena(pastTheDepot(capstone), capstone.world, {record: true}));
        }
        recorded.push({m: capstone, which: 'past-the-depot', views: runs.get('cp01-supply-run/past-the-depot').views});
        for (const {m, views} of recorded) assert.ok(views.length > 10, `${m.world.id}: views were recorded`);
        const baseline = recorded.map(({m, views}) => key(replay(m.world, views, EVALUATORS)));
        for (const [k, {m, which}] of recorded.entries()) {
            assert.equal(baseline[k], key(runs.get(`${m.world.id}/${which}`).verdict), `${m.world.id}/${which}: the replay reproduces the live verdict`);
        }
        const used = new Set(missions.flatMap(({world}) => [...world.success, ...(world.failure || [])].map(c => c.type)));
        for (const type of ['stopIn', 'heading', 'sequence', 'touch', 'push', 'avoid', 'stayIn', 'noWallContact', 'noStopIn']) {
            assert.ok(used.has(type), `no new mission uses ${type}`);
        }
        const survivors = [];
        for (const type of used) {
            for (const [name, mutant] of [['never', () => false], ['always', () => true]]) {
                const evaluators = {...EVALUATORS, [type]: mutant};
                const changed = recorded.some(({m, views}, k) => key(replay(m.world, views, evaluators)) !== baseline[k]);
                if (!changed) survivors.push(`${type}/${name}`);
            }
        }
        assert.deepEqual(survivors, [], 'mutants no mission run can tell from the real evaluator');
        // An always-true success evaluator passes some wrong solution: the
        // wrong-solution tests above are what would go red.
        const passedWrong = [...used].filter(type => !['avoid', 'stayIn', 'noWallContact', 'noTouch', 'noStopIn'].includes(type))
            .filter(type => recorded.some(({m, which, views}) => which === 'wrong' &&
                replay(m.world, views, {...EVALUATORS, [type]: () => true}).status === 'pass'));
        assert.ok(passedWrong.length >= 3, `always-true success mutants that pass a wrong solution: ${passedWrong}`);
    });

    test('partial credit is mutation-checked: counting stages EVER met would credit the undelivered crate', async () => {
        const m = missions.find(x => x.world.id === 'cp01-supply-run');
        const {views} = runs.get('cp01-supply-run/past-the-depot') || await runOnArena(pastTheDepot(m), m.world, {record: true});
        const real = new ArenaChecker(m.world);
        for (const view of views) real.evaluate(view);
        assert.deepEqual(real.verdict.stages, [true, true, false, true]);
        const ever = new ArenaChecker(m.world);
        const everMet = m.world.success.map(() => false);
        const evaluate = ever.evaluate.bind(ever);
        ever.evaluate = view => { const v = evaluate(view); ever.met.forEach((x, i) => { if (x) everMet[i] = true; }); return v; };
        ever._stages = () => ({stages: everMet.slice()});
        for (const view of views) ever.evaluate(view);
        assert.deepEqual(ever.verdict.stages, [true, true, true, true], 'the mutant credits all four stages of a failed run');
        assert.notDeepEqual(ever.verdict.stages, real.verdict.stages);
    });
}
