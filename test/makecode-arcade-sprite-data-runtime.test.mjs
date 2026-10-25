import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
const setup=()=>{const runtime=new EventEmitter(),errors=[];runtime.startHats=()=>[];runtime.on('BLOCKS_ERROR',e=>errors.push(e));const native=new(loadExtensionClass('arcade'))(runtime);const id=native.createSprite({WIDTH:1,HEIGHT:1,KIND:'Player'});return {runtime,errors,native,id,owner:native._inst};};
const undefinedValue=value=>value?.bwUndefined===true;

test('native Sprite Data preserves original missing values, null guards, boolean coercion and aliased sprites',()=>{
    const {native,id,errors}=setup();
    assert.ok(undefinedValue(native.spriteDataRead({ID:id,KEY:'missing',TYPE:'Number'})));
    assert.ok(undefinedValue(native.spriteDataRead({ID:id,KEY:'missing',TYPE:'String'})));
    assert.ok(undefinedValue(native.spriteDataRead({ID:id,KEY:'missing',TYPE:'Sprite'})));
    assert.equal(native.spriteDataRead({ID:'',KEY:'missing',TYPE:'Number'}),0);
    assert.equal(native.spriteDataRead({ID:id,KEY:'',TYPE:'String'}),'');
    assert.equal(native.spriteDataReadBoolean({ID:id,KEY:'missing'}),false);
    native.spriteDataSet({ID:id,KEY:'value',TYPE:'String',VALUE:''});native.spriteDataChange({ID:id,KEY:'value',VALUE:4});
    assert.equal(native.spriteDataRead({ID:id,KEY:'value',TYPE:'Number'}),4);
    native.spriteDataSet({ID:id,KEY:'value',TYPE:'String',VALUE:'A'});native.spriteDataChange({ID:id,KEY:'value',VALUE:4});
    assert.equal(native.spriteDataRead({ID:id,KEY:'value',TYPE:'Number'}),'A4','type assertion does not coerce original stored values');
    native.spriteDataSet({ID:id,KEY:'flag',TYPE:'Boolean',VALUE:'false'});assert.equal(native.spriteDataReadBoolean({ID:id,KEY:'flag'}),true,'nonempty text is truthy');
    const other=native.createSprite({WIDTH:1,HEIGHT:1,KIND:'Enemy'});native.spriteDataSet({ID:id,KEY:'other',TYPE:'Sprite',VALUE:other});
    assert.equal(native.spriteDataRead({ID:id,KEY:'other',TYPE:'Sprite'}),other);
    native.spriteDataSet({ID:'',KEY:'other',TYPE:'Sprite',VALUE:'not-a-sprite'});assert.deepEqual(errors,[],'original null setter guard precedes data access');
});

test('record replacement retains detached old state, while falsy records initialize lazily',()=>{
    const {native,id,owner,errors}=setup(),sprite=owner._sprite(id);
    native.spriteDataSet({ID:id,KEY:'n',TYPE:'Number',VALUE:3});const old=sprite.data;
    sprite.data={n:7};native.spriteDataChange({ID:id,KEY:'n',VALUE:2});assert.equal(old.n,3);assert.equal(sprite.data.n,9);
    for(const value of [undefined,null,false,0,'']){sprite.data=value;assert.ok(undefinedValue(native.spriteDataRead({ID:id,KEY:'missing',TYPE:'Number'})));assert.equal(typeof sprite.data,'object');}
    assert.deepEqual(errors,[]);
});

test('readonly records, foreign values and unknown types fail with named diagnostics',()=>{
    const {native,id,owner,errors}=setup();
    owner._sprite(id).data=Object.freeze({n:3});native.spriteDataSet({ID:id,KEY:'n',TYPE:'Number',VALUE:4});assert.equal(owner._sprite(id).data.n,3);
    owner._sprite(id).data={};native.spriteDataSet({ID:id,KEY:'other',TYPE:'Sprite',VALUE:'not-a-sprite'});
    native.spriteDataRead({ID:id,KEY:'x',TYPE:'Image'});
    assert.equal(errors.length,3);assert.ok(errors.every(error=>/read only|not available|not supported/.test(error)));
    for(const data of [[],new Date(0),Object.create({foreign:true})]){
        owner._sprite(id).data=data;native.spriteDataRead({ID:id,KEY:'x',TYPE:'Number'});assert.match(errors.at(-1),/owned data record/);
    }
    const info=native.getInfo();assert.equal(info.blocks.find(b=>b.opcode==='spriteDataReadBoolean').blockType,'Boolean');assert.deepEqual(info.menus.spriteDataTypes.items,['Number','String','Boolean','Sprite']);
});


test('Sprite Data reads only own keys and stores prototype names without changing or replacing the record',()=>{
    const {native,id,owner,errors}=setup(),sprite=owner._sprite(id);
    const record=sprite.data,prototype=Object.getPrototypeOf(record);
    for(const key of ['__proto__','prototype','constructor','toString','hasOwnProperty','valueOf']) {
        assert.ok(undefinedValue(native.spriteDataRead({ID:id,KEY:key,TYPE:'Number'})),key+' missing number');
        assert.ok(undefinedValue(native.spriteDataRead({ID:id,KEY:key,TYPE:'String'})),key+' missing string');
        assert.equal(native.spriteDataReadBoolean({ID:id,KEY:key}),false,key+' missing boolean');
        native.spriteDataChange({ID:id,KEY:key,VALUE:2});
        assert.equal(native.spriteDataRead({ID:id,KEY:key,TYPE:'Number'}),2,key+' change missing starts at zero');
        assert.equal(record[key],2,key+' alias sees own stored value');
        assert.equal(Object.getPrototypeOf(record),prototype);assert.equal(sprite.data,record);
    }
    const other=native.createSprite({WIDTH:1,HEIGHT:1,KIND:'Enemy'});
    native.spriteDataSet({ID:id,KEY:'__proto__',TYPE:'Sprite',VALUE:other});
    assert.equal(native.spriteDataRead({ID:id,KEY:'__proto__',TYPE:'Sprite'}),other);
    assert.equal(record.__proto__,other);assert.equal(Object.getPrototypeOf(record),prototype);
    sprite.data={};assert.ok(undefinedValue(native.spriteDataRead({ID:id,KEY:'__proto__',TYPE:'Number'})));
    assert.equal(record.__proto__,other,'detached old record retains its value');
    sprite.data=Object.create(null);native.spriteDataSet({ID:id,KEY:'constructor',TYPE:'String',VALUE:'own'});
    assert.equal(sprite.data.constructor,'own');assert.equal(Object.getPrototypeOf(sprite.data),null);
    const readonly={};Object.defineProperty(readonly,'n',{value:1,writable:true,configurable:false});sprite.data=readonly;
    native.spriteDataChange({ID:id,KEY:'n',VALUE:2});assert.equal(readonly.n,3,'existing nonconfigurable writable value remains writable');
    const inaccessible={};Object.defineProperty(inaccessible,'n',{get(){throw new Error('getter must not execute')}});sprite.data=inaccessible;
    native.spriteDataRead({ID:id,KEY:'n',TYPE:'Number'});assert.equal(errors.length,1);assert.match(errors[0],/accessor keys/);
});
