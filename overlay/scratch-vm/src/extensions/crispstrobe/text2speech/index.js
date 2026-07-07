const ArgumentType = require('../../../extension-support/argument-type');
const BlockType = require('../../../extension-support/block-type');

/**
 * Brickwright on-device Text-to-Speech — a drop-in for the cloud AWS `text2speech` extension.
 *
 * Two pluggable engines, no network to a TTS cloud:
 *   1. Web Speech API (`speechSynthesis`) — works today in every modern browser, uses the OS
 *      voices, offline. This is the default and the fallback.
 *   2. CrispASR WASM (github.com/CrispStrobe/CrispASR, MIT) — a fully client-side neural TTS
 *      (piper / kokoro) compiled to WebAssembly. Higher, consistent cross-platform quality. It is
 *      wired here per the CrispASR Embind API (`ttsOpen` / `ttsSynthesize` -> Float32Array @ 24kHz),
 *      and switches on automatically once (a) a build is hosted and its base URL is configured, and
 *      (b) the page is cross-origin isolated (SharedArrayBuffer — CrispASR's WASM is multithreaded).
 *
 * To enable the CrispASR engine, host the emscripten build + a model and set, before the editor
 * loads (e.g. in index.html):
 *     window.BRICKWRIGHT_TTS = {
 *         loaderURL: 'https://.../libwhisper.js',   // built via CrispASR/build-wasm.sh (has the TTS API)
 *         modelURL:  'https://.../piper-en_US.gguf', // piper: 30MB, MIT, built-in EN/DE/FR/ES G2P
 *         sampleRate: 24000
 *     };
 * The page must also be cross-origin isolated (COOP/COEP). On a static host without header control,
 * include CrispASR's examples/coi-serviceworker.js (it injects the headers + reloads). NOTE: enabling
 * cross-origin isolation affects cross-origin loads (our extension gallery) — use COEP credentialless.
 */

const LANGUAGES = [
    ['English', 'en'], ['Deutsch', 'de'], ['Español', 'es'], ['Français', 'fr'],
    ['Italiano', 'it'], ['Português', 'pt'], ['Nederlands', 'nl'], ['日本語', 'ja'], ['中文', 'zh']
];

class BrickwrightTTS {
    constructor (runtime) {
        this.runtime = runtime;
        this._language = 'en';
        this._voiceURI = '';        // '' = auto-pick by language
        this._crisp = null;         // lazily-created CrispASR engine promise
    }

    getInfo () {
        return {
            id: 'brickwrightTTS',
            name: 'Text to Speech',
            color1: '#0fbd8c',
            color2: '#0da57a',
            blocks: [
                {
                    opcode: 'speak',
                    blockType: BlockType.COMMAND,
                    text: 'speak [WORDS]',
                    arguments: {WORDS: {type: ArgumentType.STRING, defaultValue: 'hello'}}
                },
                {
                    opcode: 'setVoice',
                    blockType: BlockType.COMMAND,
                    text: 'set voice to [VOICE]',
                    arguments: {VOICE: {type: ArgumentType.STRING, menu: 'voices', defaultValue: 'default'}}
                },
                {
                    opcode: 'setLanguage',
                    blockType: BlockType.COMMAND,
                    text: 'set language to [LANGUAGE]',
                    arguments: {LANGUAGE: {type: ArgumentType.STRING, menu: 'languages', defaultValue: 'en'}}
                }
            ],
            menus: {
                languages: {acceptReporters: true, items: LANGUAGES.map(([text, value]) => ({text, value}))},
                voices: {acceptReporters: true, items: '_voiceMenu'}
            }
        };
    }

    // ---- blocks ----
    setLanguage (args) {
        const v = String(args.LANGUAGE);
        if (LANGUAGES.some(l => l[1] === v)) this._language = v;
    }
    setVoice (args) {
        this._voiceURI = String(args.VOICE) === 'default' ? '' : String(args.VOICE);
    }
    speak (args) {
        const text = String(args.WORDS);
        if (!text.trim()) return Promise.resolve();
        const cfg = (typeof window !== 'undefined' && window.BRICKWRIGHT_TTS) || null;
        if (cfg && cfg.loaderURL && typeof self !== 'undefined' && self.crossOriginIsolated) {
            return this._speakCrisp(text, cfg).catch(() => this._speakWebSpeech(text));
        }
        return this._speakWebSpeech(text);
    }

    // ---- dynamic voice menu (Web Speech voices for the current language) ----
    _voiceMenu () {
        const voices = (typeof speechSynthesis !== 'undefined' && speechSynthesis.getVoices()) || [];
        const items = [{text: 'default', value: 'default'}];
        voices
            .filter(v => !this._language || v.lang.toLowerCase().startsWith(this._language))
            .forEach(v => items.push({text: v.name, value: v.voiceURI}));
        return items;
    }

    // ---- engine 1: Web Speech API ----
    _speakWebSpeech (text) {
        return new Promise(resolve => {
            if (typeof speechSynthesis === 'undefined') { resolve(); return; }
            speechSynthesis.cancel();
            const utter = new SpeechSynthesisUtterance(text);
            utter.lang = this._language;
            if (this._voiceURI) {
                const match = speechSynthesis.getVoices().find(v => v.voiceURI === this._voiceURI);
                if (match) utter.voice = match;
            }
            utter.onend = () => resolve();
            utter.onerror = () => resolve();
            speechSynthesis.speak(utter);
        });
    }

    // ---- engine 2: CrispASR WASM (piper/kokoro) ----
    _ensureCrisp (cfg) {
        if (this._crisp) return this._crisp;
        this._crisp = (async () => {
            // load the emscripten loader (has the Embind TTS API), then the model into the FS.
            // `new Function` hides the dynamic import from webpack's static analysis so it stays a
            // real runtime import of the hosted URL (not a build-time module resolution).
            const dynImport = new Function('u', 'return import(u);');
            const factory = await dynImport(cfg.loaderURL).then(m => m.default || m);
            const Module = await factory();
            const modelBytes = new Uint8Array(await (await fetch(cfg.modelURL)).arrayBuffer());
            try { Module.FS.mkdirTree('/models'); } catch (e) { /* exists */ }
            Module.FS.writeFile('/models/tts.gguf', modelBytes);
            if (cfg.voiceURL) {
                const vb = new Uint8Array(await (await fetch(cfg.voiceURL)).arrayBuffer());
                Module.FS.writeFile('/models/voice.gguf', vb);
            }
            if (!Module.ttsOpen('/models/tts.gguf', 1)) throw new Error('CrispASR ttsOpen failed');
            if (cfg.voiceURL && Module.ttsSetVoice) Module.ttsSetVoice('/models/voice.gguf', '');
            return Module;
        })();
        return this._crisp;
    }
    async _speakCrisp (text, cfg) {
        const Module = await this._ensureCrisp(cfg);
        if (Module.sessionSetSourceLanguage) Module.sessionSetSourceLanguage(this._language);
        const pcm = Module.ttsSynthesize(text); // Float32Array, 24kHz mono
        if (!pcm || !pcm.length) throw new Error('CrispASR synthesis returned no audio');
        await this._playPCM(pcm, cfg.sampleRate || 24000);
    }
    _playPCM (pcm, sampleRate) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = this._audioCtx || (this._audioCtx = new AudioCtx());
        const buffer = ctx.createBuffer(1, pcm.length, sampleRate);
        buffer.getChannelData(0).set(pcm);
        return new Promise(resolve => {
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.connect(ctx.destination);
            src.onended = () => resolve();
            (ctx.state === 'running' ? Promise.resolve() : ctx.resume().catch(() => {})).then(() => src.start());
        });
    }
}

module.exports = BrickwrightTTS;
