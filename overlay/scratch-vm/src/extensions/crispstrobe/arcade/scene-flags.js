// Copyright (c) Microsoft Corporation. MIT; selected source-derived sort contract.
// See static/licenses/pxt-common-packages.MIT.txt.
// Scene render flags and all-sprite ordering from the selected MIT
// Microsoft game/scene.ts and game/basesprite.ts contracts. See the retained
// pxt-common-packages MIT notice. Source-layout/runtime adapters remain in index.
const NeedsSorting=1, SeeThrough=2, IsRendering=4;
function create() {
    const lists=new WeakMap();
    const list=scene=>{let entries=lists.get(scene);if(!entries){entries=[];lists.set(scene,entries);}return entries;};
    const dirty=scene=>{scene.flags |= NeedsSorting;};
    return {
        register(scene,object) {const entries=list(scene);if(!entries.includes(object))entries.push(object);dirty(scene);},
        remove(scene,object) {const entries=list(scene),index=entries.indexOf(object);if(index>=0)entries.splice(index,1);},
        dirty,
        begin(scene) {if(scene.flags & IsRendering)return false;scene.flags |= IsRendering;return true;},
        finish(scene) {scene.flags &= ~IsRendering;},
        through(scene) {return !!(scene.flags & SeeThrough);},
        order(scene,objects) {
            const entries=list(scene),present=new Set(objects);
            for(let i=entries.length-1;i>=0;i--)if(!present.has(entries[i]))entries.splice(i,1);
            // Existing non-source scene state may predate this host. Preserve
            // its existing registration sequence; no inferred dirty flag.
            for(const object of objects)if(!entries.includes(object))entries.push(object);
            if(scene.flags & NeedsSorting){
                // MIT base/pxt-helpers.ts sortHelper is a repeated pairwise
                // swap selection sort, explicitly not necessarily stable.
                const length=entries.length;
                for(let i=0;i<length-1;i++)for(let j=i+1;j<length;j++)if((entries[i].z-entries[j].z || (entries[i].pxtId ?? entries[i].id)-(entries[j].pxtId ?? entries[j].id))>0){const temp=entries[i];entries[i]=entries[j];entries[j]=temp;}
                scene.flags &= ~NeedsSorting;
            }
            return entries;
        },
        currentOrder(scene) {return list(scene).slice();}
    };
}
module.exports={create,NeedsSorting,SeeThrough,IsRendering};
