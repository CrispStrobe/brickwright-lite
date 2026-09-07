// N2c's hosted corpus receipt. Forty-four SmallerC compilations are deliberate
// CI work: this test belongs on GitHub's runner, not the tiny development VPS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const execFileP = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

test('the 280-program gallery records the literal-wait gain and every emitted program compiles',
    {timeout: 300000}, async () => {
        const {stdout} = await execFileP(process.execPath, [
            'scripts/measure-i8086-numeric-reach.mjs',
            '--examples', 'overlay/scratch-gui/examples',
            '--compile'
        ], {cwd: root, maxBuffer: 8 * 1024 * 1024});
        const receipt = JSON.parse(stdout);
        const s = receipt.summary;
        assert.equal(s.programs, 280);
        assert.equal(s.waitLiteralPrograms, 120);
        assert.equal(s.waitComputedPrograms, 2);
        assert.equal(s.waitLiteralRefused, 0);
        assert.equal(s.waitComputedRefused, 1);
        assert.equal(s.emits, 44, 'literal wait should lift the emitted count from the N2b baseline of 5');
        assert.equal(s.compiled, s.emits, 'every emitted program must compile through SmallerC');
        assert.equal(s.compileFailed, 0);
        assert.equal(s.longLeaked, 0);
        assert.equal(s.parseFailed, 0);
        assert.equal(s.retargetRefused + s.choke + s.hostC + s.int16Refused
            + s.waitLiteralRefused + s.waitComputedRefused + s.emits, s.programs,
        'every gallery program must land in exactly one outcome bucket');
        console.log(`N2c reach: ${JSON.stringify(s)}`);
    });
