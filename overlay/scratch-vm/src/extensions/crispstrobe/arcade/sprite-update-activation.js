// Bounded managed ExtendableSprite update activation. Selected Microsoft MIT
// scene.ts/extendableSprite.ts source contracts; retain the existing MIT notice.
// This service supplies no constructor defaults and no alternate Sprite body.
function create(ext) {
    const runtime=ext?._runtime;
    if(!runtime || typeof runtime.on!=='function' || !Array.isArray(runtime.targets)) {
        // Palette/metadata construction has no runtime owner. This service must
        // stay inert even if the extension later receives a runtime property.
        const refuse=()=>{throw new Error('Native Sprite update requires its originally bound runtime');};
        return Object.freeze({register:refuse,steps:function *(){refuse();},claim:refuse,
            handles:()=>false,hasSceneUpdates:()=>false,prepareCall:refuse,consumeChild:()=>null});
    }
    const owners=new WeakMap(),entries=new WeakMap();
    const active=new WeakMap(),invocations=new WeakMap(),calls=new WeakMap();
    // Cancellation is private state: restoring public phase fields cannot
    // revive a receipt across an actual runtime lifecycle event.
    let epoch=0,disposed=false;
    for(const event of ['PROJECT_START','PROJECT_STOP_ALL'])ext._runtime.on(event,()=>{epoch++;});
    ext._runtime.on('RUNTIME_DISPOSED',()=>{epoch++;disposed=true;});
    ext._runtime.on('PROJECT_LOADED',()=>{epoch++;disposed=false;});
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
                !runtime.targets.includes(owner.target) || owner.target.isOriginal===false || owner.target.blocks!==owner.blocks || owner.scene!==scene)continue;
            const procedure=ext._objectHeap.method(sprite.id,'update').procedure;
            if(!ext._sdkObjectClasses.matches(procedure) && owner.blocks.getProcedureDefinition(procedure))return true;
        }
        return false;
    }
    function register(sprite,util,scene) {
        const runtime=ext._runtime,target=util?.target || util?.thread?.target;
        if(!runtime.targets.includes(target) || target.isOriginal===false || !target.blocks)
            throw new Error('Native Sprite method owner must be an actual original project target');
        if(!scene || runtime.bwArcadeDeviceState!==scene)
            throw new Error('Native Sprite registration requires its actual current scene');
        owners.set(sprite,{target,blocks:target.blocks,scene});
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
            if(!owner || owner.scene!==scene)throw new Error('Native Sprite update has a foreign scene owner');
            const ref=sprite.id,heap=ext._objectHeap;
            const def=heap.definition(heap.inspect(ref).className);
            if(def.intrinsic!=='ExtendableSprite')continue;
            const method=heap.method(ref,'update'),procedure=method.procedure;
            if(!ext._sdkObjectClasses.matches(procedure) && (!phase?.active || !phase.phaseContext || phase.disposed))
                throw new Error('Native Sprite update requires an owned physical phase');
            const entry=Object.freeze({});
            const definition=owner.blocks.getProcedureDefinition(procedure);
            const definitionBlock=definition && owner.blocks.getBlock(definition);
            entries.set(entry,{phase,generation,epoch,context:null,scene,sprite,owner,procedure,
                definition,definitionBlock,definitionShape:definitionBlock && JSON.stringify(definitionBlock),used:false});
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
                    const values=Object.freeze([ref,delta]),util=Object.freeze({target:owner.target});
                    const record=entries.get(entry);
                    record.values=values;record.util=util;invocations.set(util,record);
                    try {
                        const value=phase.withSpriteUpdate(entry,()=>ext._objectProcedure(procedure,values,util));
                        if(value && typeof value.then==='function')yield value;
                    } finally {invocations.delete(util);if(record.callArgs)calls.delete(record.callArgs); }
                }
            } finally {if(active.get(scene)===entry)active.delete(scene);entries.delete(entry);}
        }
    }
    function current(entry,record,phase) {
        const runtime=ext._runtime;
        if(!record || disposed || record.epoch!==epoch || active.get(record.scene)!==entry || record.phase!==phase ||
            phase!==runtime._arcadeFramePhase || !phase.active || !phase.phaseContext || phase.disposed ||
            phase.generation!==record.generation || (record.used && phase.phaseContext!==record.context) ||
            record.owner.scene!==record.scene ||
            ext._objectHeap.method(record.sprite.id,'update').procedure!==record.procedure ||
            !runtime.targets.includes(record.owner.target) || record.owner.target.isOriginal===false ||
            record.owner.target.blocks!==record.owner.blocks ||
            ext._spriteValues.get(record.sprite.id)!==record.sprite)
            throw new Error('Native Sprite update activation is stale or foreign');
        const definition=record.owner.blocks.getProcedureDefinition(record.procedure);
        if(!definition || definition!==record.definition ||
            record.owner.blocks.getBlock(definition)!==record.definitionBlock ||
            JSON.stringify(record.definitionBlock)!==record.definitionShape)
            throw new Error('Native Sprite update method is not defined in its actual target');
        return {target:record.owner.target,definition,generation:record.generation};
    }
    function claim(entry,phase) {
        const record=entries.get(entry);
        const witness=current(entry,record,phase);
        if(record.used)throw new Error('Native Sprite update entry was already claimed');
        record.context=phase.phaseContext;record.used=true;return witness;
    }
    function prepareCall(name,values,util,args,callUtil) {
        const record=util && invocations.get(util);
        if(!record)return;
        const entry=active.get(record.scene);
        current(entry,record,record.phase);
        if(!record.used || record.values!==values || record.procedure!==name || record.callArgs ||
            util.thread!==undefined || callUtil.thread!==undefined || callUtil.target!==record.owner.target)
            throw new Error('Native Sprite update invocation differs from its private entry');
        record.callArgs=args;record.callUtil=callUtil;
        record.callName=args.NAME;record.callText=args.ARGS;record.priorThreads=new Set(ext._runtime.threads);
        calls.set(args,{entry,record});
    }
    function consumeChild(child,args,util) {
        const call=calls.get(args);
        if(!call)return null;
        calls.delete(args);
        const {entry,record}=call,witness=current(entry,record,record.phase);
        if(record.consumed || record.callUtil!==util || util.thread!==undefined || args.NAME!==record.callName ||
            args.ARGS!==record.callText || args.bwObjectConstruction!==undefined || args.bwExceptionCaller!==null ||
            util.target!==record.owner.target || util.sequencer!==null || child.target!==record.owner.target ||
            child.blockContainer!==record.owner.blocks || child.topBlock!==record.definition ||
            !ext._runtime.threads.includes(child) || record.priorThreads.has(child) || child.isKilled)
            throw new Error('Native Sprite update child differs from its private invocation');
        record.consumed=true;
        record.phase.linkSpriteUpdateChild(entry,child);
        return witness;
    }
    return {register,steps,claim,handles,hasSceneUpdates,prepareCall,consumeChild};
}
module.exports={create};
