/**
 * Construct a power-on RP2040 epoch while preserving only flash and the
 * external circuit board. A watchdog reset must not reuse peripheral or USB
 * controller state from the old SoC.
 *
 * Dependencies are injected so the reset boundary has a fast unit test and
 * keeps rp2040js behind the simulator's dynamic-import boundary.
 */
export function createFreshPicoEpoch ({previous, image, board, createAdapter, adapterOptions}) {
    const source = previous ? previous.rp2040.flash : image;
    if (!source) throw new Error('a Pico flash image is required');

    // bootFromFlash copies with Uint8Array.set(). Passing the old flash
    // directly avoids a second 16 MiB intermediate during reset while the new
    // adapter still receives independent storage.
    const adapter = createAdapter(adapterOptions || {});
    adapter.attachBoard(board);
    adapter.bootFromFlash(source);
    return adapter;
}

/** A byte queue whose pending and future reads fail together on terminal stop. */
export function createPicoByteChannel () {
    let pending = '';
    let terminalError = null;
    let waiters = [];
    const release = error => {
        const current = waiters;
        waiters = [];
        for (const waiter of current) {
            if (error) waiter.reject(error);
            else waiter.resolve();
        }
    };
    return {
        append (text) {
            pending += text;
            release();
        },
        clear () {
            pending = '';
            release();
        },
        fail (error) {
            terminalError = error instanceof Error ? error : new Error(String(error));
            release(terminalError);
        },
        async read () {
            if (terminalError) throw terminalError;
            if (!pending) await new Promise((resolve, reject) => waiters.push({resolve, reject}));
            if (terminalError) throw terminalError;
            const text = pending;
            pending = '';
            return text;
        }
    };
}
