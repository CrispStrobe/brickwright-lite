const Runtime = require('../../../engine/runtime');
const ArgumentType = require('../../../extension-support/argument-type');
const BlockType = require('../../../extension-support/block-type');
const Cast = require('../../../util/cast');
const Video = require('../../../io/video');

const DIMENSIONS = [1280, 960];
const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

class CameraCapture {
    constructor (runtime) {
        this.runtime = runtime;
        this._lastPhoto = '';
        this._width = 0;
        this._height = 0;
        this._status = 'off';
        this._ownsCamera = false;
        if (runtime && typeof runtime.on === 'function') {
            const subscribe = runtime.on.bind(runtime);
            subscribe(Runtime.PROJECT_STOP_ALL, () => this.stopCamera());
        }
    }

    getInfo () {
        return {
            id: 'cameracapture',
            name: 'Camera Capture',
            color1: '#0FBD8C',
            color2: '#0DA57A',
            blocks: [
                {
                    opcode: 'startCamera',
                    blockType: BlockType.COMMAND,
                    text: 'start [FACING] camera',
                    arguments: {FACING: {type: ArgumentType.STRING, menu: 'facing'}}
                },
                {opcode: 'cameraReady', blockType: BlockType.BOOLEAN, text: 'camera ready?'},
                {
                    opcode: 'takePhoto',
                    blockType: BlockType.COMMAND,
                    text: 'take photo as [FORMAT] quality [QUALITY] %',
                    arguments: {
                        FORMAT: {type: ArgumentType.STRING, menu: 'format'},
                        QUALITY: {type: ArgumentType.NUMBER, defaultValue: 92}
                    }
                },
                {opcode: 'lastPhoto', blockType: BlockType.REPORTER, text: 'last photo'},
                {opcode: 'photoWidth', blockType: BlockType.REPORTER, text: 'photo width'},
                {opcode: 'photoHeight', blockType: BlockType.REPORTER, text: 'photo height'},
                {opcode: 'cameraStatus', blockType: BlockType.REPORTER, text: 'camera status'},
                {opcode: 'stopCamera', blockType: BlockType.COMMAND, text: 'stop camera'}
            ],
            menus: {
                facing: {acceptReporters: true, items: [
                    {text: 'rear', value: 'environment'},
                    {text: 'front', value: 'user'}
                ]},
                format: {acceptReporters: true, items: [
                    {text: 'JPEG', value: 'image/jpeg'},
                    {text: 'PNG', value: 'image/png'},
                    {text: 'WebP', value: 'image/webp'}
                ]}
            }
        };
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
        const canvas = video.getFrame({format: Video.FORMAT_CANVAS, dimensions: DIMENSIONS, mirror: false, cacheTimeout: 0});
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
        if (video && video.videoReady) return 'ready';
        // The stock provider reports getUserMedia failures through onError and
        // resolves enableVideo(), so a missing element is the observable refusal.
        if (this._status === 'starting' && video && video.provider && !video.provider.video) {
            return 'permission denied or unavailable';
        }
        return this._status;
    }

    stopCamera () {
        const video = this.runtime && this.runtime.ioDevices && this.runtime.ioDevices.video;
        if (video && this._ownsCamera) video.disableVideo();
        this._ownsCamera = false;
        this._status = 'off';
    }
}

module.exports = CameraCapture;
