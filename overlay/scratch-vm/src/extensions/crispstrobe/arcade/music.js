// Native Arcade music. The generated music-pxt.js is PXT's own mixer code with
// pausing functions lowered to generators; this module runs those generators as
// fibers on the Arcade clock (control.millis), supplies PXT's native shims and
// turns the queued 12-byte play instructions into sound.
//
// Instruction layout (mixer/melody.ts addNote): wave u8, flags u8, start Hz
// u16, duration ms u16, start volume u16, end volume u16, end Hz u16; a zero
// wave byte ends the buffer. Volumes reach about 1024.

const LOG_LIMIT = 512;

class PxtBuffer extends Uint8Array {
    getNumber(format, offset) {
        if (format === 'UInt16LE') return this[offset] | (this[offset + 1] << 8);
        if (format === 'Int16LE') return ((this[offset] | (this[offset + 1] << 8)) << 16) >> 16;
        if (format === 'Int8LE') return (this[offset] << 24) >> 24;
        return this[offset];
    }
    setNumber(format, offset, value) {
        const number = Number(value) | 0;
        if (format === 'UInt16LE' || format === 'Int16LE') {
            this[offset] = number & 255;
            this[offset + 1] = (number >> 8) & 255;
        } else this[offset] = number & 255;
    }
    // PXT Buffer.slice(offset, length)
    slice(offset = 0, length) {
        const end = length === undefined ? this.length : Math.min(this.length, offset + length);
        const out = new PxtBuffer(Math.max(0, end - offset));
        out.set(this.subarray(offset, end));
        return out;
    }
}

const fromBytes = bytes => {
    const out = new PxtBuffer(bytes.length);
    out.set(bytes);
    return out;
};

const hex = strings => {
    const text = String(strings.raw ? strings.raw[0] : strings[0]).replace(/\s/g, '');
    return fromBytes((text.match(/../g) || []).map(byte => parseInt(byte, 16)));
};

const decodeInstructions = bytes => {
    const notes = [];
    for (let offset = 0; offset + 12 <= bytes.length; offset += 12) {
        const wave = bytes[offset];
        if (!wave) break;
        const u16 = at => bytes[offset + at] | (bytes[offset + at + 1] << 8);
        notes.push({wave, startHz: u16(2), ms: u16(4), startVolume: u16(6), endVolume: u16(8), endHz: u16(10)});
    }
    return notes;
};

const oscillatorType = wave => wave === 1 ? 'triangle' : wave === 2 ? 'sawtooth' : wave === 3 ? 'sine' :
    wave >= 11 && wave <= 15 ? 'square' : null;

module.exports = function createArcadeMusic ({initializePxtMusic, clock, audioContext = () => null, onError = () => {}}) {
    let fibers = [];
    let generation = 0;
    let pxt = null;
    let noise = null;
    const active = new Set();
    const log = [];

    // Resume a fiber until its next pause; pause(ms) yields ms.
    const step = fiber => {
        let result;
        try {
            result = fiber.generator.next();
        } catch (error) {
            fiber.done = true;
            onError(error);
            fiber.resolve?.();
            return;
        }
        if (result.done) {
            fiber.done = true;
            fiber.resolve?.();
            return;
        }
        fiber.wakeAt = clock() + Math.max(0, Number(result.value) || 0);
    };

    const start = generator => {
        const fiber = {generator, wakeAt: 0, done: false, generation};
        fibers.push(fiber);
        step(fiber);
        return fiber;
    };

    const synthesize = (delayMs, bytes) => {
        const context = audioContext();
        if (!context) return;
        const notes = decodeInstructions(bytes);
        let time = context.currentTime + Math.max(0, delayMs) / 1000;
        for (const note of notes) {
            const seconds = note.ms / 1000;
            const gain = context.createGain();
            const scale = value => Math.min(1, value / 1024) * 0.25;
            gain.gain.setValueAtTime(scale(note.startVolume), time);
            gain.gain.linearRampToValueAtTime(scale(note.endVolume), time + seconds);
            gain.connect(context.destination);
            let source;
            const type = oscillatorType(note.wave);
            if (type) {
                source = context.createOscillator();
                source.type = type;
                source.frequency.setValueAtTime(Math.max(1, note.startHz), time);
                source.frequency.linearRampToValueAtTime(Math.max(1, note.endHz), time + seconds);
            } else {
                if (!noise) {
                    noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
                    const data = noise.getChannelData(0);
                    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
                }
                source = context.createBufferSource();
                source.buffer = noise;
                source.loop = true;
            }
            source.connect(gain);
            source.start(time);
            source.stop(time + seconds);
            const entry = {source, gain};
            active.add(entry);
            source.onended = () => {
                active.delete(entry);
                gain.disconnect();
            };
            time += seconds;
        }
    };

    const shims = {
        queuePlayInstructions (timeDelta, buffer) {
            const bytes = Array.from(buffer || []);
            log.push({time: clock(), delay: Number(timeDelta) || 0, generation, bytes});
            if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT);
            synthesize(Number(timeDelta) || 0, bytes);
        },
        stopPlaying () {
            generation++;
            for (const {source} of active) {
                try {
                    source.stop();
                } catch (error) { /* already stopped */ }
            }
            active.clear();
        },
        forceOutput () {},
        enableAmp () {}
    };

    const host = {
        control: {
            millis: clock,
            createBuffer: size => new PxtBuffer(Math.max(0, Number(size) | 0)),
            runInParallel: generator => {
                start(typeof generator === 'function' ? generator() : generator);
            },
            // The simulator has no speaker volume configuration: PXT's default.
            getConfigValue: (key, fallback) => fallback
        },
        hex,
        NumberFormat: {UInt8LE: 'UInt8LE', UInt16LE: 'UInt16LE', Int8LE: 'Int8LE', Int16LE: 'Int16LE'},
        DAL: {CFG_SPEAKER_VOLUME: 'CFG_SPEAKER_VOLUME'},
        * pause (ms) {
            yield ms;
        },
        shims
    };

    return {
        get pxt () {
            if (!pxt) pxt = initializePxtMusic(host);
            return pxt;
        },
        log,
        decodeInstructions,
        // Run a lowered PXT call as a fiber. Returns a promise while it is paused.
        run (generator) {
            const fiber = start(generator);
            if (fiber.done) return undefined;
            return new Promise(resolve => {
                fiber.resolve = resolve;
            });
        },
        pump () {
            const now = clock();
            const due = fibers.filter(fiber => !fiber.done && fiber.wakeAt <= now);
            for (const fiber of due) if (!fiber.done) step(fiber);
            fibers = fibers.filter(fiber => !fiber.done);
        },
        get running () {
            return fibers.filter(fiber => !fiber.done).length;
        },
        stopAll () {
            for (const fiber of fibers) {
                fiber.done = true;
                fiber.resolve?.();
            }
            fibers = [];
            shims.stopPlaying();
            // PXT's stopAllSounds also forgets playables and the current tone.
            if (pxt) {
                try {
                    pxt.music.stopAllSounds();
                } catch (error) {
                    onError(error);
                }
            }
        },
        reset () {
            this.stopAll();
            pxt = null;
            log.length = 0;
        }
    };
};

module.exports.PxtBuffer = PxtBuffer;
module.exports.decodeInstructions = decodeInstructions;
