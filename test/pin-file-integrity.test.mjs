import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, chmod, rm, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertPinMoveAllowed, recordPin} from '../scripts/lib-pin.mjs';

const oldSha = 'a'.repeat(40), newSha = 'b'.repeat(40);
const quiet = () => {};
const operations = [assertPinMoveAllowed, recordPin];

async function fixture (t) {
    const dir = await mkdtemp(path.join(tmpdir(), 'pin-file-integrity-'));
    t.after(() => rm(dir, {recursive: true, force: true}));
    return path.join(dir, 'pins.json');
}

test('conflicted, malformed, wrong-shaped and invalid selected pins refuse updates without changing bytes', async t => {
    const pinsFile = await fixture(t);
    const cases = [
        ['merge markers', '{\n<<<<<<< HEAD\n"sb3-creator":"' + oldSha + '"\n=======\n"sb3-creator":"' + newSha + '"\n>>>>>>> branch\n}\n', /invalid JSON/],
        ['truncated JSON', '{"other":"' + oldSha + '",', /invalid JSON/],
        ['empty file', '', /invalid JSON/],
        ...['null', '[]', '"pins"', '7', 'true'].map(text => [text, text, /expected a JSON object/]),
        ...[null, false, 7, [], {}, '', 'short', 'A'.repeat(40)].map(value => [
            `invalid selected pin ${JSON.stringify(value)}`,
            JSON.stringify({'other': oldSha, 'sb3-creator': value}), /sb3-creator is not a 40-hex sha/
        ])
    ];
    for (const [label, bytes, reason] of cases) {
        await t.test(label, async () => {
            await writeFile(pinsFile, bytes);
            for (const operation of operations) {
                await assert.rejects(operation('sb3-creator', newSha, {pinsFile, explicit: true, log: quiet}), reason);
                assert.equal(await readFile(pinsFile, 'utf8'), bytes, `${operation.name} must preserve the invalid file`);
            }
        });
    }
});

test('read errors propagate, including permission denial, without replacing the registry', async t => {
    const pinsFile = await fixture(t);
    const bytes = JSON.stringify({'other': oldSha, 'sb3-creator': oldSha});
    await writeFile(pinsFile, bytes);
    await chmod(pinsFile, 0);
    try {
        for (const operation of operations) {
            await assert.rejects(operation('sb3-creator', newSha, {pinsFile, explicit: true, log: quiet}), {code: 'EACCES'});
        }
    } finally {
        await chmod(pinsFile, 0o600);
    }
    assert.equal(await readFile(pinsFile, 'utf8'), bytes);
    const directory = pinsFile + '-directory';
    await mkdir(directory);
    for (const operation of operations) {
        await assert.rejects(operation('sb3-creator', newSha, {pinsFile: directory, explicit: true, log: quiet}), {code: 'EISDIR'});
    }
});

test('only a missing file starts an empty registry; valid writes retain other pins and no-ops retain bytes', async t => {
    const pinsFile = await fixture(t);
    assert.deepEqual(await assertPinMoveAllowed('sb3-creator', newSha, {pinsFile}), {moves: false, old: undefined});
    await recordPin('sb3-creator', newSha, {pinsFile, log: quiet});
    assert.deepEqual(JSON.parse(await readFile(pinsFile, 'utf8')), {'sb3-creator': newSha});
    const bytes = '{ "other" : "' + oldSha + '", "sb3-creator" : "' + oldSha + '" }\n';
    await writeFile(pinsFile, bytes);
    await recordPin('sb3-creator', oldSha, {pinsFile, log: quiet});
    assert.equal(await readFile(pinsFile, 'utf8'), bytes);
    await recordPin('sb3-creator', newSha, {pinsFile, explicit: true, log: quiet});
    assert.deepEqual(JSON.parse(await readFile(pinsFile, 'utf8')), {other: oldSha, 'sb3-creator': newSha});
});


test('the actual default workspace manifest cannot be reinitialized and compiler updates preserve every other component', async t => {
    const pinsFile = await fixture(t), root=path.dirname(pinsFile), scripts=path.join(root,'scripts');
    await mkdir(scripts);
    const copied=path.join(scripts,'lib-pin.mjs');
    await writeFile(copied,await readFile(new URL('../scripts/lib-pin.mjs',import.meta.url)));
    const helper=await import(pathToFileURL(copied));
    for(const operation of [helper.assertPinMoveAllowed,helper.recordPin]) {
        await assert.rejects(operation('sb3-creator',newSha,{explicit:true,log:quiet}),/workspace vendor-pins.json is missing/);
        await assert.rejects(readFile(helper.PINS_FILE),{code:'ENOENT'});
    }
    const original={'bw-circuit-ui':'c'.repeat(40),'bw-board':'d'.repeat(40),'stc-compiler-flasher':'e'.repeat(40),'arrays-values':'f'.repeat(40),'sb3-creator':oldSha};
    await writeFile(helper.PINS_FILE,JSON.stringify(original));
    await helper.recordPin('sb3-creator',newSha,{explicit:true,log:quiet});
    assert.deepEqual(JSON.parse(await readFile(helper.PINS_FILE,'utf8')),{...original,'sb3-creator':newSha});
});
