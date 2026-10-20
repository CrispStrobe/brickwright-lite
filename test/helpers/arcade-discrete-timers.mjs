// Owned external timer platform for deterministic controls: independent timers
// run at their real deadlines between requested physical frame observations.
// It never rewrites source, runtime clock methods or primitive results.
export function createArcadeDiscreteTimers() {
    let current=0,nextId=1;const pending=new Map();
    return {
        now:()=>current,
        setTimeout(callback,delay) {const id=nextId++;pending.set(id,{at:current+Math.max(0,Number(delay)||0),callback});return id;},
        clearTimeout(id) {pending.delete(id);},
        async advanceTo(target) {
            if(!Number.isFinite(target)||target<current)throw new Error('Owned timer platform cannot move backwards');
            let count=0;
            while(true) {
                const due=[...pending.entries()].filter(([,timer])=>timer.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
                if(!due)break;if(++count>10000)throw Error('Owned timer dispatch bound exceeded');
                current=due[1].at;pending.delete(due[0]);await due[1].callback();
                await new Promise(resolve=>setImmediate(resolve));
            }
            current=Math.max(current,target);
        },
        get pending(){return pending.size;}
    };
}
