import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {createArrayOccurrenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-occurrence-export-authority.js';

const original='let absent:any[];let text=absent+"";absent=[5];let after=absent+"";let item=absent[0]';
const current=source=>{
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
    const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);assert.deepEqual(creator.unparsed,[]);
    for(const target of creator.project.targets)for(const node of Object.values(target.blocks))if(node.opcode==='arrays_referenceItem')return {creator,target,node};
    throw Error('missing actual current Array item');
};
const accepted=({creator,target,node})=>createArrayOccurrenceExportAuthority(creator.project).validateInput(target,node,'ARRAY');

test('current six source binary selectors contribute scalar results while actual Array writers establish occurrence facts',()=>{
    for(const op of ['+','-','*','/','%','**']){
        const run=current(original),source=Object.values(run.target.blocks).filter(block=>block.opcode==='arcade_sourceValueBinary');
        assert.equal(source.length,2,'current original source creates the actual reporters');
        for(const block of source)block.fields.OP[0]=op;
        assert.equal(accepted(run),true,op);
    }
});

test('current source binary profile refuses malformed selectors sockets and missing actual Array writers',()=>{
    for(const edit of [
        block=>{block.fields.OP[0]='unknown';},
        block=>{block.fields.OP[0]='&';},
        block=>{block.fields.OP[1]='foreign-selector-id';},
        block=>{block.inputs.OP=[1,[10,'+']];},
        block=>{block.inputs.EXTRA=[1,[10,'0']];},
        block=>{delete block.inputs.RIGHT;},
        block=>{block.opcode='foreign_sourceValueBinary';}
    ]){
        const run=current(original),source=Object.values(run.target.blocks).find(block=>block.opcode==='arcade_sourceValueBinary');
        assert.ok(source);edit(source);assert.equal(accepted(run),false);
    }
    for(const source of ['let absent:any[];let value=absent+"";let item=absent[0];absent=[5]',
        'let absent:any[];absent=[5];let value=absent+"";absent=0 as any;let item=absent[0]'])assert.equal(accepted(current(source)),false,source);
});
