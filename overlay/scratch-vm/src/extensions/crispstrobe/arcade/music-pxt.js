// Generated from PXT Arcade 4.2.1, pxt-common-packages (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// music.ts: 51451e725454ef628dc5a8bb17b4c90242047af377756a2049007e8cd3cb47e0
// melody.ts: 37274d8ea8a50850d17c122351d777c0aea2ce85c8453a1573ee31a191886b7f
// playable.ts: 29c1b161d2db8904e520862baa052084149346722979ce587969663c5bfc68a1
// legacy.ts: 9c91a0eeb36f18e6d66c8974923fe81205f2f32066f172b84c9267920c0b2380
// soundEffect.ts: d82da998cb123d6abc1eae503cdb58c597e0771d70c7c0eb02edd02a383527f3
// Pausing functions lowered to generators: .play, .playUntilDone, pause, play, playMelody, playSound, playSoundEffect, playSoundUntilDone, playTone, rest, ringTone
// Regenerate: node scripts/generate-arcade-music.mjs
module.exports = function initializePxtMusic(host) {
const {control, hex, NumberFormat, DAL} = host;
const pause = host.pause;
const __shim = (name, args) => host.shims[name](...args);
const Math = Object.create(globalThis.Math);
Math.idiv = (a, b) => (a / b) | 0;
Math.clamp = (low, high, value) => Math.min(high, Math.max(low, value));
const sequencer = {_stopAllSongs() {}};
const __removeElement = (array, element) => { const index = array ? array.indexOf(element) : -1; if (index >= 0) array.splice(index, 1); return index >= 0; };
var Note;
(function (Note) {
    //% blockIdentity=music.noteFrequency enumval=262
    Note[Note["C"] = 262] = "C";
    //% block=C#
    //% blockIdentity=music.noteFrequency enumval=277
    Note[Note["CSharp"] = 277] = "CSharp";
    //% blockIdentity=music.noteFrequency enumval=294
    Note[Note["D"] = 294] = "D";
    //% blockIdentity=music.noteFrequency enumval=311
    Note[Note["Eb"] = 311] = "Eb";
    //% blockIdentity=music.noteFrequency enumval=330
    Note[Note["E"] = 330] = "E";
    //% blockIdentity=music.noteFrequency enumval=349
    Note[Note["F"] = 349] = "F";
    //% block=F#
    //% blockIdentity=music.noteFrequency enumval=370
    Note[Note["FSharp"] = 370] = "FSharp";
    //% blockIdentity=music.noteFrequency enumval=392
    Note[Note["G"] = 392] = "G";
    //% block=G#
    //% blockIdentity=music.noteFrequency enumval=415
    Note[Note["GSharp"] = 415] = "GSharp";
    //% blockIdentity=music.noteFrequency enumval=440
    Note[Note["A"] = 440] = "A";
    //% blockIdentity=music.noteFrequency enumval=466
    Note[Note["Bb"] = 466] = "Bb";
    //% blockIdentity=music.noteFrequency enumval=494
    Note[Note["B"] = 494] = "B";
    //% blockIdentity=music.noteFrequency enumval=131
    Note[Note["C3"] = 131] = "C3";
    //% block=C#3
    //% blockIdentity=music.noteFrequency enumval=139
    Note[Note["CSharp3"] = 139] = "CSharp3";
    //% blockIdentity=music.noteFrequency enumval=147
    Note[Note["D3"] = 147] = "D3";
    //% blockIdentity=music.noteFrequency enumval=156
    Note[Note["Eb3"] = 156] = "Eb3";
    //% blockIdentity=music.noteFrequency enumval=165
    Note[Note["E3"] = 165] = "E3";
    //% blockIdentity=music.noteFrequency enumval=175
    Note[Note["F3"] = 175] = "F3";
    //% block=F#3
    //% blockIdentity=music.noteFrequency enumval=185
    Note[Note["FSharp3"] = 185] = "FSharp3";
    //% blockIdentity=music.noteFrequency enumval=196
    Note[Note["G3"] = 196] = "G3";
    //% block=G#3
    //% blockIdentity=music.noteFrequency enumval=208
    Note[Note["GSharp3"] = 208] = "GSharp3";
    //% blockIdentity=music.noteFrequency enumval=220
    Note[Note["A3"] = 220] = "A3";
    //% blockIdentity=music.noteFrequency enumval=233
    Note[Note["Bb3"] = 233] = "Bb3";
    //% blockIdentity=music.noteFrequency enumval=247
    Note[Note["B3"] = 247] = "B3";
    //% blockIdentity=music.noteFrequency enumval=262
    Note[Note["C4"] = 262] = "C4";
    //% block=C#4
    //% blockIdentity=music.noteFrequency enumval=277
    Note[Note["CSharp4"] = 277] = "CSharp4";
    //% blockIdentity=music.noteFrequency enumval=294
    Note[Note["D4"] = 294] = "D4";
    //% blockIdentity=music.noteFrequency enumval=311
    Note[Note["Eb4"] = 311] = "Eb4";
    //% blockIdentity=music.noteFrequency enumval=330
    Note[Note["E4"] = 330] = "E4";
    //% blockIdentity=music.noteFrequency enumval=349
    Note[Note["F4"] = 349] = "F4";
    //% block=F#4
    //% blockIdentity=music.noteFrequency enumval=370
    Note[Note["FSharp4"] = 370] = "FSharp4";
    //% blockIdentity=music.noteFrequency enumval=392
    Note[Note["G4"] = 392] = "G4";
    //% block=G#4
    //% blockIdentity=music.noteFrequency enumval=415
    Note[Note["GSharp4"] = 415] = "GSharp4";
    //% blockIdentity=music.noteFrequency enumval=440
    Note[Note["A4"] = 440] = "A4";
    //% blockIdentity=music.noteFrequency enumval=466
    Note[Note["Bb4"] = 466] = "Bb4";
    //% blockIdentity=music.noteFrequency enumval=494
    Note[Note["B4"] = 494] = "B4";
    //% blockIdentity=music.noteFrequency enumval=523
    Note[Note["C5"] = 523] = "C5";
    //% block=C#5
    //% blockIdentity=music.noteFrequency enumval=555
    Note[Note["CSharp5"] = 555] = "CSharp5";
    //% blockIdentity=music.noteFrequency enumval=587
    Note[Note["D5"] = 587] = "D5";
    //% blockIdentity=music.noteFrequency enumval=622
    Note[Note["Eb5"] = 622] = "Eb5";
    //% blockIdentity=music.noteFrequency enumval=659
    Note[Note["E5"] = 659] = "E5";
    //% blockIdentity=music.noteFrequency enumval=698
    Note[Note["F5"] = 698] = "F5";
    //% block=F#5
    //% blockIdentity=music.noteFrequency enumval=740
    Note[Note["FSharp5"] = 740] = "FSharp5";
    //% blockIdentity=music.noteFrequency enumval=784
    Note[Note["G5"] = 784] = "G5";
    //% block=G#5
    //% blockIdentity=music.noteFrequency enumval=831
    Note[Note["GSharp5"] = 831] = "GSharp5";
    //% blockIdentity=music.noteFrequency enumval=880
    Note[Note["A5"] = 880] = "A5";
    //% blockIdentity=music.noteFrequency enumval=932
    Note[Note["Bb5"] = 932] = "Bb5";
    //% blockIdentity=music.noteFrequency enumval=988
    Note[Note["B5"] = 988] = "B5";
})(Note || (Note = {}));
var BeatFraction;
(function (BeatFraction) {
    //% block=1
    BeatFraction[BeatFraction["Whole"] = 1] = "Whole";
    //% block="1/2"
    BeatFraction[BeatFraction["Half"] = 2] = "Half";
    //% block="1/4"
    BeatFraction[BeatFraction["Quarter"] = 4] = "Quarter";
    //% block="1/8"
    BeatFraction[BeatFraction["Eighth"] = 8] = "Eighth";
    //% block="1/16"
    BeatFraction[BeatFraction["Sixteenth"] = 16] = "Sixteenth";
    //% block="2"
    BeatFraction[BeatFraction["Double"] = 32] = "Double";
    //% block="4",
    BeatFraction[BeatFraction["Breve"] = 64] = "Breve";
    //% block="1/3",
    BeatFraction[BeatFraction["Triplet"] = 128] = "Triplet";
})(BeatFraction || (BeatFraction = {}));
var music;
(function (music) {
    let beatsPerMinute;
    /**
    * Play a tone.
    * @param frequency pitch of the tone to play in Hertz (Hz), eg: Note.C
    */
    //% help=music/ring-tone
    //% blockId=music_ring block="ring tone|at %note=device_note"
    //% parts="headphone" trackArgs=0
    //% blockNamespace=music inBasicCategory=true
    //% weight=75 blockGap=8
    //% group="Tone"
    function* ringTone(frequency) {
        (yield* music.playTone(frequency, 0));
    }
    music.ringTone = ringTone;
    /**
    * Rest, or play silence, for some time (in milliseconds).
    * @param ms rest duration in milliseconds (ms), eg: BeatFraction.Half
    */
    //% help=music/rest
    //% blockId=music_rest block="rest|for %duration=device_beat"
    //% parts="headphone" trackArgs=0
    //% blockNamespace=music
    //% weight=74
    //% group="Tone"
    function* rest(ms) {
        (yield* music.playTone(0, Math.max(ms, 20)));
    }
    music.rest = rest;
    function init() {
        if (!beatsPerMinute)
            beatsPerMinute = 120;
    }
    /**
     * Return the duration of a beat in milliseconds (the beat fraction).
     * @param fraction the fraction of the current whole note, eg: BeatFraction.Half
     */
    //% help=music/beat
    //% blockId=device_beat block="%fraction|beat"
    //% weight=9 blockGap=8
    //% group="Tempo"
    function beat(fraction) {
        init();
        if (fraction == null)
            fraction = BeatFraction.Whole;
        let beat = 60000 / beatsPerMinute;
        switch (fraction) {
            case BeatFraction.Half:
                beat /= 2;
                break;
            case BeatFraction.Quarter:
                beat /= 4;
                break;
            case BeatFraction.Eighth:
                beat /= 8;
                break;
            case BeatFraction.Sixteenth:
                beat /= 16;
                break;
            case BeatFraction.Double:
                beat *= 2;
                break;
            case BeatFraction.Breve:
                beat *= 4;
                break;
            case BeatFraction.Triplet:
                beat /= 3;
                break;
        }
        return beat >> 0;
    }
    music.beat = beat;
    /**
     * Return the tempo in beats per minute (bpm).
     * Tempo is the speed (bpm = beats per minute) at which notes play. The larger the tempo value, the faster the notes will play.
     */
    //% help=music/tempo
    //% blockId=device_tempo block="tempo (bpm)"
    //% weight=64
    //% group="Tempo"
    function tempo() {
        init();
        return beatsPerMinute;
    }
    music.tempo = tempo;
    /**
     * Change the tempo up or down by some amount of beats per minute (bpm).
     * @param bpm The change in beats per minute to the tempo, eg: 20
     */
    //% help=music/change-tempo-by weight=37
    //% blockId=device_change_tempo block="change tempo by %value|(bpm)"
    //% weight=66 blockGap=8
    //% group="Tempo"
    function changeTempoBy(bpm) {
        init();
        setTempo(beatsPerMinute + bpm);
    }
    music.changeTempoBy = changeTempoBy;
    /**
     * Set the tempo a number of beats per minute (bpm).
     * @param bpm The new tempo in beats per minute, eg: 120
     */
    //% help=music/set-tempo
    //% blockId=device_set_tempo block="set tempo to %value|(bpm)"
    //% bpm.min=4 bpm.max=400
    //% weight=65 blockGap=8
    //% group="Tempo"
    function setTempo(bpm) {
        init();
        if (bpm > 0) {
            beatsPerMinute = Math.max(1, bpm >> 0);
        }
    }
    music.setTempo = setTempo;
})(music || (music = {}));
var MusicOutput;
(function (MusicOutput) {
    MusicOutput[MusicOutput["AutoDetect"] = 0] = "AutoDetect";
    MusicOutput[MusicOutput["Buzzer"] = 1] = "Buzzer";
    MusicOutput[MusicOutput["HeadPhones"] = 2] = "HeadPhones";
})(MusicOutput || (MusicOutput = {}));
(function (music) {
    //% whenUsed
    const freqs = hex `
        1f00210023002500270029002c002e003100340037003a003e004100450049004e00520057005c00620068006e00
        75007b0083008b0093009c00a500af00b900c400d000dc00e900f70006011501260137014a015d01720188019f01
        b801d201ee010b022a024b026e029302ba02e40210033f037003a403dc03170455049704dd0427057505c8052006
        7d06e0064907b8072d08a9082d09b9094d0aea0a900b400cfa0cc00d910e6f0f5a1053115b1272139a14d4152017
        8018f519801b231dde1e`;
    //% shim=music::queuePlayInstructions
    function queuePlayInstructions(timeDelta, buf) { return __shim("queuePlayInstructions", [timeDelta, buf]); }
    //% shim=music::stopPlaying
    function stopPlaying() { return __shim("stopPlaying", []); }
    //% shim=music::forceOutput
    function forceOutput(buf) { return __shim("forceOutput", [buf]); }
    music.forceOutput = forceOutput;
    let globalVolume = null;
    const BUFFER_SIZE = 12;
    //% shim=music::enableAmp
    function enableAmp(en) { return __shim("enableAmp", [en]); }
    function initVolume() {
        if (globalVolume === null) {
            globalVolume = 0;
            setVolume(control.getConfigValue(DAL.CFG_SPEAKER_VOLUME, 128));
        }
    }
    /**
     * Set the default output volume of the sound synthesizer.
     * @param volume the volume 0...255
     */
    //% blockId=synth_set_volume block="set volume %volume"
    //% parts="speaker"
    //% volume.min=0 volume.max=255
    //% volume.defl=20
    //% help=music/set-volume
    //% weight=70
    //% group="Volume"
    function setVolume(volume) {
        globalVolume = Math.clamp(0, 255, volume | 0);
        enableAmp(globalVolume > 0 ? 1 : 0);
    }
    music.setVolume = setVolume;
    /**
     * Gets the current volume
     */
    //% parts="speaker"
    //% weight=70
    function volume() {
        initVolume();
        return globalVolume;
    }
    music.volume = volume;
    function playNoteCore(when, frequency, ms) {
        let buf = control.createBuffer(BUFFER_SIZE);
        addNote(buf, 0, ms, 255, 255, 3, frequency, volume(), frequency);
        queuePlayInstructions(when, buf);
    }
    /**
     * Play a tone through the speaker for some amount of time.
     * @param frequency pitch of the tone to play in Hertz (Hz), eg: Note.C
     * @param ms tone duration in milliseconds (ms), eg: BeatFraction.Half
     */
    //% help=music/play-tone
    //% blockId=mixer_play_note block="play tone|at %note=device_note|for %duration=device_beat"
    //% parts="headphone" async
    //% blockNamespace=music
    //% weight=76 blockGap=8
    //% group="Tone"
    //% deprecated=1
    function* playTone(frequency, ms) {
        if (ms == 0)
            ms = 86400000; // 1 day
        if (ms <= 2000) {
            playNoteCore(0, frequency, ms);
            (yield* pause(ms));
        }
        else {
            const id = ++playToneID;
            control.runInParallel((function* () {
                let pos = control.millis();
                while (id == playToneID && ms > 0) {
                    let now = control.millis();
                    let d = pos - now;
                    let t = Math.min(ms, 500);
                    ms -= t;
                    pos += t;
                    playNoteCore(d - 1, frequency, t);
                    if (ms == 0)
                        (yield* pause(d + t));
                    else
                        (yield* pause(d + t - 100));
                }
            }).bind(this));
        }
    }
    music.playTone = playTone;
    let playToneID = 0;
    /**
     * Play a melody from the melody editor.
     * @param melody - string of up to eight notes [C D E F G A B C5] or rests [-] separated by spaces,
     * which will be played one at a time, ex: "E D G F B A C5 B "
     * @param tempo - number in beats per minute (bpm), dictating how long each note will play for
     */
    //% block="play melody $melody at tempo $tempo|(bpm)" blockId=playMelody
    //% blockNamespace=music
    //% weight=85 blockGap=8 help=music/play-melody
    //% group="Melody"
    //% melody.shadow="melody_editor"
    //% tempo.min=40 tempo.max=500
    //% tempo.defl=120
    //% deprecated=1
    function* playMelody(melody, tempo) {
        let notes = melody.split(" ").filter(n => !!n);
        let formattedMelody = "";
        let newOctave = false;
        // build melody string, replace '-' with 'R' and add tempo
        // creates format like "C5-174 B4 A G F E D C "
        for (let i = 0; i < notes.length; i++) {
            if (notes[i] === "-") {
                notes[i] = "R";
            }
            else if (notes[i] === "C5") {
                newOctave = true;
            }
            else if (newOctave) { // change the octave if necesary
                notes[i] += "4";
                newOctave = false;
            }
            // add tempo after first note
            if (i == 0) {
                formattedMelody += notes[i] + "-" + tempo + " ";
            }
            else {
                formattedMelody += notes[i] + " ";
            }
        }
        const song = new Melody(formattedMelody);
        (yield* song.playUntilDone());
    }
    music.playMelody = playMelody;
    /**
     * Create a melody with the melody editor.
     * @param melody
     */
    //% block="$melody" blockId=melody_editor
    //% blockNamespace=music
    //% blockHidden = true
    //% weight=85 blockGap=8
    //% help=music/melody-editor
    //% group="Melody" duplicateShadowOnDrag
    //% melody.fieldEditor="melody"
    //% melody.fieldOptions.decompileLiterals=true
    //% melody.fieldOptions.decompileIndirectFixedInstances="true"
    //% melody.fieldOptions.onParentBlock="true"
    //% shim=TD_ID
    function melodyEditor(melody) {
        return melody;
    }
    music.melodyEditor = melodyEditor;
    /**
     * Stop all sounds from playing.
     */
    //% help=music/stop-all-sounds
    //% blockId=music_stop_all_sounds block="stop all sounds"
    //% weight=45
    //% group="Sounds"
    function stopAllSounds() {
        Melody.stopAll();
        stopPlaying();
        music._stopPlayables();
        sequencer._stopAllSongs();
    }
    music.stopAllSounds = stopAllSounds;
    //% fixedInstances
    class Melody {
        static stopAll() {
            if (Melody.playingMelodies) {
                const ms = Melody.playingMelodies.slice(0, Melody.playingMelodies.length);
                ms.forEach(p => p.stop());
            }
        }
        constructor(text) {
            this._text = text;
        }
        get text() {
            return this._text;
        }
        /**
         * Stop playing a sound
         */
        //% blockId=mixer_stop block="stop sound %sound"
        //% help=music/melody/stop
        //% parts="headphone"
        //% weight=92 blockGap=8
        //% group="Sounds"
        //% deprecated=1
        stop() {
            if (this._player) {
                this._player.stop();
                this._player = null;
            }
            this.unregisterMelody();
        }
        registerMelody() {
            // keep track of the active players
            if (!Melody.playingMelodies)
                Melody.playingMelodies = [];
            // stop and pop melodies if too many playing
            if (Melody.playingMelodies.length > 4) {
                // stop last player (also pops)
                Melody.playingMelodies[Melody.playingMelodies.length - 1].stop();
            }
            // put back the melody on top of the melody stack
            __removeElement(Melody.playingMelodies, this);
            Melody.playingMelodies.push(this);
        }
        unregisterMelody() {
            // remove from list
            if (Melody.playingMelodies) {
                __removeElement(Melody.playingMelodies, this); // remove self
            }
        }
        playCore(volume, loop) {
            this.stop();
            const p = this._player = new MelodyPlayer(this);
            this.registerMelody();
            control.runInParallel((function* () {
                while (this._player == p) {
                    (yield* p.play(volume));
                    if (!loop) {
                        // Unregister the melody when done playing, but
                        // only if it hasn't been restarted. (Looping
                        // melodies never stop on their own, they only
                        // get unregistered via stop().)
                        if (this._player == p) {
                            this.unregisterMelody();
                        }
                        break;
                    }
                }
            }).bind(this));
        }
        /**
         * Start playing a sound in a loop and don't wait for it to finish.
         * @param sound the melody to play
         */
        //% help=music/melody/loop
        //% blockId=mixer_loop_sound block="loop sound %sound"
        //% parts="headphone"
        //% weight=93 blockGap=8
        //% group="Sounds"
        //% deprecated=1
        loop(volume = 255) {
            this.playCore(volume, true);
        }
        /**
         * Start playing a sound and don't wait for it to finish.
         * @param sound the melody to play
         */
        //% help=music/melody/play
        //% blockId=mixer_play_sound block="play sound %sound"
        //% parts="headphone"
        //% weight=95 blockGap=8
        //% group="Sounds"
        //% deprecated=1
        *play(volume = 255) {
            this.playCore(volume, false);
        }
        /**
         * Play a sound and wait until the sound is done.
         * @param sound the melody to play
         */
        //% help=music/melody/play-until-done
        //% blockId=mixer_play_sound_until_done block="play sound %sound|until done"
        //% parts="headphone"
        //% weight=94 blockGap=8
        //% group="Sounds"
        //% deprecated=1
        *playUntilDone(volume = 255) {
            this.stop();
            const p = this._player = new MelodyPlayer(this);
            this._player.onPlayFinished = () => {
                if (p == this._player)
                    this.unregisterMelody();
            };
            this.registerMelody();
            (yield* this._player.play(volume));
        }
        toString() {
            return this._text;
        }
    }
    music.Melody = Melody;
    function addNote(sndInstr, sndInstrPtr, ms, beg, end, soundWave, hz, volume, endHz) {
        if (ms > 0) {
            sndInstr.setNumber(NumberFormat.UInt8LE, sndInstrPtr, soundWave);
            sndInstr.setNumber(NumberFormat.UInt8LE, sndInstrPtr + 1, 0);
            sndInstr.setNumber(NumberFormat.UInt16LE, sndInstrPtr + 2, hz);
            sndInstr.setNumber(NumberFormat.UInt16LE, sndInstrPtr + 4, ms);
            sndInstr.setNumber(NumberFormat.UInt16LE, sndInstrPtr + 6, (beg * volume) >> 6);
            sndInstr.setNumber(NumberFormat.UInt16LE, sndInstrPtr + 8, (end * volume) >> 6);
            sndInstr.setNumber(NumberFormat.UInt16LE, sndInstrPtr + 10, endHz);
            sndInstrPtr += BUFFER_SIZE;
        }
        sndInstr.setNumber(NumberFormat.UInt8LE, sndInstrPtr, 0); // terminate
        return sndInstrPtr;
    }
    music.addNote = addNote;
    class MelodyPlayer {
        constructor(m) {
            this.melody = m;
        }
        stop() {
            this.melody = null;
        }
        queuePlayInstructions(timeDelta, buf) {
            queuePlayInstructions(timeDelta, buf);
        }
        *play(volume) {
            if (!this.melody)
                return;
            volume = Math.clamp(0, 255, (volume * music.volume()) >> 8);
            let notes = this.melody._text;
            let pos = 0;
            let duration = 4; //Default duration (Crotchet)
            let octave = 4; //Middle octave
            let tempo = 120; // default tempo
            let hz = 0;
            let endHz = -1;
            let ms = 0;
            let timePos = 0;
            let startTime = control.millis();
            let now = 0;
            let envA = 0;
            let envD = 0;
            let envS = 255;
            let envR = 0;
            let soundWave = 1; // triangle
            let sndInstr = control.createBuffer(5 * BUFFER_SIZE);
            let sndInstrPtr = 0;
            const addForm = (formDuration, beg, end, msOff) => {
                let freqStart = hz;
                let freqEnd = endHz;
                const envelopeWidth = ms > 0 ? ms : duration * Math.idiv(15000, tempo) + envR;
                if (endHz != hz && envelopeWidth != 0) {
                    const slope = (freqEnd - freqStart) / envelopeWidth;
                    freqStart = hz + slope * msOff;
                    freqEnd = hz + slope * (msOff + formDuration);
                }
                sndInstrPtr = addNote(sndInstr, sndInstrPtr, formDuration, beg, end, soundWave, freqStart, volume, freqEnd);
            };
            const scanNextWord = () => {
                if (!this.melody)
                    return "";
                // eat space
                while (pos < notes.length) {
                    const c = notes[pos];
                    if (c != ' ' && c != '\r' && c != '\n' && c != '\t')
                        break;
                    pos++;
                }
                // read note
                let note = "";
                while (pos < notes.length) {
                    const c = notes[pos];
                    if (c == ' ' || c == '\r' || c == '\n' || c == '\t')
                        break;
                    note += c;
                    pos++;
                }
                return note;
            };
            let Token;
            (function (Token) {
                Token[Token["Note"] = 0] = "Note";
                Token[Token["Octave"] = 1] = "Octave";
                Token[Token["Beat"] = 2] = "Beat";
                Token[Token["Tempo"] = 3] = "Tempo";
                Token[Token["Hz"] = 4] = "Hz";
                Token[Token["EndHz"] = 5] = "EndHz";
                Token[Token["Ms"] = 6] = "Ms";
                Token[Token["WaveForm"] = 7] = "WaveForm";
                Token[Token["EnvelopeA"] = 8] = "EnvelopeA";
                Token[Token["EnvelopeD"] = 9] = "EnvelopeD";
                Token[Token["EnvelopeS"] = 10] = "EnvelopeS";
                Token[Token["EnvelopeR"] = 11] = "EnvelopeR";
            })(Token || (Token = {}));
            let token = "";
            let tokenKind = Token.Note;
            // [ABCDEFG] (\d+)  (:\d+)  (-\d+)
            // note      octave length  tempo
            // R (:\d+) - rest
            // !\d+,\d+ - sound at frequency with given length (Hz,ms); !\d+ and !\d+,:\d+ also possible
            // @\d+,\d+,\d+,\d+ - ADSR envelope - ms,ms,volume,ms; volume is 0-255
            // ~\d+ - wave form:
            //   1 - triangle
            //   2 - sawtooth
            //   3 - sine
            //   4 - pseudorandom square wave noise (tunable)
            //   5 - white noise (ignores frequency)
            //   11 - square 10%
            //   12 - square 20%
            //   ...
            //   15 - square 50%
            //   16 - filtered square wave, cycle length 16
            //   17 - filtered square wave, cycle length 32
            //   18 - filtered square wave, cycle length 64
            const consumeToken = () => {
                if (token && tokenKind != Token.Note) {
                    const d = parseInt(token);
                    switch (tokenKind) {
                        case Token.Octave:
                            octave = d;
                            break;
                        case Token.Beat:
                            duration = Math.max(1, Math.min(16, d));
                            ms = -1;
                            break;
                        case Token.Tempo:
                            tempo = Math.max(1, d);
                            break;
                        case Token.Hz:
                            hz = d;
                            tokenKind = Token.Ms;
                            break;
                        case Token.Ms:
                            ms = d;
                            break;
                        case Token.WaveForm:
                            soundWave = Math.clamp(1, 18, d);
                            break;
                        case Token.EnvelopeA:
                            envA = d;
                            tokenKind = Token.EnvelopeD;
                            break;
                        case Token.EnvelopeD:
                            envD = d;
                            tokenKind = Token.EnvelopeS;
                            break;
                        case Token.EnvelopeS:
                            envS = Math.clamp(0, 255, d);
                            tokenKind = Token.EnvelopeR;
                            break;
                        case Token.EnvelopeR:
                            envR = d;
                            break;
                        case Token.EndHz:
                            endHz = d;
                            break;
                    }
                    token = "";
                }
            };
            while (true) {
                let currNote = scanNextWord();
                let prevNote = false;
                if (!currNote) {
                    let timeLeft = timePos - now;
                    if (timeLeft > 0)
                        (yield* pause(timeLeft));
                    if (this.onPlayFinished)
                        this.onPlayFinished();
                    return;
                }
                hz = -1;
                let note = 0;
                token = "";
                tokenKind = Token.Note;
                for (let i = 0; i < currNote.length; i++) {
                    let noteChar = currNote.charAt(i);
                    switch (noteChar) {
                        case 'c':
                        case 'C':
                            note = 1;
                            prevNote = true;
                            break;
                        case 'd':
                        case 'D':
                            note = 3;
                            prevNote = true;
                            break;
                        case 'e':
                        case 'E':
                            note = 5;
                            prevNote = true;
                            break;
                        case 'f':
                        case 'F':
                            note = 6;
                            prevNote = true;
                            break;
                        case 'g':
                        case 'G':
                            note = 8;
                            prevNote = true;
                            break;
                        case 'a':
                        case 'A':
                            note = 10;
                            prevNote = true;
                            break;
                        case 'B':
                            note = 12;
                            prevNote = true;
                            break;
                        case 'r':
                        case 'R':
                            hz = 0;
                            prevNote = false;
                            break;
                        case '#':
                            note++;
                            prevNote = false;
                            break;
                        case 'b':
                            if (prevNote)
                                note--;
                            else {
                                note = 12;
                                prevNote = true;
                            }
                            break;
                        case ',':
                            consumeToken();
                            prevNote = false;
                            break;
                        case '!':
                            tokenKind = Token.Hz;
                            prevNote = false;
                            break;
                        case '@':
                            consumeToken();
                            tokenKind = Token.EnvelopeA;
                            prevNote = false;
                            break;
                        case '~':
                            consumeToken();
                            tokenKind = Token.WaveForm;
                            prevNote = false;
                            break;
                        case ':':
                            consumeToken();
                            tokenKind = Token.Beat;
                            prevNote = false;
                            break;
                        case '-':
                            consumeToken();
                            tokenKind = Token.Tempo;
                            prevNote = false;
                            break;
                        case '^':
                            consumeToken();
                            tokenKind = Token.EndHz;
                            break;
                        default:
                            if (tokenKind == Token.Note)
                                tokenKind = Token.Octave;
                            token += noteChar;
                            prevNote = false;
                            break;
                    }
                }
                consumeToken();
                if (note && hz < 0) {
                    const keyNumber = note + (12 * (octave - 1));
                    hz = freqs.getNumber(NumberFormat.UInt16LE, keyNumber * 2) || 0;
                }
                let currMs = ms;
                if (currMs <= 0) {
                    const beat = Math.idiv(15000, tempo);
                    currMs = duration * beat;
                }
                if (hz < 0) {
                    // no frequency specified, so no duration
                }
                else if (hz == 0) {
                    timePos += currMs;
                }
                else {
                    if (endHz < 0) {
                        endHz = hz;
                    }
                    sndInstrPtr = 0;
                    addForm(envA, 0, 255, 0);
                    addForm(envD, 255, envS, envA);
                    addForm(currMs - (envA + envD), envS, envS, envD + envA);
                    addForm(envR, envS, 0, currMs);
                    this.queuePlayInstructions(timePos - now, sndInstr.slice(0, sndInstrPtr));
                    endHz = -1;
                    timePos += currMs; // don't add envR - it's supposed overlap next sound
                }
                let timeLeft = timePos - now;
                if (timeLeft > 200) {
                    (yield* pause(timeLeft - 100));
                    now = control.millis() - startTime;
                }
            }
        }
    }
    music.MelodyPlayer = MelodyPlayer;
    //% blockId=music_song_field_editor
    //% block="song $song"
    //% song.fieldEditor=musiceditor
    //% song.fieldOptions.decompileLiterals=true
    //% song.fieldOptions.taggedTemplate="hex;assets.song"
    //% song.fieldOptions.decompileIndirectFixedInstances="true"
    //% song.fieldOptions.decompileArgumentAsString="true"
    //% song.snippet="hex`00780004080100`"
    //% song.pySnippet='hex("""00780004080100""")'
    //% toolboxParent=music_playable_play
    //% toolboxParentArgument=toPlay
    //% group="Songs"
    //% duplicateShadowOnDrag
    //% help=music/create-song
    function createSong(song) { throw new Error("Arcade songs are not available"); }
    music.createSong = createSong;
    function playInstructions(when, instructions) {
        queuePlayInstructions(when, instructions);
    }
    music.playInstructions = playInstructions;
    function lookupFrequency(note) {
        return freqs.getNumber(NumberFormat.UInt16LE, note * 2) || 0;
    }
    music.lookupFrequency = lookupFrequency;
    //% fixedInstance whenUsed block="ba ding"
    music.baDing = new Melody('b5:1 e6:3');
    //% fixedInstance whenUsed block="wawawawaa"
    music.wawawawaa = new Melody('~15 e3:3 r:1 d#:3 r:1 d:4 r:1 c#:8');
    //% fixedInstance whenUsed block="jump up"
    music.jumpUp = new Melody('c5:1 d e f g');
    //% fixedInstance whenUsed block="jump down"
    music.jumpDown = new Melody('g5:1 f e d c');
    //% fixedInstance whenUsed block="power up"
    music.powerUp = new Melody('g4:1 c5 e g:2 e:1 g:3');
    //% fixedInstance whenUsed block="power down"
    music.powerDown = new Melody('g5:1 d# c g4:2 b:1 c5:3');
    //% fixedInstance whenUsed block="magic wand"
    music.magicWand = new Melody('F#6:1-300 G# A# B C7# D# F F# G# A# B:6');
    //A#7:1-200 A:1 A#7:1 A:1 A#7:2
    //% fixedInstance whenUsed block="siren"
    music.siren = new Melody('a4 d5 a4 d5 a4 d5');
    //% fixedInstance whenUsed block="pew pew"
    music.pewPew = new Melody('!1200,200^50');
    //% fixedInstance whenUsed block="knock"
    music.knock = new Melody('~4 @0,0,255,150 !300,1 !211,1');
    //% fixedInstance whenUsed block="footstep"
    music.footstep = new Melody('~4 @0,0,60,50 !200,1');
    //% fixedInstance whenUsed block="thump"
    music.thump = new Melody('~4 @0,0,255,150 !100,1');
    //% fixedInstance whenUsed block="small crash"
    music.smallCrash = new Melody('~4 @10,490,0,1 !800,1');
    //% fixedInstance whenUsed block="big crash"
    music.bigCrash = new Melody('~4 @10,990,0,1 !400,1');
    //% fixedInstance whenUsed block="zapped"
    music.zapped = new Melody('~16 @10,490,0,0 !1600,500^1');
    //% fixedInstance whenUsed block="buzzer"
    music.buzzer = new Melody('~16 @10,0,255,250 !2000,300');
    //% fixedInstance whenUsed block="sonar"
    music.sonar = new Melody('~16 @10,1500,0,0 !200,1 !200,1500^190');
    //% fixedInstance whenUsed block="spooky"
    music.spooky = new Melody('~16 @700,1300,0,0 !100,1 ~18 !108,2000');
    //% fixedInstance whenUsed block="beam up"
    music.beamUp = new Melody('~18 @10,1500,0,0 !200,1500^4000');
})(music || (music = {}));
(function (music) {
    let PlaybackMode;
    (function (PlaybackMode) {
        //% block="until done"
        PlaybackMode[PlaybackMode["UntilDone"] = 0] = "UntilDone";
        //% block="in background"
        PlaybackMode[PlaybackMode["InBackground"] = 1] = "InBackground";
        //% block="looping in background"
        PlaybackMode[PlaybackMode["LoopingInBackground"] = 2] = "LoopingInBackground";
    })(PlaybackMode = music.PlaybackMode || (music.PlaybackMode = {}));
    let stateStack;
    class PlayableState {
        constructor() {
            this.looping = [];
        }
        stopLooping() {
            for (const p of this.looping) {
                p.stopped = true;
            }
            this.looping = [];
        }
    }
    function state() {
        _init();
        return stateStack[stateStack.length - 1];
    }
    function _init() {
        if (stateStack)
            return;
        stateStack = [new PlayableState()];
    }
    function _initializeSceneStack(addScenePushHandler, addScenePopHandler) {
        _init();
        addScenePushHandler(() => {
            stateStack.push(new PlayableState());
        });
        addScenePopHandler(() => {
            stateStack.pop();
            if (stateStack.length === 0)
                stateStack.push(new PlayableState());
        });
    }
    music._initializeSceneStack = _initializeSceneStack;
    class Playable {
        constructor() {
        }
        *play(playbackMode) {
            // subclass
        }
        loop() {
            state().looping.push(this);
            this.stopped = false;
            control.runInParallel((function* () {
                while (!this.stopped) {
                    (yield* this.play(PlaybackMode.UntilDone));
                }
            }).bind(this));
        }
    }
    music.Playable = Playable;
    class MelodyPlayable extends Playable {
        constructor(melody) {
            super();
            this.melody = melody;
        }
        *play(playbackMode) {
            if (playbackMode === PlaybackMode.InBackground) {
                (yield* this.melody.play(music.volume()));
            }
            else if (playbackMode === PlaybackMode.UntilDone) {
                (yield* this.melody.playUntilDone(music.volume()));
            }
            else {
                this.melody.loop(music.volume());
            }
        }
    }
    music.MelodyPlayable = MelodyPlayable;
    class TonePlayable extends Playable {
        constructor(pitch, duration) {
            super();
            this.pitch = pitch;
            this.duration = duration;
        }
        *play(playbackMode) {
            if (playbackMode === PlaybackMode.InBackground) {
                control.runInParallel((function* () {
                    (yield* music.playTone(this.pitch, this.duration));
                }).bind(this));
            }
            else if (playbackMode === PlaybackMode.UntilDone) {
                (yield* music.playTone(this.pitch, this.duration));
                if (this.duration > 2000) {
                    (yield* pause(this.duration));
                }
            }
            else {
                this.loop();
            }
        }
    }
    music.TonePlayable = TonePlayable;
    /**
     * Play a song, melody, or other sound. The music plays until finished or can play as a
     * background task.
     * @param toPlay the song or melody to play
     * @param playbackMode play the song or melody until it's finished or as background task
     */
    //% blockId="music_playable_play"
    //% block="play $toPlay $playbackMode"
    //% toPlay.shadow=music_melody_playable
    //% group="Sounds"
    //% help="music/play"
    function* play(toPlay, playbackMode) {
        (yield* toPlay.play(playbackMode));
    }
    music.play = play;
    /**
     * Create a Playable object for a melody.
     * @param melody the melody to make playable
     */
    //% blockId="music_melody_playable"
    //% block="sound $melody"
    //% toolboxParent=music_playable_play
    //% toolboxParentArgument=toPlay
    //% group="Sounds"
    //% duplicateShadowOnDrag
    //% blockHidden
    //% help=music/melody-playable
    function melodyPlayable(melody) {
        return new MelodyPlayable(melody);
    }
    music.melodyPlayable = melodyPlayable;
    /**
     * Create a Playable object for a melody string containg notes.
     * @param melody the melody string to make playable
     */
    //% blockId="music_string_playable"
    //% block="melody $melody at tempo $tempo|(bpm)"
    //% toolboxParent=music_playable_play
    //% toolboxParentArgument=toPlay
    //% weight=85 blockGap=8
    //% help=music/melody-editor
    //% group="Songs"
    //% duplicateShadowOnDrag
    //% melody.shadow=melody_editor
    //% tempo.min=40 tempo.max=500
    //% tempo.defl=120
    //% help=music/string-playable
    function stringPlayable(melody, tempo) {
        let notes = melody.split(" ").filter(n => !!n);
        let formattedMelody = "";
        let newOctave = false;
        // build melody string, replace '-' with 'R' and add tempo
        // creates format like "C5-174 B4 A G F E D C "
        for (let i = 0; i < notes.length; i++) {
            if (notes[i] === "-") {
                notes[i] = "R";
            }
            else if (notes[i] === "C5") {
                newOctave = true;
            }
            else if (newOctave) { // change the octave if necesary
                notes[i] += "4";
                newOctave = false;
            }
            // add tempo after first note
            if (i == 0) {
                formattedMelody += notes[i] + "-" + tempo + " ";
            }
            else {
                formattedMelody += notes[i] + " ";
            }
        }
        return new MelodyPlayable(new music.Melody(formattedMelody));
    }
    music.stringPlayable = stringPlayable;
    /**
     * Create a Playable object for a single tone and its duration.
     * @param note the note or tone frequency to play
     * @param duration the duration of the tone in milliseconds (ms)
     */
    //% blockId="music_tone_playable"
    //% block="tone $note for $duration"
    //% toolboxParent=music_playable_play
    //% toolboxParentArgument=toPlay
    //% group="Tone"
    //% duplicateShadowOnDrag
    //% note.shadow=device_note
    //% duration.shadow=device_beat
    //% parts="headphone"
    //% help=music/tone-playable
    function tonePlayable(note, duration) {
        return new TonePlayable(note, duration);
    }
    music.tonePlayable = tonePlayable;
    function _stopPlayables() {
        state().stopLooping();
    }
    music._stopPlayables = _stopPlayables;
})(music || (music = {}));
//% deprecated=true hidden=true
var Sounds;
(function (Sounds) {
    //% block="power up"
    Sounds[Sounds["PowerUp"] = 0] = "PowerUp";
    //% block="power down"
    Sounds[Sounds["PowerDown"] = 1] = "PowerDown";
    //% block="jump up"
    Sounds[Sounds["JumpUp"] = 2] = "JumpUp";
    //% block="jump down"
    Sounds[Sounds["JumpDown"] = 3] = "JumpDown";
    //% block="ba ding"
    Sounds[Sounds["BaDing"] = 4] = "BaDing";
    //% block="wawawawaa"
    Sounds[Sounds["Wawawawaa"] = 5] = "Wawawawaa";
    //% block="magic wand"
    Sounds[Sounds["MagicWand"] = 6] = "MagicWand";
    //% block="siren"
    Sounds[Sounds["Siren"] = 7] = "Siren";
})(Sounds || (Sounds = {}));
(function (music) {
    /**
     * Get the melody string for a built-in melody.
     * @param name the note name, eg: Note.C
     */
    //% help=music/sounds
    //% blockId=music_sounds block="%name"
    //% blockHidden=true
    //% name.fieldEditor="gridpicker"
    //% name.fieldOptions.width=285
    //% name.fieldOptions.columns=3
    function sounds(name) {
        switch (name) {
            case Sounds.BaDing:
                return 'b5:1 e6:3';
            case Sounds.Wawawawaa:
                return 'e3:3 r:1 d#:3 r:1 d:4 r:1 c#:8';
            case Sounds.JumpUp:
                return 'c5:1 d e f g';
            case Sounds.JumpDown:
                return 'g5:1 f e d c';
            case Sounds.PowerUp:
                return 'g4:1 c5 e g:2 e:1 g:3';
            case Sounds.PowerDown:
                return 'g5:1 d# c g4:2 b:1 c5:3';
            case Sounds.MagicWand:
                return 'F#6:1-300 G# A# B C7# D# F F# G# A# B:6'; //A#7:1-200 A:1 A#7:1 A:1 A#7:2
            case Sounds.Siren:
                return 'a4 d5 a4 d5 a4 d5';
            default:
                return '';
        }
    }
    music.sounds = sounds;
    let currMelody;
    /**
     * Start playing a sound and don't wait for it to finish.
     * Notes are expressed as a string of characters with this format: NOTE[octave][:duration]
     * @param sound the melody to play
     */
    //% help=music/play-sound
    //% blockId=music_play_sound block="play sound %sound=music_sounds"
    //% parts="headphone"
    //% weight=95 blockGap=8
    //% deprecated=true hidden=true
    function* playSound(sound) {
        music.stopAllSounds();
        currMelody = new music.Melody(sound);
        (yield* currMelody.play());
        (yield* pause(1));
    }
    music.playSound = playSound;
    /**
     * Play a sound and wait until the sound is done.
     * Notes are expressed as a string of characters with this format: NOTE[octave][:duration]
     * @param sound the melody to play
     */
    //% help=music/play-sound-until-done
    //% blockId=music_play_sound_until_done block="play sound %sound=music_sounds|until done"
    //% parts="headphone"
    //% weight=94 blockGap=8
    //% deprecated=true hidden=true
    function* playSoundUntilDone(sound) {
        music.stopAllSounds();
        currMelody = new music.Melody(sound);
        (yield* currMelody.playUntilDone());
    }
    music.playSoundUntilDone = playSoundUntilDone;
})(music || (music = {}));
var WaveShape;
(function (WaveShape) {
    //% block="sine"
    WaveShape[WaveShape["Sine"] = 0] = "Sine";
    //% block="sawtooth"
    WaveShape[WaveShape["Sawtooth"] = 1] = "Sawtooth";
    //% block="triangle"
    WaveShape[WaveShape["Triangle"] = 2] = "Triangle";
    //% block="square"
    WaveShape[WaveShape["Square"] = 3] = "Square";
    //% block="noise"
    WaveShape[WaveShape["Noise"] = 4] = "Noise";
})(WaveShape || (WaveShape = {}));
var InterpolationCurve;
(function (InterpolationCurve) {
    //% block="linear"
    InterpolationCurve[InterpolationCurve["Linear"] = 0] = "Linear";
    //% block="curve"
    InterpolationCurve[InterpolationCurve["Curve"] = 1] = "Curve";
    //% block="logarithmic"
    InterpolationCurve[InterpolationCurve["Logarithmic"] = 2] = "Logarithmic";
})(InterpolationCurve || (InterpolationCurve = {}));
var SoundExpressionEffect;
(function (SoundExpressionEffect) {
    //% block="none"
    SoundExpressionEffect[SoundExpressionEffect["None"] = 0] = "None";
    //% block="vibrato"
    SoundExpressionEffect[SoundExpressionEffect["Vibrato"] = 1] = "Vibrato";
    //% block="tremolo"
    SoundExpressionEffect[SoundExpressionEffect["Tremolo"] = 2] = "Tremolo";
    //% block="warble"
    SoundExpressionEffect[SoundExpressionEffect["Warble"] = 3] = "Warble";
})(SoundExpressionEffect || (SoundExpressionEffect = {}));
var SoundExpressionPlayMode;
(function (SoundExpressionPlayMode) {
    //% block="until done"
    SoundExpressionPlayMode[SoundExpressionPlayMode["UntilDone"] = 0] = "UntilDone";
    //% block="in background"
    SoundExpressionPlayMode[SoundExpressionPlayMode["InBackground"] = 1] = "InBackground";
})(SoundExpressionPlayMode || (SoundExpressionPlayMode = {}));
(function (music) {
    class SoundEffect extends music.Playable {
        constructor() {
            super();
            this.waveShape = WaveShape.Sine;
            this.startFrequency = 5000;
            this.endFrequency = 1;
            this.startVolume = 255;
            this.endVolume = 0;
            this.duration = 1000;
            this.effect = SoundExpressionEffect.None;
            this.interpolation = InterpolationCurve.Linear;
        }
        toBuffer(volume) {
            if (volume === undefined)
                volume = music.volume();
            return soundToInstructionBuffer(this.waveShape, this.startFrequency, this.endFrequency, this.startVolume, this.endVolume, this.duration, this.effect, this.interpolation, 20, 1, volume);
        }
        *play(playbackMode) {
            const toPlay = this.toBuffer(music.volume());
            if (playbackMode === music.PlaybackMode.InBackground) {
                queuePlayInstructions(0, toPlay);
            }
            else if (playbackMode === music.PlaybackMode.UntilDone) {
                queuePlayInstructions(0, toPlay);
                (yield* pause(this.duration));
            }
            else {
                this.loop();
            }
        }
    }
    music.SoundEffect = SoundEffect;
    /**
     * Play a SoundEffect.
     * @param sound the SoundEffect to play
     * @param mode the play mode, play until done or in the background
     */
    //% blockId=soundExpression_playSoundEffect
    //% block="play sound $sound $mode"
    //% weight=30
    //% help=music/play-sound-effect
    //% blockGap=8
    //% group="Sounds"
    //% deprecated=1
    function* playSoundEffect(sound, mode) {
        const toPlay = sound.toBuffer(music.volume());
        queuePlayInstructions(0, toPlay);
        if (mode === SoundExpressionPlayMode.UntilDone) {
            (yield* pause(sound.duration));
        }
    }
    music.playSoundEffect = playSoundEffect;
    /**
     * Create a sound expression from a set of sound effect parameters.
     * @param waveShape waveform of the sound effect
     * @param startFrequency starting frequency for the sound effect waveform
     * @param endFrequency ending frequency for the sound effect waveform
     * @param startVolume starting volume of the sound, or starting amplitude
     * @param endVolume ending volume of the sound, or ending amplitude
     * @param duration the amount of time in milliseconds (ms) that sound will play for
     * @param effect the effect to apply to the waveform or volume
     * @param interpolation interpolation method for frequency scaling
     */
    //% blockId=soundExpression_createSoundEffect
    //% help=music/create-sound-effect
    //% block="$waveShape|| start frequency $startFrequency end frequency $endFrequency duration $duration start volume $startVolume end volume $endVolume effect $effect interpolation $interpolation"
    //% waveShape.defl=WaveShape.Sine
    //% waveShape.fieldEditor=soundeffect
    //% waveShape.fieldOptions.useMixerSynthesizer=true
    //% startFrequency.defl=5000
    //% startFrequency.min=0
    //% startFrequency.max=5000
    //% endFrequency.defl=0
    //% endFrequency.min=0
    //% endFrequency.max=5000
    //% startVolume.defl=255
    //% startVolume.min=0
    //% startVolume.max=255
    //% endVolume.defl=0
    //% endVolume.min=0
    //% endVolume.max=255
    //% duration.defl=500
    //% duration.min=1
    //% duration.max=9999
    //% effect.defl=SoundExpressionEffect.None
    //% interpolation.defl=InterpolationCurve.Linear
    //% compileHiddenArguments=true
    //% inlineInputMode="variable"
    //% inlineInputModeLimit=3
    //% expandableArgumentBreaks="3,5"
    //% toolboxParent=music_playable_play
    //% toolboxParentArgument=toPlay
    //% weight=20
    //% group="Sounds"
    //% duplicateShadowOnDrag
    function createSoundEffect(waveShape, startFrequency, endFrequency, startVolume, endVolume, duration, effect, interpolation) {
        const result = new SoundEffect();
        result.waveShape = waveShape;
        result.startFrequency = startFrequency;
        result.endFrequency = endFrequency;
        result.startVolume = startVolume;
        result.endVolume = endVolume;
        result.duration = duration;
        result.effect = effect;
        result.interpolation = interpolation;
        return result;
    }
    music.createSoundEffect = createSoundEffect;
    function soundToInstructionBuffer(waveShape, startFrequency, endFrequency, startVolume, endVolume, duration, effect, interpolation, fxSteps, fxRange, globalVolume) {
        const steps = [];
        // Optimize the simple case
        if (interpolation === InterpolationCurve.Linear && effect === SoundExpressionEffect.None) {
            steps.push({
                frequency: startFrequency,
                volume: (startVolume / 255) * globalVolume,
            });
            steps.push({
                frequency: endFrequency,
                volume: (endVolume / 255) * globalVolume,
            });
        }
        else {
            fxSteps = Math.min(fxSteps, Math.floor(duration / 5));
            const getVolumeAt = (t) => ((startVolume + t * (endVolume - startVolume) / duration) / 255) * globalVolume;
            let getFrequencyAt;
            switch (interpolation) {
                case InterpolationCurve.Linear:
                    getFrequencyAt = t => startFrequency + t * (endFrequency - startFrequency) / duration;
                    break;
                case InterpolationCurve.Curve:
                    getFrequencyAt = t => startFrequency + (endFrequency - startFrequency) * Math.sin(t / duration * (Math.PI / 2));
                    break;
                case InterpolationCurve.Logarithmic:
                    getFrequencyAt = t => startFrequency + (Math.log(1 + 9 * (t / duration)) / Math.log(10)) * (endFrequency - startFrequency);
                    break;
            }
            const timeSlice = duration / fxSteps;
            for (let i = 0; i < fxSteps; i++) {
                const newStep = {
                    frequency: getFrequencyAt(i * timeSlice),
                    volume: getVolumeAt(i * timeSlice)
                };
                if (effect === SoundExpressionEffect.Tremolo) {
                    if (i % 2 === 0) {
                        newStep.volume = Math.max(newStep.volume - fxRange * 500, 0);
                    }
                    else {
                        newStep.volume = Math.min(newStep.volume + fxRange * 500, 1023);
                    }
                }
                else if (effect === SoundExpressionEffect.Vibrato) {
                    if (i % 2 === 0) {
                        newStep.frequency = Math.max(newStep.frequency - fxRange * 100, 0);
                    }
                    else {
                        newStep.frequency = newStep.frequency + fxRange * 100;
                    }
                }
                else if (effect === SoundExpressionEffect.Warble) {
                    if (i % 2 === 0) {
                        newStep.frequency = Math.max(newStep.frequency - fxRange * 1000, 0);
                    }
                    else {
                        newStep.frequency = newStep.frequency + fxRange * 1000;
                    }
                }
                steps.push(newStep);
            }
        }
        const out = control.createBuffer(12 * (steps.length - 1));
        const stepDuration = Math.floor(duration / (steps.length - 1));
        for (let i = 0; i < steps.length - 1; i++) {
            const offset = i * 12;
            out.setNumber(NumberFormat.UInt8LE, offset, waveToValue(waveShape));
            out.setNumber(NumberFormat.UInt16LE, offset + 2, steps[i].frequency);
            out.setNumber(NumberFormat.UInt16LE, offset + 4, stepDuration);
            out.setNumber(NumberFormat.UInt16LE, offset + 6, steps[i].volume);
            out.setNumber(NumberFormat.UInt16LE, offset + 8, steps[i + 1].volume);
            out.setNumber(NumberFormat.UInt16LE, offset + 10, steps[i + 1].frequency);
        }
        return out;
    }
    music.soundToInstructionBuffer = soundToInstructionBuffer;
    function waveToValue(wave) {
        switch (wave) {
            case WaveShape.Square: return 15;
            case WaveShape.Sine: return 3;
            case WaveShape.Triangle: return 1;
            case WaveShape.Noise: return 18;
            case WaveShape.Sawtooth: return 2;
        }
    }
    /**
     * Generate a random similar sound effect to the given one.
     *
     * @param sound the sound effect
     */
    //% blockId=soundExpression_generateSimilarSound
    //% block="randomize $sound"
    //% sound.shadow=soundExpression_createSoundEffect
    //% weight=0 help=music/randomize-sound
    //% blockGap=8
    //% group="Sounds"
    function randomizeSound(sound) {
        const res = new SoundEffect();
        res.waveShape = sound.waveShape;
        res.startFrequency = sound.startFrequency;
        res.endFrequency = sound.endFrequency;
        res.startVolume = sound.startVolume;
        res.endVolume = sound.endVolume;
        res.duration = sound.duration;
        res.effect = sound.effect;
        res.interpolation = randomInterpolation();
        res.duration = Math.clamp(Math.min(100, res.duration), Math.max(2000, res.duration), res.duration + (Math.random() - 0.5) * res.duration);
        if (res.waveShape === WaveShape.Noise) {
            // The primary waveforms don't produce sounds that are similar to noise,
            // but adding an effect sorta does
            if (Math.random() < 0.2) {
                res.waveShape = randomWave();
                res.effect = randomEffect();
            }
        }
        else {
            res.waveShape = randomWave();
            // Adding an effect can drastically alter the sound, so keep it
            // at a low percent chance unless there already is one
            if (res.effect !== SoundExpressionEffect.None || Math.random() < 0.1) {
                res.effect = randomEffect();
            }
        }
        // Instead of randomly changing the frequency, change the slope and choose
        // a new start frequency. This keeps a similar profile to the sound
        const oldFrequencyDifference = res.endFrequency - res.startFrequency;
        let newFrequencyDifference = oldFrequencyDifference + (oldFrequencyDifference * 2) * (Math.random() - 0.5);
        if (Math.sign(oldFrequencyDifference) !== Math.sign(newFrequencyDifference)) {
            newFrequencyDifference *= -1;
        }
        newFrequencyDifference = Math.clamp(-5000, 5000, newFrequencyDifference);
        res.startFrequency = Math.clamp(Math.max(-newFrequencyDifference, 1), Math.clamp(1, 5000, 5000 - newFrequencyDifference), Math.random() * 5000);
        res.endFrequency = Math.clamp(1, 5000, res.startFrequency + newFrequencyDifference);
        // Same strategy for volume
        const oldVolumeDifference = res.endVolume - res.startVolume;
        let newVolumeDifference = oldVolumeDifference + oldVolumeDifference * (Math.random() - 0.5);
        newVolumeDifference = Math.clamp(-255, 255, newVolumeDifference);
        if (Math.sign(oldVolumeDifference) !== Math.sign(newVolumeDifference)) {
            newVolumeDifference *= -1;
        }
        res.startVolume = Math.clamp(Math.max(-newVolumeDifference, 0), Math.clamp(0, 255, 255 - newVolumeDifference), Math.random() * 255);
        res.endVolume = Math.clamp(0, 255, res.startVolume + newVolumeDifference);
        return res;
    }
    music.randomizeSound = randomizeSound;
    function randomWave() {
        switch (Math.randomRange(0, 3)) {
            case 1: return WaveShape.Sawtooth;
            case 2: return WaveShape.Square;
            case 3: return WaveShape.Triangle;
            case 0:
            default:
                return WaveShape.Sine;
        }
    }
    function randomEffect() {
        switch (Math.randomRange(0, 2)) {
            case 1: return SoundExpressionEffect.Warble;
            case 2: return SoundExpressionEffect.Tremolo;
            case 0:
            default:
                return SoundExpressionEffect.Vibrato;
        }
    }
    function randomInterpolation() {
        switch (Math.randomRange(0, 2)) {
            case 1: return InterpolationCurve.Linear;
            case 2: return InterpolationCurve.Curve;
            case 0:
            default:
                return InterpolationCurve.Logarithmic;
        }
    }
    //% shim=music::queuePlayInstructions
    function queuePlayInstructions(timeDelta, buf) { return __shim("queuePlayInstructions", [timeDelta, buf]); }
})(music || (music = {}));

return {music, Note, BeatFraction, Sounds, WaveShape, InterpolationCurve, SoundExpressionEffect, SoundExpressionPlayMode};
};
