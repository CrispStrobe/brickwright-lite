import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {ARTWORK_PATH, ARTWORK_FORMAT, artworkBundleVersion} from '../overlay/scratch-gui/src/lib/bw-artwork-bundle.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {importProjectFiles, importArtefact, makeCodeSourceHex} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {ANIMATION_COMPANION_PATH} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-companion.js';
import {imageToSvg} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';

const uuid = '12345678-1234-4234-8234-123456789abc';
const document = () => {
    const frames = [[2,3],[4,5]].map((pixels, index) => ({id:`frame-${index}`,durationMs:100,activeLayerId:'pixels',
        layers:[{id:'pixels',name:'Pixels',type:'pixel',visible:true,locked:false,opacity:1,
            content:{kind:'pixels',value:{width:2,height:1,pixels}}}]}));
    return {version:4,pixelScale:1,layers:frames[0].layers,activeLayerId:'pixels',
        animation:{resource:{id:uuid,name:'Walk'},activeFrameId:'frame-0',frames}};
};
const creator = () => {
    const result = new Creator();
    result.parse('DEVICE ARCADE\nWHEN flag clicked:\n  arcade log "ready"\n');
    assert.deepEqual(result.warnings,[]);
    return result;
};

test('full project and embedded file imports recover unused rich animation source separately from code', async () => {
    const source=document(),exported=projectToArcade(creator().project,{animationDocuments:[source]});
    assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
    assert.ok(JSON.parse(exported.files['pxt.json']).files.includes(ANIMATION_COMPANION_PATH));
    const inputs=structuredClone(exported.files);
    const direct=importProjectFiles(inputs,{target:'arcade'});
    const embedded=await importArtefact(new TextEncoder().encode(makeCodeSourceHex(inputs,{target:'arcade',name:'animation'})),{name:'animation.hex'});
    for(const imported of [direct,embedded]){
        assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
        assert.equal(imported.animationResources.length,1);
        assert.deepEqual(imported.animationResources[0].document,source);
        assert.equal(imported.animationResources[0].id,'myAnimations.animation0');
        assert.deepEqual(imported.animationResources[0].frames.map(frame=>[...frame.pixels]),[[2,3],[4,5]]);
    }
    assert.deepEqual(inputs,exported.files,'recovery does not mutate original downloaded source');
});

test('malformed companion refuses the project import atomically instead of discarding layered source', () => {
    const exported=projectToArcade(creator().project,{animationDocuments:[document()]});
    const files={...exported.files,[ANIMATION_COMPANION_PATH]:'{"format":"brickwright-animation","version":999}'};
    const unchanged=structuredClone(files);
    assert.throws(()=>importProjectFiles(files,{target:'arcade'}),/companion|version/i);
    assert.deepEqual(files,unchanged);
});

test('CLI source export reads current SB3 artwork bundles and includes native galleries plus rich source', async () => {
    const temp=await fs.mkdtemp(path.join(os.tmpdir(),'bw-animation-source-cli-'));
    try {
      for (const interval of [null, 1, 65535]) {
        const cr=creator(),source=document(),zip=await JSZip.loadAsync(await (await cr.generateSB3()).arrayBuffer());
        if (interval !== null) {
            source.version = 5; source.animation.frames.length = 1;
            source.animation.frames[0].durationMs = interval;
        }
        const project=JSON.parse(await zip.file('project.json').async('string'));
        const svg=imageToSvg({width:2,height:1,pixels:Uint8Array.from([2,3])},undefined,1);
        const assetId=createHash('md5').update(svg).digest('hex'),md5ext=`${assetId}.svg`;
        project.targets[0].costumes[0]={name:'Animation source',assetId,md5ext,dataFormat:'svg',rotationCenterX:1,rotationCenterY:0.5};
        zip.file(md5ext,svg);zip.file('project.json',JSON.stringify(project));
        zip.file(ARTWORK_PATH,JSON.stringify({format:ARTWORK_FORMAT,version:artworkBundleVersion([{document:source}]),costumes:[
            {targetIndex:0,costumeIndex:0,renderedMd5ext:md5ext,document:source}]}));
        const input=path.join(temp,'source.sb3'),output=path.join(temp,'source.hex');
        await fs.writeFile(input,await zip.generateAsync({type:'nodebuffer'}));
        const run=spawnSync(process.execPath,['scripts/makecode.mjs','to-hex',input,'--target','arcade','--source','-o',output],
            {cwd:process.cwd(),encoding:'utf8',timeout:30000});
        assert.equal(run.status,0,run.stderr);assert.ok(!run.stderr.includes('not translated:'),run.stderr);
        const imported=await importArtefact(await fs.readFile(output),{name:'source.hex'});
        assert.equal(imported.animationResources.length,1);
        assert.deepEqual(imported.animationResources[0].document,source);
      }
    } finally {await fs.rm(temp,{recursive:true,force:true});}
});
