// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Code tab's Python / JavaScript "To blocks" for the LEGO hub extensions' runtime calls.
 *
 * Blocks -> Python/JS writes every block of a runtime-registry extension as `_<runtime>.<method>(…)`
 * (sb3-creator.js runtimeCall): `_spikeprime.steer(0)`, `_legopoweredup.motorOnForDegrees(…)`,
 * `_ev3comprehensive.motorRun(…)`. The Code tab reads code back with lib/robot-lab-pseudocode.js
 * readPython / readJavaScript: the vendored Translator (sb3-creator-python.js; the JS reader uses
 * the same class) knows `scratch.*`, `_stc12.*` and `_arrays.*`, and the Robot Lab lift adds
 * `_robotlab.*` only. No reader maps `_spikeprime.*`, `_legopoweredup.*` or `_ev3comprehensive.*`
 * back to blocks: each such statement is warned as "dropped expression statement" (each reporter
 * as "dropped call in expression", read as ""), so the program loses every hub block on the way.
 *
 * The first test pins what the emitter writes (it passes). The round trips are TODO: they state the
 * missing capability and fail until a reader for those calls exists (the natural home is the lift in
 * lib/robot-lab-pseudocode.js installRobotLabReaders, driven by SB3Creator.RUNTIME_EXTENSIONS'
 * method -> opcode table, as `_robotlab` is driven by robotLabDialect.js). Until then there is
 * nothing to run end to end in the Lab from Python/JS for these hubs.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, 'overlay', 'scratch-gui', 'src', 'lib');
const {default: SB3Creator} = await import(path.join(LIB, 'sb3-creator-register-art.js'));
const {readPython, readJavaScript} = await import(path.join(LIB, 'robot-lab-pseudocode.js'));
const program = file => readFileSync(path.join(ROOT, 'overlay', 'scratch-gui', 'static', 'sim-lab', 'programs', file), 'utf8');

const CASES = [
    {file: 'wall-stopper.bw', ext: 'spikeprime', call: /_spikeprime\.steer\(/},
    {file: 'technic-hub-bench.bw', ext: 'legopoweredup', call: /_legopoweredup\.motorOnForDegrees\(/},
    {file: 'ev3-wall-stopper.bw', ext: 'ev3comprehensive', call: /_ev3comprehensive\.motorRun\(/}
];

const compile = text => { const c = new SB3Creator(); c.parse(text); return c.project; };
const hubOps = (project, ext) => project.targets.flatMap(t => Object.values(t.blocks))
    .map(b => b.opcode).filter(op => op.startsWith(`${ext}_`) && !op.includes('_menu_')).sort();

for (const {file, ext, call} of CASES) {
    test(`${ext}: blocks -> Python and JavaScript write the hub blocks as _${ext}.<method>() calls`, () => {
        const project = compile(program(file));
        assert.deepEqual(project.extensions, [ext], file);
        assert.ok(hubOps(project, ext).length > 0);
        assert.match(new SB3Creator().generatePython(project, {}), call);
        assert.match(new SB3Creator().generateJavaScript(project, {}), call);
    });

    for (const [lang, generate, read] of [['Python', 'generatePython', readPython], ['JavaScript', 'generateJavaScript', readJavaScript]]) {
        test(`${ext}: the Code tab's ${lang} "To blocks" turns _${ext}.<method>() calls back into ${ext} blocks`, {
            todo: `no reader maps _${ext}.* calls to blocks (robot-lab-pseudocode.js lifts _robotlab only) — see docs/ROBOT-LAB-HUB-COVERAGE.md`
        }, () => {
            const project = compile(program(file));
            const code = new SB3Creator()[generate](project, {});
            const back = read(code);
            assert.deepEqual(back.warnings, [], `${lang} reader warnings`);
            assert.deepEqual(hubOps(compile(back.pseudocode), ext), hubOps(project, ext), `${ext} blocks survive ${lang}`);
        });
    }
}
