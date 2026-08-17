const ArgumentType = require('../../../extension-support/argument-type');
const BlockType = require('../../../extension-support/block-type');

/**
 * Brickwright on-device Text-to-Speech — a drop-in for the cloud AWS `text2speech` extension.
 *
 * Two pluggable engines, no network to a TTS cloud:
 *   1. Web Speech API (`speechSynthesis`) — works today in every modern browser, uses the OS
 *      voices, offline. This is the default and the fallback.
 *   2. CrispASR WASM (github.com/CrispStrobe/CrispASR, MIT) — a fully client-side neural TTS
 *      (kokoro) compiled to WebAssembly, multithreaded via PROXY_TO_PTHREAD. Because scratch-vm
 *      runs on the main thread and the synth blocks, the WASM runs in a dedicated Web Worker
 *      (overlay/scratch-gui/static/tts/tts-worker.js) — the extension just posts text and gets a
 *      Float32Array (24 kHz mono) back. Switches on automatically once (a) a build + worker are
 *      hosted and configured, and (b) the page is cross-origin isolated (SharedArrayBuffer).
 *
 * To enable the CrispASR engine, host the emscripten build (built via
 * CrispASR/build-wasm.sh --proxy-to-pthread: libwhisper.js + libwhisper.wasm) next to the worker,
 * and set — before the editor loads (e.g. in index.html):
 *     window.BRICKWRIGHT_TTS = {
 *         workerURL:  '/tts/tts-worker.js',   // co-hosted with libwhisper.js/.wasm
 *         modelURL:   '/tts/kokoro.gguf',
 *         voices:     {en: '/tts/voice.gguf', de: '/tts/voice_de.gguf'},
 *         cmudictURL: '/tts/cmudict.dict',    // EN G2P (~3.5MB)
 *         deDicts:    {olaph: '/tts/olaph_de.txt', espeak: '/tts/espeak_de.tsv'}, // DE G2P
 *         sampleRate: 24000,
 *         threads:    4
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
        this._voiceURI = '';        // '' = auto-pick by language (Web Speech)
        this._worker = null;        // lazily-created CrispASR driver worker
        this._reqId = 0;            // request id for worker round-trips
        this._pending = new Map();  // id -> {resolve, reject}
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
        if (cfg && cfg.workerURL && typeof self !== 'undefined' && self.crossOriginIsolated) {
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

    // ---- engine 2: CrispASR WASM (kokoro) via a driver Web Worker ----
    _ensureWorker (cfg) {
        if (this._worker) return this._worker;
        const worker = new Worker(cfg.workerURL);
        worker.onmessage = (e) => {
            const d = e.data || {};
            if (d.id == null) return; // log/progress lines
            const req = this._pending.get(d.id);
            if (!req) return;
            this._pending.delete(d.id);
            if (d.error) req.reject(new Error(d.error));
            else req.resolve(d.pcm);
        };
        worker.onerror = (e) => {
            const err = new Error((e && e.message) || 'tts worker error');
            this._pending.forEach(req => req.reject(err));
            this._pending.clear();
        };
        this._worker = worker;
        return worker;
    }
    async _speakCrisp (text, cfg) {
        const worker = this._ensureWorker(cfg);
        const lang = this._language;
        const voices = cfg.voices || {};
        const voiceURL = voices[lang] || voices.en || null;
        const id = ++this._reqId;
        const pcm = await new Promise((resolve, reject) => {
            this._pending.set(id, {resolve, reject});
            worker.postMessage({
                id, text, lang,
                modelURL: cfg.modelURL,
                voiceURL,
                cmudictURL: cfg.cmudictURL,
                deDicts: cfg.deDicts,
                threads: cfg.threads || 4
            });
        });
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
