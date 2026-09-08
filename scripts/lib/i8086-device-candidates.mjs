// Benchmark-only candidates; no project execution imports this module.
import {I8254} from '../../overlay/scratch-gui/src/lib/bw-board/i8254.js';
import {CGACard} from '../../overlay/scratch-gui/src/lib/bw-board/cga-card.js';
import {I8086Machine} from '../../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
export function installDeviceCandidate(variant) {
    if (variant === 'none') return;
    if (variant === 'pit-clock') {
        const advanceMs = I8254.prototype.advanceMs;
        I8254.prototype.advanceCpuCycles = function(n, cpuClock) {
            if (!(Number.isInteger(n) && n>=0 && n<256) || this.advanceMs!==advanceMs) {
                return this.advanceMs(n*1000/cpuClock);
            }
            const clock=this.clockHz;
            if(this._cycleCpuClock!==cpuClock || this._cyclePitClock!==clock) {
                if(!(Number.isFinite(cpuClock)&&cpuClock>0&&Number.isFinite(clock)&&clock>0)) {
                    return this.advanceMs(n*1000/cpuClock);
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
            if (Number.isSafeInteger(cycles) && cycles >= 0 && this._frameBaseSize === this._frame &&
                cycles >= base && cycles < base + this._frame) return cycles - base;
            const position = cycles % this._frame;
            this._frameBase = cycles - position; this._frameBaseSize = this._frame;
            return position;
        };
        return;
    }
    throw new Error('Unknown device candidate');
}
