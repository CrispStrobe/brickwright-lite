// Old EV3 projects keep working after the three stock-firmware extensions
// became one.
//
// Same shape, and the same reasoning, as spike-legacy-migration.js — including
// why it lives HERE rather than in the VM overlay: the VM overlay lands in
// packages/scratch-gui/node_modules/scratch-vm at integrate time and has no
// import path back to scratch-gui, so a table shared between the two has to sit
// on this side. test/ev3-legacy-migration.test.mjs holds the drift.
//
// WHAT CHANGED, AND WHAT DID NOT
// ------------------------------
// `ev3comprehensive` keeps its id and every one of its opcodes, so the common
// case — a project built with the flagship extension — migrates by doing
// nothing at all. `ev3lms` and `legoev3direct` are retired into it.
//
// The interesting half is `legoev3direct`. It spelled several capabilities as
// ONE BLOCK PER MODE where the unified extension has a menu: `gyro [PORT]
// angle` and `gyro [PORT] rate` against `gyro sensor [PORT] [MODE]`. Those
// migrate with `addFields`, which presets the menu so the block keeps meaning
// exactly what it meant — the same device the SPIKE migration used for
// getDistance/getDistanceIn.

/** Extension ids that no longer load, in the order they were retired. */
export const LEGACY_IDS = ['ev3lms', 'legoev3direct'];

/** The id everything above resolves to. */
export const UNIFIED_ID = 'ev3comprehensive';

/**
 * legacy opcode -> {to, addFields?}
 *
 * `ev3comprehensive` is absent on purpose: it is the unified extension, so an
 * empty table for it is the statement that none of its blocks moved.
 */
export const RENAMES = {
    ev3comprehensive: {},

    // Every ev3lms block that survives shares its opcode with the unified
    // extension. Only the three compiler controls were unique to it, and they
    // arrive under their own names.
    ev3lms: {},

    legoev3direct: {
        // --- plain renames: same block, different spelling ---------------
        isButtonPressed: {to: 'buttonPressed'},
        isTouchPressed: {to: 'touchSensor'},
        getRGBRaw: {to: 'colorSensorRGB'},
        resetGyro: {to: 'gyroReset'},
        getInfraredProximity: {to: 'irProximity'},
        setMotorPolarity: {to: 'motorPolarity'},
        getMotorPosition: {to: 'motorPosition'},
        getMotorSpeed: {to: 'motorSpeed'},
        clearScreen: {to: 'screenClear'},
        drawRect: {to: 'drawRectangle'},
        resetMotorPosition: {to: 'motorReset'},
        wait: {to: 'waitMillis'},
        motorOn: {to: 'motorRun'},
        motorRunSeconds: {to: 'motorRunTime'},
        getBattery: {to: 'batteryVoltage'},
        readTimer: {to: 'timerValue'},
        drawText: {to: 'screenText'},

        // --- one block per mode -> one block with a menu ------------------
        // The reading is unchanged; the mode that was implied by WHICH block
        // you dragged out is now a preset field on the block you get.
        getColor: {to: 'colorSensor', addFields: {MODE: 'color'}},
        getAmbientLight: {to: 'colorSensor', addFields: {MODE: 'ambient'}},
        getReflectedLight: {to: 'colorSensor', addFields: {MODE: 'reflected'}},
        getGyroAngle: {to: 'gyroSensor', addFields: {MODE: 'angle'}},
        getGyroRate: {to: 'gyroSensor', addFields: {MODE: 'rate'}},
        // ev3_direct reported centimetres and said so in the block text; the
        // unified block carries a unit menu, so the preset keeps the old
        // meaning rather than silently switching anyone to inches.
        getUltrasonicDistance: {to: 'ultrasonicSensor', addFields: {UNIT: 'cm'}},

        // --- renamed rather than folded ----------------------------------
        // These two are the reason the merge is not lossless by accident: no
        // other EV3 extension reads NXT analogue sensors at all.
        getNXTLight: {to: 'nxtLight'},
        getNXTSound: {to: 'nxtSound'}
    }
};

/**
 * Resolve a saved `<extensionId>_<opcode>` to what should load today.
 *
 * Returns the unified opcode plus any fields the migration has to add. An
 * opcode with no rename entry keeps its name, which is the common case.
 */
export function resolveOpcode (saved) {
    const underscore = saved.indexOf('_');
    if (underscore < 0) return {opcode: saved, addFields: {}};
    const extensionId = saved.slice(0, underscore);
    const opcode = saved.slice(underscore + 1);
    const table = RENAMES[extensionId];
    if (!table) return {opcode: saved, addFields: {}};
    const rename = table[opcode];
    return {
        opcode: `${UNIFIED_ID}_${rename ? rename.to : opcode}`,
        addFields: (rename && rename.addFields) || {}
    };
}

/**
 * Rewrite one sb3 block object in place.
 * @param {object} block a block from a target's `blocks` map
 * @returns {boolean} whether anything changed
 */
export function migrateBlock (block) {
    if (!block || typeof block !== 'object' || typeof block.opcode !== 'string') return false;
    const resolved = resolveOpcode(block.opcode);
    let changed = false;

    if (block.opcode !== resolved.opcode) {
        block.opcode = resolved.opcode;
        changed = true;
    }

    // A preset must not overwrite a value the project already carries. The
    // only blocks with addFields are the one-block-per-mode ones, which had no
    // such field to begin with — but a project rewritten twice would otherwise
    // have its user's choice clobbered by the default on the second pass.
    for (const [name, value] of Object.entries(resolved.addFields)) {
        block.fields = block.fields || {};
        if (block.fields[name] === undefined) {
            block.fields[name] = [value, null];
            changed = true;
        }
    }

    return changed;
}

/**
 * Rewrite a whole parsed project.json in place: every block of every target,
 * the monitors (which carry their own opcode and params), and the `extensions`
 * list.
 * @param {object} project a parsed sb3 project.json
 * @returns {number} how many blocks were rewritten
 */
export function migrateProject (project) {
    if (!project || typeof project !== 'object') return 0;
    let count = 0;

    for (const target of project.targets || []) {
        for (const block of Object.values((target && target.blocks) || {})) {
            // A top-level entry can be a variable/list reporter array rather
            // than a block object; those carry no opcode.
            if (migrateBlock(block)) count++;
        }
    }

    for (const monitor of project.monitors || []) {
        if (!monitor || typeof monitor !== 'object') continue;
        const resolved = resolveOpcode(monitor.opcode);
        if (monitor.opcode !== resolved.opcode) {
            monitor.opcode = resolved.opcode;
            count++;
        }
        monitor.params = monitor.params || {};
        for (const [name, value] of Object.entries(resolved.addFields)) {
            if (monitor.params[name] === undefined) monitor.params[name] = value;
        }
    }

    if (Array.isArray(project.extensions)) {
        const mapped = project.extensions.map(id => (LEGACY_IDS.indexOf(id) === -1 ? id : UNIFIED_ID));
        project.extensions = mapped.filter((id, i) => mapped.indexOf(id) === i);
    }

    return count;
}

/** Every legacy id that resolves into the unified extension, including its own. */
export const MIGRATED_IDS = [UNIFIED_ID, ...LEGACY_IDS];
