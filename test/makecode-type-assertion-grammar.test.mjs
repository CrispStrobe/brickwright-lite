import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';

test('nested angle assertions retain runtime expressions and type metadata without consuming comparison or shift operators',()=>{
    const parsed=parseMakeCodeTs('let cast=<any><number>(-1);let array=<Array<Array<number>>>value;let less=a<b;let shifted=a>>2;');
    const [cast,array,less,shifted]=parsed.body.map(statement=>statement.decls[0].init);
    assert.equal(cast.type,'Unary');assert.equal(cast.op,'-');assert.deepEqual(cast.typeAssertions,['any','number']);
    assert.equal(array.type,'Identifier');assert.equal(array.name,'value');assert.equal(array.assertedType,'Array<Array<number>>');
    assert.equal(less.type,'Binary');assert.equal(less.op,'<');assert.equal(shifted.op,'>>');
});

test('postfix generic assertions and a following assignment to as remain separate statements',()=>{
    const parsed=parseMakeCodeTs('let value=source as Array<Array<number>>;let as=1;value=source\nas=2\nas++\n');
    assert.equal(parsed.body[0].decls[0].init.assertedType,'Array<Array<number>>');
    assert.equal(parsed.body[1].decls[0].name,'as');assert.equal(parsed.body.length,5);
    assert.equal(parsed.body[3].expr.left.name,'as');assert.equal(parsed.body[4].expr.argument.name,'as');
});

test('malformed angle assertions are rejected',()=>{
    for(const source of ['let value=<any,number>1','let value=<Array<number>1','let value=<>1'])assert.throws(()=>parseMakeCodeTs(source),/MakeCode TS/);
});
