// Providers retain their own canonical reference domain. The heap stores the
// same reference and routes only declared intrinsic fields and procedures.
const sprite=require('./sdk-sprite-classes');
const dialog=require('./sdk-dialog-classes');
function create(ext,values){
    const providers=[{kinds:new Set(['BaseSprite','Sprite','ExtendableSprite']),api:sprite.create(ext,values)},
        {kinds:new Set(['BaseDialog','SplashDialog']),api:dialog.create(ext,values)}];
    if(ext._sdkFontValues)providers.push({kinds:new Set(['Font']),get api(){return ext._sdkFontValues;}});
    const external=ref=>providers.find(p=>p.api.heapHooks.external(ref));
    const owner=ref=>{const found=external(ref);if(!found)throw new Error('Unknown or stale native class reference');return found.api.heapHooks;};
    return {matches:name=>providers.some(p=>p.api.matches(name)),
        invoke(name,args,util,token,nested=null,caller=null){const found=providers.find(p=>p.api.matches(name));if(!found)throw new Error('Unknown native class procedure');return found.api.invoke(name,args,util,token,nested,caller);},
        heapHooks:{definition:name=>providers.map(p=>p.api.heapHooks.definition(name)).find(Boolean),
            reserve(def){const found=providers.find(p=>p.kinds.has(def.intrinsic));if(!found)throw new Error('Unqualified native class allocation');return found.api.heapHooks.reserve(def);},
            external:ref=>!!external(ref),externalClass:ref=>owner(ref).externalClass(ref),
            get:(ref,key)=>owner(ref).get(ref,key),set:(ref,key,value,util)=>owner(ref).set(ref,key,value,util)},
        dispose(){for(const p of providers)p.api.dispose?.();}};
}
module.exports={create};
