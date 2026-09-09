import test from 'node:test';
import assert from 'node:assert/strict';
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

const packages = [
    {name: 'zeta', version: '2.0.0', license: 'BSD-2-Clause', repository: 'https://example.test/zeta'},
    {name: 'alpha', version: '1.2.3', license: 'MIT', homepage: 'https://example.test/alpha'},
    {name: 'brickwright-tauri', version: '0.1.0', license: 'BSD-3-Clause'},
    {name: 'alpha', version: '1.2.3', license: 'MIT', homepage: 'https://example.test/duplicate'}
];

const sentinel = '## HAND-MAINTAINED AFTER\n\nSENTINEL: must survive byte for byte.\n';
const shell = body => `BEFORE: hand maintained.\n${BEGIN_MARKER}\n\n${body}\n\n${END_MARKER}\n\n${sentinel}`;
const canonical = shell(rustCrateBody(packages));

const run = (doc, metadataPackages = packages, argv = ['--check']) => {
    let written = null;
    const code = main(argv, {
        readFileSync: () => doc,
        writeFileSync: (_path, text) => { written = text; },
        readCargoMetadata: () => ({packages: metadataPackages})
    });
    return {code, written};
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
    assert.deepEqual(run(canonical), {code: 0, written: null});

    const stale = shell('- stale 0.0.0 (UNKNOWN)');
    const checked = run(stale);
    const rewritten = run(stale, packages, []);
    assert.equal(checked.code, 1);
    assert.equal(checked.written, null, '--check must never repair the file it judges');
    assert.equal(rewritten.code, 0);
    assert.equal(rewritten.written, canonical);
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
    assert.equal(main(['--write'], io), 2);
    assert.equal(main(['--check', '--check'], io), 2);
    assert.equal(read, false);
});
