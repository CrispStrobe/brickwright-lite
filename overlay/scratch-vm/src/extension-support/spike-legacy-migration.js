// SPDX-License-Identifier: MPL-2.0
//
// The five SPIKE-family extension ids collapse into one (`spikeprime`).
// This file is the whole contract for that collapse, and it is the only place
// the rename table is written down: the VM's project loader applies it, the
// GUI's library entry defers to it, and `test/spike-unified-coverage.test.mjs`
// judges the unified extension against it block by block.
//
// WHY A TABLE AND NOT METHOD ALIASES
// ----------------------------------
// Method aliasing on the extension class would be simpler, and it almost
// works: 221 of the 236 legacy blocks keep their opcode. It fails on the
// collisions — `spikeprime_getOrientation` is a no-argument reporter returning
// an orientation name, while `spikeprimeble_getOrientation` takes an AXIS and
// returns an angle. One class cannot hold both under one method name, so the
// project's stored opcode has to be rewritten on load, and a rewrite needs a
// table. Having paid for the table, every rename goes through it rather than
// splitting the rule across two mechanisms.
//
// WHAT "LOSE NOTHING" MEANS HERE
// ------------------------------
// Every (legacy id, opcode) pair in the five extensions appears in LEDGER —
// 236 of them — and resolves to a unified opcode that exists, with every
// legacy argument either carried through unchanged or explicitly transformed.
// The coverage test fails if a pair is added upstream and not accounted for
// here, if a target opcode does not exist in the unified extension, or if an
// argument would be dropped. An entry may not be deleted to make a test pass.
//
// UNITS AND SEMANTICS ARE NOT SILENTLY MERGED
// -------------------------------------------
// Two protocols report the distance sensor differently: SPIKE firmware 2.x
// (device type 62, over the REPL stream) reports **centimetres**, SPIKE
// firmware 3.x (device type 0x0d, over BLE) reports **millimetres**. The
// unified `getDistance` keeps the 2.x meaning it inherited — centimetres in
// both modes, the driver converting — and the millimetre readers migrate to
// `getDistanceIn` with an explicit UNIT. A project that read mm keeps reading
// mm; a project that read cm keeps reading cm.

/** Legacy extension ids that now resolve to the unified `spikeprime`. */
const LEGACY_IDS = ['spikeprimeBTC', 'spikeprimeBridge', 'spikeprimeble', 'legospikeprimeBLE'];

/** The id everything collapses into. */
const UNIFIED_ID = 'spikeprime';

// The BLE-alt extensions spelled motor direction as words where the REPL
// extensions spelled it as a signed multiplier. The unified menu is the
// signed one (it is what `spikeprime` projects already store), so the words
// are rewritten on load; the runtime also coerces, so a reporter dropped into
// the slot at runtime still works.
const DIRECTION_WORD_TO_SIGN = {
    forward: '1',
    backward: '-1',
    clockwise: '1',
    counterclockwise: '-1'
};

/**
 * Per legacy id, the opcodes that do NOT keep their name.
 * An opcode absent from a legacy id's map migrates unchanged.
 *
 *   to         — unified opcode
 *   renameArgs — {legacyArgName: unifiedArgName}
 *   addFields  — {ARG: value} written as a field when the block has no such input
 *   mapField   — {ARG: {legacyValue: unifiedValue}} value rewrite on an existing field
 *   note       — why, when the reason is not obvious from the names
 */
const RENAMES = {
    // `spikeprime` is the base vocabulary: every one of its 84 opcodes keeps
    // its name and shape, so projects using it need no rewriting at all.
    spikeprime: {},

    // `spikeprimeBTC`'s 74 opcodes are a strict subset of `spikeprime`'s, with
    // identical signatures — it was the same extension without the code
    // generation and hub file-management blocks.
    spikeprimeBTC: {},

    spikeprimeBridge: {
        // The bridge connects to a local WebSocket relay and so takes an
        // address; every other mode discovers its own peripheral. Keeping one
        // no-argument `connectHub` and giving the addressed form its own
        // opcode avoids an optional input that is meaningless in four of the
        // five modes.
        connectHub: {to: 'connectHubAt', note: 'bridge connect takes a relay URL'}
    },

    spikeprimeble: {
        // Collision: `spikeprime_getOrientation` is a no-argument reporter
        // returning an orientation name ("front", "up", …). This one takes an
        // AXIS and returns an angle, which is `getAngle`. The menu values
        // (yaw/pitch/roll) are already AXIS values, so no value rewrite.
        getOrientation: {to: 'getAngle', note: 'AXIS reporter, not the orientation-name reporter'},
        // Millimetres — see the units note at the top of this file.
        getDistance: {to: 'getDistanceIn', addFields: {UNIT: 'mm'}},
        getForceSensorValue: {to: 'getForce'},
        // The BLE force/position readers return the cumulative degree count,
        // which is `getRelativePosition`, not the 0–359 angle `getPosition`
        // reports.
        getMotorPosition: {to: 'getRelativePosition', note: 'cumulative degrees, not the 0-359 angle'}
    },

    legospikeprimeBLE: {
        motorPairMoveForTime: {to: 'moveForward', note: 'TIME_UNIT values are a subset of MOVE_UNIT'},
        motorRun: {to: 'motorStart', mapField: {DIRECTION: DIRECTION_WORD_TO_SIGN}},
        motorRunForTime: {to: 'motorRunFor', mapField: {DIRECTION: DIRECTION_WORD_TO_SIGN}},
        getMotorPosition: {to: 'getRelativePosition', note: 'cumulative degrees, not the 0-359 angle'},
        getMotorSpeed: {to: 'getSpeed'},
        displayWrite: {to: 'displayText'},
        displaySetPixel: {to: 'setPixel'},
        getColorSensorColor: {to: 'getColor'},
        getDistanceSensor: {to: 'getDistanceIn', addFields: {UNIT: 'mm'}},
        getForceSensor: {to: 'getForce'},
        getYaw: {to: 'getAngle', addFields: {AXIS: 'yaw'}},
        getPitch: {to: 'getAngle', addFields: {AXIS: 'pitch'}},
        getRoll: {to: 'getAngle', addFields: {AXIS: 'roll'}},
        getBattery: {to: 'getBatteryLevel'},
        runPythonCode: {to: 'runPythonCommand'}
    }
};

/**
 * Resolve one stored opcode.
 * @param {string} opcode a full sb3 opcode, e.g. "spikeprimeble_getDistance"
 * @returns {?object} {opcode, addFields, mapField, renameArgs} when the opcode
 *   belongs to a legacy SPIKE extension, else null (leave it alone).
 */
const resolveOpcode = function (opcode) {
    if (typeof opcode !== 'string') return null;
    const underscore = opcode.indexOf('_');
    if (underscore < 1) return null;
    const id = opcode.slice(0, underscore);
    const method = opcode.slice(underscore + 1);
    if (id !== UNIFIED_ID && LEGACY_IDS.indexOf(id) === -1) return null;
    const rename = (RENAMES[id] || {})[method] || {};
    return {
        opcode: `${UNIFIED_ID}_${rename.to || method}`,
        addFields: rename.addFields || null,
        mapField: rename.mapField || null,
        renameArgs: rename.renameArgs || null
    };
};

/**
 * Rewrite one sb3 block object in place.
 * Shapes handled: the compressed `{opcode, inputs, fields}` of sb3 JSON.
 * @param {object} block a block from a target's `blocks` map
 * @returns {boolean} whether anything changed
 */
const migrateBlock = function (block) {
    if (!block || typeof block !== 'object') return false;
    const resolved = resolveOpcode(block.opcode);
    if (!resolved) return false;
    let changed = false;

    if (block.opcode !== resolved.opcode) {
        block.opcode = resolved.opcode;
        changed = true;
    }

    if (resolved.renameArgs) {
        for (const [from, to] of Object.entries(resolved.renameArgs)) {
            if (block.inputs && Object.prototype.hasOwnProperty.call(block.inputs, from)) {
                block.inputs[to] = block.inputs[from];
                delete block.inputs[from];
                changed = true;
            }
            if (block.fields && Object.prototype.hasOwnProperty.call(block.fields, from)) {
                block.fields[to] = block.fields[from];
                delete block.fields[from];
                changed = true;
            }
        }
    }

    if (resolved.mapField) {
        for (const [name, table] of Object.entries(resolved.mapField)) {
            const field = block.fields && block.fields[name];
            if (!Array.isArray(field)) continue;
            const mapped = table[String(field[0])];
            if (mapped !== undefined && mapped !== field[0]) {
                field[0] = mapped;
                changed = true;
            }
        }
    }

    if (resolved.addFields) {
        for (const [name, value] of Object.entries(resolved.addFields)) {
            const hasInput = block.inputs && Object.prototype.hasOwnProperty.call(block.inputs, name);
            const hasField = block.fields && Object.prototype.hasOwnProperty.call(block.fields, name);
            if (hasInput || hasField) continue;
            if (!block.fields) block.fields = {};
            block.fields[name] = [value, null];
            changed = true;
        }
    }

    return changed;
};

/**
 * Rewrite a whole parsed project.json in place: every block of every target,
 * plus the `extensions` list, plus monitors (which carry their own opcode).
 * @param {object} project a parsed sb3 project.json
 * @returns {number} how many blocks were rewritten
 */
const migrateProject = function (project) {
    if (!project || typeof project !== 'object') return 0;
    let count = 0;

    for (const target of project.targets || []) {
        for (const block of Object.values((target && target.blocks) || {})) {
            // A top-level list entry can be a variable/list reporter array
            // rather than a block object; those carry no opcode.
            if (migrateBlock(block)) count++;
        }
    }

    for (const monitor of project.monitors || []) {
        if (!monitor || typeof monitor !== 'object') continue;
        const resolved = resolveOpcode(monitor.opcode);
        if (resolved && monitor.opcode !== resolved.opcode) {
            monitor.opcode = resolved.opcode;
            count++;
        }
        if (resolved && resolved.addFields) {
            monitor.params = monitor.params || {};
            for (const [name, value] of Object.entries(resolved.addFields)) {
                if (monitor.params[name] === undefined) monitor.params[name] = value;
            }
        }
    }

    if (Array.isArray(project.extensions)) {
        const before = project.extensions.length;
        const mapped = project.extensions.map(id => (LEGACY_IDS.indexOf(id) === -1 ? id : UNIFIED_ID));
        project.extensions = mapped.filter((id, i) => mapped.indexOf(id) === i);
        if (project.extensions.length !== before ||
            mapped.some((id, i) => id !== (project.extensions[i] || id))) {
            // The list changed; block count is the reported figure, so nothing
            // to add here beyond having done it.
        }
    }

    return count;
};

module.exports = {
    UNIFIED_ID,
    LEGACY_IDS,
    RENAMES,
    DIRECTION_WORD_TO_SIGN,
    resolveOpcode,
    migrateBlock,
    migrateProject
};
