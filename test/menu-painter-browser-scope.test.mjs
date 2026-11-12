import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {menuPainterScope, classifyGuestPaths} from '../scripts/menu-painter-browser-scope.mjs';

const fixture = (t, change = 'unrelated') => {
    const root = mkdtempSync(path.join(tmpdir(), 'menu-scope-'));
    t.after(() => rmSync(root, {recursive: true, force: true}));
    const git = args => execFileSync('/usr/bin/git', ['-c', 'user.name=Scope control',
        '-c', 'user.email=scope@example.invalid', ...args], {cwd: root, encoding: 'utf8'}).trim();
    const write = (file, text) => {mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
        writeFileSync(path.join(root, file), text);};
    git(['init', '-q', '-b', 'main']);
    const menu = 'overlay/scratch-gui/src/components/menu/menu.jsx';
    write(menu, 'fixture menu\n');
    write('docs/fixture.txt', 'fixture text\n');
    git(['add', '.']);git(['commit', '-qm', 'base fixture']);
    git(['checkout', '-qb', 'feature']);
    if (change === 'rename-out') git(['mv', menu, 'docs/renamed-menu.txt']);
    else if (change === 'rename-in') {
        const destination = 'packages/scratch-gui/src/lib/menu-keyboard.js';
        mkdirSync(path.dirname(path.join(root, destination)), {recursive: true});
        git(['mv', 'docs/fixture.txt', destination]);
    } else if (change === 'menu') write(menu, 'changed fixture menu\n');
    else write('docs/fixture.txt', 'unrelated change\n');
    git(['add', '.']);git(['commit', '-qm', 'feature fixture']);
    const head = git(['rev-parse', 'HEAD']);
    git(['checkout', '-q', 'main']);git(['commit', '--allow-empty', '-qm', 'base advance']);
    const base = git(['rev-parse', 'HEAD']);
    git(['merge', '--no-ff', '-qm', 'synthetic merge', 'feature']);
    const checkoutSha = git(['rev-parse', 'HEAD']);
    const context = {eventName: 'pull_request', checkoutSha,
        event: {repository: {full_name: 'CrispStrobe/brickwright-lite'},
            pull_request: {head: {sha: head}, base: {sha: base, repo: {full_name: 'CrispStrobe/brickwright-lite'}}, labels: []}}};
    return {root, context, git};
};

test('proven unrelated PR skips the extra painter journey', t => {
    const f = fixture(t);
    assert.deepEqual(menuPainterScope(f.root, f.context).matches, []);
    assert.equal(menuPainterScope(f.root, f.context).selected, false);
});
test('changed menu source selects the unchanged painter journey', t => {
    const f = fixture(t, 'menu');
    assert.equal(menuPainterScope(f.root, f.context).selected, true);
});
for (const direction of ['rename-out', 'rename-in']) test(`menu ${direction} selects on its old or new path`, t => {
    const f = fixture(t, direction);
    const result = menuPainterScope(f.root, f.context);
    assert.equal(result.selected, true);
    assert.equal(result.changedPaths, 2);
    assert.equal(result.matches.length, 1);
});
test('wrong base, head or checkout identity conservatively selects', t => {
    const f = fixture(t);
    for (const location of ['base', 'head', 'checkout']) {
        const c = structuredClone(f.context);
        if (location === 'checkout') c.checkoutSha = '0'.repeat(40);
        else c.event.pull_request[location].sha = '0'.repeat(40);
        assert.deepEqual(menuPainterScope(f.root, c), {selected: true, apex: true, tempest: true, reason: 'checkout-scope-uncertain'});
    }
});
test('nonmerge or unavailable checkout conservatively selects', t => {
    const f = fixture(t);
    f.git(['checkout', '-q', '--detach', f.context.event.pull_request.head.sha]);
    assert.equal(menuPainterScope(f.root, f.context).selected, true);
    assert.equal(menuPainterScope(path.join(f.root, 'absent'), f.context).selected, true);
});
test('a full label does not suppress affected guests; non-PR events skip the extras', t => {
    const f = fixture(t, 'menu');
    f.context.event.pull_request.labels = [{name: 'ci:full'}];
    assert.equal(menuPainterScope(f.root, f.context).selected, true, 'label alone proves no shard coverage');
    for (const eventName of ['push', 'workflow_dispatch']) {
        assert.equal(menuPainterScope(f.root, {...f.context, eventName}).selected, false);
    }
});
test('malformed PR identity or labels conservatively selects', () => {
    assert.equal(menuPainterScope('.', {eventName: 'pull_request', event: {}, checkoutSha: null}).selected, true);
});


test('depth-two checkout retains the exact synthetic parents and unrelated skip', t => {
    const f = fixture(t);
    const clone = path.join(f.root, 'shallow');
    execFileSync('/usr/bin/git', ['clone', '-q', '--depth=2', pathToFileURL(f.root).href, clone]);
    assert.equal(execFileSync('/usr/bin/git', ['rev-parse', '--is-shallow-repository'],
        {cwd: clone, encoding: 'utf8'}).trim(), 'true');
    const result = menuPainterScope(clone, f.context);
    assert.equal(result.selected, false);
    assert.equal(result.reason, 'proven-unrelated');
});


test('Apex and Tempest input changes select only their targeted model', () => {
    for (const [file, model] of [
        ['overlay/scratch-gui/static/sim-lab/models/apex.ldr', 'apex'],
        ['packages/scratch-gui/static/sim-lab/programs/tempest-pendulum.bw', 'tempest'],
        ['scripts/lib/sim-lab-r3-judges.mjs', 'apex'],
        ['scripts/lib/sim-lab-r4-judges.mjs', 'tempest']]) {
        const r = classifyGuestPaths([file]);
        assert.equal(r[model], true);
        assert.equal(r[model === 'apex' ? 'tempest' : 'apex'], false);
        assert.equal(r.selected, false);
    }
});
test('shared robot inputs select both model guests without selecting painter', () => {
    for (const file of ['docs/data/robot-lab-qualification.json',
        'scripts/lib/sim-lab-q5-browser-gate.mjs',
        'overlay/scratch-gui/src/lib/bw-sim/sim-session.js']) {
        const r = classifyGuestPaths([file]);
        assert.equal(r.apex, true);assert.equal(r.tempest, true);assert.equal(r.selected, false);
    }
});
test('unrelated tests and docs skip all guests; unknown executable inputs select conservatively', () => {
    const unrelated = classifyGuestPaths(['test/another-feature.test.mjs', 'docs/another-feature.md']);
    assert.equal(unrelated.selected || unrelated.apex || unrelated.tempest, false);
    const unknown = classifyGuestPaths(['scripts/unclassified-build-input.mjs']);
    assert.equal(unknown.selected && unknown.apex && unknown.tempest, true);
});
