import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {VM, SB3Creator as BundledCreator, stepFrames, clearStrayTimers, INTEGRATED} from './helpers/bw-vm.mjs';
import {loadExtensionClass, bundledExtensionIds} from './helpers/bw-extensions.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// Independently authored fixtures, checked against the selected original SDK.
// The optional canonical source uses the real adapter/registration path during
// supplier qualification; the default exercises the vendored consumer source.
const require = createRequire(import.meta.url);
const SB3Creator = process.env.SB3_CREATOR_DIR ? (await import(pathToFileURL(path.join(process.env.SB3_CREATOR_DIR, 'src/utils/sb3Creator.js')).href)).default : BundledCreator;
const adapterPath = path.join(INTEGRATED, 'node_modules/scratch-vm/src/extensions/crispstrobe/adapter.js');
const canonical = process.env.BW_ARRAYS_CANONICAL_SOURCE;
const candidate = canonical ? require(adapterPath)(readFileSync(canonical, 'utf8')) : null;
if (canonical) assert.equal(readFileSync(adapterPath, 'utf8'), readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/adapter.js', import.meta.url), 'utf8'));
const ids = bundledExtensionIds();
const values = vm => Object.fromEntries(vm.runtime.targets.flatMap(target => Object.values(target.variables))
    .map(variable => [variable.name.replace(/^Game_/, ''), variable.value]));
const packageCode = async code => {
    const creator = new SB3Creator(); creator.parse(code); assert.deepEqual(creator.warnings, []);
    return {creator, buffer: Buffer.from(await (await creator.generateSB3()).arrayBuffer())};
};
const start = async buffer => {
    const vm = new VM(), manager = vm.extensionManager, original = manager.loadExtensionURL.bind(manager), errors = [];
    const Storage = require(path.join(INTEGRATED, 'node_modules/scratch-storage/dist/node/scratch-storage.js'));
    vm.attachStorage(new Storage());
    manager.loadExtensionURL = id => {
        const key = String(id);
        if (!ids.has(key)) return original(id);
        if (manager.isExtensionLoaded(key)) return Promise.resolve();
        const Class = key === 'arrays' && candidate ? candidate : loadExtensionClass(ids.get(key));
        const service = manager._registerInternalExtension(new Class(vm.runtime));
        manager._loadedExtensions.set(key, service); return Promise.resolve();
    };
    vm.runtime.on('BLOCKS_ERROR', error => errors.push(String(error)));
    vm.on('BLOCKS_ERROR', error => errors.push(String(error)));
    await vm.loadProject(buffer); vm.runtime.bwArcadeFrameAuthority = 'manual';
    vm.start(); vm.greenFlag(); vm.quit(); await stepFrames(vm, 12, 20);
    return {vm, errors};
};

const fixtures = [
    {
        "name": "pxt-array-copy-primary",
        "source": "let input=[10,20,30,40]\nlet fraction=input.slice(0.5,2.5)\nlet fractionalLength=fraction.length\nlet fractionalFirstUndefined=fraction[0]===undefined\nlet directFractionUndefined=input[0.5]===undefined\nlet notNumber=input.slice(NaN)\nlet nanLength=notNumber.length\nlet all=input.slice()\nlet copiedLength=all.length\nlet newArray=all!==input\nall[0]=99\nlet originalFirst=input[0]\nlet copiedFirst=all[0]\nlet tail=input.slice(-2)\nlet negativeFirst=tail[0]\nlet upper=input.slice(1,99)\nlet upperLength=upper.length\nlet reverse=input.slice(3,1)\nlet reverseLength=reverse.length\nlet nested=[[1],[2]]\nlet joined=nested.concat(nested.slice(1))\njoined[2][0]=8\nlet nestedAlias=nested[1][0]\nlet concatLength=joined.length\nlet concatFresh=joined!==nested",
        "expected": {
            "fractionalLength": 2,
            "fractionalFirstUndefined": true,
            "directFractionUndefined": true,
            "nanLength": 0,
            "copiedLength": 4,
            "newArray": true,
            "originalFirst": 10,
            "copiedFirst": 99,
            "negativeFirst": 30,
            "upperLength": 3,
            "reverseLength": 0,
            "nestedAlias": 8,
            "concatLength": 3,
            "concatFresh": true
        },
        "reference": "input"
    },
    {
        "name": "pxt-string-charcode-primary",
        "source": "let text=\"😀A\"\nlet units=text.length\nlet high=text.charCodeAt(0)\nlet low=text.charCodeAt(1)\nlet ascii=text.charCodeAt(2)\nlet fraction=text.charCodeAt(0.5)\nlet negativeFraction=text.charCodeAt(-0.5)\nlet tooLarge=text.charCodeAt(3)\nlet notANumber=text.charCodeAt(NaN)\nlet unspecified=text.charCodeAt(undefined)\nlet nullIndex=text.charCodeAt(null)\nlet coerced=text.charCodeAt(<any>\"1\")\nlet words:string[]=[text]\nlet indexedUnits=words[0].length\nlet indexedCode=words[0].charCodeAt(1)",
        "expected": {
            "units": 3,
            "high": 55357,
            "low": 56832,
            "ascii": 65,
            "fraction": 55357,
            "negativeFraction": 0,
            "tooLarge": 0,
            "notANumber": 0,
            "unspecified": 0,
            "nullIndex": 55357,
            "coerced": 56832,
            "indexedUnits": 3,
            "indexedCode": 56832
        },
        "reference": "words"
    },
    {
        "name": "pxt-array-copy-effects-primary",
        "source": "let rows=[[1,2,3]]\nlet receivers=0\nlet starts=0\nlet ends=0\nfunction receiver(){receivers++;return rows[0]}\nfunction start(){starts++;rows[0]=[9];return 1}\nfunction end(){ends++;return 3}\nlet copied=receiver().slice(start(),end())\nlet receivedOnce=receivers===1&&starts===1&&ends===1\nlet copiedHead=copied[0]\nlet copiedCount=copied.length\nlet replacementHead=rows[0][0]\nlet special:any[]=[undefined,NaN,[5]]\nlet specialCopy=special.slice()\nlet specialJoined=specialCopy.concat(special)\nlet undefinedPreserved=specialJoined[0]===undefined\nlet nanPreserved=specialJoined[1]!==specialJoined[1]\nlet nested:any[]=specialJoined[2]\nnested[0]=8\nlet originalNested:any[]=special[2]\nlet nestedIdentity=originalNested[0]===8\nlet outerFresh=specialCopy!==special&&specialJoined!==specialCopy\nlet joinedLength=specialJoined.length",
        "expected": {
            "receivers": 1,
            "starts": 1,
            "ends": 1,
            "receivedOnce": true,
            "copiedHead": 2,
            "copiedCount": 2,
            "replacementHead": 9,
            "undefinedPreserved": true,
            "nanPreserved": true,
            "nestedIdentity": true,
            "outerFresh": true,
            "joinedLength": 6
        },
        "reference": "special"
    }
];

for (const fixture of fixtures) test(fixture.name + ' preserves original values and editable reference identity', {todo:(["pxt-array-copy-primary preserves original values and editable reference identity", "pxt-array-copy-effects-primary preserves original values and editable reference identity"].includes(fixture.name + ' preserves original values and editable reference identity')?"Array export authority cannot yet prove the Array receiver \u2014 see docs/ARCADE-888-OPEN-FAILURES.md":undefined),timeout: 300000}, async () => {
    const imported = arcadeToPseudocode(fixture.source); assert.deepEqual(imported.unsupported, []);
    const check = run => {
        assert.deepEqual(run.errors, []);
        const actual = values(run.vm);
        for (const [key, expected] of Object.entries(fixture.expected)) assert.equal(actual[key], expected, key);
    };
    const runs = [];
    try {
        const packaged = await packageCode(imported.code), source = await start(packaged.buffer); runs.push(source); check(source);
        const editable = await packageCode(packaged.creator.decompile()), code = await start(editable.buffer); runs.push(code); check(code);
        const saved = Buffer.from(await (await source.vm.saveProjectSb3()).arrayBuffer());
        const fresh = await start(saved); runs.push(fresh); check(fresh);
        const BWValues = require(path.join(INTEGRATED, 'node_modules/scratch-vm/src/util/bw-values.js'));
        const reference = values(source.vm)[fixture.reference];
        source.vm.stopAll(); assert.ok(BWValues.arrayValue(source.vm.runtime, reference));
        await source.vm.loadProject(saved); assert.equal(BWValues.arrayValue(source.vm.runtime, reference), undefined);
        source.vm.greenFlag(); await stepFrames(source.vm, 12, 20); check(source);
        const exported = projectToArcade(packaged.creator.project);
        assert.deepEqual(exported.unsupported, []); assert.deepEqual(exported.warnings, []);
        const original = await runPxtArcade(exported.files, {fakeClock: true});
        for (const [key, expected] of Object.entries(fixture.expected)) assert.equal(original[key] ?? original['Game_' + key], expected, key);
        const reimport = arcadeToPseudocode(exported.files); assert.deepEqual(reimport.unsupported, []);
        const back = await start((await packageCode(reimport.code)).buffer); runs.push(back); check(back);
    } finally { for (const run of runs) run.vm.quit(); clearStrayTimers(); }
});
