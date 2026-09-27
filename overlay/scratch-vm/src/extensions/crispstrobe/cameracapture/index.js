const Runtime = require('../../../engine/runtime');
const ArgumentType = require('../../../extension-support/argument-type');
const BlockType = require('../../../extension-support/block-type');
const Cast = require('../../../util/cast');
const Video = require('../../../io/video');
const formatMessage = require('format-message');
const {ScannerStore} = require('./scanner-store');

const DIMENSIONS = [1280, 960];
const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const COPY = {
    en: {
        name: 'Camera Capture', startCamera: 'start [FACING]', refreshCameras: 'refresh camera list',
        selectCamera: 'use camera [CAMERA] width [WIDTH] height [HEIGHT] fps [FPS]',
        cameraNames: 'available cameras', activeCamera: 'active camera', capabilities: 'camera capabilities',
        setControl: 'set camera [CONTROL] to [VALUE]', ready: 'camera ready?',
        takePhoto: 'take photo as [FORMAT] quality [QUALITY] %', lastPhoto: 'last photo',
        photoWidth: 'photo width', photoHeight: 'photo height', status: 'camera status',
        beginScan: 'begin scan session [NAME]', saveFrame: 'save last photo to scan',
        frameCount: 'scan frame count', exportScan: 'share scan session', importScan: 'open scan archive',
        serveScan: 'share scan on local network for [MINUTES] minutes', shareAddress: 'local share address',
        stopSharing: 'stop local sharing', clearScan: 'delete current scan session',
        depthAvailable: 'depth camera available?', depthStatus: 'depth camera status',
        startDepth: 'start depth camera', stopDepth: 'stop depth camera', sharePhoto: 'share last photo',
        photoToCostume: 'add last photo as costume', stopCamera: 'stop camera',
        rearCamera: 'rear camera', frontCamera: 'front camera', defaultCamera: 'default camera',
        zoom: 'zoom', focusDistance: 'focus distance', exposure: 'exposure', torch: 'torch'
    },
    de: {
        name: 'Kameraaufnahme', startCamera: '[FACING] starten', refreshCameras: 'Kameraliste aktualisieren',
        selectCamera: 'Kamera [CAMERA] mit Breite [WIDTH] Höhe [HEIGHT] fps [FPS] verwenden',
        cameraNames: 'verfügbare Kameras', activeCamera: 'aktive Kamera', capabilities: 'Kamerafunktionen',
        setControl: 'Kamera [CONTROL] auf [VALUE] setzen', ready: 'Kamera bereit?',
        takePhoto: 'Foto als [FORMAT] mit Qualität [QUALITY] % aufnehmen', lastPhoto: 'letztes Foto',
        photoWidth: 'Fotobreite', photoHeight: 'Fotohöhe', status: 'Kamerastatus',
        beginScan: 'Scan-Sitzung [NAME] beginnen', saveFrame: 'letztes Foto im Scan speichern',
        frameCount: 'Anzahl Scan-Bilder', exportScan: 'Scan-Sitzung teilen', importScan: 'Scan-Archiv öffnen',
        serveScan: 'Scan für [MINUTES] Minuten im lokalen Netzwerk teilen', shareAddress: 'lokale Freigabeadresse',
        stopSharing: 'lokale Freigabe beenden', clearScan: 'aktuelle Scan-Sitzung löschen',
        depthAvailable: 'Tiefenkamera verfügbar?', depthStatus: 'Tiefenkamerastatus',
        startDepth: 'Tiefenkamera starten', stopDepth: 'Tiefenkamera stoppen', sharePhoto: 'letztes Foto teilen',
        photoToCostume: 'letztes Foto als Kostüm hinzufügen', stopCamera: 'Kamera stoppen',
        rearCamera: 'Rückkamera', frontCamera: 'Frontkamera', defaultCamera: 'Standardkamera',
        zoom: 'Zoom', focusDistance: 'Fokusabstand', exposure: 'Belichtung', torch: 'Licht'
    }
};

const language = () => String(formatMessage.setup().locale || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';
const t = key => COPY[language()][key] || COPY.en[key] || key;

const STATUS_DE = {
    off: 'aus', ready: 'bereit', starting: 'wird gestartet', 'camera unavailable': 'Kamera nicht verfügbar',
    'requesting permission': 'Berechtigung wird angefragt', 'permission denied': 'Berechtigung verweigert',
    'camera error': 'Kamerafehler', 'camera not ready': 'Kamera nicht bereit',
    'frame unavailable': 'Bild nicht verfügbar', 'photo captured': 'Foto aufgenommen',
    'permission denied or unavailable': 'Berechtigung verweigert oder Kamera nicht verfügbar',
    'camera enumeration unavailable': 'Kameraliste nicht verfügbar', 'camera enumeration error': 'Fehler der Kameraliste',
    'camera disconnected': 'Kamera getrennt', 'camera selection unavailable': 'Kameraauswahl nicht verfügbar',
    'camera selection error': 'Fehler bei der Kameraauswahl', 'camera controls unavailable': 'Kamerasteuerung nicht verfügbar',
    'scan session ready': 'Scan-Sitzung bereit', 'scan frame saved': 'Scan-Bild gespeichert',
    'take a photo first': 'zuerst ein Foto aufnehmen', 'sharing unavailable': 'Teilen nicht verfügbar',
    'scan ready to share': 'Scan zum Teilen bereit', 'scan import unavailable': 'Scan-Import nicht verfügbar',
    'local sharing requires the installed app': 'Lokales Teilen erfordert die installierte App',
    'local sharing active': 'Lokales Teilen aktiv', 'local sharing stopped': 'Lokales Teilen beendet',
    'scan session cleared': 'Scan-Sitzung gelöscht', 'depth camera unavailable; RGB only': 'Tiefenkamera nicht verfügbar; nur RGB',
    'depth camera ready': 'Tiefenkamera bereit', 'depth camera stopped': 'Tiefenkamera gestoppt',
    'photo ready to share': 'Foto zum Teilen bereit', 'photo added as costume': 'Foto als Kostüm hinzugefügt'
};
const localizeStatus = status => {
    if (language() !== 'de') return status;
    if (STATUS_DE[status]) return STATUS_DE[status];
    let match = /^(\d+) camera\(s\) available$/.exec(status);
    if (match) return `${match[1]} Kamera(s) verfügbar`;
    match = /^(\d+) scan frame\(s\) imported$/.exec(status);
    if (match) return `${match[1]} Scan-Bild(er) importiert`;
    match = /^(zoom|focusDistance|exposureCompensation|torch) (updated|unsupported)$/.exec(status);
    if (match) return `${t({focusDistance: 'focusDistance', exposureCompensation: 'exposure'}[match[1]] || match[1])} ${match[2] === 'updated' ? 'aktualisiert' : 'nicht unterstützt'}`;
    return status;
};

class CameraCapture {
    constructor (runtime) {
        this.runtime = runtime;
        this._lastPhoto = '';
        this._width = 0;
        this._height = 0;
        this._status = 'off';
        this._ownsCamera = false;
        this._devices = [];
        this._selectedDevice = '';
        this._store = new ScannerStore();
        this._shareAddress = '';
        this._unwatchDevices = null;
        if (runtime && typeof runtime.on === 'function') {
            const subscribe = runtime.on.bind(runtime);
            subscribe(Runtime.PROJECT_STOP_ALL, () => this.stopCamera());
        }
    }

    getInfo () {
        return {
            id: 'cameracapture',
            name: t('name'),
            color1: '#0FBD8C',
            color2: '#0DA57A',
            blocks: [
                {
                    opcode: 'startCamera',
                    blockType: BlockType.COMMAND,
                    text: t('startCamera'),
                    arguments: {FACING: {type: ArgumentType.STRING, menu: 'facing'}}
                },
                {opcode: 'refreshCameras', blockType: BlockType.COMMAND, text: t('refreshCameras')},
                {
                    opcode: 'selectCamera', blockType: BlockType.COMMAND,
                    text: t('selectCamera'),
                    arguments: {
                        CAMERA: {type: ArgumentType.STRING, menu: 'cameras'},
                        WIDTH: {type: ArgumentType.NUMBER, defaultValue: 1280},
                        HEIGHT: {type: ArgumentType.NUMBER, defaultValue: 960},
                        FPS: {type: ArgumentType.NUMBER, defaultValue: 30}
                    }
                },
                {opcode: 'cameraNames', blockType: BlockType.REPORTER, text: t('cameraNames')},
                {opcode: 'activeCamera', blockType: BlockType.REPORTER, text: t('activeCamera')},
                {opcode: 'cameraCapabilities', blockType: BlockType.REPORTER, text: t('capabilities')},
                {
                    opcode: 'setCameraControl', blockType: BlockType.COMMAND,
                    text: t('setControl'),
                    arguments: {
                        CONTROL: {type: ArgumentType.STRING, menu: 'controls'},
                        VALUE: {type: ArgumentType.NUMBER, defaultValue: 1}
                    }
                },
                {opcode: 'cameraReady', blockType: BlockType.BOOLEAN, text: t('ready')},
                {
                    opcode: 'takePhoto',
                    blockType: BlockType.COMMAND,
                    text: t('takePhoto'),
                    arguments: {
                        FORMAT: {type: ArgumentType.STRING, menu: 'format'},
                        QUALITY: {type: ArgumentType.NUMBER, defaultValue: 92}
                    }
                },
                {opcode: 'lastPhoto', blockType: BlockType.REPORTER, text: t('lastPhoto')},
                {opcode: 'photoWidth', blockType: BlockType.REPORTER, text: t('photoWidth')},
                {opcode: 'photoHeight', blockType: BlockType.REPORTER, text: t('photoHeight')},
                {opcode: 'cameraStatus', blockType: BlockType.REPORTER, text: t('status')},
                {opcode: 'beginScan', blockType: BlockType.COMMAND, text: t('beginScan'),
                    arguments: {NAME: {type: ArgumentType.STRING, defaultValue: 'LEGO scan'}}},
                {opcode: 'saveFrame', blockType: BlockType.COMMAND, text: t('saveFrame')},
                {opcode: 'scanFrameCount', blockType: BlockType.REPORTER, text: t('frameCount')},
                {opcode: 'exportScan', blockType: BlockType.COMMAND, text: t('exportScan')},
                {opcode: 'importScan', blockType: BlockType.COMMAND, text: t('importScan')},
                {opcode: 'serveScan', blockType: BlockType.COMMAND,
                    text: t('serveScan'),
                    arguments: {MINUTES: {type: ArgumentType.NUMBER, defaultValue: 10}}},
                {opcode: 'shareAddress', blockType: BlockType.REPORTER, text: t('shareAddress')},
                {opcode: 'stopSharing', blockType: BlockType.COMMAND, text: t('stopSharing')},
                {opcode: 'clearScan', blockType: BlockType.COMMAND, text: t('clearScan')},
                {opcode: 'depthAvailable', blockType: BlockType.BOOLEAN, text: t('depthAvailable')},
                {opcode: 'depthStatus', blockType: BlockType.REPORTER, text: t('depthStatus')},
                {opcode: 'startDepthCamera', blockType: BlockType.COMMAND, text: t('startDepth')},
                {opcode: 'stopDepthCamera', blockType: BlockType.COMMAND, text: t('stopDepth')},
                {opcode: 'shareLastPhoto', blockType: BlockType.COMMAND, text: t('sharePhoto')},
                {opcode: 'photoToCostume', blockType: BlockType.COMMAND, text: t('photoToCostume')},
                {opcode: 'stopCamera', blockType: BlockType.COMMAND, text: t('stopCamera')}
            ],
            menus: {
                facing: {acceptReporters: true, items: [
                    {text: t('rearCamera'), value: 'environment'},
                    {text: t('frontCamera'), value: 'user'}
                ]},
                format: {acceptReporters: true, items: [
                    {text: 'JPEG', value: 'image/jpeg'},
                    {text: 'PNG', value: 'image/png'},
                    {text: 'WebP', value: 'image/webp'}
                ]},
                cameras: {acceptReporters: true, items: '_cameraMenu'},
                controls: {acceptReporters: true, items: [
                    {text: t('zoom'), value: 'zoom'},
                    {text: t('focusDistance'), value: 'focusDistance'},
                    {text: t('exposure'), value: 'exposureCompensation'},
                    {text: t('torch'), value: 'torch'}
                ]}
            }
        };
    }

    _provider () {
        return this.runtime && this.runtime.ioDevices && this.runtime.ioDevices.video &&
            this.runtime.ioDevices.video.provider;
    }

    _cameraMenu () {
        if (!this._devices.length) return [{text: t('defaultCamera'), value: ''}];
        return this._devices.map(device => ({text: device.label, value: device.deviceId}));
    }

    async startCamera (args) {
        const video = this.runtime && this.runtime.ioDevices && this.runtime.ioDevices.video;
        if (!video || !video.provider) {
            this._status = 'camera unavailable';
            return;
        }
        this._status = 'requesting permission';
        try {
            await video.enableVideo();
            this._ownsCamera = true;
            const facing = args && args.FACING === 'user' ? 'user' : 'environment';
            const element = video.provider.video;
            const stream = element && element.srcObject;
            const track = stream && stream.getVideoTracks && stream.getVideoTracks()[0];
            if (track && track.applyConstraints) {
                try {
                    await track.applyConstraints({facingMode: {exact: facing}});
                } catch (error) {
                    await track.applyConstraints({facingMode: {ideal: facing}});
                }
            }
            this._status = video.videoReady ? 'ready' : 'starting';
        } catch (error) {
            this._status = error && error.name === 'NotAllowedError' ? 'permission denied' : 'camera error';
            this._ownsCamera = false;
        }
    }

    async refreshCameras () {
        const provider = this._provider();
        if (!provider || typeof provider.listVideoDevices !== 'function') {
            this._devices = [];
            this._status = 'camera enumeration unavailable';
            return;
        }
        try {
            // Labels are intentionally requested only after a project has already
            // started the camera and therefore obtained consent.
            this._devices = await provider.listVideoDevices();
            if (!this._unwatchDevices && typeof provider.watchVideoDevices === 'function') {
                this._unwatchDevices = provider.watchVideoDevices(() => this._devicesChanged());
            }
            this._status = `${this._devices.length} camera(s) available`;
        } catch (error) {
            this._status = 'camera enumeration error';
        }
    }

    async _devicesChanged () {
        const selected = this._selectedDevice;
        await this.refreshCameras();
        if (selected && !this._devices.some(device => device.deviceId === selected)) {
            this._selectedDevice = '';
            const provider = this._provider();
            try {
                await provider.selectVideoDevice({});
                this._status = 'selected camera disconnected; using default camera';
            } catch (error) {
                this._status = 'camera disconnected';
            }
        }
    }

    async selectCamera (args) {
        const provider = this._provider();
        if (!provider || typeof provider.selectVideoDevice !== 'function') {
            this._status = 'camera selection unavailable';
            return;
        }
        try {
            const requested = String(args && args.CAMERA || '');
            await provider.selectVideoDevice({
                deviceId: requested,
                width: Cast.toNumber(args && args.WIDTH),
                height: Cast.toNumber(args && args.HEIGHT),
                frameRate: Cast.toNumber(args && args.FPS)
            });
            this._selectedDevice = requested;
            this._ownsCamera = true;
            this._status = 'ready';
            await this.refreshCameras();
            this._status = 'ready';
        } catch (error) {
            this._status = error && error.name === 'NotAllowedError' ? 'permission denied' : 'camera selection error';
        }
    }

    cameraNames () { return this._devices.map(device => device.label).join(', '); }
    activeCamera () {
        const provider = this._provider();
        const settings = provider && typeof provider.cameraInfo === 'function' ? provider.cameraInfo().settings : {};
        const id = settings.deviceId || this._selectedDevice;
        const match = this._devices.find(device => device.deviceId === id);
        return match ? match.label : (id ? t('activeCamera') : t('defaultCamera'));
    }
    cameraCapabilities () {
        const provider = this._provider();
        const info = provider && typeof provider.cameraInfo === 'function' ? provider.cameraInfo() : {};
        return JSON.stringify(info.capabilities || {});
    }
    async setCameraControl (args) {
        const provider = this._provider();
        if (!provider || typeof provider.applyCameraSettings !== 'function') {
            this._status = 'camera controls unavailable';
            return;
        }
        const control = String(args && args.CONTROL || '');
        let value = Cast.toNumber(args && args.VALUE);
        if (control === 'torch') value = value !== 0;
        try {
            await provider.applyCameraSettings({[control]: value});
            this._status = `${control} updated`;
        } catch (error) {
            this._status = `${control} unsupported`;
        }
    }

    cameraReady () {
        const video = this.runtime && this.runtime.ioDevices && this.runtime.ioDevices.video;
        return Boolean(video && video.videoReady);
    }

    takePhoto (args) {
        const video = this.runtime && this.runtime.ioDevices && this.runtime.ioDevices.video;
        if (!video || !video.videoReady) {
            this._status = 'camera not ready';
            return;
        }
        const element = video.provider && video.provider.video;
        const dimensions = element && element.videoWidth > 0 && element.videoHeight > 0 ?
            [element.videoWidth, element.videoHeight] : DIMENSIONS;
        const canvas = video.getFrame({format: Video.FORMAT_CANVAS, dimensions, mirror: false, cacheTimeout: 0});
        if (!canvas || typeof canvas.toDataURL !== 'function') {
            this._status = 'frame unavailable';
            return;
        }
        const format = MIME_TYPES.has(args && args.FORMAT) ? args.FORMAT : 'image/jpeg';
        const quality = Math.max(0, Math.min(100, Cast.toNumber(args && args.QUALITY))) / 100;
        this._lastPhoto = canvas.toDataURL(format, quality);
        this._width = canvas.width || DIMENSIONS[0];
        this._height = canvas.height || DIMENSIONS[1];
        this._status = 'photo captured';
    }

    lastPhoto () { return this._lastPhoto; }
    photoWidth () { return this._width; }
    photoHeight () { return this._height; }
    cameraStatus () {
        const video = this.runtime && this.runtime.ioDevices && this.runtime.ioDevices.video;
        if (video && video.videoReady) return localizeStatus('ready');
        // The stock provider reports getUserMedia failures through onError and
        // resolves enableVideo(), so a missing element is the observable refusal.
        if (this._status === 'starting' && video && video.provider && !video.provider.video) {
            return localizeStatus('permission denied or unavailable');
        }
        return localizeStatus(this._status);
    }

    beginScan (args) {
        this._store.begin(args && args.NAME);
        this._status = 'scan session ready';
    }

    async saveFrame () {
        const depthAdapter = typeof globalThis !== 'undefined' && globalThis.__BRICKWRIGHT_DEPTH__;
        let photo = this._lastPhoto;
        let depthMetadata = {};
        if (depthAdapter && depthAdapter.available && depthAdapter.running) {
            try {
                const capture = await depthAdapter.capture();
                photo = capture.rgbDataUrl;
                this._lastPhoto = photo;
                this._width = capture.imageWidth || this._width;
                this._height = capture.imageHeight || this._height;
                depthMetadata = {
                    depthBase64: capture.depthBase64,
                    confidenceBase64: capture.confidenceBase64,
                    depthWidth: capture.depthWidth,
                    depthHeight: capture.depthHeight,
                    depthFormat: capture.depthFormat,
                    confidenceFormat: capture.confidenceFormat,
                    calibration: {intrinsics: capture.intrinsics},
                    pose: capture.pose,
                    timestamp: capture.timestamp
                };
            } catch (error) {
                this._status = error.message || 'depth capture error';
                return;
            }
        }
        if (!photo) {
            this._status = 'take a photo first';
            return;
        }
        const provider = this._provider();
        const info = provider && typeof provider.cameraInfo === 'function' ? provider.cameraInfo() : {};
        try {
            await this._store.addRgbDataUrl(photo, {
                width: this._width,
                height: this._height,
                camera: this.activeCamera(),
                settings: info.settings || {},
                ...depthMetadata
            });
            this._status = 'scan frame saved';
        } catch (error) {
            this._status = error.message || 'scan storage error';
        }
    }

    async scanFrameCount () { return this._store.count(); }

    _share (filename, blob) {
        if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
            this._status = 'sharing unavailable';
            return;
        }
        window.dispatchEvent(new CustomEvent('bw-export-artifact', {detail: {filename, blob}}));
    }

    async exportScan () {
        try {
            const archive = await this._store.archive();
            this._share(archive.filename, archive.blob);
            this._status = 'scan ready to share';
        } catch (error) {
            this._status = error.message || 'scan export error';
        }
    }

    async importScan () {
        if (typeof document === 'undefined') {
            this._status = 'scan import unavailable';
            return;
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip,.bwscan.zip,application/zip';
        input.style.display = 'none';
        document.body.appendChild(input);
        try {
            const file = await new Promise(resolve => {
                let settled = false;
                const finish = value => {
                    if (settled) return;
                    settled = true;
                    window.removeEventListener('focus', onFocus);
                    resolve(value);
                };
                const onFocus = () => window.setTimeout(() => finish(input.files && input.files[0]), 300);
                input.addEventListener('change', () => finish(input.files && input.files[0]), {once: true});
                window.addEventListener('focus', onFocus, {once: true});
                input.click();
            });
            if (!file) return;
            await this._store.importArchive(await file.arrayBuffer());
            this._status = `${await this._store.count()} scan frame(s) imported`;
        } catch (error) {
            this._status = error.message || 'scan import error';
        } finally {
            input.remove();
        }
    }

    async serveScan (args) {
        const tauri = typeof window !== 'undefined' && window.__TAURI__;
        const invoke = tauri && tauri.core && tauri.core.invoke;
        if (!invoke) {
            this._status = 'local sharing requires the installed app';
            return;
        }
        try {
            const archive = await this._store.archive();
            const bytes = Array.from(new Uint8Array(await archive.blob.arrayBuffer()));
            const path = await invoke('write_temp_project', {filename: archive.filename, bytes});
            const info = await invoke('start_share_server', {
                path, minutes: Math.max(1, Math.min(30, Cast.toNumber(args && args.MINUTES)))
            });
            this._shareAddress = info.url || '';
            this._status = 'local sharing active';
        } catch (error) {
            this._status = error.message || 'local sharing error';
        }
    }
    shareAddress () { return this._shareAddress; }
    async stopSharing () {
        const tauri = typeof window !== 'undefined' && window.__TAURI__;
        const invoke = tauri && tauri.core && tauri.core.invoke;
        if (invoke) await invoke('stop_share_server').catch(() => {});
        this._shareAddress = '';
        this._status = 'local sharing stopped';
    }

    async clearScan () {
        await this._store.clear();
        this._status = 'scan session cleared';
    }

    depthAvailable () {
        const adapter = typeof globalThis !== 'undefined' && globalThis.__BRICKWRIGHT_DEPTH__;
        return Boolean(adapter && adapter.available);
    }
    depthStatus () {
        const adapter = typeof globalThis !== 'undefined' && globalThis.__BRICKWRIGHT_DEPTH__;
        return adapter && adapter.available ? String(adapter.label || 'depth available') : 'RGB only';
    }

    async startDepthCamera () {
        const adapter = typeof globalThis !== 'undefined' && globalThis.__BRICKWRIGHT_DEPTH__;
        if (!adapter || !adapter.available) {
            this._status = 'depth camera unavailable; RGB only';
            return;
        }
        try {
            if (this._ownsCamera) this.stopCamera();
            await adapter.start();
            this._status = 'depth camera ready';
        } catch (error) {
            this._status = error.message || 'depth camera error';
        }
    }

    async stopDepthCamera () {
        const adapter = typeof globalThis !== 'undefined' && globalThis.__BRICKWRIGHT_DEPTH__;
        if (adapter && adapter.running) await adapter.stop().catch(() => {});
        this._status = 'depth camera stopped';
    }

    shareLastPhoto () {
        if (!this._lastPhoto) {
            this._status = 'take a photo first';
            return;
        }
        const match = /^data:([^;,]+);base64,(.*)$/.exec(this._lastPhoto);
        if (!match) return;
        const binary = atob(match[2]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const ext = match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg';
        this._share(`brickwright-photo.${ext}`, new Blob([bytes], {type: match[1]}));
        this._status = 'photo ready to share';
    }

    photoToCostume () {
        if (!this._lastPhoto || typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
            this._status = 'take a photo first';
            return;
        }
        const match = /^data:image\/(jpeg|png|webp);/.exec(this._lastPhoto);
        const dataFormat = match && match[1] === 'jpeg' ? 'jpg' : (match ? match[1] : 'jpg');
        window.dispatchEvent(new CustomEvent('bw-camera-add-costume', {detail: {
            dataUrl: this._lastPhoto,
            dataFormat,
            name: 'camera photo'
        }}));
        this._status = 'photo added as costume';
    }

    stopCamera () {
        const video = this.runtime && this.runtime.ioDevices && this.runtime.ioDevices.video;
        if (video && this._ownsCamera) video.disableVideo();
        this._ownsCamera = false;
        if (this._unwatchDevices) this._unwatchDevices();
        this._unwatchDevices = null;
        const adapter = typeof globalThis !== 'undefined' && globalThis.__BRICKWRIGHT_DEPTH__;
        if (adapter && adapter.running) adapter.stop().catch(() => {});
        this._status = 'off';
    }
}

module.exports = CameraCapture;
