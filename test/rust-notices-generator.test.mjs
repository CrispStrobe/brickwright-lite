import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
    BEGIN_MARKER,
    END_MARKER,
    CARGO_METADATA_ARGS,
    main,
    noticesAreCurrent,
    readCargoMetadata,
    renderRustNotices,
    rustCrateBody
} from '../scripts/gen-rust-notices.mjs';
import {quietConsole} from './helpers/quiet-console.mjs';

const packages = [
    {name: 'zeta', version: '2.0.0', license: 'BSD-2-Clause', repository: 'https://example.test/zeta'},
    {name: 'alpha', version: '1.2.3', license: 'MIT', homepage: 'https://example.test/alpha'},
    {name: 'brickwright-tauri', version: '0.1.0', license: 'BSD-3-Clause'},
    {name: 'alpha', version: '1.2.3', license: 'MIT', homepage: 'https://example.test/duplicate'}
];

const sentinel = '## HAND-MAINTAINED AFTER\n\nSENTINEL: must survive byte for byte.\n';
const shell = body => `BEFORE: hand maintained.\n${BEGIN_MARKER}\n\n${body}\n\n${END_MARKER}\n\n${sentinel}`;
const canonical = shell(rustCrateBody(packages));
const workflow = readFileSync(new URL('../.github/workflows/rust-notices.yml', import.meta.url), 'utf8');

const WATCHED_INPUTS = [
    '.github/workflows/rust-notices.yml',
    'THIRD-PARTY-NOTICES.md',
    'scripts/gen-rust-notices.mjs',
    'test/rust-notices-generator.test.mjs',
    'test/helpers/quiet-console.mjs',
    'package.json',
    'apps/tauri/src-tauri/Cargo.lock',
    'apps/tauri/src-tauri/**/Cargo.toml'
];
// The qualified pre-repair permissions/concurrency/jobs block is held verbatim.
// A later action, command or resource change requires explicit source review.
const HELD_RUNTIME_SHA256 = '70f32835df8bc9a8fce512359a29796433a42e469549c96ab5c19b27a95d4ae4';

// Parse only this workflow's three-event, string-list header. Unknown or
// ambiguous forms refuse; this is deliberately not a general YAML parser.
const readNoticesTriggers = source => {
    assert.ok(source.startsWith('name: Rust notices\n\non:\n'));
    assert.equal((source.match(/^on:$/gm) || []).length, 1);
    const start = source.indexOf('\non:\n') + '\non:\n'.length;
    const end = source.indexOf('\npermissions:', start);
    assert.ok(end > start);
    const events = {};
    let current = null;
    let field = null;
    for (const line of source.slice(start, end).split('\n')) {
        if (!line.trim() || /^\s*#/.test(line)) continue;
        let match = line.match(/^  ([a-z_]+):$/);
        if (match) {
            assert.ok(['workflow_dispatch', 'push', 'pull_request'].includes(match[1]));
            assert.ok(!Object.hasOwn(events, match[1]), 'unique event');
            current = events[match[1]] = {};
            field = null;
            continue;
        }
        match = line.match(/^    ([a-z-]+):(?: \[(.*)\])?$/);
        if (match) {
            assert.ok(current && ['paths', 'branches'].includes(match[1]));
            assert.ok(!Object.hasOwn(current, match[1]), 'unique event filter');
            current[match[1]] = [];
            field = match[2] === undefined ? match[1] : null;
            if (match[2]) {
                current[match[1]] = match[2].split(',').map(value => {
                    const token = value.trim();
                    assert.match(token, /^(?:[A-Za-z][\w-]*|'[^']*'|"[^"]*")$/);
                    return /^['"]/.test(token) ? token.slice(1, -1) : token;
                });
            }
            continue;
        }
        match = line.match(/^      - '([^']+)'$/);
        assert.ok(match && current && field, 'known string-list trigger shape');
        current[field].push(match[1]);
    }
    return events;
};

const noticesPathMatches = (pattern, path) => pattern === 'apps/tauri/src-tauri/**/Cargo.toml' ?
    /^apps\/tauri\/src-tauri\/(?:[^/]+\/)*Cargo\.toml$/.test(path) : pattern === path;

const noticesSelected = (events, event) => {
    const trigger = events[event.name];
    if (!trigger) return false;
    if (event.name === 'workflow_dispatch') return true;
    if (event.name === 'push') {
        // With only a branch filter, tag pushes are excluded. The historical
        // path-only header admitted tags without evaluating path filters.
        if (event.refType === 'tag') return trigger.branches === undefined;
        if (trigger.branches && !trigger.branches.some(branch => branch === '**' || branch === event.branch)) return false;
    }
    return event.changed.some(path => trigger.paths.some(pattern => noticesPathMatches(pattern, path)));
};

const assertNoticesContract = source => {
    const events = readNoticesTriggers(source);
    assert.deepEqual(Object.keys(events), ['workflow_dispatch', 'push', 'pull_request']);
    assert.deepEqual(events.workflow_dispatch, {});
    assert.deepEqual(Object.keys(events.push), ['branches', 'paths']);
    assert.deepEqual(events.push.branches, ['main']);
    assert.deepEqual(events.push.paths, WATCHED_INPUTS);
    assert.deepEqual(events.pull_request, {paths: WATCHED_INPUTS});
    const runtime = source.slice(source.indexOf('permissions:'));
    assert.equal(createHash('sha256').update(runtime).digest('hex'), HELD_RUNTIME_SHA256,
        'permissions, concurrency, jobs, action pins, commands and five-minute bound are byte-held');
    return events;
};

const concreteNoticesInputs = [...WATCHED_INPUTS.slice(0, -1),
    'apps/tauri/src-tauri/Cargo.toml', 'apps/tauri/src-tauri/plugins/example/Cargo.toml'];
const assertNoticesCoverage = (source, select = noticesSelected) => {
    const events = assertNoticesContract(source);
    for (const path of concreteNoticesInputs) {
        const changed = [path];
        assert.equal(select(events, {name: 'push', branch: 'lane/package-adoption', changed}), false, path);
        assert.equal(select(events, {name: 'pull_request', branch: 'lane/package-adoption', changed}), true, path);
        assert.equal(select(events, {name: 'push', branch: 'main', changed}), true, path);
    }
    for (const name of ['push', 'pull_request']) {
        assert.equal(select(events, {name, branch: 'main', changed: ['docs/unrelated.md']}), false);
    }
    for (const ref of ['v1.2.3', 'bw-gui-hdd-actual-v8-' + 'a'.repeat(40)]) {
        assert.equal(select(events, {name: 'push', refType: 'tag', ref, changed: concreteNoticesInputs}), false);
    }
    assert.equal(select(events, {name: 'workflow_dispatch', changed: []}), true);
};

const assertNoticesDedup = (source, oldSource, select = noticesSelected) => {
    const events = assertNoticesContract(source);
    const oldEvents = readNoticesTriggers(oldSource);
    for (const path of concreteNoticesInputs) {
        const candidates = ['push', 'pull_request'].map(name =>
            ({name, branch: 'lane/package-adoption', changed: [path]}));
        assert.deepEqual(candidates.filter(event => select(oldEvents, event)).map(event => event.name),
            ['push', 'pull_request'], 'old source reproduces the duplicate automatic routes');
        assert.deepEqual(candidates.filter(event => select(events, event)).map(event => event.name),
            ['pull_request'], 'new source retains exactly the PR route');
    }
};

const captureMain = (argv, io) => {
    const quiet = quietConsole(['log', 'info', 'debug', 'warn', 'error']);
    try {
        return {code: main(argv, io), lines: quiet.lines};
    } finally {
        quiet.restore();
    }
};

const run = (doc, metadataPackages = packages, argv = ['--check']) => {
    let written = null;
    const result = captureMain(argv, {
        readFileSync: () => doc,
        writeFileSync: (_path, text) => { written = text; },
        readCargoMetadata: () => ({packages: metadataPackages})
    });
    return {...result, written};
};

test('cargo metadata is locked and its complete argument vector is deliberate', () => {
    let call = null;
    const metadata = readCargoMetadata((command, args, options) => {
        call = {command, args, options};
        return JSON.stringify({packages});
    });
    assert.deepEqual(CARGO_METADATA_ARGS, ['metadata', '--locked', '--format-version=1']);
    assert.equal(call.command, 'cargo');
    assert.deepEqual(call.args, CARGO_METADATA_ARGS);
    assert.match(call.options.cwd, /apps\/tauri\/src-tauri$/);
    assert.deepEqual(metadata.packages, packages);
});

test('--check and rewrite use the same rendering result', () => {
    assert.equal(noticesAreCurrent(canonical, packages), true);
    const current = run(canonical);
    assert.equal(current.code, 0);
    assert.equal(current.written, null);
    assert.deepEqual(current.lines, [['log', 'gen-rust-notices: Rust crate table is current']]);

    const stale = shell('- stale 0.0.0 (UNKNOWN)');
    const checked = run(stale);
    const rewritten = run(stale, packages, []);
    assert.equal(checked.code, 1);
    assert.equal(checked.written, null, '--check must never repair the file it judges');
    assert.deepEqual(checked.lines, [[
        'error',
        'THIRD-PARTY-NOTICES.md Rust crate table is stale; run npm run gen:notices'
    ]]);
    assert.equal(rewritten.code, 0);
    assert.equal(rewritten.written, canonical);
    assert.deepEqual(rewritten.lines, [[
        'log',
        'gen-rust-notices: wrote 2 crates to THIRD-PARTY-NOTICES.md'
    ]]);
});

test('a version mutation is stale', () => {
    const mutant = canonical.replace('alpha 1.2.3', 'alpha 9.9.9');
    assert.equal(run(mutant).code, 1);
});

test('a licence mutation is stale', () => {
    const mutant = canonical.replace('alpha 1.2.3 (MIT)', 'alpha 1.2.3 (GPL-3.0-only)');
    assert.equal(run(mutant).code, 1);
});

test('a removed crate is stale', () => {
    const mutant = canonical.replace(/- alpha 1\.2\.3[^\n]*\n/, '');
    assert.equal(run(mutant).code, 1);
});

test('a crate added to metadata is stale', () => {
    const added = [...packages, {name: 'gamma', version: '4.5.6', license: 'ISC'}];
    assert.equal(run(canonical, added).code, 1);
});

test('a missing, duplicated, or reversed END marker refuses instead of widening the write', () => {
    assert.throws(() => renderRustNotices(canonical.replace(END_MARKER, ''), packages), /END marker/);
    assert.throws(() => renderRustNotices(canonical.replace(END_MARKER, `${END_MARKER}\n${END_MARKER}`), packages), /END marker is duplicated/);
    assert.throws(() => renderRustNotices(`${END_MARKER}\n${canonical}`, packages), /END marker is duplicated|precedes/);
});

test('rewrite preserves every byte after END, including an adversarial sentinel', () => {
    const stale = shell('- stale 0.0.0 (UNKNOWN)');
    const rendered = renderRustNotices(stale, packages);
    const oldTail = stale.slice(stale.indexOf(END_MARKER));
    const newTail = rendered.slice(rendered.indexOf(END_MARKER));
    assert.equal(newTail, oldTail);
    assert.match(newTail, /SENTINEL: must survive byte for byte\./);
});

test('unknown and duplicate CLI flags refuse without reading metadata', () => {
    let read = false;
    const io = {readCargoMetadata: () => { read = true; return {packages}; }};
    const unknown = captureMain(['--write'], io);
    const duplicate = captureMain(['--check', '--check'], io);
    assert.equal(unknown.code, 2);
    assert.equal(duplicate.code, 2);
    assert.deepEqual(unknown.lines, [['error', 'usage: node scripts/gen-rust-notices.mjs [--check]']]);
    assert.deepEqual(duplicate.lines, [['error', 'usage: node scripts/gen-rust-notices.mjs [--check]']]);
    assert.equal(read, false);
});

test('the dedicated workflow installs Rust and watches every notices input', () => {
    for (const input of [
        '.github/workflows/rust-notices.yml',
        'THIRD-PARTY-NOTICES.md',
        'scripts/gen-rust-notices.mjs',
        'test/rust-notices-generator.test.mjs',
        'test/helpers/quiet-console.mjs',
        'package.json',
        'apps/tauri/src-tauri/Cargo.lock',
        'apps/tauri/src-tauri/**/Cargo.toml'
    ]) {
        assert.equal(workflow.split(`- '${input}'`).length - 1, 2,
            `${input} must trigger both push and pull-request Rust-notices runs`);
    }
    assert.match(workflow, /workflow_dispatch:/,
        'the registered manual source check remains available');
    assertNoticesContract(workflow);
    assert.match(workflow, /group: rust-notices-\$\{\{ github\.head_ref \|\| github\.ref_name \}\}/,
        'branch-push and pull-request runs must share one cancellation group');
    assert.match(workflow, /cancel-in-progress: true/,
        'a superseded notices-only run must not consume another runner slot');
    assert.match(workflow, /timeout-minutes: 5/,
        'the focused metadata check must retain its bounded five-minute ceiling');
    assert.match(workflow, /dtolnay\/rust-toolchain@[0-9a-f]{40}/,
        'Cargo must come from an explicitly pinned Rust-toolchain action, not runner ambience');
    assert.match(workflow, /run: npm run gen:notices:check/,
        'the dedicated workflow must execute the live locked-metadata check');
});


test('notices source keeps main, PR, nested Cargo and manual coverage without duplicate feature pushes', () => {
    assertNoticesCoverage(workflow);
    const oldSource = workflow.replace('    branches: [main]\n', '');
    assert.notEqual(oldSource, workflow);
    assertNoticesDedup(workflow, oldSource);
});

test('notices trigger and held-runtime mutations refuse without losing required coverage', () => {
    const pr = workflow.slice(workflow.indexOf('  pull_request:'), workflow.indexOf('\npermissions:'));
    const mutations = [
        ['old bootstrap', workflow.replace('    branches: [main]\n', '')],
        ['wildcard branch', workflow.replace('branches: [main]', "branches: ['**']")],
        ['wrong branch', workflow.replace('branches: [main]', 'branches: [develop]')],
        ['missing main', workflow.replace('branches: [main]', 'branches: []')],
        ['missing PR', workflow.replace(pr, '')],
        ['missing manual', workflow.replace('  workflow_dispatch:\n', '')],
        ['duplicate branch field', workflow.replace('    branches: [main]\n', '    branches: [main]\n    branches: [main]\n')],
        ['changed action pin', workflow.replace('11d5960a326750d5838078e36cf38b85af677262', '0'.repeat(40))],
        ['changed resource bound', workflow.replace('timeout-minutes: 5', 'timeout-minutes: 6')]
    ];
    for (const path of WATCHED_INPUTS) {
        const line = `      - '${path}'\n`;
        mutations.push(['missing push input ' + path, workflow.replace(line, '')]);
        mutations.push(['missing PR input ' + path, workflow.replace(pr, pr.replace(line, ''))]);
    }
    for (const [reason, source] of mutations) {
        assert.notEqual(source, workflow, reason);
        assert.throws(() => assertNoticesCoverage(source), undefined, reason);
    }
});

test('canned event verdicts cannot satisfy the source-driven coverage and old-header counterfactual', () => {
    for (const select of [() => true, () => false, (_events, event) => event.name === 'pull_request']) {
        assert.throws(() => assertNoticesCoverage(workflow, select));
    }
    const oldSource = workflow.replace('    branches: [main]\n', '');
    const prOnly = (_events, event) => event.name === 'pull_request';
    assert.throws(() => assertNoticesDedup(workflow, oldSource, prOnly),
        /old source reproduces the duplicate automatic routes/);
});
