// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Robot Lab's port boundary, held by the import graph
 * (docs/ROBOT-LAB-ARCHITECTURE.md §3.6, slice R1): the physics core and the
 * compiler know NO hub and NO program route. Every hub family reaches the
 * physics only as PortDrive/PortReading data through a VirtualHub
 * (bw-sim/hubs/hub-profile.js), so adding a hub can never need an edit under
 * bw-sim/physics/ or bw-sim/mech/ — and this test fails the day one of them
 * imports, even transitively, a hub adapter, the hub registry, the bridge that
 * plugs hubs in, the virtual SPIKE hub, the SPIKE controller or arena, or an
 * RCX/NQC module. The other direction holds too: hub adapters import nothing
 * from bw-sim/physics/.
 *
 * Edges followed: static `import … from`, `export … from`, `import('…')` and
 * webpack's `new Worker(new URL('…', import.meta.url))` (a worker entry is as
 * much a dependency as an import). Bare specifiers (jolt-physics, three) are
 * packages, not ours, and are not followed.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, 'overlay/scratch-gui/src/lib');
const rel = file => path.relative(LIB, file).split(path.sep).join('/');

const SPEC = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*(?:\/\*[^*]*\*\/\s*)?['"]([^'"]+)['"]\s*\)|new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;

/** The relative modules a file names (resolved to existing files). */
const importsOf = file => {
    const text = readFileSync(file, 'utf8');
    const out = [];
    for (const m of text.matchAll(SPEC)) {
        const spec = m[1] || m[2] || m[3] || m[4];
        if (!spec.startsWith('.')) continue;
        // A webpack resource query (`parts.json?core`, overlay/scratch-gui/parts-subset-loader.js) names the same file.
        const target = path.resolve(path.dirname(file), spec.replace(/\?.*$/, ''));
        assert.ok(existsSync(target), `${rel(file)} names '${spec}', which does not exist`);
        out.push(target);
    }
    return out;
};

/** Every module reachable from `starts`, with the chain that reached it. */
const closure = starts => {
    const via = new Map(starts.map(s => [s, null]));
    const queue = [...starts];
    while (queue.length) {
        const file = queue.shift();
        if (!/\.(m?js|jsx)$/.test(file)) continue;
        for (const next of importsOf(file)) {
            if (via.has(next)) continue;
            via.set(next, file);
            queue.push(next);
        }
    }
    return via;
};

const chain = (via, file) => {
    const out = [];
    for (let f = file; f; f = via.get(f)) out.unshift(rel(f));
    return out.join(' → ');
};

const filesUnder = dir => readdirSync(dir).flatMap(name => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p) : (/\.(m?js|jsx)$/.test(name) ? [p] : []);
});

/** A hub or route module: what physics and the compiler must never reach. */
const HUB_OR_ROUTE = [
    // The Robot Lab API is a program route too (blocks, `lab` words, Python/JS all end there).
    /^bw-sim\/api\//,
    /^bw-sim\/hubs\//, /^bw-sim\/registry\/hubs\.js$/, /^bw-sim\/routes\//,
    /^bw-sim\/hub-bridge\.js$/, /^bw-sim\/sim-worker-protocol\.js$/, /^bw-sim\/physics-worker\.js$/,
    /^virtual-hub\//, /^spike-sim\//, /^spike-arena\//, /^spike-nuttx\//, /^spike-micropython\//,
    /^rcx\//, /^nqc-wasm\//, /^(spike|rcx|nqc)[^/]*\.js$/
];
const isHubOrRoute = file => HUB_OR_ROUTE.some(re => re.test(rel(file)));

const PHYSICS = path.join(LIB, 'bw-sim/physics');
const MECH = path.join(LIB, 'bw-sim/mech');

test('the scan follows imports and worker URLs, and would see a hub reached from a module', () => {
    // A gate that cannot fail proves nothing: the same scan, started at the bridge (which
    // plugs hubs in) and at the Sim Lab entry (which starts the worker by URL), must find them.
    const bridge = closure([path.join(LIB, 'bw-sim/hub-bridge.js')]);
    const reached = [...bridge.keys()].map(rel);
    assert.ok(reached.includes('bw-sim/hubs/spike/spike-virtual-hub.js'), `the bridge reaches the SPIKE adapter: ${reached.join(', ')}`);
    assert.ok(reached.includes('virtual-hub/spike-hub-state.js'), 'and through it the virtual SPIKE hub');
    assert.ok(reached.includes('bw-sim/physics/actuators.js'), 'and the physics side it drives');
    assert.ok([...bridge.keys()].some(isHubOrRoute), 'the predicate flags what physics must not reach');
    const entry = [...closure([path.join(LIB, 'bw-sim/sim-lab.js')]).keys()].map(rel);
    assert.ok(entry.includes('bw-sim/physics-worker.js'), 'new Worker(new URL(…)) is an edge');
    assert.ok(entry.includes('bw-sim/sim-worker-protocol.js'), 'followed into the worker\'s own imports');
});

test('bw-sim/physics and bw-sim/mech import no hub and no route module, not even transitively', () => {
    const starts = [...filesUnder(PHYSICS), ...filesUnder(MECH)];
    const names = starts.map(rel);
    for (const f of ['bw-sim/physics/jolt-core.js', 'bw-sim/physics/physics-host.js', 'bw-sim/physics/physics-client.js',
        'bw-sim/physics/actuators.js', 'bw-sim/mech/compile.js']) {
        assert.ok(names.includes(f), `the scan covers ${f}`);
    }
    const via = closure(starts);
    const bad = [...via.keys()].filter(isHubOrRoute).map(f => chain(via, f));
    assert.deepEqual(bad, [], `physics/mech reach hub or route modules:\n${bad.join('\n')}`);
});

test('hub adapters and the hub registry import nothing from bw-sim/physics', () => {
    const starts = [...filesUnder(path.join(LIB, 'bw-sim/hubs')), path.join(LIB, 'bw-sim/registry/hubs.js')];
    assert.ok(starts.some(f => rel(f) === 'bw-sim/hubs/spike/spike-virtual-hub.js'), 'the SPIKE adapter is scanned');
    assert.ok(starts.some(f => rel(f) === 'bw-sim/hubs/lab-direct/lab-direct-hub.js'), 'the lab-direct adapter is scanned');
    const via = closure(starts);
    const bad = [...via.keys()].filter(f => rel(f).startsWith('bw-sim/physics/')).map(f => chain(via, f));
    assert.deepEqual(bad, [], `hub modules reach the physics:\n${bad.join('\n')}`);
});

test('the RCX stays behind the VirtualHub boundary: its adapter reaches the bytecode VM and no physics; the download targets reach no hub', () => {
    const rcx = [...filesUnder(path.join(LIB, 'bw-sim/hubs/rcx'))];
    assert.deepEqual(rcx.map(rel).sort(), ['bw-sim/hubs/rcx/profile.js', 'bw-sim/hubs/rcx/rcx-lab-target.js',
        'bw-sim/hubs/rcx/rcx-virtual-hub.js']);
    const via = closure(rcx);
    const reached = [...via.keys()].map(rel);
    assert.ok(reached.includes('bw-sim/routes/rcx-vm/rcx-vm.js'), 'the adapter runs the clean-room VM');
    assert.ok(reached.includes('bw-sim/devices/rcx-sensors.js'), 'and reads the sensors through their device models');
    const physics = [...via.keys()].filter(f => rel(f).startsWith('bw-sim/physics/') || rel(f).startsWith('bw-sim/mech/') ||
        rel(f) === 'bw-sim/hub-bridge.js' || rel(f) === 'bw-sim/sensors.js').map(f => chain(via, f));
    assert.deepEqual(physics, [], `the RCX reaches the physics side:\n${physics.join('\n')}`);
    // The tower hook and its target registry know no hub: the Lab registers its target at run time.
    const hook = closure([path.join(LIB, 'rcx-download-hook.js')]);
    const bad = [...hook.keys()].filter(f => rel(f).startsWith('bw-sim/')).map(f => chain(hook, f));
    assert.deepEqual(bad, [], `the download hook reaches the Robot Lab:\n${bad.join('\n')}`);
    // The pane's route to the RCX goes through the registry: hubs/index.js lists the family.
    assert.ok([...closure([path.join(LIB, 'bw-sim/hubs/index.js')]).keys()].map(rel).includes('bw-sim/hubs/rcx/rcx-virtual-hub.js'));
});

test('the Robot Lab API reaches the scene only through the session: no physics, no compiler, no hub module', () => {
    // docs/ROBOT-LAB-HUBS-PLAN.md P1: a direct motor command crosses the VirtualHub boundary (the
    // hub that owns the port, via the session's hubs), never the physics core; reads go through
    // the session's core answers (bodyPose/jointState), which the worker's mirror gives too.
    const api = path.join(LIB, 'bw-sim/api/robot-lab-api.js');
    const via = closure([api]);
    const reached = [...via.keys()].map(rel);
    assert.ok(reached.includes('bw-sim/contracts.js'), `the scan follows the API's imports: ${reached.join(', ')}`);
    const bad = [...via.keys()].filter(f => f !== api && (/^bw-sim\/(physics|mech)\//.test(rel(f)) || isHubOrRoute(f))).map(f => chain(via, f));
    assert.deepEqual(bad, [], `the API reaches:\n${bad.join('\n')}`);
});

test('the robotlab blocks know only runtime.robotLab: the extension imports nothing from the GUI', () => {
    const ext = path.join(ROOT, 'overlay/scratch-vm/src/extensions/crispstrobe/robotlab/index.js');
    const text = readFileSync(ext, 'utf8');
    const required = [...text.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);
    assert.ok(required.length > 0, 'the scan sees the extension\'s requires');
    const foreign = required.filter(r => !/^\.\.\/\.\.\/\.\.\/(extension-support|util)\//.test(r) && r !== 'format-message');
    assert.deepEqual(foreign, [], 'the extension reaches the Lab only through runtime.robotLab');
    assert.match(text, /runtime\.robotLab/);
    const code = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /scratch-gui|bw-sim\//, 'no path into the GUI or the simulator (outside comments)');
});

test('the LWP3 and WeDo 2.0 hubs stay behind the VirtualHub boundary; their GATT peripherals reach only the hubs\' protocol', () => {
    // docs/ROBOT-LAB-HUBS-PLAN.md P3: a radio hub is a profile plus an adapter that speaks its protocol; the physics
    // is reached only through PortDrive/PortReading data, and the BLE surface only through the hub object.
    for (const dir of ['bw-sim/hubs/lwp3', 'bw-sim/hubs/wedo2']) {
        const files = filesUnder(path.join(LIB, dir));
        assert.ok(files.length >= 2, `${dir} is scanned`);
        const via = closure(files);
        const bad = [...via.keys()].filter(f => /^bw-sim\/(physics|mech)\//.test(rel(f)) || rel(f) === 'bw-sim/hub-bridge.js' ||
            rel(f).startsWith('virtual-hub/')).map(f => chain(via, f));
        assert.deepEqual(bad, [], `${dir} reaches:\n${bad.join('\n')}`);
    }
    const peripherals = closure([path.join(LIB, 'virtual-hub/lab-ble-peripherals.js'), path.join(LIB, 'virtual-hub/scratch-link-ble.js'),
        path.join(LIB, 'virtual-hub/connect-virtual-hub.js')]);
    const reached = [...peripherals.keys()].map(rel);
    assert.ok(reached.includes('bw-sim/hubs/lwp3/lwp3-protocol.js'), 'the LWP3 peripheral reads the protocol constants');
    const physics = [...peripherals.keys()].filter(f => /^bw-sim\/(physics|mech)\//.test(rel(f)) || rel(f) === 'bw-sim/sim-session.js')
        .map(f => chain(peripherals, f));
    assert.deepEqual(physics, [], `the BLE surface reaches the physics:\n${physics.join('\n')}`);
    assert.ok([...closure([path.join(LIB, 'bw-sim/hubs/index.js')]).keys()].map(rel).includes('bw-sim/hubs/lwp3/lwp3-virtual-hub.js'));
});
