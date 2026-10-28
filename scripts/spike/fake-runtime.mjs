// A scratch-vm runtime stub rich enough that the LEGO peripheral extensions
// construct without touching real hardware or a real Scratch Link socket.
class FakeSocket {
    constructor (type) { this.type = type; this._open = false; this.sent = []; }
    setOnOpen (f) { this._onOpen = f; }
    setOnClose (f) { this._onClose = f; }
    setOnError (f) { this._onError = f; }
    setHandleMessage (f) { this._onMessage = f; }
    open () { this._open = true; }
    close () { this._open = false; if (this._onClose) this._onClose(); }
    isOpen () { return this._open; }
    sendMessage (m) { this.sent.push(m); return Promise.resolve(); }
}

export function makeRuntime () {
    const listeners = new Map();
    const runtime = {
        peripheralExtensions: {},
        sockets: [],
        emitted: [],
        registerPeripheralExtension (id, ext) { this.peripheralExtensions[id] = ext; },
        getScratchLinkSocket (type) { const s = new FakeSocket(type); this.sockets.push(s); return s; },
        getLocale: () => 'en',
        on (evt, cb) { if (!listeners.has(evt)) listeners.set(evt, []); listeners.get(evt).push(cb); },
        off () {},
        emit (evt, ...a) { this.emitted.push([evt, ...a]); (listeners.get(evt) || []).forEach(cb => cb(...a)); },
        startHats () {},
        requestRedraw () {},
        getTargetForStage: () => null,
        ioDevices: {}
    };
    runtime.constructor = {
        PERIPHERAL_CONNECTED: 'PERIPHERAL_CONNECTED',
        PERIPHERAL_DISCONNECTED: 'PERIPHERAL_DISCONNECTED',
        PERIPHERAL_REQUEST_ERROR: 'PERIPHERAL_REQUEST_ERROR',
        PERIPHERAL_LIST_UPDATE: 'PERIPHERAL_LIST_UPDATE',
        PERIPHERAL_SCAN_TIMEOUT: 'PERIPHERAL_SCAN_TIMEOUT',
        USER_PICKED_PERIPHERAL: 'USER_PICKED_PERIPHERAL'
    };
    return runtime;
}
