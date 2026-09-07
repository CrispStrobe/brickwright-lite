// SPDX-License-Identifier: BSD-3-Clause
const VERSION = 1;
export const MAX_NDJSON_LINE_BYTES = 256 * 1024;
export const MAX_PENDING_LINES = 256;

const fail = message => { throw new TypeError(`invalid brick-state message: ${message}`); };
const required = (value, names) => names.forEach(name => {
    if (!Object.prototype.hasOwnProperty.call(value, name)) fail(`missing ${name}`);
});
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clone = value => JSON.parse(JSON.stringify(value));
const deepFreeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(deepFreeze);
    }
    return value;
};

export const validateBrickStateMessage = message => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) fail('object required');
    if (message.schemaVersion !== VERSION) fail('unsupported schemaVersion');
    if (message.type === 'snapshot') {
        required(message, ['seq', 'clockNs', 'target', 'lifecycle', 'ports', 'motors', 'sensors',
            'display', 'buttons', 'battery', 'power', 'imu', 'audio', 'storage', 'bluetooth']);
        if (!Number.isSafeInteger(message.seq) || message.seq < 0 ||
            !Number.isSafeInteger(message.clockNs) || message.clockNs < 0) fail('invalid sequence or clock');
        required(message.target, ['board', 'firmware', 'transport', 'imageSha256', 'capabilities', 'limitations']);
        if (![message.ports, message.motors, message.sensors].every(items => Array.isArray(items) && items.length <= 16)) {
            fail('invalid peripheral arrays');
        }
        if (!Array.isArray(message.display.pixels) || message.display.pixels.length > 4096 ||
            !message.display.pixels.every(finite)) fail('invalid display');
    } else if (message.type === 'gap') {
        required(message, ['firstDroppedSeq', 'nextSeq', 'dropped']);
        if (!Number.isSafeInteger(message.dropped) || message.dropped < 1 ||
            message.nextSeq !== message.firstDroppedSeq + message.dropped) fail('invalid gap');
    } else if (message.type === 'result') {
        required(message, ['requestId', 'accepted']);
    } else fail('unsupported message type');
    return deepFreeze(clone(message));
};

export const FIRMWARE_IDENTITY_TARGETS = Object.freeze({
    'spike-prime/lego-prime-v2': 'legacy-v2',
    'spike-prime/lego-prime-v3': 'official-v3',
    'spike-prime/pybricks-prime': 'pybricks',
    'spike-prime/spike-nx': 'spike-nx',
    'spike-prime/brickwright-nuttx': 'brickwright',
    'spike-essential/lego-essential': 'official-essential',
    'spike-essential/pybricks-essential': 'pybricks-essential'
});
const targetName = target => FIRMWARE_IDENTITY_TARGETS[`${target.board}/${target.firmware}`];

export class RenodeBrickStateAdapter {
    constructor (hubState, {onGap = () => {}} = {}) {
        this.hubState = hubState;
        this.onGap = onGap;
        this.lastSeq = -1;
        this.allowedNextSeq = null;
        this.pending = '';
    }
    accept (raw) {
        const message = validateBrickStateMessage(raw);
        if (message.type === 'gap') {
            if (message.firstDroppedSeq !== this.lastSeq + 1) fail('stale gap');
            this.allowedNextSeq = message.nextSeq;
            this.onGap(message);
            return message;
        }
        if (message.type !== 'snapshot') return message;
        if (message.seq <= this.lastSeq) fail('replayed snapshot');
        if (this.lastSeq >= 0 && message.seq !== this.lastSeq + 1 && message.seq !== this.allowedNextSeq) {
            fail('unannounced sequence gap');
        }
        const target = targetName(message.target);
        if (!target) fail('unknown firmware identity');
        this.hubState.setFirmwareTarget(target);
        this.hubState.setBattery(message.battery.percent);
        this.hubState.setDisplay(message.display.pixels);
        this.hubState.setImu(message.imu);
        for (const port of message.ports) this.hubState.setPort(port.id, port.attached ? port.kind : 'none');
        for (const motor of message.motors) this.hubState.setPort(motor.port, 'motor', motor);
        for (const sensor of message.sensors) this.hubState.setPort(sensor.port, sensor.kind, sensor.values);
        this.hubState.applyNeutralMetadata({seq: message.seq, clockNs: message.clockNs,
            target: message.target, lifecycle: message.lifecycle, buttons: message.buttons,
            power: message.power, audio: message.audio, storage: message.storage,
            bluetooth: message.bluetooth});
        this.lastSeq = message.seq;
        this.allowedNextSeq = null;
        return message;
    }
    feed (chunk) {
        this.pending += chunk;
        const lines = this.pending.split('\n');
        this.pending = lines.pop();
        if (lines.length > MAX_PENDING_LINES) fail('too many queued lines');
        if (new TextEncoder().encode(this.pending).length > MAX_NDJSON_LINE_BYTES ||
            lines.some(line => new TextEncoder().encode(line).length > MAX_NDJSON_LINE_BYTES)) fail('line too long');
        return lines.filter(Boolean).map(line => this.accept(JSON.parse(line)));
    }
}

const canonical = value => Array.isArray(value) ? value.map(canonical) :
    (value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort()
        .map(key => [key, canonical(value[key])])) :
        (typeof value === 'number' && !Number.isFinite(value) ? fail('non-finite number') : value));

export const encodeBrickCommand = ({requestId, command, arguments: args = {}, expectedSeq}) => {
    if (typeof requestId !== 'string' || !requestId || requestId.length > 128) fail('invalid requestId');
    if (typeof command !== 'string' || !command || command.length > 64) fail('invalid command');
    if (!args || typeof args !== 'object' || Array.isArray(args)) fail('invalid arguments');
    if (expectedSeq !== undefined && (!Number.isSafeInteger(expectedSeq) || expectedSeq < 0)) {
        fail('invalid expectedSeq');
    }
    const message = {schemaVersion: VERSION, type: 'command', requestId, command, arguments: args};
    if (expectedSeq !== undefined) message.expectedSeq = expectedSeq;
    const line = `${JSON.stringify(canonical(message))}\n`;
    if (new TextEncoder().encode(line).length > MAX_NDJSON_LINE_BYTES) fail('line too long');
    return line;
};
