const sourceConditions=require('../../../util/bw-source-condition-waits');
// Condition polling follows Microsoft PXT base/poll.ts (MIT; notice beside this
// file). One shared queue has a 50 ms polling fiber. An empty final iteration
// still pauses before releasing the queue, so registrations during that pause
// retain its phase. Native dialogs use this instead of waking on their draw.
module.exports = function createPollEvents({now,setTimeout:delay,clearTimeout:clear,onReady=()=>{},onError=error=>{throw error;}}) {
    let queue, timer, generation=0;
    const schedule = (ms,epoch) => {
        timer=delay(async()=>{
            timer=undefined;
            if(epoch!==generation || !queue)return;
            if(!queue.length){queue=undefined;return;}
            const current=now(),events=queue;let woke=false;
            try {
                for(let i=0;i<queue.length;i++) {
                    const event=queue[i];
                    const sampled=event.condition();
                    // Existing synchronous predicates keep their original turn.
                    // Only native source sampling waits for a VM evaluation.
                    const sourceSample=sourceConditions.takeSample(sampled);
                    const outcome=sourceSample ? await sourceSample : null;
                    const ready=sourceSample ? outcome.ready : sampled;
                    if(epoch!==generation || queue!==events)return;
                    if(sourceSample && outcome.cancelled){queue.splice(i,1);i--;continue;}
                    if(ready || (event.timeout>0 && current-event.start>event.timeout)) {
                        event.ready();woke=true;
                        if(epoch!==generation || queue!==events)return;
                        if(event.once){queue.splice(i,1);i--;}
                    }
                }
                if(epoch!==generation)return;
                schedule(50,epoch);
                if(woke)await onReady();
            } catch(error) {if(epoch===generation){queue=undefined;if(timer!==undefined)clear(timer);timer=undefined;}onError(error);}
        },ms);
        timer?.unref?.();
    };
    return {
        // __queuePollEvent itself has no optimistic check. pauseUntil owns that
        // separate check, allowing conditions and handler registrations to keep
        // their actual original evaluation count.
        enqueue(condition,ready,{timeout=0,once=true}={}) {
            if(typeof condition!=='function'||typeof ready!=='function')throw new TypeError('Poll events need a condition and ready callback');
            const event={condition,ready,start:now(),timeout,once};
            if(!queue){queue=[event];schedule(0,generation);}else queue.push(event);
            return event;
        },
        cancel() {generation++;if(timer!==undefined)clear(timer);timer=undefined;queue=undefined;},
        get size(){return queue?.length || 0;},
        get active(){return queue!==undefined;}
    };
};
