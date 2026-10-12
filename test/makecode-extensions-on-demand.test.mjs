// On-demand MakeCode extensions (extension-fetch.js): a project's github:
// dependency that this build does not vendor is fetched from GitHub and handed
// to MakeCode's compiler for that compile only. Here GitHub is a fake that
// serves real extension sources under repositories the build does not carry,
// and the compile runs in MakeCode's real worker, in a vm with no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = path.join(ROOT, 'packages/scratch-gui/static/makecode');
const LIB = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode');
const {VENDORED_EXTENSIONS} = await import(path.join(LIB, 'extensions-vendored.js'));
const {PXT_GLUE_JS, MICROBIT_DEFAULT_DEPENDENCIES, EXTENSION_TABLE, onDemandExtensions} = await import(path.join(LIB, 'pxt-runtime.js'));
const {fetchMakeCodeExtensions, parseGithubSpec, unresolvedGithubDependencies, RAW_BASE} = await import(path.join(LIB, 'extension-fetch.js'));

globalThis.fetch = async url => { throw new Error(`network used in an offline test: ${url}`); };
const SYNCED = fs.existsSync(path.join(STATIC, 'microbit/pxtworker.js'));
const skip = SYNCED ? false : 'MakeCode runtime not synced (npm run sync:makecode) — pxt compiler absent';

// The kitronik motor driver's real sources, published under a name this build
// does not vendor; its LICENSE as it ships.
const kitronik = VENDORED_EXTENSIONS.find(e => e.id === 'pxt-kitronik-motor-driver');
const turtle = VENDORED_EXTENSIONS.find(e => e.id === 'microturtle');
/** A fake raw.githubusercontent.com: {'owner/repo/ref/file': text}. */
const fakeGithub = (repos, calls = []) => async url => {
    calls.push(url);
    assert.ok(url.startsWith(RAW_BASE), `fetched outside GitHub raw: ${url}`);
    const body = repos[url.slice(RAW_BASE.length)];
    return body === undefined ? {ok: false, status: 404, text: async () => ''} : {ok: true, status: 200, text: async () => body};
};
const publish = (repo, ref, ext, {licence = ext.licenceText.text, pxtJson} = {}) => {
    const out = {};
    for (const [name, f] of Object.entries(ext.files)) out[`${repo}/${ref}/${name}`] = f.text;
    if (pxtJson) out[`${repo}/${ref}/pxt.json`] = pxtJson;
    if (licence !== null) out[`${repo}/${ref}/LICENSE`] = licence;
    return out;
};

test('github: specs parse; unsafe refs and non-github specs are not fetched', () => {
    assert.deepEqual(parseGithubSpec('github:Example/Motor-Ext#v1.2.0'), {repo: 'example/motor-ext', ref: 'v1.2.0'});
    assert.deepEqual(parseGithubSpec('github:example/motor-ext'), {repo: 'example/motor-ext', ref: ''});
    assert.deepEqual(parseGithubSpec('github:Example/Motor-Ext/#v1.2.0'), {repo: 'example/motor-ext', ref: 'v1.2.0'});
    assert.deepEqual(parseGithubSpec('github:example/motor-ext.git/'), {repo: 'example/motor-ext', ref: ''});
    assert.equal(parseGithubSpec('github:example/motor-ext//#v1.2.0'), null);
    assert.equal(parseGithubSpec('github:example/motor-ext#../../x'), null);
    assert.deepEqual(unresolvedGithubDependencies({core: '*', a: 'github:example/a#v1', [kitronik.id]: kitronik.spec}, 'microbit', EXTENSION_TABLE)
        .map(d => d.id), ['a'], 'core is the target\'s and the vendored pin is served offline');
});

test('an MIT licence is recognised after a copyright line; a permission-free text is not', async () => {
    const {licenceOf} = await import(path.join(LIB, 'extension-licence.js'));
    const mit = turtle.licenceText.text;
    assert.equal(licenceOf(`Copyright (c) Microsoft Corporation\n\nAll rights reserved.\n\n${mit.slice(mit.indexOf('MIT License'))}`), 'MIT');
    assert.equal(licenceOf('MIT License\nCopyright (c) someone. All rights reserved.'), null);
});

test('an extension and its own github: dependency are fetched, with their licences and hashes', async () => {
    const calls = [];
    // The fetched extension depends on another one, not vendored either.
    const cfg = JSON.parse(kitronik.files['pxt.json'].text);
    cfg.dependencies = {...cfg.dependencies, turtle: 'github:example/turtle-copy'};
    const repos = {...publish('example/motor-copy', 'v9', kitronik, {pxtJson: JSON.stringify(cfg)}),
        ...publish('example/turtle-copy', 'HEAD', turtle, {licence: null})};
    const r = await fetchMakeCodeExtensions({dependencies: {motor: 'github:Example/Motor-Copy#v9'}, target: 'microbit',
        table: EXTENSION_TABLE, fetch: fakeGithub(repos, calls)});
    assert.deepEqual(r.refused, []);
    assert.deepEqual(r.extensions.map(e => [e.id, e.repo, e.refs[0]]), [['motor', 'example/motor-copy', 'v9'], ['turtle', 'example/turtle-copy', '']]);
    const [motor, nested] = r.extensions;
    assert.equal(motor.fetched.licence, 'MIT');
    assert.equal(motor.fetched.redistributable, true);
    assert.equal(nested.fetched.licence, null, 'no LICENSE: reported, not guessed');
    assert.equal(nested.fetched.redistributable, false);
    assert.deepEqual(Object.keys(motor.files).sort(), ['README.md', 'motors.ts', 'ns.ts', 'pxt.json']);
    assert.match(motor.fetched.sha256['motors.ts'], /^[0-9a-f]{64}$/);
    assert.ok(calls.every(u => u.startsWith(RAW_BASE + 'example/')), 'only the named repositories were read');
});

test('fetch refusals are named: missing pxt.json, wrong target, unsafe path, size and count limits', async () => {
    const bad = JSON.stringify({name: 'x', files: ['../escape.ts']});
    const arcadeOnly = JSON.stringify({name: 'x', files: [], supportedTargets: ['arcade']});
    const big = JSON.stringify({name: 'x', files: ['big.ts']});
    const repos = {'example/bad/HEAD/pxt.json': bad, 'example/arcade/HEAD/pxt.json': arcadeOnly,
        'example/big/HEAD/pxt.json': big, 'example/big/HEAD/big.ts': 'x'.repeat(2000)};
    const r = await fetchMakeCodeExtensions({dependencies: {gone: 'github:example/gone', bad: 'github:example/bad',
        arcade: 'github:example/arcade', big: 'github:example/big'}, target: 'microbit', table: EXTENSION_TABLE,
        fetch: fakeGithub(repos), limits: {extensions: 8, filesPerExtension: 64, bytesPerExtension: 1000}});
    assert.deepEqual(r.extensions, []);
    const reasons = Object.fromEntries(r.refused.map(x => [x.id, x.reason]));
    assert.match(reasons.gone, /HTTP 404/);
    assert.match(reasons.bad, /outside the extension/);
    assert.match(reasons.arcade, /supports arcade, not microbit/);
    assert.match(reasons.big, /exceed 1000 bytes/);
    const many = Object.fromEntries([1, 2, 3].map(n => [`e${n}`, `github:example/e${n}`]));
    const repos2 = Object.fromEntries([1, 2, 3].map(n => [`example/e${n}/HEAD/pxt.json`, JSON.stringify({name: `e${n}`, files: []})]));
    const capped = await fetchMakeCodeExtensions({dependencies: many, target: 'microbit', table: EXTENSION_TABLE,
        fetch: fakeGithub(repos2), limits: {extensions: 2, filesPerExtension: 64, bytesPerExtension: 1000}});
    assert.equal(capped.extensions.length, 2);
    assert.match(capped.refused[0].reason, /more than 2 extensions/);
});

test('a build that denies remote extensions does not fetch', async () => {
    const files = {'pxt.json': JSON.stringify({dependencies: {motor: 'github:example/motor-copy#v9'}})};
    const r = await onDemandExtensions('microbit', files, false, async url => { throw new Error(`fetched ${url}`); });
    assert.deepEqual(r, {extensions: [], refused: [], disabled: true});
    const vendoredOnly = {'pxt.json': JSON.stringify({dependencies: {[kitronik.id]: kitronik.spec}})};
    assert.deepEqual(await onDemandExtensions('microbit', vendoredOnly, true, async url => { throw new Error(`fetched ${url}`); }),
        {extensions: [], refused: []}, 'a vendored extension is never fetched');
});

// ── compiled by MakeCode's own worker, offline ─────────────────────────

function pxtSandbox () {
    const quiet = () => {};
    const sb = {
        setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
        TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer,
        console: {log: quiet, debug: quiet, info: quiet, warn: quiet, error: quiet},
        pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(STATIC, 'microbit/target.json'), 'utf8'))
    };
    sb.global = sb;
    sb.self = sb;
    sb.eval = src => vm.runInContext(src, sb, {filename: 'eval'});
    vm.createContext(sb, {codeGeneration: {strings: false, wasm: false}});
    vm.runInContext(fs.readFileSync(path.join(STATIC, 'microbit/pxtworker.js'), 'utf8'), sb, {filename: 'pxtworker.js'});
    vm.runInContext(PXT_GLUE_JS, sb, {filename: 'pxt-glue.js'});
    return sb;
}
const plain = x => JSON.parse(JSON.stringify(x));

test('a fetched extension compiles in MakeCode\'s worker; without it the compile names the missing extension', {skip}, async () => {
    const sb = pxtSandbox();
    const files = {
        'pxt.json': JSON.stringify({name: 'on-demand', dependencies: {...MICROBIT_DEFAULT_DEPENDENCIES, motor: 'github:example/motor-copy#v9'}, files: ['main.ts']}),
        'main.ts': 'kitronik.motorOn(kitronik.Motors.Motor1, kitronik.MotorDirection.Forward, 100)\nkitronik.motorOff(kitronik.Motors.Motor2)\n'
    };
    await assert.rejects(sb.bwMakeCode.compile(files, {}), err => err.code === 'NO_EXTENSION' && /motor/.test(err.message));
    const fetched = await fetchMakeCodeExtensions({dependencies: JSON.parse(files['pxt.json']).dependencies, target: 'microbit',
        table: EXTENSION_TABLE, fetch: fakeGithub(publish('example/motor-copy', 'v9', kitronik))});
    const extensions = fetched.extensions.map(({id, repo, refs, targets, files: f}) => ({id, repo, refs, targets, files: f}));
    const before = sb.bwMakeCode.netAttempts.length;
    const r = plain(await sb.bwMakeCode.compile(files, {extensions}));
    assert.equal(r.success, true, JSON.stringify(r.diagnostics.slice(0, 3)));
    assert.ok(r.outfiles['binary.js'].length > 1000, 'no simulator program');
    assert.equal(sb.bwMakeCode.netAttempts.length, before, 'the compile reached for the network');
});


test('repository subfolder packages keep their identity and report the root notice when absent', async () => {
    const spec = 'github:Example/Tutorial-Extensions/arrow-images#v0.0.11';
    assert.deepEqual(parseGithubSpec(spec), {repo: 'example/tutorial-extensions/arrow-images', ref: 'v0.0.11'});
    for (const bad of ['github:example/repo/../escape#v1', 'github:example/repo/./pkg',
        'github:example/repo//pkg', 'github:example/repo/pkg#../tag']) assert.equal(parseGithubSpec(bad), null);
    const calls = [];
    const repos = publish('example/tutorial-extensions', 'v0.0.11/arrow-images', kitronik, {licence: null});
    repos['example/tutorial-extensions/v0.0.11/LICENSE'] = kitronik.licenceText.text;
    const fetched = await fetchMakeCodeExtensions({dependencies: {arrow: spec}, target: 'microbit',
        table: EXTENSION_TABLE, fetch: fakeGithub(repos, calls)});
    assert.deepEqual(fetched.refused, []);
    const [ext] = fetched.extensions;
    assert.equal(ext.repo, 'example/tutorial-extensions/arrow-images');
    assert.equal(ext.fetched.base, RAW_BASE + 'example/tutorial-extensions/v0.0.11/arrow-images/');
    assert.equal(ext.fetched.licenceUrl, RAW_BASE + 'example/tutorial-extensions/v0.0.11/LICENSE');
    assert.equal(ext.fetched.licence, 'MIT');
    assert.ok(calls.includes(ext.fetched.base + 'motors.ts'));
    assert.deepEqual(unresolvedGithubDependencies({arrow: spec}, 'microbit', fetched.extensions), []);
    assert.equal(unresolvedGithubDependencies({other: 'github:example/tutorial-extensions/other#v0.0.11'},
        'microbit', fetched.extensions).length, 1, 'a sibling package is not the same dependency');
});

test('Node compiler stays offline by default and explicitly fetches a package subfolder', {skip}, async () => {
    const {compile} = await import('../scripts/lib/pxt-node.mjs');
    const files = {'pxt.json': JSON.stringify({name: 'subfolder', dependencies: {...MICROBIT_DEFAULT_DEPENDENCIES,
        motor: 'github:example/tutorial-extensions/motor-copy#v9'}, files: ['main.ts']}),
    'main.ts': 'kitronik.motorOff(kitronik.Motors.Motor1)'};
    const calls = [];
    const fetch = fakeGithub(publish('example/tutorial-extensions', 'v9/motor-copy', kitronik), calls);
    await assert.rejects(compile('microbit', files, {fetch}), error => error.code === 'NO_EXTENSION');
    assert.deepEqual(calls, [], 'passing a fetch adapter alone must not enable network access');
    const result = await compile('microbit', files, {fetchExtensions: true, fetch});
    assert.equal(result.success, true, JSON.stringify(result.diagnostics));
    assert.equal(result.fetchedExtensions[0].repo, 'example/tutorial-extensions/motor-copy');
    assert.match(result.fetchedExtensions[0].sha256['motors.ts'], /^[a-f0-9]{64}$/);
    assert.deepEqual(result.netAttempts, [], 'PXT compiler hooks remain offline after resolving the package');
    // Real PXT compilation, not just the fetch parser: original tutorials use
    // a trailing slash before the revision, including subfolder packages.
    const slashFiles = {...files, 'pxt.json': JSON.stringify({name:'subfolder-slash',
        dependencies:{...MICROBIT_DEFAULT_DEPENDENCIES,motor:'github:example/tutorial-extensions/motor-copy/#v9'},files:['main.ts']})};
    const slashResult = await compile('microbit',slashFiles,{fetchExtensions:true,fetch});
    assert.equal(slashResult.success,true,JSON.stringify(slashResult.diagnostics));
    assert.equal(slashResult.fetchedExtensions[0].repo,'example/tutorial-extensions/motor-copy');
    assert.deepEqual(slashResult.netAttempts,[], 'canonical trailing-slash identity compiles offline');
});
