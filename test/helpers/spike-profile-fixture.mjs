// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {mkdir,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {profileFiles} from '../../scripts/lib/spike-resource-profile.mjs';
import {initialFlashScenario} from '../../scripts/lib/spike-initial-flash.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function syntheticProfile (root,kind,{seed=false}={}) {
    const source=join(root,kind+'-source');await mkdir(source);
    const files=Object.fromEntries(profileFiles[kind].map(n=>[n,Buffer.from(`synthetic ${n}\n`)]));
    const elf=Buffer.alloc(52);elf.set([127,69,76,70,1,1]);elf.writeUInt16LE(40,18);
    const firmware=kind==='guest'?'arena-demo.elf':'nuttx-user.elf';
    files[firmware]=elf;if(kind==='nuttx')files['nuttx-kernel.elf']=elf;
    files['state-config.json']=Buffer.from(JSON.stringify({identity:{firmware:kind==='guest'?'brickwright-arena-demo':'brickwright-nuttx',imageSha256:sha(elf)}}));
    if(seed)files['initial-flash.bin']=Buffer.alloc(8192);
    files[kind==='guest'?'arena-demo.resc':'nuttx.resc']=Buffer.from(kind==='guest'?
        `mach create\nmachine LoadPlatformDescription @${join(source,'arena-demo.repl')}\n`:
        `include @${join(source,'models.cs')}\nmach create\nmachine LoadPlatformDescription @${join(source,'platforms/boards/spike-prime.repl')}\nemulation CreatePrimeElectricalPorts "machine-0"\n${seed?initialFlashScenario(source):''}`);
    const manifest={};
    for(const [n,b] of Object.entries(files)){await mkdir(dirname(join(source,n)),{recursive:true});await writeFile(join(source,n),b);manifest[n]=sha(b);}
    await writeFile(join(source,'manifest.json'),JSON.stringify(manifest));
    return {source,manifest};
}
