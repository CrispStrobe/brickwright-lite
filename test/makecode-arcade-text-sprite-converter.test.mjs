import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {TEXT_SPRITE_INITIALIZER} from '../overlay/scratch-gui/src/lib/bw-makecode/text-source-admission.generated.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const original=readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/text-sprite-source/text.ts',import.meta.url),'utf8');
const source=`let created=0
sprites.onCreated(SpriteKind.Text,function(){created++})
let label=textsprite.create("A")
function snapshot(s:TextSprite):string {
    let value=""+s.width+","+s.height+","+s.x+","+s.y+":"
    for(let y=0;y<s.image.height;y++)for(let x=0;x<s.image.width;x++)value+=s.image.getPixel(x,y)+",";
    return value
}
function forward(s:TextSprite):TextSprite{return s}
let first=snapshot(label)
let labels=[forward(label)]
labels[0].setText("AB")
let second=snapshot(label)
label.bg=4
label.text="XYZ"
let notRedrawn=snapshot(label)
let storedText=label.text
label.update()
let updated=snapshot(label)
label.setBorder(2,6)
let border=snapshot(label)
label.setOutline(1,3)
let outline=snapshot(label)
let icon=img\`1 .\n. 2\n3 .\`
label.setIcon(icon)
let withIcon=snapshot(label)
let iconAlias=label.icon
iconAlias.setPixel(0,0,8)
let iconPixel=icon.getPixel(0,0)
label.update()
let iconUpdated=snapshot(label)
label.setMaxFontHeight(12)
label.setText("漢")
let unicode=snapshot(label)
label.setIcon(null)
let clearedIcon=snapshot(label)
label.setText(null)
let empty=snapshot(label)
let memberCount=sprites.allOfKind(SpriteKind.Text).length
let defaultBg=label.bg
let defaultFg=label.fg
let fontHeight=label.maxFontHeight
let pad=label.padding
let done=1
done+=0`;
const names=['created','first','second','notRedrawn','storedText','updated','border','outline','withIcon','iconPixel','iconUpdated','unicode','clearedIcon','empty','memberCount','defaultBg','defaultFg','fontHeight','pad','done'];
const project=(main,text)=>({'main.ts':main,'text.ts':text,'pxt.json':JSON.stringify({name:'text-sprite-control',dependencies:{device:'*'},files:['text.ts','main.ts']})});
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('TextSprite source preserves original pixels, aliases, deferred property redraw and membership through editable roundtrips',async()=>{
    const expected=await runPxtArcade(project(source,original));
    assert.equal(expected.created,0);assert.equal(expected.memberCount,1);assert.equal(expected.iconPixel,8);assert.equal(expected.notRedrawn,expected.second);assert.equal(expected.defaultFg,1);assert.equal(expected.pad,0);
    const imported=arcadeToPseudocode(project(source,TEXT_SPRITE_INITIALIZER));assert.deepEqual(imported.unsupported,[]);
    const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const name of names)assert.equal(values(run)[name],expected[name],name);};
    try{
        const run=await runProgram(imported.code,{frames:150,uploads:imported.costumes,storage:true});check(run);
        const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(archive);run.vm.greenFlag();await stepFrames(run.vm,150);check(run);
        const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});fresh.vm.stopAll();await fresh.vm.loadProject(archive);fresh.vm.greenFlag();await stepFrames(fresh.vm,150);check(fresh);fresh.vm.quit?.();
        check(await runProgram(run.creator.decompile(),{frames:150,uploads:imported.costumes,storage:true}));
        const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
        assert.equal(JSON.parse(exported.files['pxt.json']).dependencies['arcade-text'],'github:microsoft/arcade-text#fa2439314c6633943666a763fdae32a5c67a9ae8');
        assert.match(exported.ts,/TextSprite/);assert.ok(!/export const Text\s*=/.test(exported.ts),'package installs its own Text kind once');
        const exportedFiles={...exported.files,'text.ts':original};const manifest=JSON.parse(exportedFiles['pxt.json']);delete manifest.dependencies['arcade-text'];manifest.files=['text.ts',...manifest.files];exportedFiles['pxt.json']=JSON.stringify(manifest);
        const oracle=await runPxtArcade(exportedFiles);for(const name of names)assert.equal(oracle[name]??oracle['Game_'+name],expected[name],name+' exported');
        const reimported=arcadeToPseudocode(exported.ts);assert.deepEqual(reimported.unsupported,[]);check(await runProgram(reimported.code,{frames:150,uploads:reimported.costumes,storage:true}));
    }finally{clearStrayTimers();}
});

test('unimplemented utility calls, wrong arity and shadowed extension namespaces retain diagnostics',()=>{
    for(const main of ['textsprite.create()','let label=textsprite.create("A");label.setBorder(1)','textsprite.renderScaledImage(img`1`,img`2`,0,0)','let textsprite=3;textsprite.create("A")'])assert.ok(arcadeToPseudocode(main).unsupported.length,main);
});
