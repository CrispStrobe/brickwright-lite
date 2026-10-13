import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
const setup='let actor=sprites.create(img`1`,SpriteKind.Player);';

test('exact nine Sprite Data APIs lower to typed native records and preserve value evaluation order',()=>{
    const source=setup+`
let other=sprites.create(img\`2\`,SpriteKind.Enemy)
sprites.setDataNumber(actor,"count",3)
sprites.changeDataNumberBy(actor,"count",2)
sprites.setDataString(actor,"name","actor")
sprites.setDataBoolean(actor,"ready",true)
sprites.setDataSprite(actor,"other",other)
let count=sprites.readDataNumber(actor,"count")
let name=sprites.readDataString(actor,"name")
let ready=sprites.readDataBoolean(actor,"ready")
let stored=sprites.readDataSprite(actor,"other")
let aliases=[stored]
let x=aliases[0].x
function forward(value:Sprite){return sprites.readDataSprite(value,"other")}
let y=forward(actor).y
function owner(){return actor}
function key(){return "count"}
function value(){return 5}
sprites.setDataNumber(owner(),key(),value())`;
    const result=arcadeToPseudocode(source);assert.deepEqual(result.unsupported,[]);
    for(const type of ['Number','String','Boolean','Sprite']) {
        assert.match(result.code,new RegExp(`arcade set sprite \\(actor\\) data .+ type ${type} to`));
        assert.match(result.code,new RegExp(`arcade sprite \\(actor\\) data .+ type ${type}`));
    }
    assert.match(result.code,/arcade change sprite \(actor\) number data \("count"\) by \(\(0 \+ \(2\)\)\)/);
    assert.match(result.code,/arcade property x of/);
    assert.match(result.code,/arcade property y of/);
    const line=result.code.split('\n').find(line=>line.includes('arcade set sprite') && line.includes('"owner"'));
    for(const name of ['owner','key','value'])assert.equal((line.match(new RegExp(`arcade call function "${name}"`,'g'))||[]).length,1);
    assert.ok(line.indexOf('"owner"')<line.indexOf('"key"'));assert.ok(line.indexOf('"key"')<line.indexOf('"value"'));
});

test('null guards and empty keys reach original helper semantics without invented default values',()=>{
    const result=arcadeToPseudocode('let none:Sprite=null;let missing=sprites.readDataNumber(none,"x");let keyMissing=sprites.readDataString(none,"");let flag=sprites.readDataBoolean(none,"x");sprites.setDataSprite(none,"x",none)');
    assert.deepEqual(result.unsupported,[]);assert.match(result.code,/arcade sprite \(none\) data \("x"\) type Number/);
});

test('unknown Sprite Data helpers, arities and arbitrary data object accesses remain explicit gaps',()=>{
    for(const source of [setup+'sprites.setDataImage(actor,"x",img`1`)',setup+'let v=sprites.readDataImage(actor,"x")',setup+'sprites.changeDataNumber(actor,"x",1)',setup+'sprites.setDataNumber(actor,"x")',setup+'let n=sprites.readDataNumber(actor)',setup+'let n=actor.data.n',setup+'actor.data.n=2'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});
