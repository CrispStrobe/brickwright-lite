import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const create=text=>{const out=arcadeToPseudocode(text);assert.deepEqual(out.unsupported||[],[]);const c=new Creator();c.parse(out.code);assert.deepEqual(c.errors||[],[]);return c;};
const both=c=>[projectToArcade(c.project),projectJsonToArcade(JSON.stringify(c.project))];

// The direct API holds live objects, which cannot enroll in the private JSON
// entry issuer. Its unreachability proof comes from the descriptor-checked
// owned copy, so an uncalled helper exports the same way through both routes.
test('uncalled bitwise helpers export identically through the direct and JSON routes',()=>{
    for(const text of ['function f(a:number){return a & 2}\nlet q=1',
        'function unusedSprite(actor:Sprite){return actor.flags & SpriteFlag.StayInScreen}\nlet q=1']){
        const [direct,json]=both(create(text));
        assert.deepEqual(direct.unsupported,[],text);assert.deepEqual(json.unsupported,[],text);assert.deepEqual(direct.files,json.files);
    }
});

test('a reached helper keeps its operand proof obligation on both routes',()=>{
    const [direct,json]=both(create('function g(actor:Sprite){return actor.flags & 2}\nlet s=sprites.create(image.create(1,1),1);let q=g(s)'));
    for(const out of [direct,json])assert.ok(out.unsupported.some(reason=>/Native bitwise operation/.test(reason)));
});
