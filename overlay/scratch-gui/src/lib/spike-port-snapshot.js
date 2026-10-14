// Read the same SPIKE port state used by the extension's blocks and by the
// virtual hub. Missing telemetry means "not reported", not "nothing attached".
import {makeT} from './bw-i18n.js';

const t = makeT({
    en: {
        noTelemetry: 'No telemetry', unknownDevice: 'Unknown device', motor: 'Motor',
        boostMotor: 'Boost motor', essentialMotor: 'SPIKE Essential motor', spikeMotor: 'SPIKE motor',
        forceSensor: 'Force sensor', colorSensor: 'Color sensor', distanceSensor: 'Distance sensor',
        matrix: '3×3 matrix', boostColorDistance: 'Boost color/distance',
        pressed: 'pressed', released: 'released', noColor: 'no color', color: 'color',
        matrixReading: '3×3 light matrix', boostMotorReading: 'No SPIKE motor control · manual duty only',
        boostApiOnly: 'Boost API only', liveHub: 'Live hub', virtualConnected: 'Virtual hub connected',
        virtualReady: 'Virtual hub ready', noHub: 'No hub connected', ports: 'SPIKE ports',
        configure: 'Configure simulation', matrixPixels: '3 by 3 matrix pixels'
    },
    de: {
        noTelemetry: 'Keine Telemetrie', unknownDevice: 'Unbekanntes Gerät', motor: 'Motor',
        boostMotor: 'Boost-Motor', essentialMotor: 'SPIKE Essential Motor', spikeMotor: 'SPIKE-Motor',
        forceSensor: 'Drucksensor', colorSensor: 'Farbsensor', distanceSensor: 'Abstandssensor',
        matrix: '3×3-Matrix', boostColorDistance: 'Boost Farb-/Abstandssensor',
        pressed: 'gedrückt', released: 'losgelassen', noColor: 'keine Farbe', color: 'Farbe',
        matrixReading: '3×3-Lichtmatrix', boostMotorReading: 'Keine SPIKE-Motorsteuerung · nur direkte Leistung',
        boostApiOnly: 'Nur Boost-API', liveHub: 'Hub verbunden', virtualConnected: 'Virtueller Hub verbunden',
        virtualReady: 'Virtueller Hub bereit', noHub: 'Kein Hub verbunden', ports: 'SPIKE-Ports',
        configure: 'Simulation einrichten', matrixPixels: 'Pixel der 3×3-Matrix'
    }
});
export const spikeText = t;
const PORTS = 'ABCDEF';
const COLOR_NAMES = {
    en: ['black', 'magenta', 'purple', 'blue', 'azure', 'turquoise', 'green', 'yellow', 'orange', 'red', 'white'],
    de: ['schwarz', 'magenta', 'violett', 'blau', 'azur', 'türkis', 'grün', 'gelb', 'orange', 'rot', 'weiß']
};
const EXTENSION_IDS = ['spikeprime', 'legospikeprimeBLE', 'spikeprimeble',
    'spikeprimeBTC', 'spikeprimeBridge'];

// The Widgets pane is shared by every project. Port telemetry belongs there
// only after a SPIKE extension has actually been added to this project.
export const isSpikeExtensionLoaded = vm => {
    const manager = vm?.extensionManager;
    return Boolean(manager?.isExtensionLoaded &&
        EXTENSION_IDS.some(id => manager.isExtensionLoaded(id)));
};

const reading = (kind, data = {}, locale = 'en') => {
    if (kind === 'motor') {
        const speed = Number(data.speed) || 0;
        const position = data.relativePosition ?? data.position;
        return position === undefined ? `${speed}%` : `${speed}% · ${Math.round(position)}°`;
    }
    if (kind === 'force') return `${t(locale, data.pressed ? 'pressed' : 'released')} · ${data.force ?? 0}`;
    if (kind === 'color') {
        const code = Number(data.color);
        return (COLOR_NAMES[String(locale).slice(0, 2)] || COLOR_NAMES.en)[code] || t(locale, 'noColor');
    }
    if (kind === 'distance') return data.distanceMM !== undefined ?
        `${data.distanceMM} mm` : `${data.distance ?? '—'} cm`;
    if (kind === 'matrix3') return t(locale, 'matrixReading');
    if (kind === 'boostMotor') return t(locale, 'boostMotorReading');
    if (kind === 'boostColorDistance') return data.color >= 0 ?
        `${(COLOR_NAMES[String(locale).slice(0, 2)] || COLOR_NAMES.en)[data.color] || t(locale, 'color')} · ${t(locale, 'boostApiOnly')}` :
        t(locale, 'boostApiOnly');
    return '';
};

const label = (kind, data = {}, locale = 'en') => {
    if (kind === 'motor') {
        if (data.deviceId === 38) return t(locale, 'boostMotor');
        if (data.deviceId === 65) return t(locale, 'essentialMotor');
        if (data.deviceId === 75) return t(locale, 'spikeMotor');
        return t(locale, 'motor');
    }
    const keys = {force: 'forceSensor', color: 'colorSensor', distance: 'distanceSensor',
        matrix3: 'matrix', boostMotor: 'boostMotor', boostColorDistance: 'boostColorDistance'};
    return t(locale, keys[kind] || 'unknownDevice');
};

const mapPorts = (values, locale) => [...PORTS].map(port => {
    const data = values[port];
    if (!data) return {port, label: t(locale, 'noTelemetry'), detail: '', kind: 'unknown'};
    const kind = data.kind || data.type;
    return {port, label: label(kind, data, locale), detail: reading(kind, data, locale), kind,
        pixels: kind === 'matrix3' ? data.pixels || [] : null};
});

export const snapshotSpikePorts = (runtime, virtualState, locale = 'en') => {
    const extensions = runtime?.peripheralExtensions || {};
    const connected = EXTENSION_IDS.map(id => extensions[id]).find(ext => ext && ext.isConnected?.());
    const virtual = virtualState?.data;
    if (virtual?.simulationEnabled && (virtual.connected || !connected)) {
        const values = {};
        [...PORTS].forEach((port, index) => {
            const sensor = virtual.sensors[index];
            if (!sensor) return;
            values[port] = sensor.kind === 'motor' ? {...sensor, ...virtual.motors[index]} : sensor;
        });
        return {mode: 'virtual', connected: Boolean(virtual.connected), ports: mapPorts(values, locale)};
    }
    if (connected) return {mode: 'live', connected: true, ports: mapPorts(connected.portValues || {}, locale)};
    return {mode: 'offline', connected: false, ports: mapPorts({}, locale)};
};

export default snapshotSpikePorts;
