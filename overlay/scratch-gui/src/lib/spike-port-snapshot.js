// Read the same SPIKE port state used by the extension's blocks and by the
// virtual hub. Missing telemetry means "not reported", not "nothing attached".
const PORTS = 'ABCDEF';
const COLOR_NAMES = ['black', 'magenta', 'purple', 'blue', 'azure', 'turquoise',
    'green', 'yellow', 'orange', 'red', 'white'];
const EXTENSION_IDS = ['spikeprime', 'legospikeprimeBLE', 'spikeprimeble',
    'spikeprimeBTC', 'spikeprimeBridge'];

// The Widgets pane is shared by every project. Port telemetry belongs there
// only after a SPIKE extension has actually been added to this project.
export const isSpikeExtensionLoaded = vm => {
    const manager = vm?.extensionManager;
    return Boolean(manager?.isExtensionLoaded &&
        EXTENSION_IDS.some(id => manager.isExtensionLoaded(id)));
};

const reading = (kind, data = {}) => {
    if (kind === 'motor') {
        const speed = Number(data.speed) || 0;
        const position = data.relativePosition ?? data.position;
        return position === undefined ? `${speed}%` : `${speed}% · ${Math.round(position)}°`;
    }
    if (kind === 'force') return `${data.pressed ? 'pressed' : 'released'} · ${data.force ?? 0}`;
    if (kind === 'color') {
        const code = Number(data.color);
        return COLOR_NAMES[code] || 'no color';
    }
    if (kind === 'distance') return data.distanceMM !== undefined ?
        `${data.distanceMM} mm` : `${data.distance ?? '—'} cm`;
    if (kind === 'matrix3') return '3×3 light matrix';
    if (kind === 'boostMotor') return 'No SPIKE motor control · manual duty only';
    if (kind === 'boostColorDistance') return data.color >= 0 ?
        `${COLOR_NAMES[data.color] || 'color'} · Boost API only` : 'Boost API only';
    return '';
};

const label = (kind, data = {}) => {
    if (kind === 'motor') {
        if (data.deviceId === 38) return 'Boost motor';
        if (data.deviceId === 65) return 'SPIKE Essential motor';
        if (data.deviceId === 75) return 'SPIKE motor';
        return 'Motor';
    }
    return ({force: 'Force sensor', color: 'Color sensor', distance: 'Distance sensor',
        matrix3: '3×3 matrix', boostMotor: 'Boost motor',
        boostColorDistance: 'Boost color/distance'})[kind] || 'Unknown device';
};

const mapPorts = values => [...PORTS].map(port => {
    const data = values[port];
    if (!data) return {port, label: 'No telemetry', detail: '', kind: 'unknown'};
    const kind = data.kind || data.type;
    return {port, label: label(kind, data), detail: reading(kind, data), kind,
        pixels: kind === 'matrix3' ? data.pixels || [] : null};
});

export const snapshotSpikePorts = (runtime, virtualState) => {
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
        return {mode: 'virtual', connected: Boolean(virtual.connected), ports: mapPorts(values)};
    }
    if (connected) return {mode: 'live', connected: true, ports: mapPorts(connected.portValues || {})};
    return {mode: 'offline', connected: false, ports: mapPorts({})};
};

export default snapshotSpikePorts;
