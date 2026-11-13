import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {runWithFailureOutput} from '../scripts/lib/corpus-child-output.mjs';

test('failure reveals the real case and verdict, not child error text', () => {
    const seen=[];
    const privatePath=['', 'home', 'private', 'file'].join('/');
    const child=`process.stdout.write(${JSON.stringify(`arduino-demo -> nano: ERROR ${privatePath} token=secret\n`)});process.exit(7)`;
    assert.throws(() => runWithFailureOutput(
        () => execFileSync(process.execPath, ['-e', child],
        {encoding:'utf8'}), value => seen.push(value)), error => error.message.includes('exit 7') && !error.message.includes(privatePath));
    assert.deepEqual(seen, ['arduino-demo -> nano: ERROR\n']);
    assert.doesNotMatch(seen[0], /\/home\/|token|secret/);
});

test('successful child output is unchanged', () => {
    const seen=[];
    const result=runWithFailureOutput(
        () => execFileSync(process.execPath,['-e','process.stdout.write("case: AGREE\\n")'],{encoding:'utf8'}),
        value => seen.push(value));
    assert.equal(result,'case: AGREE\n');assert.deepEqual(seen,[]);
});

test('unknown lines do not enter public diagnostics or the thrown error', () => {
    const cause=new Error('original');cause.stdout=['', 'mnt', 'private', 'foo secret\nunknown text\n'].join('/');const seen=[];
    assert.throws(() => runWithFailureOutput(() => {throw cause;}, value=>seen.push(value)), error=>!error.message.includes('secret'));
    assert.deepEqual(seen,['Corpus child failed without a recognized case verdict.\n']);
});

test('diagnostic write failure still reports a child failure', () => {
    const cause=new Error('original');cause.stdout='arduino-demo -> pico: DIFF details';
    assert.throws(() => runWithFailureOutput(() => {throw cause;}, () => {throw new Error('write failed');}), error => error.message.includes('Corpus child failed'));
});
