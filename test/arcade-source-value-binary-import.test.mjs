import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

test('source arithmetic keeps Array and primitive writer unions distinct from native helpers and opaque domains',()=>{
    for(const source of [
        'let a:any=0; a=[5]; let text=a+"!"',
        'let a:any=null; a=[5]; let alias=a; let text="!"+alias',
        'let a:any=false; if(true){a=[5]} let alias=a; let text=alias+2'
    ]){
        const imported=arcadeToPseudocode(source);
        assert.deepEqual(imported.unsupported,[],source);
        assert.match(imported.code,/arcade source value/);
    }
    const scalar=arcadeToPseudocode('let a:any=0; a=5; let text=a+"!"');
    assert.deepEqual(scalar.unsupported,[]);assert.doesNotMatch(scalar.code,/arcade source value/);
    for(const source of [
        'let a:any=foreign(); a=[5]; let text=a+"!"',
        'let a:any={}; a=[5]; let text=a+"!"'
    ]){
        const imported=arcadeToPseudocode(source);
        assert.ok(imported.unsupported.some(reason=>reason.includes('Arcade source Array arithmetic requires')),JSON.stringify(imported.unsupported));
        assert.doesNotMatch(imported.code,/arcade source value/);
    }
});
