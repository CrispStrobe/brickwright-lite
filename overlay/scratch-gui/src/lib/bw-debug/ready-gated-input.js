/**
 * Console input that waits for the console to be READY.
 *
 * A booting Linux drops what it is sent before its shell is listening: the 8250
 * driver clears the 16550A's receive FIFO when the port starts up, and until a
 * process has /dev/ttyS0 open nothing reads the line at all. A learner who types
 * during the boot — or a browser gate that types the instant it sees a prompt
 * from a runner that is not the one it is typing into — loses those bytes, and
 * the symptom is a prompt that never answers, indistinguishable from a hang.
 *
 * So input is HELD until `isReady()` says the shell is up (bw-board's
 * linuxProgress().ready: userspace printed its marker and the prompt ended the
 * stream), and flushed in order the first frame it is. Once ready and drained,
 * bytes go straight through. Nothing is dropped silently: the queue is bounded,
 * and a byte over the bound is refused with `false`, which the caller can show.
 *
 * Framework-free and injectable, so it is tested in Node against the real
 * bw-board machine with a stand-in kernel that clears its FIFO before the prompt.
 *
 * @module
 */

export const READY_GATED_INPUT_LIMIT = 4096;

/**
 * @param {{isReady: () => boolean, send: (byte: number) => boolean, limit?: number}} opts
 * @returns {{push: (byte: number) => boolean, flush: () => number, pending: () => number}}
 */
export function createReadyGatedInput ({isReady, send, limit = READY_GATED_INPUT_LIMIT}) {
    if (typeof isReady !== 'function' || typeof send !== 'function') {
        throw new TypeError('createReadyGatedInput needs isReady() and send(byte)');
    }
    const queue = [];
    const flush = () => {
        if (!queue.length || !isReady()) return 0;
        let n = 0;
        while (queue.length) { send(queue.shift()); n++; }
        return n;
    };
    return {
        push (byte) {
            const b = byte & 0xff;
            // Order is kept: a byte typed after the shell came up still waits
            // behind anything typed before it.
            if (!queue.length && isReady()) return send(b) !== false;
            if (queue.length >= limit) return false;
            queue.push(b);
            flush();
            return true;
        },
        flush,
        pending: () => queue.length
    };
}

export default createReadyGatedInput;
