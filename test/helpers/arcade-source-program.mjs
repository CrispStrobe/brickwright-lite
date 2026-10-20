// Actual VM authoring route with an optional independently qualified producer.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {VM, SB3Creator as BundledCreator, INTEGRATED, stepFrames} from './bw-vm.mjs';
import {loadExtensionClass, bundledExtensionIds} from './bw-extensions.mjs';
const require=createRequire(import.meta.url);
const Creator=process.env.SB3_CREATOR_DIR?(await import(pathToFileURL(path.join(process.env.SB3_CREATOR_DIR,'src/utils/sb3Creator.js')).href)).default:BundledCreator;
export async function runArcadeSourceCode(code,{frames=12,storage=true,uploads=[]}={}) {
    const creator=new Creator();creator.parse(code);
    for(const upload of uploads)creator.addCustomSVGCostume(upload.sprite,upload.svg,upload.name);
    const buffer=Buffer.from(await(await creator.generateSB3()).arrayBuffer());
    const vm=new VM(),manager=vm.extensionManager,load=manager.loadExtensionURL.bind(manager),ids=bundledExtensionIds(),errors=[];
    if(storage){const Storage=require(path.join(INTEGRATED,'node_modules/scratch-storage/dist/node/scratch-storage.js'));vm.attachStorage(new Storage());}
    manager.loadExtensionURL=id=>{
        if(!ids.has(id))return load(id);
        if(!manager.isExtensionLoaded(id))manager._loadedExtensions.set(id,manager._registerInternalExtension(new(loadExtensionClass(ids.get(id)))(vm.runtime)));
        return Promise.resolve();
    };
    vm.runtime.on('BLOCKS_ERROR',error=>errors.push(String(error)));vm.on('BLOCKS_ERROR',error=>errors.push(String(error)));
    await vm.loadProject(buffer);vm.runtime.bwArcadeFrameAuthority='manual';vm.start();vm.greenFlag();vm.quit();await stepFrames(vm,frames,20);
    return {creator,vm,buffer,errors};
}
