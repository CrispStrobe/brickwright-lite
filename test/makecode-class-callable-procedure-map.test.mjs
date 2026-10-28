import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerObjectClasses} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-object-classes.js';

test('class lowerer maps actual emitted procedures and hygienic self parameters without admitting callbacks',()=>{
    const program=parseMakeCodeTs('let __bwSelf=9;class Holder {value:number;constructor(){this.value=2}read():number{return this.value}}let holder=new Holder();let result=holder.read()',{retainClassHeritage:true,parameterDefaults:true});
    const cls=program.body.find(node=>node.type==='Class');cls.ctor.bwClassCallableScopeId=11;cls.methods[0].bwClassCallableScopeId=12;
    const result=lowerObjectClasses(program);assert.deepEqual(result.unsupported,[]);
    assert.equal(result.program.bwClassCallableProcedures.length,2);
    for(const mapping of result.program.bwClassCallableProcedures) {
        assert.equal(mapping.className,'Holder');assert.equal(mapping.receiverParameter,'__bwSelf_');
        const fn=result.program.body.find(node=>node.type==='FunctionDeclaration'&&mapping.procedure===node.name+node.params.map(()=> ' %s').join(''));
        assert.ok(fn);assert.equal(fn.params[0],mapping.receiverParameter);
    }
    assert.equal(result.program.bwClassCallableProcedures[0].methodName,null);
    assert.equal(result.program.bwClassCallableProcedures[1].methodName,'read');
});

test('no source marker grants a callable field or generic method runtime admission',()=>{
    for(const source of ['class Holder {action:()=>number;constructor(){}}let holder=new Holder()', 'class Holder {constructor(){}read<T>(value:T):T{return value}}let holder=new Holder()']) {
        const program=parseMakeCodeTs(source,{retainClassHeritage:true});program.body[0].ctor.bwClassCallableScopeId=11;
        const result=lowerObjectClasses(program);assert.ok(result.unsupported.length);
        assert.equal(result.program.bwClassCallableProcedures,undefined);
    }
});
