// Bounded managed ExtendableSprite update activation. Selected Microsoft MIT
// scene.ts/extendableSprite.ts source contracts; retain the existing MIT notice.
// This service supplies no constructor defaults and no alternate Sprite body.
function create(ext) {
    const owners=new WeakMap(),entries=new WeakMap();
    const active=new WeakMap();
    function handles(sprite) {
        if(!sprite || !owners.has(sprite))return false;
        try{return ext._objectHeap.definition(ext._objectHeap.inspect(sprite.id).className).intrinsic==='ExtendableSprite';}
        catch{return false;}
    }
    function hasSceneUpdates() {
        // Query existing membership without _state initialization: scene
        // initialization itself asks the driver whether source timers apply.
        const runtime=ext._runtime,scene=runtime.bwArcadeDeviceState;
        if(!scene?.sprites)return false;
        for(const sprite of ext._sceneFlags.iterate(scene)){
            const owner=owners.get(sprite);
            if(scene.sprites[sprite.id]!==sprite || !handles(sprite) || !owner ||
                !runtime.targets.includes(owner.target) || owner.target.isOriginal===false || owner.target.blocks!==owner.blocks)continue;
            const procedure=ext._objectHeap.method(sprite.id,'update').procedure;
            if(!ext._sdkObjectClasses.matches(procedure) && owner.blocks.getProcedureDefinition(procedure))return true;
        }
        return false;
    }
    function register(sprite,util) {
        const runtime=ext._runtime,target=util?.target || util?.thread?.target;
        if(!runtime.targets.includes(target) || target.isOriginal===false || !target.blocks)
            throw new Error('Native Sprite method owner must be an actual original project target');
        owners.set(sprite,{target,blocks:target.blocks});
    }
    // Only the live scene iterator opens an entry. Capture membership before
    // base __update: destruction there does not cancel the subsequent update.
    function *steps(scene,invokeBase) {
        const phase=ext._runtime._arcadeFramePhase;
        const generation=phase?.generation;
        for(const sprite of ext._sceneFlags.iterate(scene)) {
            if(scene.sprites[sprite.id]!==sprite)continue;
            const owner=owners.get(sprite);
            if(!handles(sprite)){
                // A bare BaseSprite/renderable has no Sprite lifecycle. All
                // actual Sprite bodies share the same live-array pass.
                if(!sprite._sdkBaseOnly)yield* invokeBase(sprite);
                if(phase?.generation!==generation || phase?.disposed)return;
                continue;
            }
            const ref=sprite.id,heap=ext._objectHeap;
            const def=heap.definition(heap.inspect(ref).className);
            if(def.intrinsic!=='ExtendableSprite')continue;
            const method=heap.method(ref,'update'),procedure=method.procedure;
            if(!ext._sdkObjectClasses.matches(procedure) && (!phase?.active || !phase.phaseContext || phase.disposed))
                throw new Error('Native Sprite update requires an owned physical phase');
            const entry=Object.freeze({});
            entries.set(entry,{phase,generation,scene,sprite,owner,procedure,used:false});
            const prior=entries.get(active.get(scene));
            if(prior?.generation===generation)throw new Error('Native Sprite update iterator cannot reenter its scene');
            active.set(scene,entry);
            try {
                yield* invokeBase(sprite);
                if(phase?.generation!==generation || phase?.disposed)return;
                const delta=ext._state().frameDeltaTime*1000;
                // The inherited SDK no-op needs no managed thread authority.
                if(ext._sdkObjectClasses.matches(procedure)) {
                    ext._objectProcedure(procedure,[ref,delta],{target:owner.target});
                } else {
                    const value=phase.withSpriteUpdate(entry,()=>ext._objectProcedure(
                        procedure,[ref,delta],{target:owner.target}));
                    if(value && typeof value.then==='function')yield value;
                }
            } finally {if(active.get(scene)===entry)active.delete(scene);entries.delete(entry);}
        }
    }
    function claim(entry,phase) {
        const record=entries.get(entry),runtime=ext._runtime;
        if(!record || active.get(record.scene)!==entry || record.used || record.phase!==phase ||
            phase!==runtime._arcadeFramePhase || !phase.active || !phase.phaseContext || phase.disposed ||
            phase.generation!==record.generation ||
            !runtime.targets.includes(record.owner.target) || record.owner.target.isOriginal===false ||
            record.owner.target.blocks!==record.owner.blocks ||
            ext._spriteValues.get(record.sprite.id)!==record.sprite)
            throw new Error('Native Sprite update activation is stale or foreign');
        const definition=record.owner.blocks.getProcedureDefinition(record.procedure);
        if(!definition)throw new Error('Native Sprite update method is not defined in its actual target');
        record.used=true;
        return {target:record.owner.target,definition,generation:record.generation};
    }
    return {register,steps,claim,handles,hasSceneUpdates};
}
module.exports={create};
