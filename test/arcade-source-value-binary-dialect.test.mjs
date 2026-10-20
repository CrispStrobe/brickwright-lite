import test from 'node:test';
import assert from 'node:assert/strict';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {ARCADE_WORDS,compileArcadeWord} from '../overlay/scratch-gui/src/lib/arcadeDialect.js';
const operations=['+','-','*','/','%','**'];
const program=op=>`DEVICE ARCADE\nGLOBAL result\nSPRITE Game:\nWHEN flag clicked:\n  set result to (arcade source value (5) op ${op} with (2))`;
const built=source=>{const creator=new SB3Creator();creator.parse(source);assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);return creator;};
const operation=creator=>{
    const all=creator.project.targets.flatMap(target=>Object.values(target.blocks||{}));
    const nodes=all.filter(block=>block.opcode==='arcade_sourceValueBinary');assert.equal(nodes.length,1);
    return nodes[0];
};

test('Arcade source arithmetic Code builds a fixed selector field and survives actual Creator decompile',()=>{
    const entry=ARCADE_WORDS.find(word=>word.op==='arcade_sourceValueBinary');assert.ok(entry);
    const selector=compileArcadeWord(entry).parts.find(part=>part.slot==='OP');
    assert.equal(selector.field,true);assert.deepEqual(selector.choices,operations);
    for(const op of operations){
        const creator=built(program(JSON.stringify(op))),block=operation(creator);
        assert.deepEqual(block.fields.OP,[op,null]);assert.equal(Object.hasOwn(block.inputs,'OP'),false);
        assert.deepEqual(Object.keys(block.inputs).sort(),['LEFT','RIGHT']);
        const reparse=built(creator.decompile()),again=operation(reparse);
        assert.deepEqual(again.fields.OP,block.fields.OP);assert.deepEqual(Object.keys(again.inputs).sort(),['LEFT','RIGHT']);
    }
});

test('Arcade source arithmetic does not turn a reporter or unsupported operator into a selector grant',()=>{
    for(const selector of ['(result)','"&"','"==="','"not-an-operator"']){
        const creator=new SB3Creator();
        assert.throws(()=>creator.parse(program(selector)),error=>error?.code==='DIALECT_UNPARSED_LINES');
        assert.equal(creator.project?.targets?.flatMap(target=>Object.values(target.blocks||{})).some(block=>block.opcode==='arcade_sourceValueBinary')||false,false);
    }
});
