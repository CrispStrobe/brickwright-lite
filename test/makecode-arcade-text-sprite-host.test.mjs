import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const require = createRequire(import.meta.url);
const dir = '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/';
const initializeOriginal = require(dir + 'text-sprite-pxt.js');
const createHost = require(dir + 'text-sprite-host.js');
const createImages = require(dir + 'image.js');
const initializeImages = require(dir + 'image-pxt.js');
const original = readFileSync(new URL(dir + 'text-sprite-source/text.ts', import.meta.url), 'utf8');

test('complete original Text Sprite algorithms are reproducible from the retained source', () => {
    execFileSync(process.execPath, ['scripts/generate-arcade-text-sprite.mjs', '--check']);
});

test('Text Sprite original/native pixels and resize positions agree across setters and fonts', async () => {
    const source = `
let createdCount=0
sprites.onCreated(SpriteKind.Text, function(){createdCount++})
let label=textsprite.create("A")
function snapshot(s:TextSprite) {
    let value=""+s.width+","+s.height+","+s.x+","+s.y+","+s.flags+":"
    for(let y=0;y<s.image.height;y++) for(let x=0;x<s.image.width;x++) value+=s.image.getPixel(x,y)+",";
    return value
}
let first=snapshot(label)
label.setText("AB")
let second=snapshot(label)
label.setBorder(2,6,1)
let border=snapshot(label)
label.setOutline(1,3)
let outline=snapshot(label)
let icon=img\`1 .\n. 2\n3 .\`
label.setIcon(icon)
let withIcon=snapshot(label)
label.setMaxFontHeight(20)
let scaled=snapshot(label)
label.setMaxFontHeight(12)
label.setText("漢")
let unicode=snapshot(label)
label.setText(null)
let empty=snapshot(label)
let sameKind=label.kind()==SpriteKind.Text
let actualKind=label.kind();actualKind+=0
`;
    const expected = await runPxtArcade({'main.ts': source, 'text.ts': original,
        'pxt.json': JSON.stringify({name: 'text-host-oracle', dependencies: {device: '*'}, files: ['text.ts','main.ts']})});
    const runtime = new EventEmitter(), errors = [];
    runtime.startHats = () => [];
    runtime.on('BLOCKS_ERROR', error => errors.push(error));
    const native = new (loadExtensionClass('arcade'))(runtime), ext = native._inst;
    const id = native.textSpriteCreate({TEXT:'A',BACKGROUND:0,FOREGROUND:1});
    const label = ext._extensionSprites.get(id);
    const snapshot = () => {
        const s = ext._spriteValues.get(label.__bwId), img = s.image;
        return [s.width,s.height,s.x,s.y,s.flags].join(',') + ':' + Array.from(img.pixels, c => c + ',').join('');
    };
    const check = name => assert.equal(snapshot(), expected[name], name);
    check('first'); native.textSpriteSetText({ID:id,TEXT:'AB'}); check('second');
    native.textSpriteSetBorder({ID:id,WIDTH:2,COLOR:6,PADDING:1}); check('border');
    native.textSpriteSetOutline({ID:id,WIDTH:1,COLOR:3}); check('outline');
    const icon=ext._imageHandle({width:2,height:3,pixels:Uint8Array.from([1,0,0,2,3,0])});
    native.textSpriteSetIcon({ID:id,IMAGE:icon}); check('withIcon');
    native.textSpriteSetMaxFontHeight({ID:id,HEIGHT:20}); check('scaled');
    native.textSpriteSetMaxFontHeight({ID:id,HEIGHT:12}); native.textSpriteSetText({ID:id,TEXT:'漢'}); check('unicode');
    native.textSpriteSetText({ID:id,TEXT:null}); check('empty');
    assert.equal(expected.createdCount, 0, 'original textsprite.create does not invoke sprites.create handlers');
    assert.equal(expected.sameKind, true);
    assert.equal(ext._spriteValues.get(label.__bwId).kind, expected.actualKind);
    assert.equal(ext._kindRegistry.displayName(expected.actualKind), 'Text');
    assert.equal(ext._state().physicsEngine.members.filter(s => s.id === label.__bwId).length, 1);
    assert.deepEqual(errors, []);
});
