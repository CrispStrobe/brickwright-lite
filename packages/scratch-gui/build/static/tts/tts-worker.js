// Brickwright on-device TTS worker — CrispASR WASM (kokoro), multithreaded via PROXY_TO_PTHREAD.
//
// Why a worker: scratch-vm runs on the main thread; the CrispASR WASM is multithreaded and its
// synth blocks, so it must run off-thread. This file is the driver Web Worker. Two rules that avoid
// the classic Emscripten-in-a-worker deadlock:
//   1. Pthread-pool workers (self.name === 'em-pthread') do ONLY importScripts(loader) — nothing else.
//   2. Instantiate the module at TOP LEVEL, never inside onmessage.
// The loader (libwhisper.js) + this file + libwhisper.wasm MUST be co-hosted (relative import below).
// URLs for the model / voice / G2P dicts are passed in per-message by the extension.
'use strict';
const LOADER = './libwhisper.js'; // co-hosted with this worker

if (self.name === 'em-pthread') {
    importScripts(LOADER); // pthread bootstrap only
} else {
    main();
}

function main () {
    importScripts(LOADER); // defines global `whisper_factory`

    let M = null, opened = false, loadedVoice = null, deDict = false;
    const G2P_DIR = 'home/web_user/.cache/crispasr'; // kokoro G2P reads $HOME/.cache/crispasr
    const post = (m, t) => self.postMessage(m, t || []);
    const fetchU = async (u) => {
        const r = await fetch(u);
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
        return new Uint8Array(await r.arrayBuffer());
    };
    const writeAt = (dir, name, bytes) => {
        try { M.FS_createPath('/', dir, true, true); } catch (e) { /* exists */ }
        M.FS_createDataFile('/' + dir, name, bytes, true, true);
    };

    // INSTANTIATE AT TOP LEVEL — the key to multithreaded not deadlocking on bootstrap.
    const ready = whisper_factory({
        print: m => post({ log: m }),
        printErr: m => post({ log: m })
    }).then(m => { M = m; post({ log: 'module ready' }); });

    self.onmessage = async (e) => {
        const { id, text, lang, modelURL, voiceURL, cmudictURL, deDicts, threads } = e.data || {};
        try {
            await ready;
            if (!opened) {
                post({ log: 'loading model…' });
                if (cmudictURL) writeAt(G2P_DIR, 'cmudict.dict', await fetchU(cmudictURL));
                writeAt('models', 'tts.gguf', await fetchU(modelURL));
                // PROXY_TO_PTHREAD build → real multithread from the worker.
                if (!M.ttsOpenExplicit('/models/tts.gguf', 'kokoro', threads || 4)) {
                    throw new Error('ttsOpenExplicit failed');
                }
                opened = true;
            }
            if (lang === 'de' && !deDict && deDicts) {
                try {
                    if (deDicts.olaph)  writeAt(G2P_DIR, 'olaph_de.txt',  await fetchU(deDicts.olaph));
                    if (deDicts.espeak) writeAt(G2P_DIR, 'espeak_de.tsv', await fetchU(deDicts.espeak));
                    deDict = true;
                } catch (err) { /* best effort — EN still works */ }
            }
            if (voiceURL && loadedVoice !== voiceURL) {
                writeAt('models', 'voice.gguf', await fetchU(voiceURL));
                M.ttsSetVoice('/models/voice.gguf', '');
                loadedVoice = voiceURL;
            }
            if (M.sessionSetSourceLanguage && lang) M.sessionSetSourceLanguage(lang);
            post({ log: 'synthesizing…' });
            // Async: enqueue compute onto the proxied pthread; the worker never blocks.
            const pcm = M.ttsSynthesizeAsync
                ? await new Promise((resolve) => M.ttsSynthesizeAsync(text, resolve))
                : M.ttsSynthesize(text);
            if (!pcm || !pcm.length) { post({ id, error: 'synthesis returned no audio' }); return; }
            const out = new Float32Array(pcm);
            post({ id, pcm: out }, [out.buffer]);
        } catch (err) {
            post({ id, error: (err && err.message) || String(err) });
        }
    };

    post({ log: 'worker started' });
}
