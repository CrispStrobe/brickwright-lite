/**
 * Console input that waits for the console to be READY, and then is fed to
 * the UART no faster than a real one can take it.
 *
 * READY. A booting Linux drops what it is sent before its shell is listening:
 * the 8250 driver clears the 16550A's receive FIFO when the port starts up, and
 * until a process has /dev/ttyS0 open nothing reads the line at all. A learner
 * who types during the boot — or a browser gate that types the instant it sees
 * a prompt from a runner that is not the one it is typing into — loses those
 * bytes, and the symptom is a prompt that never answers, indistinguishable from
 * a hang. So input is HELD until `isReady()` says the shell is up (bw-board's
 * linuxProgress().ready: userspace printed its marker and the prompt ended the
 * stream), and flushed in order once it is.
 *
 * PACED. Once the console is a terminal, a paste is thousands of bytes in one
 * event. A real NS16550A holds 16 received bytes; a 17th before the driver has
 * read any sets LSR.OE and is lost. So with `canAccept` (the UART's receive
 * FIFO is empty — LSR.DR clear) the queue is handed over at most `burst` bytes
 * at a time, and only after the guest has drained the previous burst: the
 * host keeps the paste, the guest pulls it at its own pace. Refills happen on
 * `write` and on every `flush()` (debug-runner calls it once per frame, after
 * the machine ran), so a burst is never more than one FIFO's worth. Without
 * `canAccept` (a UART that cannot say) bytes pass straight through, as before.
 *
 * Nothing is dropped silently: the queue is bounded, and a write that does not
 * fit is refused whole with `false`, which the caller can show.
 *
 * Framework-free and injectable, so it is tested in Node against the real
 * bw-board machine (a stand-in kernel for the boot race; the real Linux 6.1
 * for the paste).
 *
 * @module
 */

/** Bytes held before a write is refused: a generous paste, not a file transfer. */
export const READY_GATED_INPUT_LIMIT = 1 << 20;
/** An NS16550A's receive FIFO depth: the most bytes handed over per refill. */
export const UART_FIFO_DEPTH = 16;

/**
 * @param {{isReady: () => boolean, send: (byte: number) => boolean,
 *          canAccept?: () => boolean, burst?: number, limit?: number}} opts
 * @returns {{push: (byte: number) => boolean, write: (bytes: ArrayLike<number>) => boolean,
 *            flush: () => number, pending: () => number}}
 */
export function createReadyGatedInput ({isReady, send, canAccept = null,
    burst = UART_FIFO_DEPTH, limit = READY_GATED_INPUT_LIMIT}) {
    if (typeof isReady !== 'function' || typeof send !== 'function') {
        throw new TypeError('createReadyGatedInput needs isReady() and send(byte)');
    }
    if (canAccept !== null && typeof canAccept !== 'function') {
        throw new TypeError('canAccept, when given, is a function');
    }
    // A ring would be tidier; an array with a moving head is enough and keeps
    // shift() off the hot path of a 4 KB paste.
    let queue = [];
    let head = 0;
    const pending = () => queue.length - head;
    const flush = () => {
        if (!pending() || !isReady()) return 0;
        if (canAccept && !canAccept()) return 0;
        const n = canAccept ? Math.min(burst, pending()) : pending();
        for (let i = 0; i < n; i++) send(queue[head++]);
        if (head === queue.length) { queue = []; head = 0; }
        return n;
    };
    const write = bytes => {
        const n = bytes.length;
        if (pending() + n > limit) return false;
        for (let i = 0; i < n; i++) queue.push(bytes[i] & 0xff);
        // Order is kept: a byte typed after the shell came up still waits
        // behind anything typed before it.
        flush();
        return true;
    };
    return {
        push: byte => write([byte]),
        write,
        flush,
        pending
    };
}

export default createReadyGatedInput;
