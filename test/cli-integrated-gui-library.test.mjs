import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {integratedGuiLibrary} from '../scripts/lib/integrated-gui-library.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const MODEL = 'src/util/bw-procedure-constraint-model.js';
function fixture () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-gui-boundary-'));
    const gui = path.join(root, 'packages/scratch-gui'), vm = path.join(gui, 'node_modules/scratch-vm');
    const put = (rel, bytes) => {const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, bytes);};
    put('packages/scratch-gui/package.json', JSON.stringify({name: 'scratch-gui', version: '4.1.7', type: 'module', dependencies: {'scratch-vm': '4.8.115'}}));
    put('packages/scratch-gui/node_modules/scratch-vm/package.json', JSON.stringify({name: 'scratch-vm', version: '4.8.115', exports: {'.': './index.js', [`./${MODEL}`]: `./${MODEL}`}}));
    const model = 'module.exports = {token: {}};\n';
    put(`overlay/scratch-vm/${MODEL}`, model); put(`packages/scratch-gui/node_modules/scratch-vm/${MODEL}`, model);
    const consumer = "import model from 'scratch-vm/src/util/bw-procedure-constraint-model.js'; export default model;\n";
    put('overlay/scratch-gui/src/lib/consumer.js', consumer); put('packages/scratch-gui/src/lib/consumer.js', consumer);
    return {root, gui, vm, put, boundary: integratedGuiLibrary(root), close: () => fs.rmSync(root, {recursive: true, force: true})};
}
const refuses = (f, pattern) => assert.throws(f, e => e.code === 'NO_RUNTIME' &&
    e.prerequisite === 'CLI_INTEGRATED_GUI_REQUIRED' && pattern.test(e.cause?.message));

test('plain Node integrated import and actual GUI consumer share the normal physical canonical model', async () => {
    const f = fixture(); try {
        const state = f.boundary.inspect();
        assert.equal(state.model, fs.realpathSync(path.join(f.vm, MODEL)));
        const throughCLI = await f.boundary.import('consumer.js');
        const throughGUI = await import(pathToFileURL(path.join(f.gui, 'src/lib/consumer.js')).href);
        assert.equal(throughCLI.default, throughGUI.default);
        assert.equal(throughCLI.default.token, throughGUI.default.token);
    } finally {f.close();}
});
test('an ordinary subprocess resolves the same package without loader or module-path flags', () => {
    const f = fixture(); try {
        const helper = pathToFileURL(path.join(ROOT, 'scripts/lib/integrated-gui-library.mjs')).href;
        const code = `import {integratedGuiLibrary} from ${JSON.stringify(helper)}; const b=integratedGuiLibrary(${JSON.stringify(f.root)}); const m=await b.import('consumer.js'); console.log(JSON.stringify({model:b.inspect().model,token:typeof m.default.token}));`;
        const env = {PATH: process.env.PATH, HOME: f.root};
        const actual = spawnSync(process.execPath, ['--input-type=module', '-e', code], {env, encoding: 'utf8', timeout: 5000});
        assert.equal(actual.status, 0, actual.stderr);
        assert.deepEqual(JSON.parse(actual.stdout), {model: path.join(f.vm, MODEL), token: 'object'});
    } finally {f.close();}
});
test('missing installed dependencies refuse instead of substituting the owned overlay', () => {
    const f = fixture(); try {fs.rmSync(path.join(f.gui, 'node_modules'), {recursive: true}); refuses(() => f.boundary.inspect(), /Cannot find module/);} finally {f.close();}
});
test('a missing canonical export retains the original normal-resolution failure', () => {
    const f = fixture(); try {const p = path.join(f.vm, 'package.json'), pkg = JSON.parse(fs.readFileSync(p)); delete pkg.exports[`./${MODEL}`]; fs.writeFileSync(p, JSON.stringify(pkg)); refuses(() => f.boundary.inspect(), /not defined by "exports"/);} finally {f.close();}
});
test('conflicting installed model bytes refuse rather than importing a second model', () => {
    const f = fixture(); try {fs.appendFileSync(path.join(f.vm, MODEL), '// stale'); refuses(() => f.boundary.inspect(), /model is stale/);} finally {f.close();}
});
test('stale integrated libraries refuse before their executable body runs', async () => {
    const f = fixture(); try {
        fs.writeFileSync(path.join(f.gui, 'src/lib/consumer.js'), 'throw new Error("BODY_MUST_NOT_RUN");');
        await assert.rejects(f.boundary.import('consumer.js'), e => e.code === 'NO_RUNTIME' && /stale integrated/.test(e.cause.message));
    } finally {f.close();}
});
test('matching edits to both source copies cannot silently replace an already admitted module', () => {
    const f = fixture(); try {f.boundary.inspect(); for (const rel of ['overlay/scratch-gui/src/lib/consumer.js', 'packages/scratch-gui/src/lib/consumer.js']) fs.appendFileSync(path.join(f.root, rel), '// edit'); refuses(() => f.boundary.inspect(), /changed during/);} finally {f.close();}
});
test('known generated files outside verbatim lib copy do not need unrelated overlay hashes or a frontend build', () => {
    const f = fixture(); try {f.put('packages/scratch-gui/src/generated/microbit-hex-url.cjs', "module.exports = '';\n"); assert.equal(f.boundary.inspect().vmVersion, '4.8.115'); assert.equal(fs.existsSync(path.join(f.gui, 'build')), false);} finally {f.close();}
});
test('wrong package declaration and redirected owned sources refuse', () => {
    for (const mode of ['version', 'symlink']) {
        const f = fixture(); try {
            if (mode === 'version') {const p = path.join(f.gui, 'package.json'), pkg = JSON.parse(fs.readFileSync(p)); pkg.dependencies['scratch-vm'] = '*'; fs.writeFileSync(p, JSON.stringify(pkg));}
            else {const p = path.join(f.gui, 'src/lib/consumer.js'); fs.unlinkSync(p); fs.symlinkSync(path.join(f.root, 'overlay/scratch-gui/src/lib/consumer.js'), p);}
            refuses(() => f.boundary.inspect(), mode === 'version' ? /declaration differs/ : /redirected/);
        } finally {f.close();}
    }
});
test('owned path boundary rejects escapes and unowned package modules', async () => {
    const f = fixture(); try {for (const name of ['../consumer.js', '/consumer.js', 'other.js']) await assert.rejects(f.boundary.import(name), e => e.code === 'NO_RUNTIME');} finally {f.close();}
});
test('exact overlay model exception is reserved for genuine no-dependencies mode', () => {
    for (const installed of [false, true]) {
        const f = fixture(); try {
            if (!installed) fs.rmSync(path.join(f.gui, 'node_modules'), {recursive: true});
            const hook = pathToFileURL(path.join(ROOT, 'scripts/lib/gui-scope-hooks.mjs')).href;
            const importer = pathToFileURL(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-export.js')).href;
            const code = `import {resolve} from ${JSON.stringify(hook)}; const calls=[]; await resolve('scratch-vm/${MODEL}', {parentURL:${JSON.stringify(importer)}}, async(s,c)=>{calls.push(s);return {url:s};}); console.log(JSON.stringify(calls));`;
            const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {env: {PATH: process.env.PATH, BW_INTEGRATED_ROOT: f.gui}, encoding: 'utf8', timeout: 5000});
            assert.equal(r.status, 0, r.stderr);
            const calls = JSON.parse(r.stdout);
            assert.deepEqual(calls, [installed ? `scratch-vm/${MODEL}` : pathToFileURL(path.join(ROOT, 'overlay/scratch-vm', MODEL)).href]);
        } finally {f.close();}
    }
});

test('nested owned library names use portable forward slashes for CLI imports', async () => {
    const f = fixture(); try {
        const source = 'export const nested = 17;\n';
        f.put('overlay/scratch-gui/src/lib/deep/nested.js', source);
        f.put('packages/scratch-gui/src/lib/deep/nested.js', source);
        assert.ok(f.boundary.inspect().libraryHashes.some(([rel]) => rel === 'deep/nested.js'));
        assert.equal((await f.boundary.import('deep/nested.js')).nested, 17);
    } finally {f.close();}
});

test('redirecting the entire integrated library directory is refused', () => {
    const f = fixture(); try {
        const lib = path.join(f.gui, 'src/lib');
        fs.rmSync(lib, {recursive: true});
        fs.symlinkSync(path.join(f.root, 'overlay/scratch-gui/src/lib'), lib, 'dir');
        refuses(() => f.boundary.inspect(), /source directory is redirected/);
    } finally {f.close();}
});
test('module evaluation cannot return after replacing both admitted source copies', async () => {
    const f = fixture(); try {
        const paths = ['overlay/scratch-gui/src/lib/mutate.js', 'packages/scratch-gui/src/lib/mutate.js'].map(p => path.join(f.root, p));
        const code = `import fs from 'node:fs'; await Promise.resolve(); for(const p of ${JSON.stringify(paths)}) fs.appendFileSync(p, '// changed'); export const value=19;`;
        for (const p of paths) fs.writeFileSync(p, code);
        await assert.rejects(f.boundary.import('mutate.js'), e => e.code === 'NO_RUNTIME' && /changed during/.test(e.cause.message));
    } finally {f.close();}
});
test('an expired source admission retains a simultaneous original evaluation exception', async () => {
    const f = fixture(); try {
        const paths = ['overlay/scratch-gui/src/lib/mutate.js', 'packages/scratch-gui/src/lib/mutate.js'].map(p => path.join(f.root, p));
        const code = `import fs from 'node:fs'; await Promise.resolve(); for(const p of ${JSON.stringify(paths)}) fs.appendFileSync(p, '// changed'); throw new Error('ORIGINAL_EVALUATION_FAILURE');`;
        for (const p of paths) fs.writeFileSync(p, code);
        await assert.rejects(f.boundary.import('mutate.js'), e => e.code === 'NO_RUNTIME' && /changed during/.test(e.cause.message) && e.importError?.message === 'ORIGINAL_EVALUATION_FAILURE');
    } finally {f.close();}
});

test('mutating a returned inspection record cannot renew the private source admission', () => {
    const f = fixture(); try {
        const returned = f.boundary.inspect();
        const code = fs.readFileSync(path.join(f.root, 'overlay/scratch-gui/src/lib/consumer.js'), 'utf8') + '// replacement';
        for (const rel of ['overlay/scratch-gui/src/lib/consumer.js', 'packages/scratch-gui/src/lib/consumer.js']) fs.writeFileSync(path.join(f.root, rel), code);
        returned.libraryHashes.find(([rel]) => rel === 'consumer.js')[1] = createHash('sha256').update(code).digest('hex');
        returned.guiVersion = 'forged';
        refuses(() => f.boundary.inspect(), /changed during/);
    } finally {f.close();}
});

test('falsy module evaluation rejections retain their actual value', async () => {
    for (const value of ['undefined', 'null', '0', 'false', "''"]) {
        const f = fixture(); try {
            const code = `await Promise.resolve(); throw ${value};`;
            for (const rel of ['overlay/scratch-gui/src/lib/reject.js', 'packages/scratch-gui/src/lib/reject.js']) f.put(rel, code);
            let rejected = false, actual;
            try {await f.boundary.import('reject.js');} catch (error) {rejected = true; actual = error;}
            assert.equal(rejected, true);
            const expected = value === 'undefined' ? undefined : value === 'null' ? null : value === '0' ? 0 : value === 'false' ? false : '';
            assert.equal(actual, expected);
        } finally {f.close();}
    }
});
test('source expiration also retains a present undefined module rejection', async () => {
    const f = fixture(); try {
        const paths = ['overlay/scratch-gui/src/lib/reject.js', 'packages/scratch-gui/src/lib/reject.js'].map(p => path.join(f.root, p));
        const code = `import fs from 'node:fs'; await Promise.resolve(); for(const p of ${JSON.stringify(paths)}) fs.appendFileSync(p, '// changed'); throw undefined;`;
        for (const p of paths) fs.writeFileSync(p, code);
        await assert.rejects(f.boundary.import('reject.js'), e => e.code === 'NO_RUNTIME' && /changed during/.test(e.cause.message) && e.importRejected === true && Object.hasOwn(e, 'importError') && e.importError === undefined);
    } finally {f.close();}
});
