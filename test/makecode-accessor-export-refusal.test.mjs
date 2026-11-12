import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

const source = "let trace=\"\";class Box {constructor(public n:number){}get value():number{trace=trace+\"g\";return this.n}set value(v:number){trace=trace+\"s\";this.n=v}}let b=new Box(2);let alias=b;let before=b.value;alias.value=5;let after=b.value;let same=b===alias;before+=0;after+=0;trace=trace+\"\";";
const project=()=>{
    const imported=arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
    const creator=new Creator();creator.parse(imported.code);
    assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);assert.deepEqual(creator.unparsed,[]);
    assert.ok(creator.project.targets.some(target=>Object.values(target.blocks).some(block=>block.opcode==='arrays_valueBinary'&&block.fields.OP?.[0]==='+')),'actual native addition reaches final emitted-source analysis');
    return creator.project;
};

test('valid accessor export retains owned procedure symbols and complete native addition analysis',()=>{
    const input=project(),before=structuredClone(input),result=projectToArcade(input);
    assert.deepEqual(result.unsupported,[]);assert.deepEqual(result.warnings,[]);
    assert.match(result.ts,/get value\s*\(/);assert.match(result.ts,/set value\s*\(/);
    assert.doesNotMatch(result.ts,/function null\s*\(/);assert.deepEqual(input,before);
});

test('edited accessor formals return ownership diagnostics without emitting an unowned function',()=>{
    for(const mode of ['duplicate','invalid','global']){
        const input=project(),target=input.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_declareClass'));
        const prototype=Object.values(target.blocks).find(block=>block.opcode==='procedures_prototype'&&block.mutation.proccode.startsWith('__bwAccessor_Box_set_value '));
        assert.ok(prototype);const names=JSON.parse(prototype.mutation.argumentnames);
        assert.equal(names.length,2);
        if(mode==='duplicate')names[1]=names[0];
        if(mode==='invalid')names[0]='invalid receiver';
        if(mode==='global')names[0]='trace';
        prototype.mutation.argumentnames=JSON.stringify(names);
        const before=structuredClone(input);let result;
        assert.doesNotThrow(()=>{result=projectToArcade(input);},mode);
        assert.match(result.unsupported.join('\n'),/does not match its declaration|distinct ownership/,mode);
        assert.match(result.unsupported.join('\n'),/ordinary symbol/i,mode);
        assert.doesNotMatch(result.ts,/function null\s*\(/,mode);assert.deepEqual(input,before,mode);
    }
});
