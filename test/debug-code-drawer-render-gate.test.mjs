/** Run the focused JSX component proof inside the prepared GUI dependency scope. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {INTEGRATED} from './helpers/bw-integrated.mjs';

test('the debugger drawer renders and clicks exact code addresses', () => {
    const jest = path.join(INTEGRATED, 'node_modules', '.bin', 'jest');
    const file = 'test/unit/components/tw-pseudocode/debug-drawer-code-address.test.jsx';
    const result = spawnSync(jest, ['--runInBand', '--runTestsByPath', file], {
        cwd: INTEGRATED,
        encoding: 'utf8',
        env: {...process.env, CI: 'true'},
        timeout: 60_000
    });
    assert.equal(result.status, 0,
        `focused drawer render proof failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
});
