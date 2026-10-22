import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

// Exact system interpreter: it must expose pidfd_open and pidfd_send_signal.
// The workspace's default Python is deliberately not used.
const python = '/usr/bin/python3';
const supervisor = fileURLToPath(new URL('../scripts/private-assessment/supervise.py', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'private-supervisor-'));
let serial = 0;
const normal = {cpuSeconds: 2, termSeconds: 1.5, killSeconds: 1.8, terminalSeconds: 2.2};
function run(code, limits = {}, override = {}) {
    const id = serial++, outputRoot = path.join(root, `output-${id}`), specPath = path.join(root, `spec-${id}.json`);
    const spec = {argv: [python, '-c', code], cwd: root, outputRoot, limits: {...normal, ...limits}, ...override};
    fs.writeFileSync(specPath, JSON.stringify(spec));
    const child = spawnSync(python, [supervisor, '--spec', specPath], {encoding: 'utf8', timeout: 5000,
        maxBuffer: 65536, env: {PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C'}});
    assert.equal(child.error, undefined, 'Finite actual supervisor must return before outer test timeout');
    assert.equal(child.signal, null);
    const resultPath = path.join(outputRoot, 'result.json');
    const result = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, 'utf8')) : null;
    return {child, result, outputRoot, specPath};
}
const stdout = run => fs.readFileSync(path.join(run.outputRoot, 'stdout.bin'));
function terminal(run) {
    assert(run.result);
    assert.equal(run.result.subreaper, true);
    assert.equal(run.result.terminal, true);
    assert.equal(run.result.cleanup.echild, true);
    assert.deepEqual(run.result.cleanup.ownedRemaining, []);
    assert.equal(run.result.cpu.arbitraryGraphExact, false);
    assert.match(run.result.accountingScope, /autoreaped/);
    assert.match(run.result.accountingScope, /Outer watchdog/);
    assert(Math.abs(run.result.cpu.finalReceiptPartitionSeconds - run.result.cpu.supervisorSeconds - run.result.cpu.reapedSeconds) < 1e-8);
}
// Retain this finite tree under the caller's owned TMPDIR for independent DATA
// review, including every original failure/stdout/stderr/receipt. No paths are printed.

test('original exit, exact private stdout/stderr and clean child environment survive supervision', () => {
    const actual = run('import os\nos.write(1,b"original\\x00bytes")\nos.write(2,b"original stderr")\nassert set(os.environ)<=set(["PATH","LANG","LC_ALL","TZ","HOME","TMPDIR"])\nraise SystemExit(7)');
    terminal(actual);
    assert.equal(actual.child.status, 1);
    assert.equal(actual.result.success, false);
    assert.equal(actual.result.root.exitCode, 7);
    assert.equal(actual.result.root.signal, null);
    assert.deepEqual(stdout(actual), Buffer.from('original\0bytes'));
    assert.equal(fs.readFileSync(path.join(actual.outputRoot, 'stderr.bin'), 'utf8'), 'original stderr');
    assert(actual.result.failures.includes('original_exit_failure'));
    const leaf = actual.result.outputs.find(row => row.name === 'stdout.bin');
    assert.equal(leaf.sha256, createHash('sha256').update(stdout(actual)).digest('hex'));
    const replaced = run(`import os
os.write(1,b'original stream bytes')
replacement=os.path.join(os.environ['TMPDIR'],'replacement')
with open(replacement,'wb') as f:f.write(b'replacement')
os.replace(replacement,os.path.join(os.environ['TMPDIR'],'..','stdout.bin'))`);
    terminal(replaced);
    assert.equal(replaced.result.success, false);
    assert(replaced.result.failures.includes('original_stream_replaced'));
    assert.equal(stdout(replaced).toString(), 'replacement');
    const captured = replaced.result.captures.find(row => row.stream === 'stdout.bin');
    assert.equal(captured.originalNameIntact, false);
    const original = fs.readFileSync(path.join(replaced.outputRoot, captured.retainedName));
    assert.equal(original.toString(), 'original stream bytes');
    assert.equal(captured.sha256, createHash('sha256').update(original).digest('hex'));
    assert(replaced.result.outputs.some(row => row.name === captured.retainedName && row.sha256 === captured.sha256));
});

test('double-fork, setsid and a late adopted child drain after the original parent exits', () => {
    const actual = run(`import os,time
if os.fork(): os._exit(0)
os.setsid()
time.sleep(.06)
if os.fork(): os._exit(0)
time.sleep(.06)
os.write(1,('adopted:'+str(os.getppid())+'\\n').encode())
os._exit(0)`);
    terminal(actual);
    assert.equal(actual.child.status, 0);
    assert.equal(actual.result.success, true);
    assert.equal(actual.result.root.exitCode, 0);
    assert.equal(stdout(actual).toString(), `adopted:${actual.result.supervisorPid}\n`);
    assert.equal(actual.result.receipts.length, 3);
    assert(actual.result.receipts.every(row => row.exitCode === 0));
});

test('waited-grandchild CPU remains in one disjoint parent receipt rather than being counted twice', () => {
    const actual = run(`import os,time
pid=os.fork()
if pid==0:
 end=time.process_time()+.05
 while time.process_time()<end: pass
 os._exit(0)
pid,status,usage=os.wait4(pid,0)
os.write(1,('waited:'+str(usage.ru_utime+usage.ru_stime)+'\\n').encode())`);
    terminal(actual);
    assert.equal(actual.result.success, true);
    assert.equal(actual.result.receipts.length, 1);
    const measured = Number(stdout(actual).toString().trim().split(':')[1]);
    assert(measured >= .04);
    assert(actual.result.cpu.reapedSeconds >= measured);
    assert(Math.abs(actual.result.cpu.reapedSeconds - actual.result.receipts[0].userSeconds - actual.result.receipts[0].systemSeconds) < 1e-8);
});

test('lowered cumulative CPU terminates genuine detached busy children and preserves original receipts', () => {
    const actual = run(`import os,time
os.write(1,b'busy-started\\n')
for n in range(2):
 if os.fork()==0:
  os.setsid()
  while True: pass
while True: time.sleep(.01)`, {cpuSeconds: .3, termSeconds: 1, killSeconds: 1.2, terminalSeconds: 1.5});
    terminal(actual);
    assert.equal(actual.result.success, false);
    assert(actual.result.failures.includes('cpu_bound'));
    assert.match(stdout(actual).toString(), /busy-started/);
    assert(actual.result.cpu.reapedSeconds > .05);
    assert(actual.result.receipts.length >= 2);
    assert(actual.result.signals.some(row => row.signal === 9));
    assert(actual.result.signals.every(row => Number.isInteger(row.starttime) && row.starttime > 0));
});

test('wall TERM and ignored-TERM KILL preserve original termination status and leave no survivors', () => {
    const cooperative = run(`import signal,time,os
signal.signal(signal.SIGTERM,lambda *_:exit(0))
os.write(1,b'ready\\n')
while True:time.sleep(.01)`, {termSeconds: .3, killSeconds: .6, terminalSeconds: .9});
    terminal(cooperative);
    assert(cooperative.result.failures.includes('wall_term'));
    assert.equal(cooperative.result.root.exitCode, 0);
    assert.equal(cooperative.result.cleanup.termSent, true);
    const stubborn = run(`import signal,time,os
signal.signal(signal.SIGTERM,signal.SIG_IGN)
os.write(1,b'ready\\n')
while True:time.sleep(.01)`, {termSeconds: .3, killSeconds: .55, terminalSeconds: .85});
    terminal(stubborn);
    assert(stubborn.result.failures.includes('wall_term'));
    assert.equal(stubborn.result.root.signal, 9);
    assert.equal(stubborn.result.cleanup.killSent, true);
    assert.match(stdout(stubborn).toString(), /ready/);
    const unicode = run(`import ctypes,os,time
assert ctypes.CDLL(None).prctl(15,ctypes.c_char_p(bytes.fromhex('776f726b65722de29883')),0,0,0)==0
os.write(1,open('/proc/self/comm','rb').read().hex().encode())
while True:time.sleep(.01)`, {termSeconds: .3, killSeconds: .55, terminalSeconds: .85});
    terminal(unicode);
    assert.match(stdout(unicode).toString(), /e29883/);
    assert(unicode.result.failures.includes('wall_term'));
    assert(!unicode.result.failures.includes('ownership_inventory_refused'));
    assert.equal(unicode.result.root.signal, os.constants.signals.SIGTERM);
});

test('real inherited file limit and aggregate output checks fail without truncating originals', () => {
    const leaf = run(`import os,signal
signal.signal(signal.SIGXFSZ,signal.SIG_DFL)
while True:os.write(1,b'x'*4096)`, {fileBytes: 8192});
    terminal(leaf);
    assert.equal(leaf.result.root.signal, os.constants.signals.SIGXFSZ);
    assert.equal(stdout(leaf).length, 8192);
    assert(stdout(leaf).every(value => value === 120));
    const aggregate = run(`import os
for n in range(2):
 with open(os.path.join(os.environ['TMPDIR'],str(n)),'wb') as f:f.write(b'z'*800000)`,
    {fileBytes: 1024 * 1024, ownedBytes: 5 * 1024 * 1024});
    terminal(aggregate);
    assert.equal(aggregate.result.success, false);
    assert(aggregate.result.failures.some(code => /output/.test(code)));
    assert.equal(fs.readFileSync(path.join(aggregate.outputRoot, 'tmp', '0')).length, 800000);
    const partial = fs.readFileSync(path.join(aggregate.outputRoot, 'tmp', '1'));
    assert(partial.length > 0 && partial.length <= 800000);
    assert(partial.every(value => value === 122), 'Any prefix written before termination remains original, never replaced or truncated by collector');
});

test('symlink output collection refuses and invalid or raised specs execute no child', () => {
    const linked = run(`import os
os.symlink('/etc/passwd',os.path.join(os.environ['TMPDIR'],'link'))`);
    terminal(linked);
    assert.equal(linked.result.success, false);
    assert(linked.result.failures.some(code => /output/.test(code)));
    assert.equal(fs.lstatSync(path.join(linked.outputRoot, 'tmp', 'link')).isSymbolicLink(), true);
    assert.deepEqual(linked.result.outputs, []);
    const bounded = run(`import os
for n in range(40):os.mkdir(os.path.join(os.environ['TMPDIR'],str(n)),0o700)`, {outputNodes: 32});
    terminal(bounded);
    assert.equal(bounded.result.success, false);
    assert(bounded.result.failures.includes('output_node_bound'));
    assert(fs.readdirSync(path.join(bounded.outputRoot, 'tmp')).length >= 29, 'Actual empty directories cross the all-node bound');
    for (const override of [{limits: {cpuSeconds: 26}}, {limits: {hosted: true}}, {extra: true}, {argv: ['relative']}]) {
        const refused = run('raise SystemExit(0)', {}, override);
        assert.equal(refused.child.status, 2);
        assert.equal(refused.result, null);
        assert.equal(fs.existsSync(refused.outputRoot), false);
        assert.equal(refused.child.stderr, 'private assessment supervisor setup refused\n');
    }
    for (const source of ['{"argv":[],"argv":[]}', '{"cpu":NaN}']) {
        const filename = path.join(root, `invalid-${serial++}.json`); fs.writeFileSync(filename, source);
        const refused = spawnSync(python, [supervisor, '--spec', filename], {encoding: 'utf8', timeout: 2000,
            env: {PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C'}});
        assert.equal(refused.status, 2);
        assert.equal(refused.stderr, 'private assessment supervisor setup refused\n');
    }
});
