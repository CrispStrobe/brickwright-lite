// The local NQC compiler, driven through the exact entry point the app uses.
//
// This exists because the RCX extension treats the local compiler and the
// hosted service as interchangeable: it calls `runtime.nqcCompile` if it is
// there and falls back to the network if it is not. A local compiler that
// returns the wrong SHAPE therefore does not fail loudly — it makes the app
// quietly slower and dependent on a service, which is the opposite of the
// reason it was vendored. So the contract asserted here is the shape as much
// as the bytes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const fx = name => join(import.meta.dirname, 'fixtures/rcx-images', name);

const {
    compileWithToolchain, loadToolchain, normaliseTarget, isRcxImage,
    NQC_TARGETS, NQC_DEFAULT_TARGET
} = await import('../overlay/scratch-gui/src/lib/nqc-wasm/compiler.js');

// Under Node the loader's own default points at the vendored `dist/`, so this
// drives the shipped entry point with no argument at all — the loading is part
// of what is under test, not scaffolding around it.
const toolchain = await loadToolchain();

test('the toolchain loads from the vendored files, not from a network', async () => {
    assert.equal(typeof toolchain.factory, 'function');
    assert.match(toolchain.resolve('nqc.wasm'), /^file:/);
});

test('a minimal program compiles to an RCXI container', async () => {
    const out = await compileWithToolchain('task main() { OnFwd(OUT_A); }', 'RCX2', toolchain);
    assert.equal(out.ok, true, out.log);
    assert.ok(isRcxImage(out.bytes), 'output must begin with the RCXI magic');
    assert.equal(out.target, 'RCX2');
});

test('the compiler is byte-identical to the one the fixtures came from', async () => {
    // The fixtures under test/fixtures/rcx-images were produced by the NATIVE
    // nqc binary. If the WASM build disagreed with it by a single byte, every
    // claim docs/RCX-IR-PROTOCOL.md makes about the container would be about a
    // different compiler than the one that ships. That is the property here —
    // not "it compiles", but "it compiles to the same thing".
    for (const name of ['a', 'b', 'c', 'd', 'e', 't', 'gen', 'mine-native']) {
        const source = readFileSync(fx(`${name}.nqc`), 'utf8');
        const expected = new Uint8Array(readFileSync(fx(`${name}.rcx`)));
        const out = await compileWithToolchain(source, 'RCX2', toolchain);
        assert.equal(out.ok, true, `${name}.nqc: ${out.log}`);
        assert.deepEqual(out.bytes, expected, `${name}.rcx differs from the native build`);
    }
});

test('a broken program fails with the compiler\'s own diagnosis, not a generic message', async () => {
    const out = await compileWithToolchain('task main() { bogus(); }', 'RCX2', toolchain);
    assert.equal(out.ok, false);
    assert.equal(out.bytes, undefined);
    // The user has to be able to find the line. A wrapper that swallowed this
    // and said "compilation failed" would be worse than no local compiler.
    assert.match(out.log, /undefined function 'bogus'/);
    assert.match(out.log, /line 1/);
});

test('a failed compile does not leave the host process marked as failed', () => {
    // Emscripten's `quit_` is captured before Module options are read, so a
    // nonzero exit sets process.exitCode on the HOST. Under `node --test` that
    // turns an all-green file red if the last thing it compiled was something
    // it meant to fail — which is exactly what the test above does. The
    // wrapper restores it; this asserts that it did.
    assert.ok(!process.exitCode, `process.exitCode leaked: ${process.exitCode}`);
});

test('an unknown target is refused by name rather than passed to the compiler', async () => {
    const out = await compileWithToolchain('task main() {}', 'NXT', toolchain);
    assert.equal(out.ok, false);
    assert.match(out.log, /unknown NQC target "NXT"/);
    assert.match(out.log, /RCX, RCX2, CM, Scout, Spy, Swan/);
});

test('empty source is refused without starting the compiler', async () => {
    for (const source of ['', '   \n', null]) {
        const out = await compileWithToolchain(source, 'RCX2', toolchain);
        assert.equal(out.ok, false);
        assert.match(out.log, /no NQC source/);
    }
});

test('targets are matched case-insensitively and default to RCX2', () => {
    assert.equal(normaliseTarget('rcx2'), 'RCX2');
    assert.equal(normaliseTarget('SCOUT'), 'Scout');
    assert.equal(normaliseTarget(''), NQC_DEFAULT_TARGET);
    assert.equal(normaliseTarget(undefined), NQC_DEFAULT_TARGET);
    assert.equal(normaliseTarget('nxt'), null);
    assert.equal(NQC_TARGETS.includes(NQC_DEFAULT_TARGET), true);
});

test('RCX and RCX2 produce different images, so -T is not being ignored', async () => {
    const source = 'task main() { OnFwd(OUT_A); }';
    const one = await compileWithToolchain(source, 'RCX', toolchain);
    const two = await compileWithToolchain(source, 'RCX2', toolchain);
    assert.equal(one.ok, true, one.log);
    assert.equal(two.ok, true, two.log);
    // The target word is at offset 10 of the container; if the flag were
    // dropped, both would carry the same one and every claim about targeting
    // would be vacuous.
    assert.notDeepEqual(one.bytes.slice(10, 12), two.bytes.slice(10, 12));
});

test('isRcxImage rejects anything that is not a container', () => {
    assert.equal(isRcxImage(new Uint8Array([0x52, 0x43, 0x58, 0x49])), true);
    assert.equal(isRcxImage(new Uint8Array([0x52, 0x43, 0x58])), false);
    assert.equal(isRcxImage(new Uint8Array([0, 0, 0, 0])), false);
    assert.equal(isRcxImage(Buffer.from('RCXI')), true, 'a Buffer is a Uint8Array');
    assert.equal(isRcxImage('RCXI'), false, 'a string is not an image');
    assert.equal(isRcxImage(null), false);
});

// THE HOOK, which is the part that actually reaches the extension.
//
// Everything above tests a compiler. This tests the promise made to a caller
// that will never import it: the RCX extension reads `runtime.nqcCompile` and
// falls back to a network service when it is missing or wrong, silently. A
// broken hook therefore costs latency and offline support, not an error, and
// nothing else in the suite would notice.
const {installNqcCompiler} = await import('../overlay/scratch-gui/src/lib/nqc-runtime-hook.js');

test('the hook installs on a VM and compiles through the runtime', async () => {
    const vm = {runtime: {}};
    assert.equal(installNqcCompiler(vm), true);
    assert.equal(typeof vm.runtime.nqcCompile, 'function');
    const out = await vm.runtime.nqcCompile('task main() { OnFwd(OUT_A); }', 'RCX2');
    assert.equal(out.ok, true, out.log);
    assert.ok(isRcxImage(out.bytes));
});

test('the hook never overwrites a compiler the host already supplied', () => {
    const mine = () => ({ok: false});
    const vm = {runtime: {nqcCompile: mine}};
    assert.equal(installNqcCompiler(vm), false);
    assert.equal(vm.runtime.nqcCompile, mine, 'a host-supplied compiler must win');
});

test('the hook refuses rather than throws when there is no runtime', () => {
    assert.equal(installNqcCompiler(null), false);
    assert.equal(installNqcCompiler({}), false);
});

test('a failing compile through the hook keeps the {ok, log} shape', async () => {
    const vm = {runtime: {}};
    installNqcCompiler(vm);
    const out = await vm.runtime.nqcCompile('task main() { bogus(); }', 'RCX2');
    assert.equal(out.ok, false);
    assert.equal(typeof out.log, 'string');
    assert.match(out.log, /bogus/);
});

test('no webpack asset syntax reaches the bundle from a Node-only branch', async () => {
    // `new URL('<literal>', import.meta.url)` is resolved by webpack at build
    // time and emitted as an asset. It is not an import and nothing in this
    // suite executes it as one, so a Node-only fallback written that way looks
    // fine here and fails the EDITOR build — which is exactly what happened:
    // `.../nqc-wasm/dist/index.js doesn't exist`, for a branch the browser
    // never takes. Two hours of CI to learn it, and one assertion to keep it.
    const {readFile} = await import('node:fs/promises');
    const source = await readFile(
        new URL('../overlay/scratch-gui/src/lib/nqc-wasm/compiler.js', import.meta.url), 'utf8');
    // Comments here are prose ABOUT the shape as often as instances of it —
    // the paragraph in compiler.js explaining this trap is itself an example —
    // so they are blanked before matching, the same way
    // scripts/audit-gate-shapes.mjs does it and for the same reason: a
    // detector that flags the documentation of a defect is noise.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const sites = [...code.matchAll(/new URL\(\s*['"`][^'"`]*['"`]\s*,\s*import\.meta\.url/g)];
    assert.deepEqual(sites.map(m => m[0]), [],
        'a literal first argument makes webpack resolve and emit this path at build time');
});
