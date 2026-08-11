/**
 * Debug target factory — one construction path for two targets.
 *
 * The host should not need to know that one target has a destructive init
 * (emu_init re-callocs code memory) or that another needs a baud rate.
 * This factory owns each one's setup ordering and returns something the
 * front end can treat identically — branching on capabilities(), never
 * on which target it is.
 *
 * What the factory UNIFIES: construction and setup ordering.
 * What it does NOT unify: capabilities. The two targets are not equally
 * capable, and §1 says an interface hiding that "produces a front end
 * that lies to the user the moment it is pointed at real hardware."
 *
 * @module
 */

import { createEmu8051Adapter } from './emu8051-adapter.js';
import { createSerialDebugTarget } from './serial-debug.js';

/**
 * Create a DebugTarget of the specified kind.
 *
 * @param {'emulator' | 'serial'} kind
 * @param {object} opts
 *
 * For 'emulator':
 * @param {object} opts.wasm — the loaded emu8051 WASM module
 * @param {object} opts.board — the BoardImpl instance
 * @param {string} [opts.hex] — Intel HEX to load
 * @param {object} [opts.symbols] — stc_symtab.py JSON output
 * @param {number} [opts.fosc] — oscillator frequency (default 11059200)
 * @param {number} [opts.vcc] — supply voltage (default 5.0)
 *
 * For 'serial':
 * @param {object} opts.transport — serial transport adapter
 *   { write(data), onData(cb), onClose(cb) }
 * @param {number} [opts.timeoutMs] — command timeout (default 2000)
 *
 * @returns {Promise<{ target: object, adapter?: object }>}
 *   target: the DebugTarget
 *   adapter: the boundary-A adapter (emulator only)
 */
export async function createDebugTarget(kind, opts) {
  if (kind === 'emulator') {
    return createEmulatorTarget(opts);
  }
  if (kind === 'avr8js') {
    return createAvr8jsTarget(opts);
  }
  if (kind === 'rp2040js') {
    return createRp2040jsTarget(opts);
  }
  if (kind === 'serial') {
    return createSerialTarget(opts);
  }
  throw new Error(
    `Unknown debug target kind: '${kind}'. Use 'emulator', 'avr8js', 'rp2040js' or 'serial'.`
  );
}

// ─── Emulator target ─────────────────────────────────────────────────────

async function createEmulatorTarget(opts) {
  const {
    wasm, board, hex, symbols,
    fosc = 11059200, vcc = 5.0,
  } = opts;

  if (!wasm) throw new Error('emulator target requires opts.wasm');
  if (!board) throw new Error('emulator target requires opts.board');

  // ─── ORDERING IS CRITICAL ──────────────────────────────────────────
  // emu_init re-callocs code memory. If the adapter is created after
  // loading the hex, the image is wiped and the CPU NOP-sleds to
  // whatever address a breakpoint sits at. The host sees a working
  // debugger pointing at the wrong block.
  //
  // Correct order:
  //   1. Create adapter (calls emu_init internally)
  //   2. Attach board
  //   3. Load hex (into the memory emu_init allocated)
  //   4. Create debug target (reads the loaded image)

  // 1. Adapter
  const adapter = createEmu8051Adapter(wasm, { fosc, vcc, mode: 'poll' });

  // 2. Attach board
  adapter.attachBoard(board);

  // 3. Load hex
  if (hex) {
    adapter.loadHex(hex);

    // Sanity: the reset vector should not be 0x0000 (empty memory)
    const resetHi = wasm._emu_get_code(0);
    const resetLo = wasm._emu_get_code(1);
    const resetAddr = (resetHi === 0x02) ? (wasm._emu_get_code(1) << 8 | wasm._emu_get_code(2)) : 0;
    if (resetHi === 0 && resetLo === 0) {
      console.warn(
        'Warning: reset vector is 0x0000 after loading hex. ' +
        'The image may not have loaded correctly.'
      );
    }
  }

  // 4. Debug target — import dynamically to avoid circular deps
  const { createEmu8051DebugTarget } = await import('./emu8051-debug.js');
  const target = createEmu8051DebugTarget(wasm, { symbols });

  return { target, adapter };
}

// ─── AVR target (avr8js) ─────────────────────────────────────────────────

async function createAvr8jsTarget(opts) {
  const { board, hex, clockHz, vcc = 5.0 } = opts;

  if (!board) throw new Error('avr8js target requires opts.board');

  // Lazy import: avr8js is optional — an STC12-only user never pays for it,
  // and the smoke test does not die when the package is absent.
  const { createAvr8jsAdapter } = await import('./avr8js-adapter.js');

  // 1. Adapter — clockHz comes from the compile response, never hard-coded
  const adapter = createAvr8jsAdapter({ clockHz, vcc });

  // 2. Attach board
  adapter.attachBoard(board);

  // 3. Load hex — parse Intel HEX to Uint16Array of 16-bit words
  if (hex) {
    const words = parseIntelHex(hex);
    adapter.loadProgram(words);
  }

  // The AVR debug target wraps the adapter for boundary D (run/pause/step).
  // Block-level positions require AVR symbol mapping (a later addition).
  const { createAvr8jsDebugTarget } = await import('./avr8js-adapter.js');
  const target = typeof createAvr8jsDebugTarget === 'function'
    ? createAvr8jsDebugTarget(adapter)
    : null;

  return { adapter, target };
}

// ─── RP2040 target (rp2040js) ─────────────────────────────────────────────

async function createRp2040jsTarget(opts) {
  const { board, hex } = opts;
  if (!board) throw new Error('rp2040js target requires opts.board');
  const { createRp2040jsAdapter, createRp2040jsDebugTarget } =
    await import('./rp2040js-adapter.js');
  const adapter = createRp2040jsAdapter({ board });
  adapter.attachBoard(board);
  if (hex) adapter.loadProgram(parseIntelHexBytes(hex));
  const target = createRp2040jsDebugTarget(adapter);
  return { adapter, target };
}

/**
 * Parse an Intel HEX string into a Uint16Array of 16-bit words (little-endian
 * byte pairs), suitable for avr8js's progMem.
 */
function parseIntelHex(hex) {
  const bytes = new Uint8Array(0x8000); // 32 KB flash
  let maxAddr = 0;
  for (const line of hex.split(/\r?\n/)) {
    if (!line.startsWith(':')) continue;
    const len = parseInt(line.slice(1, 3), 16);
    const addr = parseInt(line.slice(3, 7), 16);
    const type = parseInt(line.slice(7, 9), 16);
    if (type !== 0) continue; // only data records
    for (let i = 0; i < len; i++) {
      const b = parseInt(line.slice(9 + i * 2, 11 + i * 2), 16);
      bytes[addr + i] = b;
      if (addr + i + 1 > maxAddr) maxAddr = addr + i + 1;
    }
  }
  // Pack into 16-bit words (little-endian: low byte first)
  const wordCount = Math.ceil(maxAddr / 2);
  const words = new Uint16Array(wordCount);
  for (let i = 0; i < wordCount; i++) {
    words[i] = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
  }
  return words;
}

function parseIntelHexBytes(hex) {
  const bytes = new Uint8Array(0x100000);
  let maxAddr = 0;
  let upper = 0;
  for (const line of String(hex).split(/\r?\n/)) {
    if (!line.startsWith(':')) continue;
    const len = parseInt(line.slice(1, 3), 16);
    const addr = parseInt(line.slice(3, 7), 16);
    const type = parseInt(line.slice(7, 9), 16);
    if (type === 4) { upper = parseInt(line.slice(9, 13), 16) << 16; continue; }
    if (type !== 0) continue;
    const absolute = upper + addr;
    // RP2040 flash images are linked at 0x10000000; store them at offset 0.
    const offset = absolute >= 0x10000000 ? absolute - 0x10000000 : absolute;
    for (let i = 0; i < len; i++) {
      bytes[offset + i] = parseInt(line.slice(9 + i * 2, 11 + i * 2), 16);
      maxAddr = Math.max(maxAddr, offset + i + 1);
    }
  }
  return bytes.slice(0, maxAddr);
}

// ─── Serial target ───────────────────────────────────────────────────────

async function createSerialTarget(opts) {
  const { transport, timeoutMs } = opts;

  if (!transport) throw new Error('serial target requires opts.transport');

  const target = createSerialDebugTarget(transport, { timeoutMs });

  // Connect and discover capabilities
  try {
    await target.connect();
  } catch (e) {
    // Connection may fail — the target starts detached and the caller
    // can retry. Do not throw from the factory.
    console.warn(`Serial target connect failed: ${e.message}`);
  }

  return { target };
}

/**
 * The known target kinds — for the target picker UI.
 * @returns {Array<{kind: string, label: string, description: string}>}
 */
export function getTargetKinds() {
  return [
    {
      kind: 'emulator',
      label: 'Simulated (emu8051)',
      description: 'Full instruction-level emulation. All debug features available.',
    },
    {
      kind: 'avr8js',
      label: 'Simulated (AVR)',
      description: 'ATmega328P instruction-level emulation (Arduino Uno/Nano).',
    },
    {
      kind: 'rp2040js',
      label: 'Simulated (Pico)',
      description: 'RP2040 instruction-level emulation with GPIO simulation; source mapping is not yet available.',
    },
    {
      kind: 'serial',
      label: 'Live board (USB)',
      description: 'Real hardware over serial. Block stepping and yield breakpoints only.',
    },
  ];
}
