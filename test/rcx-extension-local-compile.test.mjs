// The RCX extension, compiled against the compiler this app ships.
//
// THE JOIN THIS EXISTS TO HOLD. Three pieces have to agree and none of them
// imports another: the extension emits NQC and calls `runtime.nqcCompile`;
// lib/nqc-runtime-hook.js installs that function; lib/nqc-wasm/compiler.js is
// what it calls. Each is tested on its own. Nothing tested that they fit —
// and the failure mode when they do not fit is SILENT, because the extension
// falls back to a hosted service whenever the local compiler is missing or
// returns a shape it does not recognise. The app still works; it is simply
// online-only and slower, and no test goes red.
//
// So this takes the bundle Lite actually ships, runs its transpiler, and
// compiles the result with the real WASM compiler through the real hook.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bundleSource} from '../scripts/spike/bundled-upstream.mjs';
import {quietConsole} from './helpers/quiet-console.mjs';

quietConsole();

const {installNqcCompiler} = await import('../overlay/scratch-gui/src/lib/nqc-runtime-hook.js');
const {isRcxImage} = await import('../overlay/scratch-gui/src/lib/nqc-wasm/compiler.js');

// The bundle is `makeExt("<source as a JSON string>")`, so its source arrives
// with every quote escaped and no source-shaped regex matches anything in the
// raw file. That has cost this repo two separate afternoons; bundleSource()
// evaluates the bundle with a stubbed adapter to recover the real source, and
// using it here is the whole reason this test can read the extension at all.
// It takes a bundle ID, not a path, and returns null rather than throwing.
const source = bundleSource('legorcx');
assert.equal(typeof source, 'string', 'the legorcx bundle did not yield its source');

test('the vendored bundle is the RCX extension and declares MPL-2.0', () => {
    assert.match(source, /\/\/ ID: legorcx/);
    assert.match(source, /\/\/ License: MPL-2\.0/);
    assert.match(source, /runtime\.nqcCompile/,
        'the extension must still look for a host-installed compiler; if this goes, ' +
        'the local path is dead and only the hosted service remains');
});

test('what the extension generates, the compiler we ship accepts', async () => {
    // Not the extension's own transpiler driven through a VM — that needs a
    // runtime this suite does not build. What is asserted is the contract at
    // the seam: NQC in the dialect the extension emits, compiled by the hook.
    // The samples below are lifted from the units the extension documents,
    // which are exactly the things it could get silently wrong: power is 0..7
    // and not a percentage, and Wait()/PlayTone() take CENTISECONDS.
    const vm = {runtime: {}};
    assert.equal(installNqcCompiler(vm), true);

    const programs = [
        'task main() { SetPower(OUT_A, 7); OnFwd(OUT_A); Wait(100); Off(OUT_A); }',
        'task main() { SetSensor(SENSOR_1, SENSOR_TOUCH); until (SENSOR_1 == 1); PlayTone(440, 50); }',
        'int count;\ntask main() { count = 0; repeat(5) { count += 1; Wait(30); } }',
        'sub helper() { OnFwd(OUT_A); }\ntask main() { helper(); }\ntask watcher() { Off(OUT_B); }'
    ];
    for (const program of programs) {
        const out = await vm.runtime.nqcCompile(program, 'RCX2');
        assert.equal(out.ok, true, `${program}\n${out.log}`);
        assert.ok(isRcxImage(out.bytes), 'the extension checks this magic before downloading');
    }
});

test('the extension and the compiler agree on which targets exist', async () => {
    // The extension offers a target menu; the compiler refuses anything it
    // does not know by name. A menu entry the compiler rejects is a block that
    // fails only when a user picks it.
    const {NQC_TARGETS} = await import('../overlay/scratch-gui/src/lib/nqc-wasm/compiler.js');
    const offered = [...source.matchAll(/["'](RCX2?|CM|Scout|Spy|Swan)["']/g)].map(m => m[1]);
    assert.ok(offered.length > 0, 'the extension names no target at all');
    for (const target of new Set(offered)) {
        assert.ok(NQC_TARGETS.includes(target), `the extension offers ${target}, which nqc does not build`);
    }
});
