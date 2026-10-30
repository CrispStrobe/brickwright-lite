import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';

// A captured primitive cell read inside a class method is admitted only when
// its sole declaration runs before any possible entry. A preceding class
// declaration with a static heritage name (the exporter's ExtendableSprite
// subclasses) runs no code, exactly like a class without heritage.
const helper=nativeArrayAddHelperSource('__bwBinaryAdd',true,true),profile=GENERATED_HELPER_PROFILES.ordinary;
const inspect=source=>inspectNativeArrayBinaryDomains(parseMakeCodeTs(helper+'\n'+source,profile),profile);
const program=(heritage,between='')=>`function __bwStartup () {
    updates = (0 + 0)
    actor = new Actor()
}
class Actor ${heritage}{
    constructor() {
    super(img\`1\`, SpriteKind.Player)
    }
    update(dt: number) {
    updates = __bwBinaryAdd(updates, (0 + 1))
    }
}
${between}let actor: any
let updates: number
__bwStartup()`;

test('a static heritage class before the captured declaration admits the method addition',()=>{
    const result=inspect(program('extends sprites.ExtendableSprite '));
    assert.equal(result.reason,null);assert.equal(result.helpers.size,1);assert.equal(result.current(),true);
});

test('an executable statement before the captured declaration keeps the refusal with static heritage',()=>{
    const result=inspect(program('extends sprites.ExtendableSprite ','new Actor()\n'));
    assert.equal(typeof result.reason,'string');assert.equal(result.helpers.size,0);
});
