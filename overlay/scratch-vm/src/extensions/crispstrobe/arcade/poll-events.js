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
            const current=now();let woke=false;
            try {
                for(let i=0;i<queue.length;i++) {
                    const event=queue[i];
                    if(event.condition() || (event.timeout>0 && current-event.start>event.timeout)) {
                        event.ready();woke=true;
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
