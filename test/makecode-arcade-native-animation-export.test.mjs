import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {decodeAnimationJres} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-jres.js';
import {INTEGRATED} from './helpers/bw-integrated.mjs';
import {compile} from '../scripts/lib/pxt-node.mjs';
import {runArcadeSim} from '../scripts/lib/makecode-arcade-sim.mjs';
const pixels = [[1,2,3,4,5,6],[7,8,9,10,11,12]];
const document = (id='resource-1',name='Walking') => ({version:4,animation:{resource:{id,name},
    frames:pixels.map((values,i)=>({id:`frame-${i}`,durationMs:125,layers:[{type:'pixel',visible:true,opacity:1,
        content:{kind:'pixels',value:{width:3,height:2,pixels:values}}}]}))}});
const project = () => {const c=new Creator();c.parse('DEVICE ARCADE\nWHEN flag clicked:\n  arcade log "ready"\n');assert.deepEqual(c.warnings,[]);return c.project;};
const execute = async files => {
    const compiled=await compile('arcade',files);
    assert.equal(compiled.success,true,JSON.stringify(compiled.diagnostics));
    assert.deepEqual(compiled.netAttempts,[]);
    const run=await runArcadeSim(compiled.outfiles['binary.js'],{ms:100});
    assert.equal(run.error,null);
    return run.serial.map(row=>String(row.text).trim());
};
const originalFactory = gallery => {
    const dir=path.join(INTEGRATED,'static/makecode/arcade');
    const oracle=vm.createContext({console:{log(){},warn(){},error(){},debug(){}},setTimeout,clearTimeout,
        setInterval,clearInterval,TextEncoder,TextDecoder,atob,btoa,
        pxtTargetBundle:JSON.parse(fs.readFileSync(path.join(dir,'target.json'),'utf8')),gallery});
    oracle.global=oracle;oracle.self=oracle;
    vm.runInContext(fs.readFileSync(path.join(dir,'pxtworker.js'),'utf8'),oracle,{timeout:10000});
    return vm.runInContext('pxt.emitProjectImages(gallery)',oracle,{timeout:1000});
};

test('unused published timelines export editable native gallery entries and original-equivalent factories',async()=>{
    const exported=projectToArcade(project(),{animationDocuments:[document()]});
    assert.deepEqual(exported.unsupported,[]);
    const config=JSON.parse(exported.files['pxt.json']);
    for(const file of ['images.g.jres','images.g.ts','main.ts'])assert.ok(config.files.includes(file));
    assert.ok(!exported.ts.includes('__bwAnimationFrames'),'unused resource does not add main-code helpers');
    const gallery=JSON.parse(exported.files['images.g.jres']);
    assert.equal(Object.keys(gallery).length,1);
    const [entry]=Object.values(gallery),decoded=decodeAnimationJres(entry);
    assert.equal(decoded.name,'Walking');assert.equal(decoded.intervalMs,125);
    assert.deepEqual(decoded.frames.map(frame=>[...frame.pixels]),pixels);
    const main='let a=assets.animation`animation0`; let b=assets.animation`Walking`; console.log(a===b); '+
        'for(let f of a){console.log(f.width);console.log(f.height);for(let y=0;y<f.height;y++){for(let x=0;x<f.width;x++){console.log(f.getPixel(x,y))}}}';
    const files={...exported.files,'main.ts':main};
    const expected=['false',...pixels.flatMap(frame=>['3','2',...frame.map(String)])];
    assert.deepEqual(await execute(files),expected,'our factory has exact dimensions, pixel order and fresh lookup arrays');
    assert.deepEqual(await execute({...files,'images.g.ts':originalFactory(gallery)}),expected,
        'same native gallery executes with actual original PXT emitter output');
});

test('native aliases avoid generated ID/display-name collisions and preserve Unicode names',async()=>{
    const exported=projectToArcade(project(),{animationDocuments:[document('one','animation0'),document('two','走る')]});
    assert.deepEqual(exported.unsupported,[]);
    const gallery=JSON.parse(exported.files['images.g.jres']);
    assert.deepEqual(Object.values(gallery).map(row=>row.id),['animation0_','animation1']);
    assert.deepEqual(await execute({...exported.files,'main.ts':'console.log(assets.animation`animation0`[0].getPixel(2,1)); console.log(assets.animation`走る`[1].getPixel(2,1));'}),['6','12']);
});

test('native assets refuse invalid display names and duplicate aliases explicitly',()=>{
    const bad=projectToArcade(project(),{animationDocuments:[document('one','bad.name')]});
    assert.ok(bad.unsupported.some(message=>message.includes('display name')));
    const duplicate=projectToArcade(project(),{animationDocuments:[document('one','Walking'),document('two','Walking')]});
    assert.ok(duplicate.unsupported.some(message=>message.includes('Duplicate native animation display name')));
    const none=projectToArcade(project());
    assert.equal(none.files['images.g.jres'],undefined);
    assert.equal(none.files['images.g.ts'],undefined);
});

test('native generated factory namespace avoids saved user globals',async()=>{
    const creator=new Creator();
    creator.parse('DEVICE ARCADE\nGLOBAL __bwAnimationAssets = 42\nGLOBAL myImages = 17\nWHEN flag clicked:\n  arcade log (__bwAnimationAssets)\n  arcade log (myImages)\n');
    assert.deepEqual(creator.warnings,[]);
    const exported=projectToArcade(creator.project,{animationDocuments:[document()]});
    assert.deepEqual(exported.unsupported,[]);
    assert.match(exported.files['images.g.ts'],/namespace __bwAnimationAssets_ \{/);
    assert.deepEqual(await execute(exported.files),['42','17']);
});
