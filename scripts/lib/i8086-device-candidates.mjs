// Benchmark-only candidates; no project execution imports this module.
import {I8254} from '../../overlay/scratch-gui/src/lib/bw-board/i8254.js';
import {CGACard} from '../../overlay/scratch-gui/src/lib/bw-board/cga-card.js';
export function installDeviceCandidate(variant) {
    if (variant === 'none') return;
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
