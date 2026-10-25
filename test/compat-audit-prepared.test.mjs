import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {hasRuntime} from '../scripts/lib/pxt-node.mjs';
import {makeCodeProjectFile} from '../overlay/scratch-gui/src/lib/bw-makecode/project-file.js';
const root=path.resolve(import.meta.dirname,'..');
const sha=text=>createHash('sha256').update(text).digest('hex');
for(const missing of [false,true])test('prepared CLI keeps raw classification and input bytes when '+(missing?'offline package input is missing':'original package preparation succeeds'),
    {skip:hasRuntime('arcade')?false:'Arcade original worker not synced'},()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bw-prepared-audit-'));
    try {
        const source='let observed=1\nobserved+=0\n';
        const files={'main.ts':source,'pxt.json':JSON.stringify({name:'prepared',dependencies:{device:'*',...(missing?{missing:'github:example/missing#'+'1'.repeat(40)}:{})},files:['main.ts']})};
        const original=makeCodeProjectFile(files,{target:'arcade',name:'prepared'}),input=path.join(dir,'project.mkcd'),out=path.join(dir,'report.json');
        fs.writeFileSync(input,original);
        const before=fs.readFileSync(input);
        const run=spawnSync(process.execPath,['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON','scripts/compat-audit.mjs','--target','arcade','--prepare-extensions','--out',out,input],{cwd:root,encoding:'utf8',timeout:60000});
        assert.equal(run.status,missing?1:0,run.stderr);
        assert.deepEqual(fs.readFileSync(input),before);
        const report=JSON.parse(fs.readFileSync(out)),row=report.rows[0];
        assert.equal(row.stage,'translated');assert.deepEqual(row.unsupported,[]);
        assert.equal(report.compilerPolicy.extensionFetching,'offline');
        if(missing){
            assert.equal(row.preparedTranslation.stage,'preparation-failed');
            assert.equal(row.preparedTranslation.code,'NO_EXTENSION');
            assert.ok(row.preparedTranslation.extensions.some(name=>name.includes('example/missing')));
            assert.deepEqual(report.preparedTally,{'preparation-failed':1});
        }else{
            assert.equal(row.preparedTranslation.stage,'translated');
            assert.equal(row.preparedTranslation.originalFilesUnchanged,true);
            assert.equal(row.preparedTranslation.originalFileHashes['main.ts'],sha(source));
            assert.equal(row.preparedTranslation.preparedFileHashes['main.ts'],sha(source));
            assert.deepEqual(report.preparedTally,{translated:1});
            assert.equal(row.qualification.originalCompile,'not-requested');
            assert.match(row.preparedTranslation.boundary,/gameplay.*separate gates/);
        }
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
