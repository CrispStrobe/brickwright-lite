import {requestVideoStream, requestDisableVideo} from './camera.js';
import log from '../log.js';

/**
 * Video Manager for video extensions.
 */
class VideoProvider {
    constructor () {
        /**
         * Default value for mirrored frames.
         * @type boolean
         */
        this.mirror = true;

        /**
         * Cache frames for this many ms.
         * @type number
         */
        this._frameCacheTimeout = 16;

        /**
         * DOM Video element
         * @private
         */
        this._video = null;

        /**
         * Usermedia stream track
         * @private
         */
        this._track = null;

        /**
         * Stores some canvas/frame data per resolution/mirror states
         */
        this._workspace = [];
    }

    static get FORMAT_IMAGE_DATA () {
        return 'image-data';
    }

    static get FORMAT_CANVAS () {
        return 'canvas';
    }

    /**
     * Dimensions the video stream is analyzed at after its rendered to the
     * sample canvas.
     * @type {Array.<number>}
     */
    static get DIMENSIONS () {
        return [480, 360];
    }

    /**
     * Order preview drawable is inserted at in the renderer.
     * @type {number}
     */
    static get ORDER () {
        return 1;
    }

    /**
     * Get the HTML video element containing the stream
     */
    get video () {
        return this._video;
    }

    /** Enumerate video inputs after permission has been requested. Browsers hide
     * labels before consent; callers must not use this as an eager permission
     * probe. */
    async listVideoDevices () {
        const media = typeof navigator !== 'undefined' && navigator.mediaDevices;
        if (!media || typeof media.enumerateDevices !== 'function') return [];
        return (await media.enumerateDevices())
            .filter(device => device.kind === 'videoinput')
            .map((device, index) => ({
                deviceId: device.deviceId,
                groupId: device.groupId,
                label: device.label || `Camera ${index + 1}`
            }));
    }

    watchVideoDevices (callback) {
        const media = typeof navigator !== 'undefined' && navigator.mediaDevices;
        if (!media || typeof media.addEventListener !== 'function') return () => {};
        media.addEventListener('devicechange', callback);
        return () => media.removeEventListener('devicechange', callback);
    }

    /** Replace the shared stream with a selected built-in/UVC camera. This is
     * intentionally provider-owned: consumers never reach into _track, and the
     * preview plus every video extension continue to share one stream. */
    async selectVideoDevice ({deviceId, facingMode, width, height, frameRate} = {}) {
        const media = typeof navigator !== 'undefined' && navigator.mediaDevices;
        if (!media || typeof media.getUserMedia !== 'function') {
            throw new Error('camera selection is unavailable');
        }
        const constraints = {};
        if (deviceId) constraints.deviceId = {exact: deviceId};
        else if (facingMode) constraints.facingMode = {ideal: facingMode};
        if (Number(width) > 0) constraints.width = {ideal: Number(width)};
        if (Number(height) > 0) constraints.height = {ideal: Number(height)};
        if (Number(frameRate) > 0) constraints.frameRate = {ideal: Number(frameRate)};
        const stream = await media.getUserMedia({audio: false, video: constraints});
        const nextTrack = stream.getVideoTracks()[0];
        if (!nextTrack) throw new Error('selected camera returned no video track');
        const previous = this._track;
        this._track = nextTrack;
        this._singleSetup = Promise.resolve(this);
        if (!this._video) this._video = document.createElement('video');
        this._video.srcObject = stream;
        await this._video.play();
        if (previous && previous !== nextTrack) previous.stop();
        this.enabled = true;
        this._workspace = [];
        return this.cameraInfo();
    }

    cameraInfo () {
        if (!this._track) return {ready: false, settings: {}, capabilities: {}};
        return {
            ready: this.videoReady,
            settings: typeof this._track.getSettings === 'function' ? this._track.getSettings() : {},
            capabilities: typeof this._track.getCapabilities === 'function' ? this._track.getCapabilities() : {}
        };
    }

    async applyCameraSettings (settings) {
        if (!this._track || typeof this._track.applyConstraints !== 'function') {
            throw new Error('camera controls are unavailable');
        }
        const capabilities = typeof this._track.getCapabilities === 'function' ?
            this._track.getCapabilities() : {};
        const advanced = {};
        for (const key of ['zoom', 'focusDistance', 'exposureCompensation', 'torch']) {
            if (Object.prototype.hasOwnProperty.call(settings || {}, key) &&
                Object.prototype.hasOwnProperty.call(capabilities, key)) advanced[key] = settings[key];
        }
        if (!Object.keys(advanced).length) throw new Error('requested camera control is unsupported');
        await this._track.applyConstraints({advanced: [advanced]});
        return this.cameraInfo();
    }

    /**
     * Request video be enabled.  Sets up video, creates video skin and enables preview.
     *
     * @return {Promise.<Video>} resolves a promise to this video provider when video is ready.
     */
    enableVideo () {
        this.enabled = true;
        return this._setupVideo();
    }

    /**
     * Disable video stream (turn video off)
     */
    disableVideo () {
        this.enabled = false;
        // If we have begun a setup process, call _teardown after it completes
        if (this._singleSetup) {
            this._singleSetup
                .then(this._teardown.bind(this))
                .catch(err => this.onError(err));
        }
    }

    /**
     * async part of disableVideo
     * @private
     */
    _teardown () {
        // we might be asked to re-enable before _teardown is called, just ignore it.
        if (this.enabled === false) {
            const disableTrack = requestDisableVideo();
            this._singleSetup = null;
            // by clearing refs to video and track, we should lose our hold over the camera
            this._video = null;
            if (this._track && disableTrack) {
                this._track.stop();
            }
            this._track = null;
        }
    }

    /**
     * Return frame data from the video feed in a specified dimensions, format, and mirroring.
     *
     * @param {object} frameInfo A descriptor of the frame you would like to receive.
     * @param {Array.<number>} frameInfo.dimensions [width, height] array of numbers.  Defaults to [480,360]
     * @param {boolean} frameInfo.mirror If you specificly want a mirror/non-mirror frame, defaults to true
     * @param {string} frameInfo.format Requested video format, available formats are 'image-data' and 'canvas'.
     * @param {number} frameInfo.cacheTimeout Will reuse previous image data if the time since capture is less than
     *                                        the cacheTimeout.  Defaults to 16ms.
     *
     * @return {ArrayBuffer|Canvas|string|null} Frame data in requested format, null when errors.
     */
    getFrame ({
        dimensions = VideoProvider.DIMENSIONS,
        mirror = this.mirror,
        format = VideoProvider.FORMAT_IMAGE_DATA,
        cacheTimeout = this._frameCacheTimeout
    }) {
        if (!this.videoReady) {
            return null;
        }
        const [width, height] = dimensions;
        const workspace = this._getWorkspace({dimensions, mirror: Boolean(mirror)});
        const {videoWidth, videoHeight} = this._video;
        const {canvas, context, lastUpdate, cacheData} = workspace;
        const now = Date.now();

        // if the canvas hasn't been updated...
        if (lastUpdate + cacheTimeout < now) {

            if (mirror) {
                context.scale(-1, 1);
                context.translate(width * -1, 0);
            }

            context.drawImage(this._video,
                // source x, y, width, height
                0, 0, videoWidth, videoHeight,
                // dest x, y, width, height
                0, 0, width, height
            );

            // context.resetTransform() doesn't work on Edge but the following should
            context.setTransform(1, 0, 0, 1, 0, 0);
            workspace.lastUpdate = now;
        }

        // each data type has it's own data cache, but the canvas is the same
        if (!cacheData[format]) {
            cacheData[format] = {lastUpdate: 0};
        }
        const formatCache = cacheData[format];

        if (formatCache.lastUpdate + cacheTimeout < now) {
            if (format === VideoProvider.FORMAT_IMAGE_DATA) {
                formatCache.lastData = context.getImageData(0, 0, width, height);
            } else if (format === VideoProvider.FORMAT_CANVAS) {
                // this will never change
                formatCache.lastUpdate = Infinity;
                formatCache.lastData = canvas;
            } else {
                log.error(`video io error - unimplemented format ${format}`);
                // cache the null result forever, don't log about it again..
                formatCache.lastUpdate = Infinity;
                formatCache.lastData = null;
            }

            // rather than set to now, this data is as stale as it's canvas is
            formatCache.lastUpdate = Math.max(workspace.lastUpdate, formatCache.lastUpdate);
        }

        return formatCache.lastData;
    }

    /**
     * Method called when an error happens.  Default implementation is just to log error.
     *
     * @abstract
     * @param {Error} error An error object from getUserMedia or other source of error.
     */
    onError (error) {
        log.error('Unhandled video io device error', error);
    }

    /**
     * Create a video stream.
     * @private
     * @return {Promise} When video has been received, rejected if video is not received
     */
    _setupVideo () {
        // We cache the result of this setup so that we can only ever have a single
        // video/getUserMedia request happen at a time.
        if (this._singleSetup) {
            return this._singleSetup;
        }

        this._singleSetup = requestVideoStream({
            width: {min: 480, ideal: 640},
            height: {min: 360, ideal: 480}
        })
            .then(stream => {
                this._video = document.createElement('video');

                // Use the new srcObject API, falling back to createObjectURL
                try {
                    this._video.srcObject = stream;
                } catch (error) {
                    this._video.src = window.URL.createObjectURL(stream);
                }
                // Hint to the stream that it should load. A standard way to do this
                // is add the video tag to the DOM. Since this extension wants to
                // hide the video tag and instead render a sample of the stream into
                // the webgl rendered Scratch canvas, another hint like this one is
                // needed.
                this._video.play(); // Needed for Safari/Firefox, Chrome auto-plays.
                this._track = stream.getTracks()[0];
                return this;
            })
            .catch(error => {
                this._singleSetup = null;
                this.onError(error);
            });

        return this._singleSetup;
    }

    get videoReady () {
        if (!this.enabled) {
            return false;
        }
        if (!this._video) {
            return false;
        }
        if (!this._track) {
            return false;
        }
        const {videoWidth, videoHeight} = this._video;
        if (typeof videoWidth !== 'number' || typeof videoHeight !== 'number') {
            return false;
        }
        if (videoWidth === 0 || videoHeight === 0) {
            return false;
        }
        return true;
    }

    /**
     * get an internal workspace for canvas/context/caches
     * this uses some document stuff to create a canvas and what not, probably needs abstraction
     * into the renderer layer?
     * @private
     * @return {object} A workspace for canvas/data storage.  Internal format not documented intentionally
     */
    _getWorkspace ({dimensions, mirror}) {
        let workspace = this._workspace.find(space => (
            space.dimensions.join('-') === dimensions.join('-') &&
            space.mirror === mirror
        ));
        if (!workspace) {
            workspace = {
                dimensions,
                mirror,
                canvas: document.createElement('canvas'),
                lastUpdate: 0,
                cacheData: {}
            };
            workspace.canvas.width = dimensions[0];
            workspace.canvas.height = dimensions[1];
            workspace.context = workspace.canvas.getContext('2d');
            this._workspace.push(workspace);
        }
        return workspace;
    }
}

export default VideoProvider;
