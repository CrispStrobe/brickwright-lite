// Frame workers follow PXT base/eventcontext.ts and game/scene.ts (MIT;
// poll-events.LICENSE preserves the Microsoft notice). Each registered scene
// starts with delta 0, owns its actual timer cadence, and retains a sleeping
// predecessor until that worker observes unregister. Restoration waits for the
// predecessor through the same condition-poll queue, just as EventContext does.
module.exports = function createSceneFrameContexts({now,setTimeout:delay,clearTimeout:clear,polls,runFrame,onError}) {
    const contexts=new Map();let generation=0;
    const schedule=(context,ms,callback)=>{
        const handle=delay(callback,ms);context.timers.add(handle);handle?.unref?.();return handle;
    };
    const start=(context,worker,epoch)=>{
        const begin=async()=>{
            if(epoch!==generation)return;
            context.running=true;context.previous=now();
            const tick=async()=>{
                if(epoch!==generation)return;
                if(worker!==context.worker){context.running=false;return;}
                const began=now(),delta=began-context.previous;context.previous=began;
                const finish=()=>{
                    if(epoch!==generation)return;
                    // A frame paused in an authored callback retains its worker;
                    // its next sleep starts when the real callback completes.
                    let handle;handle=schedule(context,Math.max(1,20-(now()-began)),async()=>{context.timers.delete(handle);await tick();});
                };
                try {
                    const result=await runFrame(context.owner,delta);
                    if(result?.completion?.then)result.completion.then(finish,error=>{context.running=false;onError(error);});
                    else finish();
                }catch(error){context.running=false;onError(error);}
            };
            await tick();
        };
        let handle;handle=schedule(context,0,async()=>{
            context.timers.delete(handle);if(epoch!==generation)return;
            if(context.running)polls().enqueue(()=>!context.running,begin);
            else await begin();
        });
    };
    return {
        register(owner) {
            let context=contexts.get(owner);
            if(!context){context={owner,worker:0,running:false,registered:false,timers:new Set()};contexts.set(owner,context);}
            if(context.registered)return;
            context.registered=true;start(context,context.worker,generation);
        },
        unregister(owner) {const context=contexts.get(owner);if(context?.registered){context.registered=false;context.worker++;}},
        cancel() {generation++;for(const context of contexts.values()){for(const timer of context.timers)clear(timer);context.timers.clear();context.registered=false;context.running=false;}contexts.clear();},
        get active(){return [...contexts.values()].some(context=>context.registered);}
    };
};
