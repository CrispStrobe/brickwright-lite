// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,rename,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {freezeResourceProfile} from '../scripts/lib/spike-resource-profile.mjs';
import {syntheticProfile} from './helpers/spike-profile-fixture.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const kind of ['guest','nuttx'])test(`${kind} profile freezes exact mappings and hash cascade, then relocates`,async()=>{
    const root=await mkdtemp(join(tmpdir(),'bw-profile-'));try{
        const {source,manifest}=await syntheticProfile(root,kind,{seed:kind==='nuttx'});
        const resources=join(root,'resources');await mkdir(resources);
        const output=join(resources,kind);const original=await readFile(join(source,'manifest.json'));
        const result=await freezeResourceProfile(kind,source,output,resources);
        const scenario=kind==='guest'?'arena-demo.resc':'nuttx.resc';
        assert.notEqual(result.manifest[scenario],manifest[scenario]);
        for(const n of Object.keys(manifest).filter(n=>n!==scenario))assert.equal(result.manifest[n],manifest[n]);
        assert.deepEqual(await readFile(join(source,'manifest.json')),original);
        assert.ok(Object.values(result.resources).every(n=>n.startsWith(kind+'/')));
        const prefix=kind==='guest'?'BW_RENODE_SPIKE':'BW_RENODE_NUTTX';
        assert.equal(result.pins[`${prefix}_RESOURCE_ROOT`],kind);
        assert.equal(result.pins[`${prefix}_SCENARIO_SHA256`],result.manifest[scenario]);
        assert.equal(result.pins[`${prefix}_MANIFEST_SHA256`],sha(await readFile(join(output,'manifest.json'))));
        assert.ok(Object.values(result.pins).every(n=>!n.includes(root)));
        const relocated=join(root,'installed resources with spaces');await rename(resources,relocated);
        const text=await readFile(join(relocated,kind,scenario),'utf8');assert.ok(!text.includes(source));
        if(kind==='nuttx')assert.ok(text.includes("Path.Combine(variables['ORIGIN'],'initial-flash.bin')"));
        await assert.rejects(freezeResourceProfile(kind,source,join(relocated,kind),relocated),/EEXIST/);
    }finally{await rm(root,{recursive:true,force:true});}
});
test('freezer rejects digest damage, unknown declarations, scripts, seed geometry and missing helper',async()=>{
    for(const failure of ['digest','unknown','scenario','seed','helper','notice']){
        const root=await mkdtemp(join(tmpdir(),'bw-profile-reject-'));try{
            const {source,manifest}=await syntheticProfile(root,'nuttx',{seed:true});
            if(failure==='digest')await writeFile(join(source,'models.cs'),'changed bytes');
            if(failure==='unknown')manifest['private.bin']='0'.repeat(64);
            const change=async(n,b)=>{await writeFile(join(source,n),b);manifest[n]=sha(b);};
            if(failure==='scenario')await change('nuttx.resc',Buffer.from('include @elsewhere.resc\n'));
            if(failure==='seed')await change('initial-flash.bin',Buffer.alloc(8191));
            if(failure==='helper')await change('scripts/spike-state-server.py',Buffer.from('from spike_program_uart import worker'));
            if(failure==='notice')await change('licenses/Apache-2.0.txt',Buffer.from('partial backport notice'));
            await writeFile(join(source,'manifest.json'),JSON.stringify(manifest));
            const resources=join(root,'resources');await mkdir(resources);
            await assert.rejects(freezeResourceProfile('nuttx',source,join(resources,'nuttx'),resources));
            await assert.rejects(readFile(join(resources,'nuttx','manifest.json')),/ENOENT/);
        }finally{await rm(root,{recursive:true,force:true});}
    }
});
test('freezer rejects linked artifacts and escapes before copying',async()=>{
    const root=await mkdtemp(join(tmpdir(),'bw-profile-links-'));try{
        const {source}=await syntheticProfile(root,'guest');const resources=join(root,'resources');await mkdir(resources);
        const file=join(source,'arena-demo.repl');await rename(file,join(root,'outside'));await symlink(join(root,'outside'),file);
        await assert.rejects(freezeResourceProfile('guest',source,join(resources,'guest'),resources),/regular file/);
        await assert.rejects(freezeResourceProfile('guest',source,join(root,'outside-output'),resources),/destination/);
    }finally{await rm(root,{recursive:true,force:true});}
});
