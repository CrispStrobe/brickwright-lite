/**
 * The RCX infrared tower over Web Serial.
 *
 * `rcx-protocol.js` takes `send(bytes) -> received` and imports no transport,
 * deliberately. This is one implementation of that function and nothing else:
 * it knows about baud rates and quiet periods, and it has never heard of an
 * opcode. The split is the same one the tower firmware makes in hardware — see
 * docs/RCX-IR-TOWER-FIRMWARE.md, where a tower that DECODES serial rather than
 * gating a carrier is the mistake being avoided.
 *
 * THE LINE PARAMETERS ARE NOT NEGOTIABLE, and getting one wrong fails silently.
 * RCX Internals: "bits are sent using a 2400 baud, 8 data, odd parity, NRZ
 * format", and "RCX completely ignores messages that have invalid packet
 * checksums" — so a parity setting of `none` does not produce an error, it
 * produces a brick that never answers. That is the worst failure mode
 * available here, which is why these are constants with a citation rather than
 * options with defaults.
 *
 * WHY READING IS TIMED RATHER THAN COUNTED. Infrared is a broadcast medium and
 * the tower hears its own LED, so every send is followed by its own echo and
 * then, maybe, a reply. The protocol layer already knows how to tell those
 * apart (`extractReply` matches `~opcode`); what the transport has to decide is
 * only WHEN TO STOP LISTENING. It stops on a quiet period — no new byte for
 * `quietMs` — bounded by an overall `timeoutMs`, and hands everything it heard
 * upwards. Counting bytes instead would require this layer to know each
 * opcode's reply length, which is precisely the knowledge the split exists to
 * keep out.
 *
 * Browser wiring, which is all the app has to write:
 *
 *   const port = await navigator.serial.requestPort();
 *   const link = await openRcxSerial(port);
 *   const session = new RcxSession(link.send);
 *   await downloadImage(parseRcxImage(bytes), { send: link.send, ... });
 *   await link.close();
 */

/** RCX Internals, "Serial format". Both are required; neither is a preference. */
export const RCX_BAUD_RATE = 2400;
export const RCX_PARITY = 'odd';
export const RCX_DATA_BITS = 8;
export const RCX_STOP_BITS = 1;

/**
 * `firmdl3` raises the link for firmware download only. RCX Internals calls
 * this a property of the tools rather than of the brick, and it is optional —
 * 2400/odd is what always works, so this is never the default.
 *
 * Note for anyone building a tower to go with this: a receiver module with a
 * 10-cycle minimum burst length cannot carry this mode at all, because a
 * single zero bit at 4800 baud is only 7.9 carrier cycles. The measurement and
 * the part numbers are in firmware/ir-tower/README.md.
 */
export const FIRMWARE_BAUD_RATE = 4800;
export const FIRMWARE_PARITY = 'none';

/**
 * One byte at 2400 8-O-1 is 11 bit times — a start bit, eight data, parity and
 * stop — so 11 / 2400 = 4.583 ms. Everything below is derived from that rather
 * than guessed, which is why the numbers look oddly specific.
 */
export const BIT_TIMES_PER_BYTE = 11;
export const byteMs = (baudRate = RCX_BAUD_RATE) => (BIT_TIMES_PER_BYTE * 1000) / baudRate;

/**
 * Quiet period: how long a gap means "nothing more is coming".
 *
 * It has to exceed the inter-byte gap of a transmission that is still running,
 * or a reply gets cut in half and read as a truncated frame. A sender emits
 * bytes back to back, so that gap is nominally zero — but a USB serial adapter
 * delivers in chunks on its own schedule, and the brick takes a moment to turn
 * the link around. Three byte times (13.75 ms at 2400) is comfortably above
 * adapter jitter and still short enough that a brick which is simply absent
 * does not stall the UI.
 */
export const DEFAULT_QUIET_BYTES = 3;

/**
 * Overall deadline for one command.
 *
 * The longest exchange in the download path is a `TRANSFER_DATA` block:
 * DEFAULT_BLOCK_SIZE (50) payload bytes, each sent as a byte and its
 * complement, plus header, opcode and checksum — then the echo of all of it,
 * then a reply. Call it 120 bytes each way at 4.583 ms, which is about 1.1 s,
 * and double it for the brick's own turnaround and a slow adapter.
 */
export const DEFAULT_TIMEOUT_MS = 2500;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Open a Web Serial port with the RCX's line settings and return a link.
 *
 * @param {object} port an unopened Web Serial `SerialPort`
 * @param {object} [options]
 * @param {number} [options.baudRate] RCX_BAUD_RATE, or FIRMWARE_BAUD_RATE
 * @param {string} [options.parity] matched to the baud rate by default
 * @param {number} [options.quietMs] gap that ends a read
 * @param {number} [options.timeoutMs] deadline for one exchange
 * @param {boolean} [options.alreadyOpen] the caller opened the port itself
 * @returns {Promise<{send: Function, close: Function, settings: object}>}
 */
export async function openRcxSerial (port, options = {}) {
    if (!port || typeof port !== 'object') {
        throw new TypeError('openRcxSerial needs a Web Serial port');
    }
    const baudRate = options.baudRate ?? RCX_BAUD_RATE;
    // Parity follows the baud rate unless the caller overrides it, because the
    // two only ever move together: 2400 is odd, the firmware mode is none.
    // Letting them be set independently would make "4800, odd" expressible,
    // and that combination exists in no tool and works on no brick.
    const parity = options.parity ?? (baudRate === FIRMWARE_BAUD_RATE ? FIRMWARE_PARITY : RCX_PARITY);
    const settings = {
        baudRate,
        parity,
        dataBits: RCX_DATA_BITS,
        stopBits: RCX_STOP_BITS
    };
    const quietMs = options.quietMs ?? Math.ceil(DEFAULT_QUIET_BYTES * byteMs(baudRate));
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!options.alreadyOpen) await port.open(settings);

    const writer = port.writable.getWriter();
    const reader = port.readable.getReader();
    let closed = false;

    const readChunk = async () => {
        const {value, done} = await reader.read();
        if (done || !value) return null;
        return value instanceof Uint8Array ? value : new Uint8Array(value);
    };

    // ONE OUTSTANDING READ, EVER, AND IT ALWAYS DEPOSITS WHAT IT HEARD.
    //
    // The obvious shape — `Promise.race([reader.read(), timeout])` in a loop —
    // loses data, and loses it silently. When the timeout wins, the read is
    // abandoned but NOT cancelled: it is still queued on the stream, it still
    // resolves later, and the bytes it resolves with are dropped because
    // nobody is awaiting it any more. The next iteration then issues a second
    // read, which the spec queues BEHIND the first, so from then on every
    // chunk is delivered to a promise the loop has already walked away from.
    // The symptom is a reply that arrives intact on the wire and decodes as
    // truncated, intermittently, depending on adapter timing.
    //
    // So the pump owns the single in-flight read and appends to `stash`
    // unconditionally. A read that resolves after its exchange gave up still
    // deposits its bytes, and the NEXT send picks them up — which is also
    // exactly what is needed for a reply that begins before the write promise
    // settles, since an adapter is a pipe and not a turn-taking protocol.
    let stash = [];
    let inflight = null;
    let ended = false;

    const pump = () => {
        if (inflight || ended) return inflight;
        inflight = readChunk()
            .then(chunk => {
                inflight = null;
                if (chunk === null) ended = true;
                else if (chunk.length) stash.push(...chunk);
                return chunk;
            })
            .catch(() => {
                inflight = null;
                ended = true;
                return null;
            });
        return inflight;
    };

    /**
     * Write a frame and return everything heard afterwards — echo included.
     * The protocol layer separates echo from reply; that is not this layer's
     * business and it deliberately does not try.
     */
    const send = async bytes => {
        if (closed) throw new Error('the RCX serial link is closed');
        const frame = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        await writer.write(frame);

        const heard = stash;
        stash = [];
        const deadline = Date.now() + timeoutMs;
        let lastByteAt = Date.now();

        for (;;) {
            if (ended) break;
            const before = stash.length;
            const remaining = Math.max(0, deadline - Date.now());
            if (remaining === 0) break;
            // Wait for the pump OR for a quiet period to elapse, whichever
            // comes first. Racing the SLEEP is safe where racing the read was
            // not, because the pump keeps its own result.
            await Promise.race([pump(), sleep(Math.min(quietMs, remaining))]);
            if (stash.length > before) {
                heard.push(...stash.splice(0, stash.length));
                lastByteAt = Date.now();
                continue;
            }
            // A quiet period only ends the read once something has been heard;
            // before that the deadline is what governs, so a slow brick is
            // waited for rather than declared absent after 14 ms.
            if (heard.length && Date.now() - lastByteAt >= quietMs) break;
        }
        // Anything the pump deposited between the last drain and here belongs
        // to this exchange too.
        if (stash.length) heard.push(...stash.splice(0, stash.length));
        return new Uint8Array(heard);
    };

    const close = async () => {
        if (closed) return;
        closed = true;
        try {
            writer.releaseLock();
        } catch { /* already released */ }
        await reader.cancel().catch(() => {});
        try {
            reader.releaseLock();
        } catch { /* already released */ }
        if (!options.alreadyOpen) await port.close().catch(() => {});
    };

    return {send, close, settings, quietMs, timeoutMs};
}

/**
 * The LEGO USB tower's identity, for a WebUSB filter or a Web Serial hint.
 *
 * A home-built tower is an ordinary USB-serial adapter and matches no filter,
 * which is why a port request must be offerable WITHOUT one — see
 * docs/RCX-IR-TOWER-FIRMWARE.md, where a DIY board is told to present its own
 * VID/PID rather than claim this pair.
 */
export const LEGO_USB_TOWER = Object.freeze({usbVendorId: 0x0694, usbProductId: 0x0001});

/**
 * Ask the user for a port. Separate from openRcxSerial, and the only function
 * here that touches `navigator`, so everything above stays testable in Node.
 *
 * `filters` is EMPTY by default on purpose. Filtering to the LEGO tower would
 * hide every home-built one — the serial tower is a plain COM port and the DIY
 * boards are ordinary adapters — and a chooser that shows nothing reads as
 * broken hardware.
 */
export async function requestRcxPort (filters = []) {
    if (typeof navigator !== 'object' || !navigator.serial) {
        throw new Error('this browser has no Web Serial; use Chrome, Edge or Opera');
    }
    return navigator.serial.requestPort(filters.length ? {filters} : {});
}

export default openRcxSerial;
