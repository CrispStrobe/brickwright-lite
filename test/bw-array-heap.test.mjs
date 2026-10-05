import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const values=require('../overlay/scratch-vm/src/util/bw-values.js');

test('shared array heap preserves identity and expires references across runtimes and project resets',()=>{
    const runtime=new EventEmitter(),other=new EventEmitter();
    const array=['sprite-one','sprite-two'];
    const first=values.arrayReference(runtime,array);
    assert.equal(values.arrayReference(runtime,array),first);
    assert.equal(values.arrayValue(runtime,first),array);
    assert.equal(values.arrayValue(other,first),undefined);
    const snapshot=values.arrayReference(runtime,array.slice());
    assert.notEqual(snapshot,first);
    values.arrayValue(runtime,snapshot).pop();
    assert.equal(array.length,2);
    for(const event of ['PROJECT_START','PROJECT_LOADED','RUNTIME_DISPOSED']){
        const old=values.arrayReference(runtime,array);
        runtime.emit(event);
        assert.equal(values.arrayValue(runtime,old),undefined);
        const fresh=values.arrayReference(runtime,array);
        assert.notEqual(fresh,old);
        assert.equal(values.arrayValue(runtime,fresh),array);
    }
});

test('tile locations retain their reference kind inside shared arrays and expire at project restart',()=>{
    const runtime=new EventEmitter(),other=new EventEmitter();
    const location=values.reference(runtime,'tile','location-one');
    const copy=JSON.parse(JSON.stringify(location));
    assert.ok(values.isReference(copy));
    assert.equal(values.decode(copy),location);
    assert.equal(values.referenceId(runtime,copy,'tile'),'location-one');
    assert.equal(values.referenceId(runtime,copy,'image'),null);
    assert.equal(values.referenceId(other,copy,'tile'),null);
    const array=values.arrayReference(runtime,[location]);
    assert.equal(values.arrayValue(runtime,array)[0],location);
    runtime.emit('PROJECT_START');
    assert.equal(values.referenceId(runtime,copy,'tile'),null);
    assert.equal(values.arrayValue(runtime,array),undefined);
});
