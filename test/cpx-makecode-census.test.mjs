import test from 'node:test';
import assert from 'node:assert/strict';
import {adafruitPrograms, adafruitCalls, inspectAdafruitProgram, adafruitCensus} from '../scripts/lib/makecode-adafruit-corpus.mjs';

test('CPX census takes every pinned documentation fence, without deduplication', () => {
    const rows = adafruitPrograms();
    assert.equal(rows.length, 244, 'The pinned source changed; never silently shrink the corpus');
    assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
    for (const name of ['reference/', 'examples/', 'projects/', 'tutorials/', 'learnsystem/']) {
        assert.ok(rows.some(r => r.id.startsWith(name)), name);
    }
});

test('CPX source-call reader distinguishes executable calls from comments and text', () => {
    assert.deepEqual(adafruitCalls('// light.clear()\nlight.showRing("music.playTone(1,2)")\n'
        + '/* input.onLoudSound() */\ninput.buttonA.onEvent(ButtonEvent.Click,()=>light.clear())'),
    ['input.buttonA.onEvent', 'light.clear', 'light.showRing']);
    assert.deepEqual(adafruitCalls('light.showRing(`${input.lightLevel()}`)'), ['input.lightLevel', 'light.showRing']);
});

test('CPX census checks the actual blocks and retains every named refusal', () => {
    const good = inspectAdafruitProgram({id: 'ring', ts: 'light.setAll(0xff0000)'});
    assert.equal(good.stage, 'full');
    assert.equal(good.cpxBlocks, 1);
    assert.deepEqual(good.silent, []);
    const refused = inspectAdafruitProgram({id: 'infrared', ts: 'network.infraredSendNumber(1)'});
    assert.equal(refused.stage, 'refused-by-name');
    assert.equal(refused.cpxBlocks, 0);
    assert.ok(refused.unsupported.some(s => s.includes('network.infraredSendNumber()')));
    assert.deepEqual(refused.silent, []);
});

test('missing compiler inputs cannot count as an invalid original program', async () => {
    const infrastructure = await adafruitCensus({limit: 1, compile: async () => { throw new Error('ENOENT missing compiler'); }});
    assert.equal(infrastructure.tally['import-or-parse-error'], 1);
    assert.equal(infrastructure.tally['not-a-program'], undefined);
    const sourceError = await adafruitCensus({limit: 1, compile: async () => {
        throw new Error('MakeCode does not compile it: [{"message":"unknown source name"}]');
    }});
    assert.equal(sourceError.tally['not-a-program'], 1);
});
