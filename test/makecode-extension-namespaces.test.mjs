// A program that uses an extension's namespace converts with that extension
// instead of silently dropping it: detection by namespace (vendored set first),
// an explicit "extension namespace X not available" otherwise, and an opt-in,
// pinned, licence-checked fetch exercised only against a local fake GitHub.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {importProjectFiles, importProjectFilesWithDependencies} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {exportToMakeCode} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import {VENDORED_EXTENSIONS} from '../overlay/scratch-gui/src/lib/bw-makecode/extensions-vendored.js';
import {NAMESPACE_ALIASES, CORE_SYMBOLS, resolveExtensionNamespaces, usedNames} from '../overlay/scratch-gui/src/lib/bw-makecode/extension-namespaces.js';
import {decideLicence, licenceOf, holderOf, ALLOWED_LICENCES} from '../overlay/scratch-gui/src/lib/bw-makecode/extension-licence.js';
import {fetchNamespaceExtensions, registryCandidates, memoryExtensionCache} from '../overlay/scratch-gui/src/lib/bw-makecode/extension-ondemand.js';
import {RAW_BASE, API_BASE} from '../overlay/scratch-gui/src/lib/bw-makecode/extension-fetch.js';
import {hasRuntime, compile} from '../scripts/lib/pxt-node.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipCompile = hasRuntime('microbit') && fs.existsSync(path.join(ROOT, 'packages/scratch-gui/static/makecode/microbit/pxtworker.js')) ?
    false : 'MakeCode runtime not synced (npm run sync:makecode)';
const byId = id => VENDORED_EXTENSIONS.find(e => e.id === id);

/** One tiny program per vendored extension: the namespace it declares and a call. */
const PROGRAMS = {
    microturtle: {target: 'microbit', main: 'turtle.forward(2)\nturtle.turnRight()\n', namespace: 'turtle'},
    'radio-blockchain': {target: 'microbit', main: 'blockchain.addBlock(7)\n', namespace: 'blockchain'},
    'pxt-kitronik-motor-driver': {target: 'microbit', main: 'kitronik.motorOff(kitronik.Motors.Motor1)\n', namespace: 'kitronik'},
    'arcade-background-scroll': {target: 'arcade', main: 'scroller.scrollBackgroundWithSpeed(10, 0)\n', namespace: 'scroller'},
    'arcade-character-animations': {target: 'arcade', main: 'characterAnimations.setCharacterAnimationsEnabled(sprites.create(img`.`, SpriteKind.Player), true)\n', namespace: 'characterAnimations'},
    'pxt-ws2812b': {target: 'microbit', main: 'ws2812b.setBufferMode(DigitalPin.P0, 0)\n', namespace: 'ws2812b'},
    'pxt-neopixel': {target: 'microbit', main: 'let strip = neopixel.create(DigitalPin.P0, 8, NeoPixelMode.RGB)\nstrip.show()\n', namespace: 'neopixel'},
    'pxt-sonar': {target: 'microbit', main: 'basic.showNumber(sonar.ping(DigitalPin.P1, DigitalPin.P2, PingUnit.Centimeters))\n', namespace: 'sonar'},
    'pxt-status-bar': {target: 'arcade', main: 'statusbars.create(20, 4, StatusBarKind.Health)\n', namespace: 'statusbars'},
    'arcade-text': {target: 'arcade', main: 'textsprite.create("hi")\n', namespace: 'textsprite'},
    'arcade-sprite-util': {target: 'arcade', main: 'spriteutils.degreesToRadians(90)\n', namespace: 'spriteutils'},
    'arcade-carnival': {target: 'arcade', main: 'carnival.startTimer()\n', namespace: 'carnival'},
    'pxt-settings-blocks': {target: 'arcade', main: 'blockSettings.writeNumber("score", 1)\n', namespace: 'blockSettings'},
    'arcade-sprite-data': {target: 'arcade', main: 'sprites.setDataNumber(mySprite, "n", 1)\n', namespace: 'sprites'}
};

test('every vendored extension has a derived alias and a program here', () => {
    for (const e of VENDORED_EXTENSIONS) {
        assert.ok(PROGRAMS[e.id], `${e.id}: add a tiny program`);
        // Core namespaces an extension merely augments never resolve to it.
        if (!CORE_SYMBOLS.has(PROGRAMS[e.id].namespace)) assert.deepEqual(NAMESPACE_ALIASES[PROGRAMS[e.id].namespace], [e.id]);
        else assert.equal(NAMESPACE_ALIASES[PROGRAMS[e.id].namespace], undefined);
    }
    assert.equal(NAMESPACE_ALIASES.SpriteKind, undefined);
});

for (const [id, program] of Object.entries(PROGRAMS).filter(([, p]) => !CORE_SYMBOLS.has(p.namespace))) {
    test(`${id}: its namespace resolves without a pxt.json, and not twice when declared`, () => {
        const bare = resolveExtensionNamespaces({files: {'main.ts': program.main}, target: program.target});
        assert.deepEqual(bare.extensions.map(e => [e.id, e.via, e.declared]), [[id, 'vendored', false]]);
        assert.equal(bare.dependencies[id], byId(id).spec);
        assert.deepEqual(bare.unresolved, []);
        const listed = resolveExtensionNamespaces({target: program.target, files: {'main.ts': program.main,
            'pxt.json': JSON.stringify({dependencies: {[id]: byId(id).spec}})}});
        assert.deepEqual(listed.dependencies, {}, 'a declared dependency is not added again');
        assert.equal(listed.extensions[0].declared, true);
        const own = resolveExtensionNamespaces({target: program.target, files: {'main.ts': `namespace ${program.namespace} { export function f() {} }\n${program.namespace}.f()\n`}});
        assert.deepEqual(own.extensions, [], 'the program\'s own declaration shadows the extension');
    });
}

test('names the program declares or receives are not namespaces', () => {
    const used = usedNames('let turtle = [1]\nlet a = turtle.length\nfunction f(sonar: number[]) { return sonar.length }\nx.y(1)\n"neopixel.z" // blockchain.q\n');
    assert.deepEqual([...used.keys()], ['x']);
});

test('micro:bit: a bare turtle program translates into namespace procedures, not unsupported calls', () => {
    const imported = importProjectFiles({'main.ts': PROGRAMS.microturtle.main}, {target: 'microbit'});
    assert.deepEqual(imported.extensions.map(e => [e.id, e.via, e.licence, e.commit]), [['microturtle', 'vendored', 'MIT', byId('microturtle').commit]]);
    assert.match(imported.code, /DEFINE __bwNamespace_turtle_forward \(steps\):/);
    assert.match(imported.code, /^ {2}__bwNamespace_turtle_forward 2$/m);
    assert.ok(!imported.unsupported.some(line => /^turtle\./.test(line)), imported.unsupported.join('|'));
    const creator = new SB3Creator();
    creator.parse(imported.code);
    const exported = exportToMakeCode(creator.project, {name: 'x'});
    assert.match(exported.files['main.ts'], /function __bwNamespace_turtle_forward\(steps: number\)/);
    assert.match(exported.files['main.ts'], /__bwNamespace_turtle_forward\(2\)/);
});

test('micro:bit: the declared spelling resolves the same as the detected one', () => {
    const declared = importProjectFiles({'main.ts': PROGRAMS.microturtle.main,
        'pxt.json': JSON.stringify({dependencies: {core: '*', microturtle: byId('microturtle').spec}})}, {target: 'microbit'});
    const bare = importProjectFiles({'main.ts': PROGRAMS.microturtle.main}, {target: 'microbit'});
    assert.equal(declared.code, bare.code);
    assert.equal(declared.extensions[0].declared, true);
});

test('micro:bit: the re-exported turtle program compiles in MakeCode', {skip: skipCompile}, async () => {
    const imported = importProjectFiles({'main.ts': PROGRAMS.microturtle.main}, {target: 'microbit'});
    const creator = new SB3Creator();
    creator.parse(imported.code);
    const exported = exportToMakeCode(creator.project, {name: 'x'});
    const result = await compile('microbit', exported.files);
    assert.equal(result.success, true, JSON.stringify((result.diagnostics || []).slice(0, 3).map(d => d.message)));
});

test('a namespace no extension provides is named, never dropped', () => {
    const curated = importProjectFiles({'main.ts': 'grove.lcd1602Show("hi")\n'}, {target: 'microbit'});
    assert.ok(curated.unsupported.includes('extension namespace grove not available'), curated.unsupported.join('|'));
    assert.match(curated.code, /# unsupported: extension namespace grove not available/);
    assert.deepEqual(curated.unavailableExtensions, ['grove']);
    const unknown = importProjectFiles({'main.ts': 'acme.beep(3)\n'}, {target: 'microbit'});
    assert.ok(unknown.unsupported.includes('extension namespace acme not available'), unknown.unsupported.join('|'));
    const core = importProjectFiles({'main.ts': 'led.setDisplayMode(DisplayMode.Greyscale)\nbasic.showNumber(1)\n'}, {target: 'microbit'});
    assert.ok(!core.unsupported.some(line => /extension namespace/.test(line)), 'a core namespace is not an extension');
});

test('licence decisions: text decides, pxt.json may only agree, and the allow-list is closed', () => {
    const mit = byId('microturtle').licenceText.text;
    assert.deepEqual(decideLicence({licenceText: mit, pxtLicense: 'MIT'}), {allowed: true, licence: 'MIT', holder: 'Microsoft Corporation', reason: null});
    assert.equal(decideLicence({licenceText: mit}).allowed, true);
    assert.match(decideLicence({licenceText: mit, pxtLicense: 'Apache-2.0'}).reason, /says MIT but its pxt.json says Apache-2.0/);
    assert.match(decideLicence({licenceText: null, pxtLicense: 'MIT'}).reason, /no LICENSE file/);
    assert.match(decideLicence({licenceText: 'GNU GENERAL PUBLIC LICENSE Version 3'}).reason, /not a licence on the allow-list/);
    const zlib = 'Copyright (c) 2020 Jane Doe\n\nThis software is provided \'as-is\', without any express or implied warranty.\n\n2. Altered source versions must be plainly marked as such.';
    assert.equal(licenceOf(zlib), 'Zlib');
    assert.equal(holderOf(zlib), 'Jane Doe');
    assert.deepEqual([...ALLOWED_LICENCES].sort(), ['0BSD', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MIT', 'Zlib']);
    assert.equal(decideLicence({licenceText: 'Redistribution and use in source and binary forms, with or without modification\nCopyright (c) A B'}).licence, 'BSD-2-Clause');
});

// ---------------------------------------------------------------------------
// A local fake GitHub and MakeCode registry. Nothing here touches the network.
const sha1 = text => {
    const body = Buffer.from(text);
    return crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest('hex');
};
const COMMIT = 'a'.repeat(40);
const widgetSource = byId('microturtle').files['turtle.ts'].text.replace('namespace turtle', 'namespace widget');
const widgetFiles = ({licence = byId('microturtle').licenceText.text, pxtLicense = 'MIT', source = widgetSource} = {}) => ({
    'pxt.json': JSON.stringify({name: 'pxt-widget', license: pxtLicense, dependencies: {core: '*'}, files: ['widget.ts']}),
    'widget.ts': source, ...(licence === null ? {} : {LICENSE: licence})});
const fakeGithub = ({files = widgetFiles(), registry = ['example/pxt-widget'], treeOverride = null} = {}) => {
    const calls = [];
    const respond = (body, ok = true, status = 200) => ({ok, status, headers: {get: () => null}, text: async () => body});
    const fetch = async url => {
        calls.push(url);
        if (/\/api\/config\/microbit\/targetconfig$/.test(url)) {
            return respond(JSON.stringify({packages: {approvedRepoLib: Object.fromEntries(registry.map(r => [r, {tags: ['Software']}]))}}));
        }
        if (url === `${API_BASE}repos/example/pxt-widget/commits/HEAD`) return respond(JSON.stringify({sha: COMMIT}));
        if (url === `${API_BASE}repos/example/pxt-widget/git/trees/${COMMIT}?recursive=1`) {
            return respond(JSON.stringify({truncated: false, tree: Object.entries(files).map(([file, text]) =>
                ({path: file, type: 'blob', sha: treeOverride?.[file] || sha1(text)}))}));
        }
        if (url.startsWith(`${RAW_BASE}example/pxt-widget/${COMMIT}/`)) {
            const text = files[url.slice(`${RAW_BASE}example/pxt-widget/${COMMIT}/`.length)];
            return text === undefined ? respond('', false, 404) : respond(text);
        }
        return respond('', false, 404);
    };
    return {fetch, calls};
};
const WIDGET_MAIN = 'widget.forward(3)\n';

test('registry candidates come from the approved list by repository name', () => {
    assert.deepEqual(registryCandidates('widget', {'example/pxt-widget': {}, 'example/other': {}}), ['example/pxt-widget']);
    assert.deepEqual(registryCandidates('sonar', {'microsoft/pxt-sonar': {preferred: true}}), ['microsoft/pxt-sonar']);
    assert.deepEqual(registryCandidates('basic', {'example/pxt-widget': {}}), []);
});

test('fetching is off unless asked for: no request, an explicit reason', async () => {
    const github = fakeGithub();
    const off = await fetchNamespaceExtensions({files: {'main.ts': WIDGET_MAIN}, target: 'microbit', fetch: github.fetch});
    assert.deepEqual(off, {extensions: [], refused: [], disabled: true});
    const imported = await importProjectFilesWithDependencies({'main.ts': WIDGET_MAIN}, {target: 'microbit', fetch: github.fetch});
    assert.deepEqual(github.calls, []);
    assert.ok(imported.unsupported.includes('extension namespace widget not available'));
});

test('an unknown namespace is resolved through the registry, pinned, verified, licence-checked, cached and translated', async () => {
    const github = fakeGithub();
    const cache = memoryExtensionCache();
    const imported = await importProjectFilesWithDependencies({'main.ts': WIDGET_MAIN}, {target: 'microbit', fetchExtensions: true,
        fetch: github.fetch, extensionCache: cache});
    assert.match(imported.code, /DEFINE __bwNamespace_widget_forward \(steps\):/);
    assert.ok(!imported.unsupported.some(line => /^widget\./.test(line) || /extension namespace/.test(line)), imported.unsupported.join('|'));
    assert.deepEqual(imported.extensions.map(e => [e.id, e.via, e.licence, e.holder, e.commit]),
        [['pxt-widget', 'fetched', 'MIT', 'Microsoft Corporation', COMMIT]]);
    const [[key, record]] = cache.entries();
    assert.equal(key, `example/pxt-widget@${COMMIT}`);
    const {provenance} = record;
    assert.equal(provenance.commit, COMMIT);
    assert.equal(provenance.repo, 'example/pxt-widget');
    assert.equal(provenance.holder, 'Microsoft Corporation');
    assert.equal(provenance.licence, 'MIT');
    assert.equal(provenance.licenceText, byId('microturtle').licenceText.text);
    assert.equal(provenance.files['widget.ts'].blob, sha1(widgetSource));
    assert.equal(provenance.licenceBlob, sha1(byId('microturtle').licenceText.text));
    assert.match(provenance.files['widget.ts'].sha256, /^[0-9a-f]{64}$/);
    // The second import needs no file downloads, only the ref lookup.
    const before = github.calls.length;
    await importProjectFilesWithDependencies({'main.ts': WIDGET_MAIN}, {target: 'microbit', fetchExtensions: true,
        fetch: github.fetch, extensionCache: cache});
    const again = github.calls.slice(before).filter(url => url.startsWith(RAW_BASE) || url.includes('/git/trees/'));
    assert.deepEqual(again, [], 'cached files are not downloaded again');
});

test('a licence off the allow-list is refused by name and the namespace stays reported', async () => {
    const gpl = 'GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\nCopyright (C) 2007 Free Software Foundation, Inc.';
    const github = fakeGithub({files: widgetFiles({licence: gpl, pxtLicense: 'GPL-3.0'})});
    const imported = await importProjectFilesWithDependencies({'main.ts': WIDGET_MAIN}, {target: 'microbit', fetchExtensions: true, fetch: github.fetch});
    assert.deepEqual(imported.extensions, []);
    assert.ok(imported.unsupported.some(line => /^extension pxt-widget refused: licence refused: .*allow-list/.test(line)), imported.unsupported.join('|'));
    assert.ok(imported.unsupported.includes('extension namespace widget not available'));
    for (const files of [widgetFiles({licence: null}), widgetFiles({pxtLicense: 'Apache-2.0'})]) {
        const result = await fetchNamespaceExtensions({files: {'main.ts': WIDGET_MAIN}, target: 'microbit', fetchExtensions: true, fetch: fakeGithub({files}).fetch});
        assert.deepEqual(result.extensions, []);
        assert.match(result.refused[0].message, /licence refused/);
    }
});

test('bytes that are not the commit\'s blob are refused', async () => {
    const github = fakeGithub({treeOverride: {'widget.ts': 'b'.repeat(40)}});
    const result = await fetchNamespaceExtensions({files: {'main.ts': WIDGET_MAIN}, target: 'microbit', fetchExtensions: true, fetch: github.fetch});
    assert.deepEqual(result.extensions, []);
    assert.match(result.refused[0].reason, /arrived as blob/);
});

test('a candidate that does not declare the namespace is refused', async () => {
    const github = fakeGithub({files: widgetFiles({source: widgetSource.replace('namespace widget', 'namespace gadget')})});
    const result = await fetchNamespaceExtensions({files: {'main.ts': WIDGET_MAIN}, target: 'microbit', fetchExtensions: true, fetch: github.fetch});
    assert.deepEqual(result.extensions, []);
    assert.equal(result.refused[0].message, 'extension namespace widget not available: example/pxt-widget does not declare it');
});

test('a declared github: dependency that is not vendored is fetched the same way', async () => {
    const github = fakeGithub();
    const files = {'main.ts': 'basic.showNumber(1)\n', 'pxt.json': JSON.stringify({dependencies: {core: '*', widget: 'github:example/pxt-widget'}})};
    const result = await fetchNamespaceExtensions({files, target: 'microbit', fetchExtensions: true, fetch: github.fetch});
    assert.deepEqual(result.refused, []);
    assert.deepEqual(result.extensions.map(e => [e.id, e.fetched.commit]), [['widget', COMMIT]]);
});

test('the directory cache stores one provenance record per repo@commit and refuses other keys', async () => {
    const {fileExtensionCache} = await import('../scripts/lib/extension-file-cache.mjs');
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'bw-ext-cache-'));
    try {
        const cache = fileExtensionCache(dir);
        const key = `example/pxt-widget@${COMMIT}`;
        assert.equal(await cache.get(key), null);
        await cache.set(key, {provenance: {commit: COMMIT}, files: {}});
        assert.deepEqual(await cache.get(key), {provenance: {commit: COMMIT}, files: {}});
        assert.deepEqual(fs.readdirSync(dir), [`example__pxt-widget@${COMMIT}.json`]);
        await assert.rejects(() => cache.set('example/pxt-widget@main', {}), /invalid extension cache key/);
        await assert.rejects(() => cache.set(`../x/y@${COMMIT}`, {}), /invalid extension cache key/);
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
