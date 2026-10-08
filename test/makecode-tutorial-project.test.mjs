import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {tutorialProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/tutorial-project.js';
import {readMakeCodeProjectText} from '../overlay/scratch-gui/src/lib/bw-makecode/project-file.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
const block=(lang,text,mark='```')=>`${mark}${lang}\n${text}\n${mark}\n`;
const fixture=block('assetjson',JSON.stringify({'main.ts':'template','images.g.jres':'{"pixel":"exact bytes"}',
    'pxt.json':JSON.stringify({name:'Authored',files:['main.ts','images.g.jres'],palette:['#000000'],dependencies:{device:'*'}})}))+
    block('package','demo=github:example/demo#v1\nmultiplayer\n// comment\n')+block('customts','namespace SpriteKind {export const Bonus=SpriteKind.create()}','~~~~');

test('tutorial assembly preserves assets, palette, dependencies, custom code and exact selected main',()=>{
    const main='// selected\r\nlet answer=42\r\n';
    const project=tutorialProjectFiles(fixture,main);
    assert.equal(project.files['main.ts'],main);assert.equal(project.files['images.g.jres'],'{"pixel":"exact bytes"}');
    const config=JSON.parse(project.files['pxt.json']);
    assert.equal(config.name,'Authored');assert.deepEqual(config.palette,['#000000']);
    assert.equal(config.dependencies.demo,'github:example/demo#v1');assert.equal(config.dependencies.multiplayer,'*');assert.ok(config.files.includes('tutorial.custom.1.ts'));
    assert.match(project.files['tutorial.custom.1.ts'],/namespace SpriteKind/);
});

test('invalid or ambiguous tutorial inputs fail explicitly',()=>{
    for(const text of [block('assetjson','{bad'),block('assetjson','[]'),block('assetjson','{"../escape":"x"}'),
        block('assetjson','{"a.ts":"first"}')+block('assetjson','{"a.ts":"second"}'),
        block('package','demo=first\ndemo=second'),block('package','not a package'),
        '```assetjson\n{}',block('assetjson',JSON.stringify({'pxt.json':'{"files":["missing.ts"]}'}))]){
        assert.throws(()=>tutorialProjectFiles(text,'let x=1'),undefined,text);
    }
});

test('CLI assembles an offline native project, and requires an explicit main',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bw-tutorial-'));
    try{
        const doc=path.join(dir,'tutorial.md'),main=path.join(dir,'main.ts'),out=path.join(dir,'project.mkcd');
        fs.writeFileSync(doc,fixture);fs.writeFileSync(main,'let selected=19');
        const run=(...args)=>spawnSync(process.execPath,['scripts/makecode.mjs',...args],{encoding:'utf8',timeout:30000});
        const result=run('tutorial-to-project',doc,'--main',main,'--target','arcade','-o',out);
        assert.equal(result.status,0,result.stderr);
        const recovered=readMakeCodeProjectText(fs.readFileSync(out,'utf8'),'mkcd');
        assert.equal(recovered.meta.cloudId,'pxt/arcade');assert.equal(recovered.files['main.ts'],'let selected=19');
        assert.equal(JSON.parse(recovered.files['pxt.json']).dependencies.demo,'github:example/demo#v1');
        assert.equal(run('tutorial-to-project',doc).status,2);
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('supplemental Arcade code without a declared source order remains named',()=>{
    const imported=arcadeToPseudocode({'main.ts':'let x=1','game.ts':'let extra=2','images.g.ts':'// generated resource factories'});
    assert.ok(imported.unsupported.some(message=>message.includes('game.ts') && message.includes('source order')));
    assert.ok(!imported.unsupported.some(message=>message.includes('images.g.ts')));
});


test('custom palette rendering remains an explicit gap while project source retains its colors',async()=>{
    const {ARCADE_PALETTE}=await import('../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js');
    const palette=['#000000',...ARCADE_PALETTE.slice(1)];
    const files={'main.ts':'let x=1','pxt.json':JSON.stringify({palette})};
    assert.deepEqual(arcadeToPseudocode(files).unsupported,[]);
    palette[2]='#010203';files['pxt.json']=JSON.stringify({palette});
    assert.ok(arcadeToPseudocode(files).unsupported.some(message=>message.includes('custom palette')));
    assert.equal(JSON.parse(files['pxt.json']).palette[2],'#010203');
});
