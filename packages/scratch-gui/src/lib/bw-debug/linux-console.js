/**
 * The Linux lesson's serial terminal, host side: keys in, bytes out.
 *
 * ONE MODULE FOR BOTH HALVES, and the same one in the browser and in Node:
 * debug-runner's attachRiscV32Linux builds it around bw-board's linux debug
 * target, and test/linux-terminal.test.mjs builds it around the same target
 * booting the real Linux 6.1 — so what the test proves (Ctrl-C interrupts
 * `sleep`, an arrow recalls history, a 4 KB paste arrives whole) is proved of
 * the feed the learner's keystrokes take.
 *
 *   in   send(data) — a key's bytes (terminal-keys.js), pasted text, or a
 *        typed string (UTF-8). Held until the shell is up, then fed to the
 *        16550A no more than one FIFO's worth (16 bytes) at a time and only
 *        once the guest has drained the last one (LSR.DR clear): see
 *        ready-gated-input.js.
 *   out  output.push(byte) from the UART's transmit side; output.subscribe()
 *        for the terminal emulator, which gets the raw stream, escape
 *        sequences and all.
 *   frame()  once per host frame, after the machine ran: refill the FIFO and
 *        deliver this frame's output.
 *
 * TERMINAL SIZE. The guest cannot be told one: a UART has no TIOCSWINSZ, the
 * kernel reports 0×0, and busybox's tools (vi, less, top, ash's line editor)
 * then assume 80×24. So the emulator is a fixed 80×24 and nothing is typed
 * into the learner's shell to say so. `stty rows R cols C` inside the guest
 * still works for anyone who resizes on purpose.
 *
 * @module
 */
import {createReadyGatedInput} from './ready-gated-input.js';
import {createTerminalOutput} from './terminal-output.js';
import {textToBytes} from './terminal-keys.js';

export const TERMINAL_COLS = 80;
export const TERMINAL_ROWS = 24;

const UART_LSR = 5;
let nextConsoleId = 1;
const LSR_DR = 0x01;

/**
 * The 16550A's line status, read the way the guest's driver reads it. A
 * register READ, so it has no side effect (unlike RBR or IIR). The machine is
 * looked up on every call: a Linux reset builds a new one.
 */
function uartLineStatus (adapter) {
    const uart = adapter && adapter.machine && adapter.machine.uart;
    return uart && typeof uart.load8 === 'function' ? uart.load8(UART_LSR) : null;
}

/**
 * @param {{target: {linuxProgress: () => ({ready: boolean}|null), sendSerial: (b: number) => boolean},
 *          adapter?: {machine?: {uart?: {load8: (off: number) => number}}}}} opts
 */
export function createLinuxConsole ({target, adapter}) {
    if (!target || typeof target.sendSerial !== 'function') {
        throw new TypeError('createLinuxConsole needs a target with sendSerial');
    }
    const output = createTerminalOutput();
    const input = createReadyGatedInput({
        isReady: () => !!((target.linuxProgress && target.linuxProgress()) || {}).ready,
        send: byte => target.sendSerial(byte),
        // No UART to ask (not this machine): pass straight through.
        canAccept: () => {
            const lsr = uartLineStatus(adapter);
            return lsr === null || !(lsr & LSR_DR);
        }
    });
    const toBytes = data => {
        if (typeof data === 'number') return [data & 0xff];
        if (typeof data === 'string') return textToBytes(data);
        return Array.from(data || [], b => b & 0xff);
    };
    return {
        /** Distinct per console, so a view keyed on it remounts for a new boot. */
        id: `linux-console-${nextConsoleId++}`,
        output,
        input,
        cols: TERMINAL_COLS,
        rows: TERMINAL_ROWS,
        /** Queue bytes for the guest; false (nothing queued) when over the bound. */
        send: data => input.write(toBytes(data)),
        frame () {
            input.flush();
            output.deliver();
        }
    };
}

export default createLinuxConsole;
