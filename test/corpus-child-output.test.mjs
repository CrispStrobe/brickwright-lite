import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {runWithFailureOutput} from '../scripts/lib/corpus-child-output.mjs';

test('prints actual failed child stdout and preserves its exit failure', () => {
    const seen=[];
    assert.throws(() => runWithFailureOutput(
        () => execFileSync(process.execPath,['-e','process.stdout.write("case: DIFFERENT\\n");process.exit(7)'],{encoding:'utf8'}),
        value => seen.push(value)), error => error.status===7);
    assert.deepEqual(seen,['case: DIFFERENT\n']);
});
test('returns successful output without writing failure diagnostics', () => {
    const seen=[];
    const result=runWithFailureOutput(
        () => execFileSync(process.execPath,['-e','process.stdout.write("case: AGREE\\n")'],{encoding:'utf8'}),
        value => seen.push(value));
    assert.equal(result,'case: AGREE\n');assert.deepEqual(seen,[]);
});

test('preserves the child failure even if diagnostic writing fails', () => {
    const cause=new Error('original');cause.stdout='details';
    assert.throws(() => runWithFailureOutput(() => {throw cause;}, () => {throw new Error('write failed');}), error => error===cause);
});
