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
`;
    const expected = await runPxtArcade({'main.ts': source, 'text.ts': original,
        'pxt.json': JSON.stringify({name: 'text-host-oracle', dependencies: {device: '*'}, files: ['text.ts','main.ts']})});
    const runtime = new EventEmitter(), errors = [];
    runtime.startHats = () => [];
    runtime.on('BLOCKS_ERROR', error => errors.push(error));
    const native = new (loadExtensionClass('arcade'))(runtime), ext = native._inst;
    const module = createHost(ext, createImages([], initializeImages), initializeOriginal);
    const label = module.textsprite.create('A');
    const snapshot = () => {
        const s = ext._spriteValues.get(label.__bwId), img = s.image;
        return [s.width,s.height,s.x,s.y,s.flags].join(',') + ':' + Array.from(img.pixels, c => c + ',').join('');
    };
    const check = name => assert.equal(snapshot(), expected[name], name);
    check('first'); label.setText('AB'); check('second');
    label.setBorder(2,6,1); check('border'); label.setOutline(1,3); check('outline');
    label.setIcon(module.wrapImage({width:2,height:3,pixels:Uint8Array.from([1,0,0,2,3,0])})); check('withIcon');
    label.setMaxFontHeight(20); check('scaled');
    label.setMaxFontHeight(12); label.setText('漢'); check('unicode');
    label.setText(null); check('empty');
    assert.equal(expected.createdCount, 0, 'original textsprite.create does not invoke sprites.create handlers');
    assert.equal(expected.sameKind, true);
    assert.equal(ext._spriteValues.get(label.__bwId).kind, 'Text');
    assert.equal(ext._state().physicsEngine.members.filter(s => s.id === label.__bwId).length, 1);
    assert.deepEqual(errors, []);
});
