import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
        'a new workflow needs a branch dispatch before the CI census can judge it');
    assert.doesNotMatch(workflow, /push:\s*\n\s+branches:/,
        'a new workflow absent from default cannot be dispatched; its path-filtered branch push must bootstrap the first run');
    assert.match(workflow, /dtolnay\/rust-toolchain@[0-9a-f]{40}/,
        'Cargo must come from an explicitly pinned Rust-toolchain action, not runner ambience');
    assert.match(workflow, /run: npm run gen:notices:check/,
        'the dedicated workflow must execute the live locked-metadata check');
});
