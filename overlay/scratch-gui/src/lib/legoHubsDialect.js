/**
 * The BrickWright pseudocode <-> LEGO Powered Up / BOOST / WeDo 2.0 / NXT block map: the `pup …`,
 * `boost …`, `wedo …` and `nxt …` words (docs/ROBOT-LAB-HUBS-PLAN.md P3, item "DEVICE words").
 *
 * Each word is one block of a bundled LEGO extension, UNCHANGED (scratch-vm
 * extensions/crispstrobe/legopoweredup, legoboostunified, wedo2unified): the table is the
 * whole contract, as ev3Dialect.js's EV3_WORDS is for DEVICE EV3 and robotLabDialect.js's
 * for the `lab` words — the compiler parses a line against it and decompiles a block
 * through it (lib/robot-lab-pseudocode.js layers both tables over the pinned sb3-creator at
 * its door, lib/sb3-creator-register-art.js). Entries use the arcadeDialect.js grammar:
 *
 *   {NAME}                 a value input (one term)
 *   {NAME:a|b|c}           a field (the extension's menu has acceptReporters: false, so
 *                          scratch-vm makes the argument a field_dropdown on the block)
 *   {NAME:menu:m:a|b}      a reporter input with the extension's menu shadow `<ext>_menu_m`
 *                          (a menu with acceptReporters: true): a bare choice, or a value in
 *                          parentheses
 *
 * WHERE THE WORDS APPLY: under ANY DEVICE line, as the `lab` words — the hub is chosen by the
 * blocks the program uses, and the prefix (`pup`, `boost`, `wedo`) keeps every word apart
 * from Scratch's own and from each other. A `DEVICE POWEREDUP` / `DEVICE BOOST` /
 * `DEVICE WEDO2` declaration is NOT a word here: the pinned compiler's DEVICE line names a
 * build target (SB3Creator.STC_PARTS), and these hubs have none (docs/LWP3-VIRTUAL-HUB-NOTES.md
 * "Next steps").
 *
 * THE SLICE IS COUNTED: every opcode of the three extensions is a word here or in one
 * exclusion class below (test/lego-hubs-dialect.test.mjs requires the union to be the
 * extensions' getInfo()). Hats are not words yet ('learner-gap'); of the Booleans, NXT's touch sensor is.
 *
 * Table order is precedence: `… on for {DEGREES} degrees` before `… on for {TIME} seconds`
 * before `… on`.
 */

const ext = (extension, prefix) => (op, kind, words) => Object.freeze({
    op: `${extension}_${op}`, kind, words: `${prefix} ${words}`, extension, menuExtension: extension
});

// ---- legopoweredup: LEGO Powered Up (City, Technic, Move, SPIKE Essential hubs) --------------
const pup = ext('legopoweredup', 'pup');
const PORT = '{PORT:menu:portLabel:A|B|C|D|E|F}';
const POWEREDUP_WORDS = [
    pup('connect', 'command', 'connect to hub'),
    pup('motorOnForDegrees', 'command', `turn motor ${PORT} on for {DEGREES} degrees`),
    pup('motorOnFor', 'command', `turn motor ${PORT} on for {TIME} seconds`),
    pup('motorOn', 'command', `turn motor ${PORT} on`),
    pup('motorOff', 'command', `turn motor ${PORT} off`),
    pup('setMotorPower', 'command', `set motor ${PORT} power to {POWER} %`),
    // LWP3 StartPower: an unregulated duty cycle. (`set motor … power` + `turn motor … on` is
    // StartSpeed, a speed the hub holds under load, as LEGO's own Scratch blocks send it.)
    pup('motorStartPower', 'command', `start motor ${PORT} at {POWER} % power`),
    pup('setMotorDirection', 'command', `set motor ${PORT} direction to {DIRECTION:forward|backward|reverse}`),
    pup('setMotorStopAction', 'command', `set motor ${PORT} stop action to {ACTION:float|brake|hold}`),
    pup('setMotorAcceleration', 'command', `set motor ${PORT} acceleration to {TIME} ms`),
    pup('setMotorDeceleration', 'command', `set motor ${PORT} deceleration to {TIME} ms`),
    pup('resetMotorPosition', 'command', `reset motor ${PORT} position to {POSITION}`),
    pup('setHubLED', 'command', 'set hub LED to {HUE}'),
    pup('getMotorPosition', 'reporter', `motor ${PORT} position`),
    pup('getColor', 'reporter', `color sensor ${PORT} color`),
    pup('getReflection', 'reporter', `color sensor ${PORT} reflection`),
    pup('getDistance', 'reporter', `distance sensor ${PORT} distance`),
    pup('getForce', 'reporter', `force sensor ${PORT} force`),
    pup('getTiltAngle', 'reporter', 'tilt angle {DIRECTION:up|down|left|right}'),
    pup('getHubType', 'reporter', 'hub type'),
    pup('getBatteryLevel', 'reporter', 'battery level')
];

// ---- legoboostunified: LEGO BOOST (the Move Hub) -------------------------------------------
const boost = ext('legoboostunified', 'boost');
const MOTOR = '{MOTOR_ID:A|B|C|D|AB|ALL}';
const BOOST_PORT = '{PORT:A|B|C|D}';
const BOOST_WORDS = [
    boost('connect', 'command', 'connect to LEGO Boost'),
    boost('motorOnForDegrees', 'command', `turn motor ${MOTOR} on for {DEGREES} degrees`),
    boost('motorOnFor', 'command', `turn motor ${MOTOR} on for {TIME} seconds`),
    boost('motorOn', 'command', `turn motor ${MOTOR} on`),
    boost('motorOff', 'command', `turn motor ${MOTOR} off`),
    boost('setMotorPower', 'command', `set motor ${MOTOR} power to {POWER} %`),
    boost('motorStartPower', 'command', `start motor ${MOTOR} at {POWER} % power`),
    boost('setMotorDirection', 'command', `set motor ${MOTOR} direction to {MOTOR_DIRECTION:forward|backward|reverse}`),
    boost('setMotorStopAction', 'command', `set motor ${MOTOR} stop action to {ACTION:float|brake|hold}`),
    boost('setMotorAcceleration', 'command', `set motor ${MOTOR} acceleration to {TIME} ms`),
    boost('setMotorDeceleration', 'command', `set motor ${MOTOR} deceleration to {TIME} ms`),
    boost('resetMotorPosition', 'command', `reset motor ${MOTOR} position to {POSITION}`),
    boost('setLightHue', 'command', 'set light color to {HUE}'),
    boost('getMotorPosition', 'reporter', 'motor {MOTOR_ID:A|B|C|D} position'),
    boost('getReflection', 'reporter', `color sensor ${BOOST_PORT} reflection`),
    boost('getDistance', 'reporter', `distance sensor ${BOOST_PORT} distance`),
    boost('getForce', 'reporter', `force sensor ${BOOST_PORT} force`),
    boost('getTiltAngle', 'reporter', 'tilt angle {TILT_DIRECTION:up|down|left|right}'),
    boost('getBatteryLevel', 'reporter', 'battery level')
];

// ---- wedo2unified: LEGO Education WeDo 2.0 ----------------------------------------------------
const wedo = ext('wedo2unified', 'wedo');
const WEDO_PORT = '{PORT:A|B|ALL}';
const WEDO2_WORDS = [
    wedo('connect', 'command', 'connect to WeDo 2.0'),
    wedo('motorOn', 'command', `turn motor ${WEDO_PORT} on`),
    wedo('motorOff', 'command', `turn motor ${WEDO_PORT} off`),
    wedo('setMotorPower', 'command', `set motor ${WEDO_PORT} power to {POWER} %`),
    wedo('setMotorDirection', 'command', `set motor ${WEDO_PORT} direction to {DIRECTION:forward|backward|reverse}`),
    wedo('setLED', 'command', 'set light color to {HUE}'),
    wedo('playNote', 'command', 'play note {NOTE} for {DURATION} seconds'),
    wedo('lightOff', 'command', `turn lights ${WEDO_PORT} off`),
    wedo('getDistance', 'reporter', 'distance'),
    wedo('getTiltAngle', 'reporter', 'tilt angle {DIRECTION:up|down|left|right}'),
    wedo('getBatteryLevel', 'reporter', 'battery level')
];

// ---- legonxt: LEGO MINDSTORMS NXT (the stock firmware, direct commands) ---------------------
// The NXT has no DEVICE target in the pinned compiler either (as the hubs above): the `nxt`
// words apply under any DEVICE line, and Scratch's own `wait … seconds` / `wait until <…>`
// carry the waits (`wait until nxt touch sensor S1 pressed`).
// The colour sensor's full-colour mode ("all colors", a menu value with a space) has no
// spelling: the word grammar splits a slot at whitespace; the single-light modes do.
const nxt = ext('legonxt', 'nxt');
const NXT_MOTOR = '{PORT:menu:MOTOR_PORT:A|B|C}';
const NXT_SENSOR = '{PORT:menu:SENSOR_PORT:S1|S2|S3|S4}';
const NXT_NOTES = 'C4|C#4|D4|D#4|E4|F4|F#4|G4|G#4|A4|A#4|B4|C5|C#5|D5|D#5|E5|F5|F#5|G5|G#5|A5|A#5|B5';
const NXT_WORDS = [
    nxt('connect', 'command', 'connect to NXT {PARAM}'),
    nxt('motorRunDegrees', 'command', `motor ${NXT_MOTOR} power {POWER} for {DEGREES} degrees`),
    nxt('motorRunRotations', 'command', `motor ${NXT_MOTOR} power {POWER} for {ROTATIONS} rotations`),
    nxt('motorOn', 'command', `motor ${NXT_MOTOR} power {POWER}`),
    nxt('motorStop', 'command', `stop motor ${NXT_MOTOR} {ACTION:brake|coast}`),
    nxt('resetMotorPosition', 'command', `reset motor ${NXT_MOTOR} position`),
    nxt('setupTouchSensorNXT', 'command', `setup touch sensor ${NXT_SENSOR}`),
    nxt('setupLightSensor', 'command', `setup light sensor ${NXT_SENSOR} LED {STATE:on|off}`),
    nxt('setupColorSensor', 'command', `setup color sensor ${NXT_SENSOR} mode {MODE:red|green|blue|none}`),
    nxt('setupSoundSensor', 'command', `setup sound sensor ${NXT_SENSOR} mode {MODE:dBA|dB}`),
    nxt('setupUltrasonicSensor', 'command', `setup ultrasonic sensor ${NXT_SENSOR}`),
    nxt('playTone', 'command', 'play tone {FREQ} Hz for {MS} ms'),
    nxt('playNote', 'command', `play note {NOTE:${NXT_NOTES}} for {BEATS} beats`),
    nxt('clearScreen', 'command', 'clear screen'),
    nxt('drawText', 'command', 'draw text {TEXT} at x {X} y {Y}'),
    nxt('startProgram', 'command', 'start program {FILENAME}'),
    nxt('stopProgram', 'command', 'stop program'),
    nxt('getMotorPosition', 'reporter', `motor ${NXT_MOTOR} position`),
    nxt('getMotorPower', 'reporter', `motor ${NXT_MOTOR} power`),
    nxt('getLightLevel', 'reporter', `light level ${NXT_SENSOR}`),
    nxt('getColor', 'reporter', `color ${NXT_SENSOR}`),
    nxt('getSoundLevel', 'reporter', `sound level ${NXT_SENSOR}`),
    nxt('getDistance', 'reporter', `distance ${NXT_SENSOR} cm`),
    nxt('getBattery', 'reporter', 'battery level mV'),
    nxt('isTouchPressed', 'boolean', `touch sensor ${NXT_SENSOR} pressed`)
];

export const LEGO_HUB_WORDS = Object.freeze([...POWEREDUP_WORDS, ...BOOST_WORDS, ...WEDO2_WORDS, ...NXT_WORDS]);

/** The extensions the table speaks, with the prefix of their words. */
export const LEGO_HUB_EXTENSIONS = Object.freeze({legopoweredup: 'pup', legoboostunified: 'boost', wedo2unified: 'wedo', legonxt: 'nxt'});

/**
 * Every opcode of the three extensions that is NOT a word, by reason. The union with the
 * words is each extension's whole getInfo() (test/lego-hubs-dialect.test.mjs).
 */
export const LEGO_HUB_EXCLUSIONS = Object.freeze({
    // Which transport reaches the hub is a property of the SESSION (as EV3's 'transport-control').
    'transport-control': Object.freeze(['legopoweredup_setConnectionType', 'legopoweredup_setBridgeURL',
        'legopoweredup_disconnect', 'legoboostunified_setConnectionType', 'legoboostunified_setBridgeURL',
        'legoboostunified_disconnect', 'wedo2unified_setConnectionType', 'wedo2unified_disconnect',
        'legonxt_setConnectionMode', 'legonxt_getConnectionMode', 'legonxt_disconnect', 'legonxt_keepAlive']),
    // Debug logging of the extension, not a program statement.
    'host-control': Object.freeze(['legopoweredup_setDebugLevel', 'legopoweredup_enableDebug',
        'legoboostunified_setDebugLevel', 'legoboostunified_enableDebug', 'wedo2unified_setDebugLevel',
        'legopoweredup_shutdown', 'legoboostunified_shutdown']),
    // legonxt's NXC build chain and file tools (transpile, compile, upload, download): host actions on
    // the whole project, not statements of a program (docs/NXT-RXE-VM.md runs their result).
    'build-control': Object.freeze(['legonxt_transpileProject', 'legonxt_showNXCCode', 'legonxt_downloadNXC',
        'legonxt_compileToRXE', 'legonxt_setRxeFilename', 'legonxt_uploadToNXT', 'legonxt_fullWorkflow',
        'legonxt_captureScreen']),
    // Hats and Boolean blocks: the layer reads commands and reporters only so far.
    'learner-gap': Object.freeze(['legopoweredup_isConnected', 'legopoweredup_getConnectedDevices', 'legopoweredup_getDeviceOnPort',
        'legopoweredup_whenColor', 'legopoweredup_seeingColor', 'legopoweredup_whenForceSensorPressed',
        'legopoweredup_isForceSensorPressed', 'legopoweredup_whenTilted', 'legopoweredup_isTilted', 'legopoweredup_setLEDBrightness',
        'legopoweredup_setMatrixPixel', 'legopoweredup_setMatrixAll', 'legopoweredup_clearMatrix', 'legopoweredup_whenButtonPressed',
        'legopoweredup_isButtonPressed', 'legopoweredup_getFirmwareVersion', 'legopoweredup_getRSSI', 'legopoweredup_whenBatteryLow',
        'legopoweredup_whenMotorOverloaded',
        'legoboostunified_isConnected', 'legoboostunified_whenColor', 'legoboostunified_seeingColor',
        'legoboostunified_whenForceSensorPressed', 'legoboostunified_isForceSensorPressed', 'legoboostunified_whenTilted',
        'legoboostunified_isTilted', 'legoboostunified_whenButtonPressed', 'legoboostunified_isButtonPressed',
        'legoboostunified_getFirmwareVersion', 'legoboostunified_getRSSI', 'legoboostunified_whenBatteryLow',
        'legoboostunified_whenMotorOverloaded',
        'wedo2unified_isConnected', 'wedo2unified_whenTilted', 'wedo2unified_isTilted', 'wedo2unified_setLightBrightness',
        'wedo2unified_whenButtonPressed', 'wedo2unified_isButtonPressed',
        'legonxt_isConnected', 'legonxt_getMotorMode', 'legonxt_getMotorRegulationMode', 'legonxt_getMotorTurnRatio',
        'legonxt_getMotorRunState', 'legonxt_getMotorTachoLimit', 'legonxt_getMotorTachoCount',
        'legonxt_getMotorBlockTachoCount', 'legonxt_getMotorRotationCount', 'legonxt_getSensorPort',
        'legonxt_getSensorValid', 'legonxt_getSensorCalibrated', 'legonxt_getSensorType', 'legonxt_getSensorMode',
        'legonxt_getSensorRawValue', 'legonxt_getSensorNormalizedValue', 'legonxt_getSensorScaledValue',
        'legonxt_getSensorCalibratedValue', 'legonxt_getRawSensorValue', 'legonxt_updateDisplay', 'legonxt_drawPixel',
        'legonxt_drawLine', 'legonxt_drawRect', 'legonxt_drawCircle', 'legonxt_drawPattern', 'legonxt_spriteGetX',
        'legonxt_spriteGetY', 'legonxt_spriteGetSize', 'legonxt_spriteGetVisible', 'legonxt_spriteSetPosition',
        'legonxt_spriteSetSize', 'legonxt_spriteSetVisible', 'legonxt_getDeviceName', 'legonxt_getBluetoothAddress',
        'legonxt_getFreeFlash', 'legonxt_getSignalStrength', 'legonxt_sendMessage', 'legonxt_receiveMessage',
        'legonxt_getLowSpeedStatus', 'legonxt_getCurrentProgram'])
});

const byOpcode = new Map(LEGO_HUB_WORDS.map(e => [e.op, e]));

/** The table entry for one of the three extensions' opcodes, or null. */
export function legoHubWordFor (opcode) {
    return byOpcode.get(opcode) || null;
}

/** The entries of the given kinds, in table order (the order is the precedence). */
export function legoHubWordsOf (kinds) {
    return LEGO_HUB_WORDS.filter(e => kinds.includes(e.kind));
}

/** Whether a line or reporter begins with one of the words' prefixes. */
export const isLegoHubText = text => /^(?:pup|boost|wedo|nxt)\s/i.test(String(text).trim());
