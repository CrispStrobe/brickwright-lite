// Publish committed project metadata at the VM's completed-load boundary.
// Board selection keeps using its existing settings event; no extension-name
// inference or editor preference is used to classify a loaded project.
const INSTALLED = Symbol.for('brickwright.savedProjectDevicePublication');
const defaultCore = device => import('./bw-matrix/capabilities.js').then(({DEVICE_GROUPS}) =>
    DEVICE_GROUPS.find(group => group.devices.some(item => item.id === device))?.core || null);

export const appliedProjectDevice = runtime => {
    const value = Object.prototype.hasOwnProperty.call(runtime || {}, 'bwDeviceId') ?
        runtime.bwDeviceId : runtime?.stc?.device;
    return typeof value === 'string' ? value.toLowerCase() : '';
};

export default function installSavedProjectDevicePublication(vm, {
    events = typeof window === 'undefined' ? null : window,
    coreOfDevice = defaultCore
} = {}) {
    if (!vm?.runtime?.on || vm[INSTALLED]) return false;
    const runtime = vm.runtime;
    let selected = null, publishing = false, generation = 0, disposed = false;
    const onSelection = event => {
        if (publishing || event.detail?.key !== 'bw-device-id') return;
        selected = {stage: runtime.getTargetForStage?.(), device: event.detail.value};
    };
    const onLoaded = () => {
        const stage = runtime.getTargetForStage?.();
        const value = stage && selected?.stage === stage ? selected.device : runtime.stc?.device;
        const device = typeof value === 'string' ? value.toLowerCase() : '';
        const current = ++generation;
        runtime.bwDeviceId = device || null;
        runtime.bwDeviceCore = null;
        if (events) {
            publishing = true;
            try {events.dispatchEvent(new CustomEvent('bw-settings-change', {detail: {key: 'bw-device-id', value: device}}));}
            finally {publishing = false;}
        }
        if (device) Promise.resolve().then(() => coreOfDevice(device)).then(core => {
            if (!disposed && generation === current && runtime.bwDeviceId === device) runtime.bwDeviceCore = core || null;
        }).catch(error => {
            if (!disposed && generation === current) runtime.emit('BLOCKS_ERROR', `Device metadata: ${error.message}`);
        });
    };
    events?.addEventListener('bw-settings-change', onSelection);
    runtime.on('PROJECT_LOADED', onLoaded);
    const uninstall = () => {
        disposed = true; generation++;
        events?.removeEventListener('bw-settings-change', onSelection);
        runtime.removeListener('PROJECT_LOADED', onLoaded);
        delete vm[INSTALLED];
    };
    Object.defineProperty(vm, INSTALLED, {value: uninstall, configurable: true});
    return uninstall;
}
