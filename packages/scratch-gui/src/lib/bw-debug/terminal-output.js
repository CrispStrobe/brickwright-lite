/**
 * The machine → terminal half of a serial terminal: bytes the UART transmitted,
 * batched per frame for a terminal emulator, plus a bounded replay log so a
 * terminal mounted after the boot (the panel re-rendered, the tab was switched)
 * redraws the same screen rather than starting blank.
 *
 * Bytes, not text: the stream is UTF-8 with escape sequences split across any
 * frame boundary, and only the emulator can reassemble either. Framework-free.
 *
 * @module
 */

/** Bytes kept for a late subscriber. Enough for the boot log and a session. */
export const TERMINAL_REPLAY_LIMIT = 256 * 1024;

/**
 * @param {{replayLimit?: number}} [opts]
 * @returns {{push: (byte: number) => void, deliver: () => number,
 *            subscribe: (sink: (bytes: Uint8Array) => void) => () => void,
 *            replayed: () => Uint8Array}}
 */
export function createTerminalOutput ({replayLimit = TERMINAL_REPLAY_LIMIT} = {}) {
    let pending = [];
    let log = [];                  // chunks, oldest first
    let logBytes = 0;
    const sinks = new Set();

    const replayed = () => {
        const out = new Uint8Array(logBytes);
        let at = 0;
        for (const c of log) { out.set(c, at); at += c.length; }
        return out;
    };

    return {
        /** One transmitted byte (called from the UART's onSerial). */
        push (byte) { pending.push(byte & 0xff); },

        /** Hand this frame's bytes to every sink; returns how many. */
        deliver () {
            if (!pending.length) return 0;
            const chunk = Uint8Array.from(pending);
            pending = [];
            log.push(chunk);
            logBytes += chunk.length;
            // Drop whole old chunks past the bound; a split escape sequence at
            // the cut is harmless (the emulator resynchronises on the next one).
            while (logBytes > replayLimit && log.length > 1) logBytes -= log.shift().length;
            for (const sink of sinks) sink(chunk);
            return chunk.length;
        },

        /** Subscribe; the sink first receives the replay log, then each frame. */
        subscribe (sink) {
            if (typeof sink !== 'function') throw new TypeError('subscribe needs a function');
            if (logBytes) sink(replayed());
            sinks.add(sink);
            return () => sinks.delete(sink);
        },

        replayed
    };
}

export default createTerminalOutput;
