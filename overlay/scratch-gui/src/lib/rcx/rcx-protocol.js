/**
 * rcx-protocol.js — the LEGO RCX infrared protocol, as pure functions.
 *
 * Clean-room implementation. Written from two sources only:
 *
 *   1. Kekoa Proudfoot, "RCX Internals" (1998-2001), <https://www.mralligator.com/rcx/>
 *      and its opcode reference <https://www.mralligator.com/rcx/opcodes.html>.
 *      Every opcode number, parameter list and reply code below is read off that
 *      document's tables.
 *   2. docs/RCX-IR-PROTOCOL.md in this repository (the framing contract).
 *
 * Plus direct measurement of `.rcx` files emitted by the NQC compiler, which is
 * where the container layout in parseRcxImage() comes from — RCX Internals does
 * not describe the `.rcx` container at all (it is an NQC artefact, not a brick
 * artefact). See the header comment on parseRcxImage for the derivation.
 *
 * No I/O anywhere in this file. The download sequence takes an injected
 * `send()`; nothing here imports Web Serial, WebUSB, or node:anything.
 */

/* ------------------------------------------------------------------------ *
 * Opcode table
 *
 * Only PC-to-brick requests are listed — the "P" column of RCX Internals.
 * Opcodes are given with bit 3 (0x08, the toggle) CLEAR; that bit is applied
 * at encode time, which is exactly what the document's `NN / MM` pairs mean.
 *
 * `params` is the parameter byte count and must equal `opcode & 0x07` for
 * every fixed-length opcode (RCX Internals: messages are "grouped and parsed
 * by lower 3 bits"). TRANSFER_DATA is the documented variable-length
 * exception, so it carries params: null and is checked separately.
 *
 * `reply` is the reply opcode and `replyParams` its payload length. Note that
 * reply opcodes do NOT obey the arity rule (0xd2's reply d2/da carries one
 * error byte, yet 0xd2 & 7 === 2), which is why the length has to be tabulated
 * rather than computed.
 * ------------------------------------------------------------------------ */

export const OP = Object.freeze({
  ALIVE: 0x10,
  GET_VALUE: 0x12,
  SET_MOTOR_POWER: 0x13,
  SET_VARIABLE: 0x14,
  GET_VERSIONS: 0x15,
  GET_MEMORY_MAP: 0x20,
  SET_MOTOR_ON_OFF: 0x21,
  SET_TIME: 0x22,
  PLAY_TONE: 0x23,
  START_TASK_DOWNLOAD: 0x25,
  GET_BATTERY_POWER: 0x30,
  SET_TRANSMITTER_RANGE: 0x31,
  SET_SENSOR_TYPE: 0x32,
  SET_DISPLAY: 0x33,
  START_SUBROUTINE_DOWNLOAD: 0x35,
  DELETE_ALL_TASKS: 0x40,
  SET_SENSOR_MODE: 0x42,
  TRANSFER_DATA: 0x45,
  SET_POWER_DOWN_DELAY_REPLY_CHECK: 0x46, // reply code, kept out of REQUESTS
  STOP_ALL_TASKS: 0x50,
  PLAY_SOUND: 0x51,
  SET_DATALOG_SIZE: 0x52,
  POWER_OFF: 0x60,
  DELETE_TASK: 0x61,
  DELETE_ALL_SUBROUTINES: 0x70,
  START_TASK: 0x71,
  STOP_TASK: 0x81,
  SET_PROGRAM_NUMBER: 0x91,
  UPLOAD_DATALOG: 0xa4,
  UNLOCK_FIRMWARE: 0xa5,
  SET_POWER_DOWN_DELAY: 0xb1,
  DELETE_SUBROUTINE: 0xc1,
  CLEAR_SENSOR_VALUE: 0xd1,
  SET_MOTOR_DIRECTION: 0xe1,
});

/** @type {Map<number, {name: string, params: number|null, reply: number, replyParams: number|null}>} */
export const REQUESTS = new Map([
  [0x10, { name: 'alive', params: 0, reply: 0xe7, replyParams: 0 }],
  [0x12, { name: 'getValue', params: 2, reply: 0xe5, replyParams: 2 }],
  [0x13, { name: 'setMotorPower', params: 3, reply: 0xe4, replyParams: 0 }],
  [0x14, { name: 'setVariable', params: 4, reply: 0xe3, replyParams: 0 }],
  [0x15, { name: 'getVersions', params: 5, reply: 0xe2, replyParams: 8 }],
  [0x20, { name: 'getMemoryMap', params: 0, reply: 0xd7, replyParams: 188 }],
  [0x21, { name: 'setMotorOnOff', params: 1, reply: 0xd6, replyParams: 0 }],
  [0x22, { name: 'setTime', params: 2, reply: 0xd5, replyParams: 0 }],
  [0x23, { name: 'playTone', params: 3, reply: 0xd4, replyParams: 0 }],
  [0x25, { name: 'startTaskDownload', params: 5, reply: 0xd2, replyParams: 1 }],
  [0x30, { name: 'getBatteryPower', params: 0, reply: 0xc7, replyParams: 2 }],
  [0x31, { name: 'setTransmitterRange', params: 1, reply: 0xc6, replyParams: 0 }],
  [0x32, { name: 'setSensorType', params: 2, reply: 0xc5, replyParams: 0 }],
  [0x33, { name: 'setDisplay', params: 3, reply: 0xc4, replyParams: 0 }],
  [0x35, { name: 'startSubroutineDownload', params: 5, reply: 0xc2, replyParams: 1 }],
  [0x40, { name: 'deleteAllTasks', params: 0, reply: 0xb7, replyParams: 0 }],
  [0x42, { name: 'setSensorMode', params: 2, reply: 0xb5, replyParams: 0 }],
  // Variable length: short index, short length, data[length], byte checksum.
  [0x45, { name: 'transferData', params: null, reply: 0xb2, replyParams: 1 }],
  [0x50, { name: 'stopAllTasks', params: 0, reply: 0xa7, replyParams: 0 }],
  [0x51, { name: 'playSound', params: 1, reply: 0xa6, replyParams: 0 }],
  // replyParams 0, not 1. This said 1 until the oracle ran `nqc -clear`, which
  // is the only thing in NQC that sends this opcode: it transmits
  // `52 ad 00 ff 00 ff 52 ad` and accepts a reply carrying the complemented
  // opcode and NOTHING else, exiting 0. With 1 here, extractReply waits for a
  // byte that never arrives and reports NO_REPLY for an exchange that worked.
  [0x52, { name: 'setDatalogSize', params: 2, reply: 0xa5, replyParams: 0 }],
  [0x60, { name: 'powerOff', params: 0, reply: 0x97, replyParams: 0 }],
  [0x61, { name: 'deleteTask', params: 1, reply: 0x96, replyParams: 0 }],
  [0x70, { name: 'deleteAllSubroutines', params: 0, reply: 0x87, replyParams: 0 }],
  [0x71, { name: 'startTask', params: 1, reply: 0x86, replyParams: 0 }],
  [0x81, { name: 'stopTask', params: 1, reply: 0x76, replyParams: 0 }],
  [0x91, { name: 'setProgramNumber', params: 1, reply: 0x66, replyParams: 0 }],
  // Variable-length reply (datalog records); replyParams null => caller sizes it.
  [0xa4, { name: 'uploadDatalog', params: 4, reply: 0x53, replyParams: null }],
  [0xa5, { name: 'unlockFirmware', params: 5, reply: 0x52, replyParams: 25 }],
  [0xb1, { name: 'setPowerDownDelay', params: 1, reply: 0x46, replyParams: 0 }],
  [0xc1, { name: 'deleteSubroutine', params: 1, reply: 0x36, replyParams: 0 }],
  [0xd1, { name: 'clearSensorValue', params: 1, reply: 0x26, replyParams: 0 }],
  [0xe1, { name: 'setMotorDirection', params: 1, reply: 0x16, replyParams: 0 }],
]);

/** The three header bytes. RCX Internals: `55 ff 00`. */
export const HEADER = Object.freeze([0x55, 0xff, 0x00]);

/** The toggle bit. RCX Internals: "Messages sent by PC seem to alternate
 *  between having 0x08 set and not set". */
export const TOGGLE_BIT = 0x08;

const complement = (b) => (~b) & 0xff;

/* ------------------------------------------------------------------------ *
 * 1. Framing
 * ------------------------------------------------------------------------ */

/**
 * Build a complete IR message.
 *
 *   55 ff 00  Op Op'  D0 D0'  ...  Dn Dn'  Ck Ck'
 *
 * where Ck = (Op + sum(D)) % 256, and Op already carries the toggle bit,
 * because Op is by definition the byte that goes on the wire.
 *
 * --- Where the toggle state lives, and why ---
 *
 * The toggle is deliberately NOT module-level mutable state. Module state
 * would be shared by every link in the process, so two towers, or a test
 * running beside real traffic, would corrupt each other's alternation — and
 * because a desynchronised toggle fails *silently* (the brick drops a repeated
 * opcode and re-sends the previous reply, per RCX Internals), that corruption
 * would be close to undiagnosable. Sequence state belongs to the connection it
 * sequences.
 *
 * So: `encodeCommand` is pure, and takes the toggle explicitly. The
 * alternation lives in an object the caller owns — `createSequencer()` — which
 * can be created per link and reset at will (§ below). `RcxSession` owns one.
 *
 * @param {number} opcode  base opcode, toggle bit ignored
 * @param {Iterable<number>|Uint8Array} [params]
 * @param {{toggle?: boolean, checkArity?: boolean}} [options]
 * @returns {Uint8Array}
 */
export function encodeCommand(opcode, params = [], options = {}) {
  const { toggle = false, checkArity = true } = options;
  const data = Uint8Array.from(params);

  if (!Number.isInteger(opcode) || opcode < 0 || opcode > 0xff) {
    throw new RangeError(`opcode must be a byte, got ${opcode}`);
  }
  for (const b of data) {
    if (!Number.isInteger(b) || b < 0 || b > 0xff) {
      throw new RangeError(`parameter bytes must be 0..255, got ${b}`);
    }
  }

  const op = toggle ? (opcode | TOGGLE_BIT) : (opcode & ~TOGGLE_BIT & 0xff);

  // RCX Internals: "The opcode is a single byte not equal to 55, ff, or 00."
  // Checked on both phases of the toggle, so an opcode that is only legal with
  // the bit set (0xff -> 0xf7) is rejected rather than quietly becoming a
  // different opcode on alternate messages.
  for (const candidate of [opcode & 0xff, op]) {
    if (candidate === 0x55 || candidate === 0xff || candidate === 0x00) {
      throw new RangeError(
        `opcode 0x${candidate.toString(16)} collides with a header byte`);
    }
  }

  if (checkArity) {
    const spec = REQUESTS.get(op & ~TOGGLE_BIT & 0xff);
    // The arity rule is a property of the opcode encoding, not of the table:
    // low three bits give the parameter byte count. Check it for every opcode
    // we know to be fixed-length.
    if (spec && spec.params !== null && spec.params !== data.length) {
      throw new RangeError(
        `${spec.name} (0x${opcode.toString(16)}) takes ${spec.params} parameter ` +
        `bytes, got ${data.length}`);
    }
  }

  let sum = op;
  for (const b of data) sum += b;
  const ck = sum & 0xff;

  const out = new Uint8Array(3 + 2 * (data.length + 2));
  out[0] = HEADER[0];
  out[1] = HEADER[1];
  out[2] = HEADER[2];
  let i = 3;
  out[i++] = op;
  out[i++] = complement(op);
  for (const b of data) {
    out[i++] = b;
    out[i++] = complement(b);
  }
  out[i++] = ck;
  out[i++] = complement(ck);
  return out;
}

/**
 * The toggle-bit sequencer: a tiny object the caller owns.
 * `next()` returns the toggle to use for the command about to be sent and
 * flips the stored state; `reset()` puts it back to the initial value.
 */
export function createSequencer(initial = false) {
  let toggle = Boolean(initial);
  return {
    /** Toggle value for the next command; flips state. */
    next() {
      const t = toggle;
      toggle = !toggle;
      return t;
    },
    /** Current value without consuming it. */
    peek() {
      return toggle;
    },
    reset(value = initial) {
      toggle = Boolean(value);
    },
    /** Encode with this sequencer's toggle. */
    encode(opcode, params = [], options = {}) {
      return encodeCommand(opcode, params, { ...options, toggle: this.next() });
    },
  };
}

/* ------------------------------------------------------------------------ *
 * 2. Decoding
 * ------------------------------------------------------------------------ */

/**
 * Typed refusal reasons. Malformed input is routine on a noisy IR link, so
 * decodeReply never throws — it returns one of these.
 */
export const DecodeError = Object.freeze({
  TOO_SHORT: 'TOO_SHORT',
  BAD_HEADER: 'BAD_HEADER',
  BAD_COMPLEMENT: 'BAD_COMPLEMENT',
  ODD_LENGTH: 'ODD_LENGTH',
  BAD_CHECKSUM: 'BAD_CHECKSUM',
  FORBIDDEN_OPCODE: 'FORBIDDEN_OPCODE',
});

/**
 * Decode one framed message.
 *
 * Works for both directions: a brick reply and the tower's echo of our own
 * command have identical structure. Telling them apart is the job of
 * createReplyReader().
 *
 * @param {Uint8Array|number[]} bytes  exactly one frame, header included
 * @returns {{ok: true, opcode: number, baseOpcode: number, toggle: boolean,
 *             params: Uint8Array, checksum: number, length: number}
 *        | {ok: false, error: string, detail: string, offset?: number}}
 */
export function decodeReply(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes ?? []);

  // Shortest legal frame: header + opcode pair + checksum pair = 7 bytes.
  if (b.length < 7) {
    return refuse(DecodeError.TOO_SHORT,
      `need at least 7 bytes for header + opcode + checksum, got ${b.length}`);
  }
  for (let i = 0; i < 3; i++) {
    if (b[i] !== HEADER[i]) {
      return refuse(DecodeError.BAD_HEADER,
        `byte ${i} is 0x${hex(b[i])}, expected 0x${hex(HEADER[i])}`, i);
    }
  }

  const body = b.subarray(3);
  if (body.length % 2 !== 0) {
    return refuse(DecodeError.ODD_LENGTH,
      `${body.length} bytes after the header is not a whole number of ` +
      `value/complement pairs`);
  }

  // Every byte after the header is followed by its complement.
  for (let i = 0; i < body.length; i += 2) {
    if (body[i + 1] !== complement(body[i])) {
      return refuse(DecodeError.BAD_COMPLEMENT,
        `0x${hex(body[i])} at offset ${3 + i} is followed by 0x${hex(body[i + 1])}, ` +
        `expected its complement 0x${hex(complement(body[i]))}`, 3 + i + 1);
    }
  }

  const opcode = body[0];
  if (opcode === 0x55 || opcode === 0xff || opcode === 0x00) {
    return refuse(DecodeError.FORBIDDEN_OPCODE,
      `0x${hex(opcode)} may not be an opcode (header bytes are excluded)`, 3);
  }

  const nParams = body.length / 2 - 2;
  const params = new Uint8Array(nParams);
  let sum = opcode;
  for (let i = 0; i < nParams; i++) {
    params[i] = body[2 + 2 * i];
    sum += params[i];
  }
  const checksum = body[body.length - 2];
  const expected = sum & 0xff;
  if (checksum !== expected) {
    return refuse(DecodeError.BAD_CHECKSUM,
      `checksum is 0x${hex(checksum)}, expected 0x${hex(expected)} ` +
      `(opcode + ${nParams} parameter bytes) mod 256`, b.length - 2);
  }

  return {
    ok: true,
    opcode,
    baseOpcode: opcode & ~TOGGLE_BIT & 0xff,
    toggle: (opcode & TOGGLE_BIT) !== 0,
    params,
    checksum,
    length: b.length,
  };
}

function refuse(error, detail, offset) {
  return offset === undefined
    ? { ok: false, error, detail }
    : { ok: false, error, detail, offset };
}

const hex = (n) => (n ?? 0).toString(16).padStart(2, '0');

/* ------------------------------------------------------------------------ *
 * 3. Echo suppression
 *
 * RCX Internals: "Tower echos commands sent by PC" and "RCX reply opcode is
 * always ~query opcode". So within the bytes that come back after sending
 * opcode Op, a frame whose opcode is Op is our own light and must be dropped;
 * a frame whose opcode is (~Op & 0xff) is the brick.
 *
 * Frame lengths cannot be recovered from the stream alone: the arity rule
 * (opcode & 7) holds for requests but not for replies (reply d2/da carries one
 * byte, and 0xd2 & 7 is 2). The reader is therefore told what was sent, from
 * which both the echo length and the reply length follow.
 * ------------------------------------------------------------------------ */

/**
 * @param {number} opcode base or toggled request opcode
 * @returns {number} the reply opcode the brick will use: ~opcode of the byte sent
 */
export function replyOpcodeFor(opcode) {
  return complement(opcode & 0xff);
}

/**
 * A resynchronising stream reader that yields only genuine brick replies.
 *
 * Usage:
 *   const r = createReplyReader();
 *   r.expect(sentOpcodeByte, sentParamCount, replyParamCount);
 *   const events = r.push(bytesFromTower);   // array of events
 *
 * Events:
 *   {kind: 'reply',   frame}   a genuine reply (decoded)
 *   {kind: 'echo',    frame}   our own transmission, reported but not a reply
 *   {kind: 'refused', error, detail, bytes}  a frame that failed validation
 *   {kind: 'noise',   bytes}   bytes skipped while resynchronising
 */
export function createReplyReader() {
  /** @type {number[]} */
  let buf = [];
  let expectation = null; // {echoOpcode, echoLen, replyOpcode, replyLen}

  function frameLength(paramCount) {
    return 3 + 2 * (paramCount + 2);
  }

  return {
    /**
     * Declare what was just transmitted.
     * @param {number} sentOpcode the exact opcode byte put on the wire (toggle included)
     * @param {number} sentParamCount parameter bytes in that command
     * @param {number|null} replyParamCount payload bytes of the expected reply
     */
    expect(sentOpcode, sentParamCount, replyParamCount) {
      expectation = {
        echoOpcode: sentOpcode & 0xff,
        echoLen: frameLength(sentParamCount),
        replyOpcode: replyOpcodeFor(sentOpcode),
        replyLen: replyParamCount === null || replyParamCount === undefined
          ? null
          : frameLength(replyParamCount),
      };
    },

    /** Forget the expectation and any half-frame. */
    reset() {
      buf = [];
      expectation = null;
    },

    /** Bytes buffered but not yet forming a complete frame. */
    pending() {
      return Uint8Array.from(buf);
    },

    /**
     * @param {Uint8Array|number[]} chunk
     * @returns {Array<object>} events, in stream order
     */
    push(chunk) {
      for (const b of chunk) buf.push(b);
      const events = [];
      let noise = [];

      const flushNoise = () => {
        if (noise.length) {
          events.push({ kind: 'noise', bytes: Uint8Array.from(noise) });
          noise = [];
        }
      };

      for (;;) {
        // RESYNCHRONISE ONTO A HEADER — OR ONTO WHAT IS LEFT OF ONE.
        //
        // Requiring all three bytes of `55 ff 00` looks obviously right and
        // costs real downloads. RCX Internals says the header's job is to
        // "warm up the serial link", which means its LEADING bytes are the
        // ones a cold link is most likely to eat — so demanding them is
        // demanding the least reliable part of the frame.
        //
        // NQC does not. `FindSync` in RCX_PipeTransport.cpp searches for the
        // full pattern, then drops its first byte and searches for `ff 00`,
        // then for `00` alone, and at every level requires the byte that
        // follows to be the complement of the command it sent (compared with
        // the toggle masked off). Measured 2026-09-21: with the header
        // corrupted to `55 fe 00`, NQC completes the download and this reader
        // reported NO_REPLY.
        //
        // That guard is what makes a one-byte sync safe, so it is kept
        // exactly: a shortened sync is only accepted when the next byte is an
        // opcode this reader is actually waiting for. Without an expectation
        // set, only the full header will do.
        let start = -1;
        let syncLen = 0;
        const awaited = (op) => {
          if (!expectation) return false;
          const masked = op & ~TOGGLE_BIT & 0xff;
          return masked === (expectation.echoOpcode & ~TOGGLE_BIT & 0xff) ||
                 masked === (expectation.replyOpcode & ~TOGGLE_BIT & 0xff);
        };
        for (let len = HEADER.length; len > 0 && start === -1; len--) {
          const pattern = HEADER.slice(HEADER.length - len);
          for (let i = 0; i + len < buf.length; i++) {
            let match = true;
            for (let k = 0; k < len; k++) {
              if (buf[i + k] !== pattern[k]) { match = false; break; }
            }
            if (!match) continue;
            // The full header stands on its own; a truncated one has to be
            // vouched for by the opcode that follows it.
            if (len < HEADER.length && !awaited(buf[i + len])) continue;
            start = i;
            syncLen = len;
            break;
          }
        }
        if (start !== -1 && syncLen < HEADER.length) {
          // Put back the bytes the link ate, so everything downstream still
          // parses a frame that begins with a whole header. What was actually
          // missing is reported as noise rather than silently invented.
          noise.push(...buf.slice(0, start + syncLen));
          buf = [...HEADER, ...buf.slice(start + syncLen)];
          start = 0;
        }
        if (start === -1) {
          // Keep at most two trailing bytes: a header could be split across chunks.
          const keep = Math.max(0, buf.length - 2);
          if (keep > 0) {
            noise.push(...buf.slice(0, keep));
            buf = buf.slice(keep);
          }
          flushNoise();
          return events;
        }
        if (start > 0) {
          noise.push(...buf.slice(0, start));
          buf = buf.slice(start);
        }

        if (buf.length < 4) { flushNoise(); return events; }

        const op = buf[3];
        let want;
        if (expectation && op === expectation.echoOpcode) {
          want = expectation.echoLen;
        } else if (expectation && op === expectation.replyOpcode) {
          want = expectation.replyLen;
        } else {
          want = null;
        }

        if (want === null) {
          // An unexpected or variable-length opcode. We cannot know where it
          // ends, so consume the header as noise and resynchronise rather than
          // guess a length and swallow a real reply behind it.
          noise.push(...buf.slice(0, 3));
          buf = buf.slice(3);
          continue;
        }

        if (buf.length < want) { flushNoise(); return events; }

        const raw = Uint8Array.from(buf.slice(0, want));
        buf = buf.slice(want);
        flushNoise();

        const decoded = decodeReply(raw);
        if (!decoded.ok) {
          events.push({ kind: 'refused', error: decoded.error, detail: decoded.detail, bytes: raw });
          continue;
        }
        events.push({
          kind: op === expectation.echoOpcode ? 'echo' : 'reply',
          frame: decoded,
          bytes: raw,
        });
      }
    },
  };
}

/**
 * One-shot convenience: given everything that came back after transmitting
 * `sentBytes`, return the genuine reply or a typed refusal.
 *
 * @param {Uint8Array} sentBytes  the exact frame that was transmitted
 * @param {Uint8Array} received   everything read back, echo included
 * @param {number|null} replyParamCount
 */
export function extractReply(sentBytes, received, replyParamCount) {
  const sent = decodeReply(sentBytes);
  if (!sent.ok) {
    return { ok: false, error: 'BAD_SENT_FRAME', detail: sent.detail };
  }
  const reader = createReplyReader();
  reader.expect(sent.opcode, sent.params.length, replyParamCount);
  const events = reader.push(received);
  for (const e of events) {
    if (e.kind === 'reply') return e.frame;
  }
  const refused = events.find((e) => e.kind === 'refused');
  if (refused) return { ok: false, error: refused.error, detail: refused.detail };
  return {
    ok: false,
    error: 'NO_REPLY',
    detail: `no frame with opcode 0x${hex(replyOpcodeFor(sent.opcode))} in ` +
            `${received.length} received bytes`,
  };
}

/* ------------------------------------------------------------------------ *
 * 4. The .rcx container
 *
 * RCX Internals describes the brick, not this file format: `.rcx` is NQC's
 * own container. The layout below was derived by measurement — compiling
 * programs with a known number of tasks, subroutines and globals and diffing
 * the output. All offsets are little-endian (RCX Internals notes that
 * everything is little-endian unless stated otherwise, and the measurements
 * agree).
 *
 *   offset  size  meaning
 *   0       4     magic, ASCII "RCXI"
 *   4       2     version (0x0102 as two bytes 02 01 in every file observed)
 *   6       2     chunk count
 *   8       2     symbol count
 *   10      2     target (0x0003 for -TRCX2 in every file observed)
 *   12      -     chunks, each aligned to a 4-byte boundary:
 *                   1  type   0 = task, 1 = subroutine
 *                   1  number task index 0..9 / subroutine index 0..7
 *                   2  length of the bytecode that follows
 *                   n  bytecode
 *                   pad to the next multiple of 4
 *   ...           symbols, packed with no alignment:
 *                   1  type   0 = task, 1 = subroutine, 2 = variable
 *                   1  index
 *                   2  name length, NUL included
 *                   n  name bytes, NUL-terminated
 *
 * Padding is relative to the start of the file, and the padding after the
 * LAST chunk is present too — the symbol table begins on a 4-byte boundary.
 * ------------------------------------------------------------------------ */

export const CHUNK_TASK = 0;
export const CHUNK_SUBROUTINE = 1;

export const SYMBOL_TASK = 0;
export const SYMBOL_SUBROUTINE = 1;
export const SYMBOL_VARIABLE = 2;

export const RCX_MAGIC = 'RCXI';

/**
 * Parse a `.rcx` image.
 *
 * Like decodeReply, this refuses rather than throwing: a file picked by a user
 * is untrusted input.
 *
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {{ok: true, version: number, target: number,
 *             chunks: Array<{type: number, kind: string, number: number,
 *                            length: number, data: Uint8Array, offset: number}>,
 *             symbols: Array<{type: number, kind: string, index: number, name: string}>}
 *        | {ok: false, error: string, detail: string, offset?: number}}
 */
export function parseRcxImage(bytes) {
  const b = bytes instanceof Uint8Array
    ? bytes
    : new Uint8Array(bytes ?? new ArrayBuffer(0));

  if (b.length < 12) {
    return refuse('TOO_SHORT', `image header is 12 bytes, file is ${b.length}`);
  }
  const magic = String.fromCharCode(b[0], b[1], b[2], b[3]);
  if (magic !== RCX_MAGIC) {
    return refuse('BAD_MAGIC', `expected ASCII "${RCX_MAGIC}", got ${JSON.stringify(magic)}`, 0);
  }

  const u16 = (o) => b[o] | (b[o + 1] << 8);
  const version = u16(4);
  const chunkCount = u16(6);
  const symbolCount = u16(8);
  const target = u16(10);

  const chunks = [];
  let p = 12;
  for (let i = 0; i < chunkCount; i++) {
    if (p + 4 > b.length) {
      return refuse('TRUNCATED_CHUNK_HEADER',
        `chunk ${i} header needs 4 bytes at offset ${p}, file ends at ${b.length}`, p);
    }
    const type = b[p];
    const number = b[p + 1];
    const length = u16(p + 2);
    const dataStart = p + 4;
    if (dataStart + length > b.length) {
      return refuse('TRUNCATED_CHUNK',
        `chunk ${i} declares ${length} bytes at offset ${dataStart}, ` +
        `file ends at ${b.length}`, dataStart);
    }
    if (type !== CHUNK_TASK && type !== CHUNK_SUBROUTINE) {
      return refuse('BAD_CHUNK_TYPE',
        `chunk ${i} has type ${type}; only 0 (task) and 1 (subroutine) are known`, p);
    }
    chunks.push({
      type,
      kind: type === CHUNK_TASK ? 'task' : 'subroutine',
      number,
      length,
      data: b.subarray(dataStart, dataStart + length),
      offset: dataStart,
    });
    p = align4(dataStart + length);
  }

  const symbols = [];
  for (let i = 0; i < symbolCount; i++) {
    if (p + 4 > b.length) {
      return refuse('TRUNCATED_SYMBOL_HEADER',
        `symbol ${i} header needs 4 bytes at offset ${p}, file ends at ${b.length}`, p);
    }
    const type = b[p];
    const index = b[p + 1];
    const nameLen = u16(p + 2);
    const nameStart = p + 4;
    if (nameStart + nameLen > b.length) {
      return refuse('TRUNCATED_SYMBOL',
        `symbol ${i} declares a ${nameLen}-byte name at offset ${nameStart}, ` +
        `file ends at ${b.length}`, nameStart);
    }
    let end = nameStart + nameLen;
    if (end > nameStart && b[end - 1] === 0) end -= 1; // drop the NUL
    symbols.push({
      type,
      kind: ['task', 'subroutine', 'variable'][type] ?? `type${type}`,
      index,
      name: String.fromCharCode(...b.subarray(nameStart, end)),
    });
    p = nameStart + nameLen;
  }

  return { ok: true, version, target, chunks, symbols, bytesUsed: p };
}

const align4 = (n) => (n + 3) & ~3;

/* ------------------------------------------------------------------------ *
 * 5. Transport-agnostic download
 *
 * `send` is injected: (Uint8Array) => Promise<Uint8Array>. It must transmit the
 * frame and return every byte read back in response, echo included — that is
 * what a real tower gives you, and pretending otherwise would push the echo
 * problem into the transport where it cannot be tested.
 * ------------------------------------------------------------------------ */

/** Default bytes of payload per `transfer data` block.
 *  Inferred, not measured: RCX Internals gives no maximum. Chosen so that the
 *  whole frame (3 + 2*(1 + 2+2+N+1 + 1)) stays well under 256 bytes. */
/**
 * Payload bytes per TRANSFER_DATA block.
 *
 * 20, because that is `kFragmentChunk` in NQC's RCX_Link.cpp and NQC is the
 * sender real bricks have actually accepted. This was 50 — chosen only so the
 * framed result stays under 256 bytes, which it does — until the reference was
 * captured and turned out to send less than half that. There is no evidence
 * here that 50 is unsafe and none that it is safe, and "larger than the only
 * implementation with twenty years of field use" is the wrong side of that to
 * be on by default. Callers may raise it.
 */
export const DEFAULT_BLOCK_SIZE = 20;

const u16le = (n) => [n & 0xff, (n >> 8) & 0xff];

/** Encode the parameters of `start task download` / `start subroutine download`. */
export function encodeStartDownloadParams(index, length) {
  return Uint8Array.from([0x00, ...u16le(index), ...u16le(length)]);
}

/** Encode the parameters of `transfer data` (opcode 45). */
export function encodeTransferDataParams(sequence, data) {
  const d = Uint8Array.from(data);
  let sum = 0;
  for (const x of d) sum += x;
  return Uint8Array.from([...u16le(sequence), ...u16le(d.length), ...d, sum & 0xff]);
}

/**
 * Split a chunk's bytecode into `transfer data` blocks.
 *
 * RCX Internals: "Block sequence numbers start at 1 and increase by one with
 * each successive block transferred. The special sequence number 0 indicates
 * the last block of a transfer." So the final block — including the only block
 * of a single-block chunk — is sent with sequence 0.
 */
/**
 * Split a chunk into TRANSFER_DATA blocks.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO, AND WHY IT IS SAFE. NQC's
 * `RCX_Link::AdjustChunkSize` shortens a block when its data holds a long run
 * of zero bytes — "fast downloading doesn't like it and messaging can lose
 * sync", worst at short range with the transmitter on high power. That is the
 * receiver's automatic gain control: a long run of zeros is a long continuous
 * infrared burst, the AGC pulls sensitivity down, and bytes are lost. It is
 * the same effect `docs/RCX-IR-TOWER-FIRMWARE.md` had to reason about from the
 * other end, and finding it here, stated as a sender-side workaround, is
 * independent confirmation that it is real on hardware.
 *
 * NQC applies it `if (!bComplement)` — ONLY when complemented transmission is
 * off. Which explains something no specification says out loud: complementing
 * every byte is not merely an error check, it is a line code. A zero byte is
 * always followed by 0xff, so the burst can never exceed one byte's worth of
 * zeros — the nine bit times, about 142 carrier cycles, that the tower
 * contract computes as its worst case.
 *
 * This implementation always complements (see encodeCommand), so the
 * adjustment never applies and its absence is correct rather than missing.
 * Anyone adding the uncomplemented fast mode must implement it.
 */
export function planBlocks(data, blockSize = DEFAULT_BLOCK_SIZE) {
  if (!Number.isInteger(blockSize) || blockSize < 1) {
    throw new RangeError(`blockSize must be a positive integer, got ${blockSize}`);
  }
  const d = Uint8Array.from(data);
  const blocks = [];
  if (d.length === 0) {
    return [{ sequence: 0, data: d }];
  }
  const count = Math.ceil(d.length / blockSize);
  for (let i = 0; i < count; i++) {
    blocks.push({
      sequence: i === count - 1 ? 0 : i + 1,
      data: d.subarray(i * blockSize, Math.min((i + 1) * blockSize, d.length)),
    });
  }
  return blocks;
}

/** A download step failed. Carries the step so a caller can report usefully. */
export class RcxDownloadError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RcxDownloadError';
    Object.assign(this, details);
  }
}

/**
 * A link: owns the toggle sequencer and the echo-suppressing reader, and turns
 * `send` into "command in, validated reply out".
 */
export class RcxSession {
  /**
   * @param {(bytes: Uint8Array) => Promise<Uint8Array>|Uint8Array} send
   * @param {{sequencer?: object, retries?: number}} [options]
   */
  constructor(send, options = {}) {
    if (typeof send !== 'function') {
      throw new TypeError('RcxSession requires a send(bytes) function');
    }
    this.send = send;
    this.sequencer = options.sequencer ?? createSequencer(false);
    this.retries = options.retries ?? 0;
    this.reader = createReplyReader();
  }

  /** Start a fresh conversation: toggle back to its initial phase, reader empty. */
  reset() {
    this.sequencer.reset();
    this.reader.reset();
  }

  /**
   * Send one command and return its decoded reply.
   * @param {number} opcode base opcode (toggle bit ignored)
   * @param {Iterable<number>} [params]
   * @param {{replyParams?: number|null, checkArity?: boolean}} [options]
   */
  async command(opcode, params = [], options = {}) {
    const base = opcode & ~TOGGLE_BIT & 0xff;
    const spec = REQUESTS.get(base);
    const replyParams = options.replyParams !== undefined
      ? options.replyParams
      : (spec ? spec.replyParams : null);
    const checkArity = options.checkArity ?? true;

    let lastFailure = null;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const frame = encodeCommand(base, params, {
        toggle: this.sequencer.next(),
        checkArity,
      });
      const received = await this.send(frame);
      const reply = extractReply(frame, received ?? new Uint8Array(0), replyParams);
      if (reply.ok) return reply;
      lastFailure = reply;
    }
    throw new RcxDownloadError(
      `no valid reply to ${spec ? spec.name : `opcode 0x${hex(base)}`}: ` +
      `${lastFailure.error} — ${lastFailure.detail}`,
      { opcode: base, failure: lastFailure });
  }

  /** As command(), but also require a zero error byte in the reply payload. */
  async commandExpectOk(opcode, params = [], options = {}) {
    const reply = await this.command(opcode, params, options);
    if (reply.params.length > 0 && reply.params[0] !== 0) {
      const base = opcode & ~TOGGLE_BIT & 0xff;
      const spec = REQUESTS.get(base);
      throw new RcxDownloadError(
        `${spec ? spec.name : `opcode 0x${hex(base)}`} returned error code ` +
        `${reply.params[0]}`,
        { opcode: base, errorCode: reply.params[0] });
    }
    return reply;
  }
}

/**
 * Download a parsed image into a program slot.
 *
 * Order, per the contract and RCX Internals:
 *   set program number → stop all tasks → delete all tasks →
 *   delete all subroutines → for each chunk: start {task,subroutine}
 *   download, then transfer data blocks.
 *
 * Subroutines are downloaded before tasks, because a task's `call subroutine`
 * (opcode 17) refers to a subroutine index and the brick moves memory around
 * on each start-download; doing the fixed-index subroutines first keeps the
 * task bodies last in memory. (Inference, not a spec requirement — the spec
 * imposes no order. It is also the order NQC's own images list them in when a
 * subroutine exists.)
 *
 * @param {object} image  result of parseRcxImage (ok: true)
 * @param {{send: Function, session?: RcxSession, programSlot?: number,
 *          blockSize?: number, onProgress?: Function, startTask?: number|null}} options
 */
export async function downloadImage(image, options = {}) {
  if (!image || image.ok !== true) {
    throw new RcxDownloadError('downloadImage needs a successfully parsed image',
      { image });
  }
  const {
    send,
    session = new RcxSession(send),
    programSlot = 0,
    blockSize = DEFAULT_BLOCK_SIZE,
    onProgress = () => {},
    startTask = null,
  } = options;

  // PROGRAM SLOTS ARE ZERO-BASED HERE AND ONE-BASED IN NQC, and the same
  // number therefore means different programs in the two. `nqc -pgm 3` puts
  // the byte 2 on the wire (it sends programNumber - 1); `programSlot: 3`
  // here puts 3. Anyone porting an NQC command line by copying its digits
  // selects the program next door, and nothing reports an error — the brick
  // runs whatever was in the slot they actually picked. Verified against
  // captured frames in test/rcx-nqc-oracle.test.mjs, which is where the
  // mismatch first showed up.
  if (!Number.isInteger(programSlot) || programSlot < 0 || programSlot > 4) {
    throw new RangeError(`program slot must be 0..4, got ${programSlot} ` +
      `(this API is zero-based; NQC's -pgm is one-based)`);
  }

  const step = async (label, fn) => {
    onProgress({ phase: label });
    return fn();
  };

  // SELECT THE SLOT, THEN STOP. This order was changed to stop-then-select on
  // the strength of reading NQC's `RCX_Link::DownloadByChunk`, and changed
  // back an hour later when the frames NQC actually puts on the wire were
  // captured. Both readings are worth keeping, because the second is the one
  // that counts:
  //
  //   In SOURCE, DownloadByChunk sends kRCX_StopAllOp and then, `if
  //   (programNumber)`, kRCX_SelectProgramOp. That branch is DEAD from NQC's
  //   own CLI — RCX_Image::Download declares `programNumber = 0` and nqc.cpp
  //   never passes one, so the select inside the download never runs.
  //
  //   On the WIRE, `nqc -d -pgm 3` emits 10 91 50 40 70 25 ...: the slot is
  //   selected by a separate action BEFORE the download's stop-all. That is
  //   the only order a real brick has ever seen from NQC, and it is this one.
  //
  // See test/rcx-nqc-oracle.test.mjs, which now pins captured frames rather
  // than a reading of the source.
  await step('setProgramNumber', () =>
    session.command(OP.SET_PROGRAM_NUMBER, [programSlot]));
  await step('stopAllTasks', () => session.command(OP.STOP_ALL_TASKS));
  await step('deleteAllTasks', () => session.command(OP.DELETE_ALL_TASKS));
  await step('deleteAllSubroutines', () => session.command(OP.DELETE_ALL_SUBROUTINES));

  // Subroutines before tasks. NQC downloads chunks in FILE order and does not
  // reorder — but its own compiler already writes subroutines first, so on
  // every image NQC produces the two are the same sequence (verified on the
  // fixtures: c.rcx is sub#0 task#0, d.rcx is sub#0 sub#1 task#0..2). Keeping
  // the sort makes the invariant explicit rather than inherited from whoever
  // wrote the file, which matters because this function accepts any parsed
  // image and not only NQC's.
  const ordered = [
    ...image.chunks.filter((c) => c.type === CHUNK_SUBROUTINE),
    ...image.chunks.filter((c) => c.type === CHUNK_TASK),
  ];

  for (const chunk of ordered) {
    const startOp = chunk.type === CHUNK_TASK
      ? OP.START_TASK_DOWNLOAD
      : OP.START_SUBROUTINE_DOWNLOAD;

    onProgress({ phase: 'startDownload', chunk });
    await session.commandExpectOk(
      startOp, encodeStartDownloadParams(chunk.number, chunk.length));

    const blocks = planBlocks(chunk.data, blockSize);
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      onProgress({ phase: 'transferData', chunk, block: i + 1, blocks: blocks.length });
      await session.commandExpectOk(
        OP.TRANSFER_DATA,
        encodeTransferDataParams(block.sequence, block.data),
        { checkArity: false });
    }
  }

  if (startTask !== null) {
    onProgress({ phase: 'startTask', task: startTask });
    await session.command(OP.START_TASK, [startTask]);
  }

  onProgress({ phase: 'done' });
  return { chunks: ordered.length };
}

/**
 * A fake `send` for tests and dry runs: replies correctly to everything,
 * recording what it was asked to transmit.
 *
 * Not a transport — it is here because a protocol module without one forces
 * every consumer to reinvent it, and getting the echo right is the fiddly part.
 */
export function createFakeTower({ errorCode = 0, echo = true } = {}) {
  const sent = [];
  const send = (bytes) => {
    sent.push(Uint8Array.from(bytes));
    const frame = decodeReply(bytes);
    if (!frame.ok) return new Uint8Array(0);
    const spec = REQUESTS.get(frame.baseOpcode);
    const n = spec && spec.replyParams ? spec.replyParams : 0;
    const payload = new Uint8Array(n);
    if (n > 0) payload[0] = errorCode;
    const replyOp = replyOpcodeFor(frame.opcode);
    const reply = encodeCommand(replyOp, payload, { toggle: (replyOp & TOGGLE_BIT) !== 0, checkArity: false });
    if (!echo) return reply;
    const out = new Uint8Array(bytes.length + reply.length);
    out.set(bytes, 0);
    out.set(reply, bytes.length);
    return out;
  };
  return { send, sent, decoded: () => sent.map(decodeReply) };
}
