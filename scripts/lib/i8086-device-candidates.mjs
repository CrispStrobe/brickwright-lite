// Benchmark-only candidates; no project execution imports this module.
import {I8254} from '../../overlay/scratch-gui/src/lib/bw-board/i8254.js';
import {CGACard} from '../../overlay/scratch-gui/src/lib/bw-board/cga-card.js';
import {I8086Machine} from '../../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
// One opt-in per isolated process/browser realm. Never stack prototype patches.
export const deviceCandidateNames = ['none','pit-index','pit-cold','cga-cache','pit-clock','pit-inline','pit-mode3'];
let installed = 'none';
export function installDeviceCandidate(variant) {
    if (!deviceCandidateNames.includes(variant)) throw new Error('Unknown device candidate');
    if (variant === installed) return;
    if (installed !== 'none') throw new Error('Device candidates require a fresh isolated realm');
    if (variant === 'none') return;
    installed = variant;
    if (variant === 'pit-inline') {
        const advance = Object.getPrototypeOf(new I8254().counters[0]).advance;
        I8254.prototype.advanceMs = function(ms) {
            const exact=ms*this.clockHz/1000+this._frac, whole=Math.floor(exact);
            this._frac=exact-whole;
            if(whole>0) for(const c of this.counters) {
                // Preserve custom methods, immediate state and callback order.
                if(c.advance!==advance) {c.advance(whole);continue;}
                if(c.nullCount || (!c.gate && c.mode!==1 && c.mode!==5)) continue;
                const decrement=c.mode===3?whole*2:whole;
                const edge=c.mode===2?1:0;
                if(!c.bcd && c.mode<=5 && c.ce>decrement+edge) c.ce-=decrement;
                else c.advance(whole);
            }
        };
        return;
    }
    if (variant === 'pit-mode3') {
        const counter=Object.getPrototypeOf(new I8254().counters[0]), advance=counter.advance;
        counter.advance=function(ticks) {
            // Common active binary square-wave countdown; everything else uses
            // the original path, including callbacks and fractional requests.
            if(this.mode===3 && !this.bcd && !this.nullCount && this.gate &&
                Number.isInteger(ticks) && ticks>0 && this.ce>ticks*2) {
                this.ce-=ticks*2;return;
            }
            return advance.call(this,ticks);
        };
        return;
    }
    if (variant === 'pit-clock') {
        const advanceMs = I8254.prototype.advanceMs;
        I8254.prototype.advanceCpuCycles = function(n, cpuClock) {
            const method=this.advanceMs;
            if (!(Number.isInteger(n) && n>=0 && n<256) || method!==advanceMs) {
                return method.call(this,n*1000/cpuClock);
            }
            const clock=this.clockHz;
            if(this._cycleCpuClock!==cpuClock || this._cyclePitClock!==clock) {
                if(!(Number.isFinite(cpuClock)&&cpuClock>0&&Number.isFinite(clock)&&clock>0)) {
                    return method.call(this,n*1000/cpuClock);
                }
                const table=new Float64Array(256);
                for(let i=0;i<256;i++) table[i]=(i*1000/cpuClock)*clock/1000;
                this._cycleTicks=table;this._cycleCpuClock=cpuClock;this._cyclePitClock=clock;
            }
            const exact=this._cycleTicks[n]+this._frac,whole=Math.floor(exact);
            this._frac=exact-whole;
            if(whole>0)for(const c of this.counters)c.advance(whole);
        };
        const build=I8086Machine.prototype._buildAdvanceList;
        I8086Machine.prototype._buildAdvanceList=function(){
            const list=build.call(this);
            for(let i=0;i<list.length;i+=2)if(list[i] instanceof I8254 && list[i+1]===1)list[i+1]=2;
            return list;
        };
        I8086Machine.prototype._advanceChips=function(n){
            const list=this._advList!==null?this._advList:this._buildAdvanceList();
            if(!list.length)return;
            const clock=this._anyMs?this.clockHz:0;
            let ms;
            for(let i=0;i<list.length;i+=2){
                if(list[i+1]===2)list[i].advanceCpuCycles(n,clock);
                else if(list[i+1]===1){
                    if(ms===undefined)ms=n*1000/clock;
                    list[i].advanceMs(ms);
                }else list[i].advance(n);
            }
        };
        I8086Machine.prototype._wakeHorizon=function(){
            let h=Infinity;
            const list=this._advList!==null?this._advList:this._buildAdvanceList();
            for(let i=0;i<list.length;i+=2){
                const device=list[i], inMs=list[i+1]!==0;
                const method=inMs?device.nextWakeMs:device.nextWake;
                if(typeof method!=='function')return 1;
                const wait=method.call(device)*(inMs?this.clockHz/1000:1);
                if(!(wait>=0))return 1;
                h=Math.min(h,wait);
            }
            if(!Number.isFinite(h))h=Math.round(this.clockHz/1000);
            return Math.max(1,Math.min(Math.floor(h),Math.round(this.clockHz/1000)));
        };
        return;
    }
    if (variant === 'pit-index') {
        I8254.prototype.advanceMs = function(ms) {
            const exact = ms * this.clockHz / 1000 + this._frac;
            const whole = Math.floor(exact); this._frac = exact - whole;
            if (whole > 0) {
                const counters = this.counters;
                for (let i = 0; i < counters.length; i++) counters[i].advance(whole);
            }
        };
        return;
    }
    if (variant === 'pit-cold') {
        const counter = Object.getPrototypeOf(new I8254().counters[0]);
        counter._advanceTicks = function(ticks) { for (let t=0;t<ticks;t++) this._tick(); };
        counter.advance = function(ticks) {
            if (this.nullCount) return;
            if (!this.gate && this.mode !== 1 && this.mode !== 5) return;
            if (!this.bcd && this.mode <= 5 && Number.isInteger(ticks) && ticks > 0) {
                const decrement = this.mode === 3 ? ticks * 2 : ticks;
                const edge = this.mode === 2 ? 1 : 0;
                if (this.ce > decrement + edge) { this.ce -= decrement; return; }
            }
            this._advanceTicks(ticks);
        };
        return;
    }
    if (variant === 'cga-cache') {
        CGACard.prototype._framePos = function(cycles) {
            const base = this._frameBase;
            if (Number.isSafeInteger(cycles) && cycles > 0 && this._frameBaseSize === this._frame &&
                cycles >= base && cycles < base + this._frame) return cycles - base;
            const position = cycles % this._frame;
            this._frameBase = cycles - position; this._frameBaseSize = this._frame;
            return position;
        };
        return;
    }
    throw new Error('Unknown device candidate');
}
