import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {SCORE_THRESHOLD_SOURCE,SCORE_THRESHOLD_OBSERVED_SOURCE} from './fixtures/arcade-score-threshold.mjs';

const parse = source => parseMakeCodeTs(source, {retainParentheses:true});
const clean = result => {
    assert.deepEqual(result.unsupported || [], []);
    assert.deepEqual(result.errors || [], []);
    assert.deepEqual(result.warnings || [], []);
};
const create = source => {
    const imported = arcadeToPseudocode(source); clean(imported);
    const creator = new Creator(); creator.parse(imported.code); clean(creator);
    return creator;
};
const assertMarkerWriters = project => {
    const variables = project.targets.flatMap(target => Object.entries(target.variables)
        .filter(([,variable]) => variable[0].replace(/^Game_/, '') === 'ready'));
    assert.equal(variables.length, 1);
    const writers = project.targets.flatMap(target => Object.values(target.blocks))
        .filter(block => block.opcode === 'data_setvariableto' && block.fields.VARIABLE[1] === variables[0][0]);
    assert.equal(writers.length, 2, 'both actual marker writes survive the authoring route');
};

test('score observation retains the complete raw game-operation AST and changes only its completion instrumentation', () => {
    const raw = parse(SCORE_THRESHOLD_SOURCE), observed = parse(SCORE_THRESHOLD_OBSERVED_SOURCE);
    const core = raw.body.slice(0,-1);
    assert.deepEqual(raw.body.at(-1), {type:'Declaration',kind:'let',decls:[{name:'ready',
        init:{type:'Boolean',value:true},isArray:false,typeName:''}]});
    assert.deepEqual(observed.body[0], {type:'Declaration',kind:'let',decls:[{name:'ready',
        init:{type:'Boolean',value:false},isArray:false,typeName:''}]});
    assert.deepEqual(observed.body.at(-1), {type:'ExpressionStatement',expr:{type:'Assignment',op:'=',
        left:{type:'Identifier',name:'ready'},right:{type:'Boolean',value:true}}});
    assert.deepEqual(observed.body.slice(1,-1), core);
    const references = value => {
        if (!value || typeof value !== 'object') return;
        if (value.name === 'ready') assert.fail('the auxiliary completion binding is not part of the game core');
        for (const child of Object.values(value)) references(child);
    };
    references(core);
});

test('observed score control retains both writes through Code, current export/reimport and owned saved projects', async () => {
    const creator = create(SCORE_THRESHOLD_OBSERVED_SOURCE);
    assertMarkerWriters(creator.project);
    const code = new Creator(); code.parse(creator.decompile()); clean(code); assertMarkerWriters(code.project);
    const exported = projectToArcade(creator.project); clean(exported);
    assertMarkerWriters(create(exported.files).project);
    const saved = await JSZip.loadAsync(await (await creator.generateSB3()).arrayBuffer());
    const json = await saved.file('project.json').async('string');
    assertMarkerWriters(JSON.parse(json));
    const reopened = projectJsonToArcade(json); clean(reopened);
    assertMarkerWriters(create(reopened.files).project);
});
