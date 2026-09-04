import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import DebugDrawer from './debug-drawer.jsx';
import DebugInspector from './debug-inspector.jsx';
import DebugFrames from './debug-frames.jsx';
import {mergeTargetKinds} from '../../lib/bw-debug/target-kinds.js';

// VDP screen — lazy-loaded, only renders when the runner has video output.
const SwitchPanel = React.lazy(() =>
    import(/* webpackChunkName: "bw-circuit-ui" */ '../../lib/bw-circuit-ui/components/SwitchPanel.jsx')
        .then(m => ({default: m.SwitchPanel}))
);
const VdpScreen = React.lazy(() =>
    import(/* webpackChunkName: "bw-circuit-ui" */ '../../lib/bw-circuit-ui/components/VdpScreen.jsx')
        .then(m => ({default: m.VdpScreen}))
);

/**
 * The debugger's controls: ⚑ ⏸ ⏭ ⏹, a speed dial, and what the program is doing.
 *
 * Design: `sb3-creator/reference/debugger-ui.md`. Two things it deliberately gets right:
 *
 * 1. **`block` is the only step verb here.** It is the one kind every target supports —
 *    emulator, ucsim, and the on-chip monitor — and "run to the next yield" is what a
 *    Scratch user means by "next". `insn` / `over` / `out` belong in the advanced drawer,
 *    which does not exist yet; `line` is refused outright by the target and is not offered.
 * 2. **A control that cannot work says why.** Capabilities are queried, never assumed, and
 *    a disabled button carries its reason in the tooltip. A dead button that explains
 *    itself teaches the hardware; a dead button that does not reads as a bug.
 *
 * **Why it lives in the Circuit tab rather than the stage header**, which is what the design
 * note describes: the stage header is shown for EVERY project, including pure Scratch ones,
 * where a debugger strip is meaningless. Putting it there means teaching shared chrome to
 * detect hardware projects. The Circuit tab is already the hardware surface, already gated,
 * and already shows the board you want to watch while stepping. The glow lands in the Blocks
 * tab either way — `vm.runtime.glowBlock` does not care which tab is open. Moving the strip
 * into the stage header, once the chrome knows what an STC project is, changes nothing here.
 */

const L10N = {
    en: {
        run: 'Run', pause: 'Pause', step: 'Step', stop: 'Stop',
        speed: 'Speed', idle: 'not running', building: 'building…', attaching: 'starting…',
        ready: 'ready', running: 'running', paused: 'paused', stepping: 'stepping…',
        error: 'error',
        stepHint: 'Run to the next block boundary',
        serialHint: 'type a line, Enter sends it',
        serialSend: 'Send this line to the machine (ends with CR)',
        consumes: 'Debugging this board uses:',
        lwCaveats: 'Heavy tier, one known limit: analog inputs are not injected — a pot or ' +
            'LDR reads the engine’s own counter, not the voltage this board solves. ' +
            'Use the light tier for analog work.',
        pausedAt: 'Paused at', afterMs: 'after',
        noPins: 'Declare pins in the Code tab to debug this project.',
        bps: 'Pause points', noBps: 'Right-click a block and choose “Pause here”.',
        skipped: 'hits passed over — a wait is re-entered constantly, and conditions filter the rest',
        unreachable: 'cannot be stopped at',
        unreachableWhy: 'The program only stops at a wait or a loop, so these marks have ' +
            'nowhere to land in this build. They are kept in case a later edit gives them one.',
        yieldNote: 'The program can only stop at a wait or a loop — so the highlight marks ' +
            'the last one it passed, not every block in between.',
        watchHit: 'Stopped on a write to',
        watchWas: 'was',
        watchNow: 'now',
        watchNote: 'A watchpoint here reports a CHANGE, not every store: writing the value ' +
            'that is already there is invisible, and a byte the peripherals move fires ' +
            'with no instruction of yours responsible.'
    },
    de: {
        run: 'Start', pause: 'Pause', step: 'Schritt', stop: 'Stopp',
        speed: 'Tempo', idle: 'läuft nicht', building: 'wird gebaut…', attaching: 'startet…',
        ready: 'bereit', running: 'läuft', paused: 'angehalten', stepping: 'Schritt…',
        error: 'Fehler',
        stepHint: 'Bis zur nächsten Blockgrenze laufen',
        serialHint: 'Zeile eingeben, Enter sendet',
        serialSend: 'Diese Zeile an die Maschine senden (endet mit CR)',
        consumes: 'Das Debuggen dieser Platine belegt:',
        lwCaveats: 'Schwere Stufe, eine bekannte Grenze: Analogeingänge werden nicht ' +
            'eingespeist — ein Poti oder LDR liest den internen Zähler der Engine, nicht die ' +
            'Spannung, die diese Platine löst. Für Analoges die leichte Stufe verwenden.',
        pausedAt: 'Angehalten bei', afterMs: 'nach',
        noPins: 'Für das Debuggen im Code-Tab Pins deklarieren.',
        bps: 'Haltepunkte', noBps: 'Rechtsklick auf einen Block, dann „Hier anhalten“.',
        skipped: 'übergangene Treffer — ein Warten wird ständig neu betreten, Bedingungen filtern den Rest',
        unreachable: 'nicht anhaltbar',
        unreachableWhy: 'Das Programm hält nur bei einem Warten oder einer Schleife an; diese ' +
            'Markierungen haben in diesem Build keinen Platz. Sie bleiben erhalten, falls eine ' +
            'spätere Änderung einen schafft.',
        yieldNote: 'Das Programm kann nur bei einem Warten oder einer Schleife anhalten — die ' +
            'Markierung zeigt also die letzte solche Stelle, nicht jeden Block dazwischen.',
        watchHit: 'Angehalten bei einem Schreibzugriff auf',
        watchWas: 'war',
        watchNow: 'jetzt',
        watchNote: 'Ein Watchpoint meldet hier eine ÄNDERUNG, nicht jeden Schreibzugriff: ' +
            'denselben Wert erneut zu schreiben bleibt unsichtbar, und ein Byte, das die ' +
            'Peripherie bewegt, löst aus, ohne dass eine deiner Anweisungen schuld ist.'
    }
};

const BTN = {
    padding: '6px 12px', borderRadius: 4, border: '1px solid #2c3e50',
    background: '#16213e', color: '#ecf0f1', fontFamily: 'monospace', fontSize: 12,
    cursor: 'pointer'
};
const OFF = {...BTN, color: '#4a5568', cursor: 'not-allowed'};

class DebugPanel extends React.Component {
    constructor (props) {
        super(props);
        // The target is chosen BEFORE a runner exists, so it lives here rather
        // than in the runner: picking "Live board" and then pressing Run is the
        // order a user works in.
        this.state = {runner: null, ui: {phase: 'idle', message: ''}, kind: 'emulator', kinds: null,
            machineConfig: null, serialInput: '', firmwareName: null};
        this.onStart = this.onStart.bind(this);
        this.onPause = this.onPause.bind(this);
        this.onStep = this.onStep.bind(this);
        this.onStop = this.onStop.bind(this);
        this.onSpeed = this.onSpeed.bind(this);
        this.onSerialInput = this.onSerialInput.bind(this);
        this.onSerialKeyDown = this.onSerialKeyDown.bind(this);
        this.onSerialSend = this.onSerialSend.bind(this);
        this.syncProjectTokens = this.syncProjectTokens.bind(this);
        this._onMachineExtracted = this._onMachineExtracted.bind(this);
        this._onMediaLoad = this._onMediaLoad.bind(this);
        this._onAsmRomReady = this._onAsmRomReady.bind(this);
        /** Boot image handed over by the Machine Loader / ASM tab —
         *  {slot, bytes, profile, name, romAt}. Kept off state: the bytes are
         *  runner input, not render input. */
        this._bootMedia = null;
        /** STABLE identity, bound once: the panel re-renders on every
         *  runner emit (rAF cadence), and an inline arrow here gave
         *  VdpScreen a new videoFn each render — its paint effect then
         *  cancelled and rescheduled its own rAF every frame, so the
         *  paint callback never once ran and the screen stayed black
         *  while the machine rendered perfect frames behind it. */
        /** STABLE identity, bound once -- same reason as _videoFn below. An
         *  inline arrow here would give VdpScreen a new sendScancodeFn every
         *  render, and its key handlers are useCallback'd on that prop, so
         *  every render would rebuild them. Returns undefined when the runner
         *  has no keyIn, which is how VdpScreen decides not to offer a
         *  keyboard at all. */
        /** STABLE identity, bound once -- SwitchPanel's toggle handler is
         *  useCallback'd on it, so an inline arrow would rebuild every
         *  switch's handler on every runner emit (rAF cadence). */
        this._setInputFn = (chip, port, bit, level) => {
            const r = this.state.runner;
            return r && typeof r.setInput === 'function'
                ? r.setInput(chip, port, bit, level) : false;
        };
        this._scancodeFn = (sc) => {
            const r = this.state.runner;
            if (r && typeof r.keyIn === 'function') r.keyIn(sc);
        };
        this._videoFn = () => {
            const r = this.state.runner;
            return r && typeof r.video === 'function' ? r.video() : null;
        };
    }

    /** Build Machine succeeded: the bus extractor's {regions, chips}.
     *  Stored, and any live runner destroyed, so the NEXT boot threads
     *  the config into createDebugTarget — the machine the user wired,
     *  not a hardcoded preset. */
    _onMachineExtracted (e) {
        const detail = e.detail || {};
        if (!detail.config) return;
        this._teardownRunner();
        // Build Machine can happen AFTER an example has already delivered its
        // ROM. Extraction changes the wiring/config, not the disk/ROM sitting
        // in the loader; dropping _bootMedia here made the visible Sim control
        // run an all-zero image. Keep the media and recreate the runner so the
        // newly extracted machine and the already loaded image boot together.
        const hasBootMedia = !!this._bootMedia;
        const kind = detail.kind === 'z80' ? 'z80'
            : detail.kind === 'eater6502' || detail.kind === '6502' ? 'eater6502'
                : this.state.kind;
        this.setState({machineConfig: detail.config, kind, runner: null,
            ui: {phase: 'idle', message: hasBootMedia ?
                'machine extracted — loaded program ready' :
                'machine extracted — load a program (presets, file, or ASM tab)'}});
    }

    /** Machine Loader (presets / file picker) delivered an image. The
     *  runner is recreated rather than hot-patched: config and image
     *  must boot TOGETHER so the CPU reads its reset vector from the
     *  real bytes, not from a zero-filled ROM it booted with earlier. */
    async _onMediaLoad (e) {
        const {slotId, bytes, kind, profile, name, romAt} = e.detail || {};
        if (!bytes) return;
        this._teardownRunner();
        this._bootMedia = {
            slot: slotId,
            bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
            profile: profile || null,
            name: name || null,
            // WHERE the image is mapped, when the sender knows and we cannot
            // infer it. A raw .bin carries no origin, so without this the
            // runner falls back to the machine's default ROM base — and for
            // an 8086 that is wrong for every image that is not exactly 64K.
            // The loader computes `0x100000 - length` so the reset vector at
            // FFFF0h lands INSIDE the image: a 32K monitor maps at F8000h, a
            // 64K BIOS at F0000h. Dropped silently before this, and the
            // symptom is a machine that starts executing open bus and looks
            // identical to one that failed to start.
            romAt: typeof romAt === 'number' ? romAt : null
        };
        const nextKind = kind === 'z80' ? 'z80'
            : kind === 'eater6502' || kind === '6502' ? 'eater6502'
                // All four spellings. The 8088 is an 8086 with an eight-bit
                // bus -- same ISA, same registers, same core here -- so
                // refusing it by name would refuse a machine we can run.
                : kind === 'i8086' || kind === '8086' || kind === 'i8088' || kind === '8088' ? 'i8086'
                    : this.state.kind;
        await new Promise(resolve => this.setState(
            {kind: nextKind, runner: null, ui: {phase: 'idle', message: ''}}, resolve));
        const runner = await this.runner();
        await runner.start();
    }

    /**
     * ASM tab assembled a binary — same delivery path as the loader.
     *
     * `slotId` and `profile` are carried rather than hardcoded to 'rom'
     * because a .COM/.EXE from the local 8086 assembler is NOT a ROM: the
     * runner has to know to build the DOS bench for it, and a .COM loaded as
     * a ROM at F0000 executes nothing while looking exactly like a machine
     * that failed to start. The default stays 'rom' so a hosted 6502/Z80
     * build behaves as it always did.
     */
    _onAsmRomReady (e) {
        const {rom, target, slotId, profile} = e.detail || {};
        if (!rom) return;
        this._onMediaLoad({detail: {
            slotId: slotId || 'rom', bytes: rom,
            profile: profile || null,
            kind: target === 'z80' ? 'z80'
                : target === 'i8086' ? 'i8086' : 'eater6502',
            name: 'assembled image'
        }});
    }

    componentDidMount () {
        this.syncDeviceKind();
        // A NEW PROGRAM must not debug through the OLD program's runner:
        // loading an example kept the previous runner alive whenever the
        // device stayed the same, and the PINS panel showed the former
        // example's pins (owner report, 2026-08-17). Keyed on the pin
        // SIGNATURE, not the event alone — PROJECT_CHANGED also fires on
        // every block edit, and killing a live run for an unrelated edit
        // would be worse than the staleness.
        const rt0 = this.props.vm && this.props.vm.runtime;
        this._pinSig = JSON.stringify((rt0 && rt0.stc && rt0.stc.pins) || []);
        this._onProjectChanged = () => {
            const rt = this.props.vm && this.props.vm.runtime;
            const sig = JSON.stringify((rt && rt.stc && rt.stc.pins) || []);
            if (sig === this._pinSig) return;
            this._pinSig = sig;
            this._teardownRunner();
            this.setState({runner: null, ui: {phase: 'idle', message: ''}});
        };
        if (rt0 && rt0.on) rt0.on('PROJECT_CHANGED', this._onProjectChanged);
        // The runner announces WHICH board it drives (designer / example /
        // inferred). An inferred LED-per-pin board must announce itself in
        // red instead of impersonating the example's circuit.
        this._onBoardSource = (e) => this.setState({boardSource: (e.detail && e.detail.source) || null});
        window.addEventListener('bw-board-source', this._onBoardSource);
        if (window.__bwBoardSource) this.setState({boardSource: window.__bwBoardSource.source});
        // The machine-bench pipeline: Build Machine → config; Machine
        // Loader / ASM tab → image; both meet in _onMediaLoad's reboot.
        window.addEventListener('bw-machine-extracted', this._onMachineExtracted);
        window.addEventListener('bw-machine-media-load', this._onMediaLoad);
        window.addEventListener('bw-asm-rom-ready', this._onAsmRomReady);
        // Replay what was dispatched before this panel existed: the panel
        // mounts LAZILY in response to bw-machine-extracted, so the first
        // of these events is structurally always gone by the time the
        // listeners above are registered. circuit-tab stashes them.
        if (window.__bwMachineExtracted && window.__bwMachineExtracted.config &&
            !this.state.machineConfig) {
            this._onMachineExtracted({detail: window.__bwMachineExtracted});
        }
        // The stash is deliberately NOT cleared on consumption: the runner
        // dies with this panel (tab switches remount the whole designer),
        // and a bench that forgets its program on every tab switch is a
        // bench the ASM workflow cannot use. Replaying the last program is
        // the bench's continuity — same stance as the config replay above.
        const pending = window.__bwPendingMedia;
        if (pending) {
            if (pending.type === 'asm') this._onAsmRomReady({detail: pending.detail});
            else this._onMediaLoad({detail: pending.detail});
        }
        // AFTER the replays: an example's auto-run token fired onStart()
        // here, BEFORE the config/media replays ran — so the token built a
        // second runner with neither, and on a machine bench that runner
        // booted the extracted machine with an EMPTY ROM, won state.runner,
        // and put a black VDP on screen while the real program ran unseen.
        this.syncProjectTokens({}, true);
        // The menu comes from bw-board, not from a list duplicated here: it owns
        // which targets exist and what each one is called.
        import(/* webpackChunkName: "bw-board" */ '../../lib/bw-board/index.js')
            .then(async m => {
                if (!m.getTargetKinds) return;
                // ...plus the kinds the app can SELECT and bw-board does not
                // yet LIST. A <select> whose value matches no option shows
                // the first one instead, so an 8086 run would have read
                // "Simulated (STC12 / 8051)". See lib/bw-debug/target-kinds.js
                // — the merge is idempotent, so the upstream fix costs
                // nothing here.
                const kinds = mergeTargetKinds(m.getTargetKinds());
                // The heavy tier is offered only if its engine is actually
                // here. It is a 20 MB artifact fetched at deploy time and
                // loaded on demand, so unlike every other kind it can be
                // genuinely absent — and an entry that fails when clicked is
                // worse than one that is not there. The probe never throws:
                // absence is an answer.
                try {
                    const {isLabwiredAvailable} = await import(
                        /* webpackChunkName: "labwired-probe" */ '../../lib/labwired-engine.js');
                    if (await isLabwiredAvailable() && m.LABWIRED_KIND) kinds.push(m.LABWIRED_KIND);
                } catch (e) {
                    // Probe module missing entirely — same outcome, no entry.
                }
                this.setState({kinds});
            })
            .catch(e => {
                // Degrading to "no picker" is the right call for a genuine
                // failure, but swallowing the reason is not: if the chunk is
                // missing because the deploy moved on, this catch hides it from
                // the global stale-build recovery (which only sees UNHANDLED
                // rejections) and the user gets a silently reduced UI. Ask the
                // recovery first, and if it declines, at least say why the
                // picker is absent instead of pretending it was never there.
                const recovering = typeof window !== 'undefined' &&
                    window.__bwRecoverFromStaleBuild &&
                    window.__bwRecoverFromStaleBuild(e && e.message);
                if (!recovering) console.warn('[brickwright] target picker unavailable:', e);
            });
    }

    componentDidUpdate (prevProps) {
        this.syncDeviceKind();
        this.syncProjectTokens(prevProps, false);
    }

    // When the project's DEVICE declaration changes, switch the default
    // target kind to match the architecture. The user can still override
    // it via the picker — this only sets the default so an Arduino project
    // does not start with "Simulated (emu8051)" selected.
    syncDeviceKind () {
        const rt = this.props.vm && this.props.vm.runtime;
        if (!rt) return;
        const core = rt.bwDeviceCore;
        const dev = rt.bwDeviceId;
        const key = `${core}/${dev}`;
        if (key === this._lastCore) return;
        this._lastCore = key;
        // Device-specific engines first: an ATtiny88 on the coarse
        // core→kind map landed on avr8js (ATmega328P memory map) — or,
        // when no core was published at all, stayed on the 8051 emulator
        // and the pendant's matrix never lit (owner report, 3791c09).
        const DEVICE_TO_KIND = {
            attiny88: 'attiny88', attiny85: 'attiny85',
            'arduino-mega': 'atmega2560', atmega2560: 'atmega2560',
            pico: 'rp2040js', stm32f030: 'stm32f0', eater6502: 'eater6502',
            z80: 'z80', zx48: 'z80', zx128: 'z80', i8086: 'i8086',
        };
        // i8086 was MISSING from this map while the 8086 debug target,
        // extractor and machine were all present: choosing the 8086 (or
        // seating one on the board, which publishes bwDeviceCore = 'i8086')
        // left the panel on whatever engine it already had — the 8051
        // emulator by default — and the 8086 image would have been run as
        // 8051 opcodes. Plausible and wrong, which is the same shape as the
        // ATtiny88 note above.
        const CORE_TO_KIND = { '8051': 'emulator', arduino: 'avr8js', rp2040: 'rp2040js', arm: 'stm32f0', micropython: 'rp2040js', w65c02: 'eater6502', z80: 'z80', i8086: 'i8086' };
        // The user's remembered pick for THIS device wins over the map:
        // choosing an engine in the picker persists per device (see
        // onChange below), so "I always debug my Uno on the 2560 engine"
        // survives a reload. An unknown stored kind (an engine that no
        // longer exists) falls back to the map rather than a dead panel.
        let stored = null;
        try { stored = localStorage.getItem(`bw-emulator-pref:${dev}`); } catch { /* private mode */ }
        const kind = stored || DEVICE_TO_KIND[dev] || CORE_TO_KIND[core];
        if (kind && kind !== this.state.kind) {
            // Changing the kind while a runner exists would leave it on the
            // wrong engine. Destroy it so the next Start creates a fresh one.
            this._teardownRunner();
            this.setState({ kind, runner: null, ui: { phase: 'idle', message: '' } });
        }
    }

    async onFirmwareFile (e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = ''; // same file again should re-trigger
        if (!file) return;
        const buf = new Uint8Array(await file.arrayBuffer());
        const isText = /\.(hex|ihx)$/i.test(file.name) || (buf.length && buf[0] === 0x3a);
        this._userFirmware = {
            name: file.name,
            bytes: isText ? null : buf,
            text: isText ? new TextDecoder().decode(buf) : null
        };
        // The next Start must attach fresh with this image.
        this._teardownRunner();
        this.setState({firmwareName: file.name, runner: null, ui: {phase: 'idle', message: ''}});
    }

    onFirmwareClear () {
        this._userFirmware = null;
        this._teardownRunner();
        this.setState({firmwareName: null, runner: null, ui: {phase: 'idle', message: ''}});
    }

    syncProjectTokens (prevProps, initial) {
        if (this.props.runToken && (initial || this.props.runToken !== prevProps.runToken)) {
            this.onStart();
        }
        if (!initial && this.props.stopToken && this.props.stopToken !== prevProps.stopToken) {
            this.onStop();
        }
    }

    componentWillUnmount () {
        const rt = this.props.vm && this.props.vm.runtime;
        if (rt && rt.off && this._onProjectChanged) rt.off('PROJECT_CHANGED', this._onProjectChanged);
        else if (rt && rt.removeListener && this._onProjectChanged) rt.removeListener('PROJECT_CHANGED', this._onProjectChanged);
        window.removeEventListener('bw-machine-extracted', this._onMachineExtracted);
        if (this._onBoardSource) window.removeEventListener('bw-board-source', this._onBoardSource);
        window.removeEventListener('bw-machine-media-load', this._onMediaLoad);
        window.removeEventListener('bw-asm-rom-ready', this._onAsmRomReady);
        this._teardownRunner();
    }

    tx (key) {
        const table = L10N[this.props.locale] || L10N.en;
        return table[key] || L10N.en[key];
    }

    /** Destroy whatever runner exists OR is still being created. The
     *  creation is async (a chunk import), so a plain state check races —
     *  two concurrent runner() calls once produced two live machines. */
    _teardownRunner () {
        const p = this._runnerPromise;
        this._runnerPromise = null;
        if (p) {
            p.then(r => { if (r) r.destroy(); }).catch(() => {});
        } else if (this.state.runner) {
            this.state.runner.destroy();
        }
    }

    async runner () {
        if (this._runnerPromise) return this._runnerPromise;
        this._runnerPromise = this._createRunner();
        return this._runnerPromise;
    }

    async _createRunner () {
        const {createDebugRunner} = await import(
            /* webpackChunkName: "bw-debug" */ '../../lib/bw-debug/debug-runner.js');
        const runner = createDebugRunner({
            vm: this.props.vm,
            targetKind: this.state.kind,
            machineConfig: this.state.machineConfig,
            bootMedia: this._bootMedia,
            onChange: (ui) => {
                this.setState({ui});
                // The board only exists after attach, and the tab has to be told:
                // until it is, the designer is showing a board of its own that
                // nothing drives. See circuit-tab.jsx.
                if (this.props.onRunnerChange) this.props.onRunnerChange(runner, ui);
            }
        });
        if (this._userFirmware && typeof runner.setFirmware === 'function') {
            runner.setFirmware(this._userFirmware);
        }
        if (this.props.onRunnerChange) this.props.onRunnerChange(runner, this.state.ui);
        // setState is async, so hand the instance back directly rather than
        // reading it out of state on the very next line.
        this.setState({runner});
        return runner;
    }

    async onStart () {
        const runner = await this.runner();
        const phase = this.state.ui.phase;
        if (phase === 'paused') runner.resume();
        else await runner.start();
    }

    onSerialInput (e) { this.setState({serialInput: e.target.value}); }

    onSerialKeyDown (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        this.onSerialSend();
    }

    /** Send the typed line to the machine's UART, terminated with CR.
     *
     *  CR (0x0d), not LF: that is what an ACIA monitor and every BASIC on
     *  these benches read as "line ends here" — bw-circuit-ui's SerialConsole
     *  defaults to the same byte.
     *
     *  NO local echo. BBC BASIC, Tali Forth and the Searle monitor all echo
     *  what they receive, so painting the line here too would double every
     *  character. The console shows what the MACHINE said; if nothing comes
     *  back, that is a fact about the machine worth seeing, not one to hide
     *  behind an echo the UI invented. */
    onSerialSend () {
        const runner = this.state.runner;
        const line = this.state.serialInput;
        if (!runner || typeof runner.sendSerial !== 'function') return;
        runner.sendSerial(`${line}\r`);
        this.setState({serialInput: ''});
    }

    onPause () { if (this.state.runner) this.state.runner.pause(); }
    onStop () { if (this.state.runner) this.state.runner.stop(); }
    async onStep () { (await this.runner()).step('block'); }
    onSpeed (e) { if (this.state.runner) this.state.runner.setSpeed(Number(e.target.value)); }

    render () {
        const {ui} = this.state;
        const {phase, message} = ui;
        const running = phase === 'running' || phase === 'stepping';
        const paused = phase === 'paused';
        const busy = phase === 'building' || phase === 'attaching';
        const why = ui.session && ui.session.why;

        // Capabilities decide what is offered — never an assumption about which
        // target is attached. Before one is attached there is nothing to ask,
        // so the buttons reflect the phase alone.
        const caps = ui.capabilities;
        const canStep = !caps || caps.steps.includes('block');
        // A capability, asked of the runner — the same stance as the step
        // buttons. An 8051 that only prints has no sendSerial and gets no
        // input line rather than a dead one.
        const canSendSerial = !!(this.state.runner &&
            typeof this.state.runner.sendSerial === 'function');

        const inferredBoard = this.state.boardSource === 'inferred';
        return (
            <div data-debug-panel data-debug-phase={phase} style={{
                display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
                background: '#1a1a2e', border: '1px solid #2c3e50', borderRadius: 8,
                fontFamily: 'monospace', fontSize: 12, color: '#bdc3c7'
            }}>
                {inferredBoard ? (
                    <div data-inferred-board-warning role="alert" style={{
                        display: 'flex', gap: 8, alignItems: 'flex-start',
                        background: '#7f1d1d', border: '1px solid #ef4444',
                        borderRadius: 6, padding: '6px 8px', color: '#fecaca',
                        fontWeight: 700
                    }}>
                        <span aria-hidden style={{fontSize: 14}}>{'\u26a0'}</span>
                        <span>
                            {/^de/i.test(String(this.props.locale || (typeof navigator !== 'undefined' && navigator.language) || 'en'))
                                ? 'IMPROVISIERTES Testboard: Der Debugger hat aus den PIN-Zeilen ein Ersatzboard erraten — das ist NICHT die Schaltung des Beispiels. Öffne den Circuit-Tab, um das echte Board zu laden.'
                                : 'IMPROVISED test board: the debugger guessed a stand-in from the PIN lines — this is NOT the example\u2019s circuit. Open the Circuit tab to load the real board.'}
                        </span>
                    </div>
                ) : null}
                <div style={{display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap'}}>
                    <button
                        style={running || busy ? OFF : {...BTN, borderColor: '#2ecc71', color: '#2ecc71'}}
                        disabled={running || busy}
                        onClick={this.onStart}
                        title={paused ? 'Resume' : 'Build, load and run'}
                    >{'▶ '}{this.tx('run')}</button>

                    <button
                        style={running ? BTN : OFF}
                        disabled={!running}
                        onClick={this.onPause}
                    >{'⏸ '}{this.tx('pause')}</button>

                    <button
                        style={canStep && !busy ? BTN : OFF}
                        disabled={!canStep || busy}
                        onClick={this.onStep}
                        title={canStep ? this.tx('stepHint')
                            : 'This target cannot step one block'}
                    >{'⏭ '}{this.tx('step')}</button>

                    <button
                        style={running || paused ? {...BTN, borderColor: '#c0392b', color: '#e74c3c'} : OFF}
                        disabled={!running && !paused}
                        onClick={this.onStop}
                    >{'⏹ '}{this.tx('stop')}</button>

                    {/* The target picker. Everything else in this panel branches on
                        capabilities(), never on which target is selected — §1 is
                        explicit that an interface hiding the differences "produces a
                        front end that lies to the user the moment it is pointed at
                        real hardware". So this chooses; it does not adapt. */}
                    {/* Arbitrary firmware: run YOUR .bin/.hex instead of the
                        blocks. No symbols, so glow/yield-breakpoints disappear
                        — pins, board, serial and stepping stay. */}
                    <span style={{display: 'inline-flex', alignItems: 'center', gap: 4}}>
                        <label style={{...BTN, padding: '3px 6px', cursor: 'pointer'}}
                            title={'Load a firmware file (.bin for Pico/STM32, .hex/.ihx for 8051/AVR) and run it instead of the blocks'}>
                            {'📂'}
                            <input
                                type="file"
                                accept=".bin,.hex,.ihx"
                                style={{display: 'none'}}
                                disabled={running || paused || busy}
                                onChange={e => this.onFirmwareFile(e)}
                            />
                        </label>
                        {this.state.firmwareName ? (
                            <span style={{fontSize: 11, opacity: 0.85}}>
                                {this.state.firmwareName}
                                <button
                                    style={{...BTN, padding: '0 4px', marginLeft: 3}}
                                    title={'Back to running the blocks'}
                                    onClick={() => this.onFirmwareClear()}
                                >{'✕'}</button>
                            </span>
                        ) : null}
                    </span>
                    {this.state.kinds && this.state.kinds.length > 1 ? (
                        <span style={{display: 'flex', alignItems: 'center', gap: 6}}>
                            <select
                                value={this.state.kind}
                                disabled={running || paused || busy}
                                title={(this.state.kinds.find(k => k.kind === this.state.kind) || {}).description}
                                onChange={e => {
                                    const kind = e.target.value;
                                    // Persist per device — the setting the
                                    // picker IS. Cleared by picking the
                                    // device's default again.
                                    try {
                                        const rt = this.props.vm && this.props.vm.runtime;
                                        const dev = rt && rt.bwDeviceId;
                                        if (dev) localStorage.setItem(`bw-emulator-pref:${dev}`, kind);
                                    } catch { /* private mode */ }
                                    this.setState({kind});
                                }}
                                style={{...BTN, padding: '3px 6px'}}
                            >
                                {this.state.kinds.map(k => (
                                    <option key={k.kind} value={k.kind}>{k.label}</option>
                                ))}
                            </select>
                        </span>
                    ) : null}

                    <span style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6}}>
                        <label htmlFor="bw-debug-speed">{this.tx('speed')}</label>
                        <select
                            id="bw-debug-speed"
                            defaultValue="1"
                            onChange={this.onSpeed}
                            style={{...BTN, padding: '3px 6px'}}
                        >
                            <option value="0.1">{'0.1×'}</option>
                            <option value="0.5">{'0.5×'}</option>
                            <option value="1">{'1×'}</option>
                            <option value="4">{'4×'}</option>
                        </select>
                    </span>
                </div>

                {/* What this target cannot do, named rather than left as greyed
                    buttons with no explanation. The capability matrix is a teaching
                    surface: a live chip has no code breakpoints because the part has
                    no PSEN, and saying so is the point. */}
                {caps && caps.consumes && caps.consumes.length ? (
                    <div style={{color: '#f39c12', fontSize: 11}}>
                        {`${this.tx('consumes')} ${caps.consumes.join(', ')}`}
                    </div>
                ) : null}

                {/* THE HEAVY TIER'S CAVEATS, STATED WHERE THE ENGINE IS PICKED.
                    Both are properties of the engine and both are measured (the
                    light tier is the control in each case — bw-board
                    LABWIRED-BRIDGE.md §4 and §4c), so they are true before the
                    first Run and must be readable before it, not discovered
                    afterwards from a blink that comes out at half the asked
                    period. Once a session attaches, ui.engineNotes carries the
                    same two plus this bench's own refusal ledger, so this static
                    pair steps aside rather than being said twice. */}
                {this.state.kind === 'labwired' && !(ui.engineNotes || []).length ? (
                    <div style={{color: '#f39c12', fontSize: 11}}>
                        {this.tx('lwCaveats')}
                    </div>
                ) : null}
                {(ui.engineNotes || []).length ? (
                    <div style={{color: '#f39c12', fontSize: 11}}>
                        {ui.engineNotes.map((n, i) => (
                            <div key={i}>{`• ${n}`}</div>
                        ))}
                    </div>
                ) : null}

                {/* WHERE THIS IMAGE CAME FROM, when it was not compiled just now.
                    Neutral grey and not amber: a prebuilt image is provenance,
                    not a refusal, and the amber block above is where a learner
                    reads "something here does not work". The sentence says all
                    three parts — nothing was compiled, what it was built from
                    and when, and that an edit makes it stop applying — because
                    a reader who edits the program must not be left believing
                    the prebuilt image still describes it. See D2 in
                    docs/WAVE-OPEN-DEFECTS.md. */}
                {ui.imageProvenance ? (
                    <div
                        data-image-provenance={ui.imageProvenance.exampleId}
                        data-image-toolchain={ui.imageProvenance.toolchain || ''}
                        style={{color: '#7f8c8d', fontSize: 11}}
                    >{ui.imageProvenance.sentence}</div>
                ) : null}

                <div style={{display: 'flex', gap: 10, alignItems: 'baseline'}}>
                    <strong style={{color: phase === 'error' ? '#e74c3c'
                        : running ? '#2ecc71' : paused ? '#f39c12' : '#7f8c8d'}}>
                        {this.tx(phase) || phase}
                    </strong>
                    {message ? <span style={{color: '#7f8c8d'}}>{message}</span> : null}
                </div>

                {/* What the user has marked, and what this build can actually do
                    with it. A mark on a block with no yield point is kept rather
                    than refused (block-menu.js), so it has to be VISIBLE — an
                    invisible mark that never fires is the worst of both. */}
                <div style={{borderTop: '1px solid #2c3e50', paddingTop: 8}}>
                    <div style={{color: '#7f8c8d', marginBottom: 4}}>
                        {this.tx('bps')}
                        {ui.breakpoints && ui.breakpoints.length
                            ? ` (${ui.breakpoints.length})` : ''}
                    </div>
                    {!ui.breakpoints || !ui.breakpoints.length ? (
                        <div style={{color: '#5d6d7e'}}>{this.tx('noBps')}</div>
                    ) : (
                        <div style={{color: '#95a5a6'}}>
                            {ui.breakpoints.map(id => {
                                const dead = (ui.unreachableBreakpoints || []).includes(id);
                                return (
                                    <div key={id} style={{color: dead ? '#7f8c8d' : '#ecf0f1'}}>
                                        {'● '}
                                        {(ui.yieldKinds && ui.yieldKinds[id]) || id.slice(0, 8)}
                                        {/* The condition belongs NEXT TO the mark:
                                            a pause point that has one and does not
                                            say so is the hardest kind to debug. */}
                                        {ui.conditions && ui.conditions[id] ? (
                                            <span style={{color: '#3498db', marginLeft: 6}}>
                                                {`when ${ui.conditions[id]}`}
                                            </span>
                                        ) : null}
                                        {ui.conditionErrors && ui.conditionErrors[id] ? (
                                            <span style={{color: '#e74c3c', marginLeft: 6}}>
                                                {ui.conditionErrors[id]}
                                            </span>
                                        ) : null}
                                        {dead ? ` — ${this.tx('unreachable')}` : ''}
                                    </div>
                                );
                            })}
                            {ui.skippedHits ? (
                                <div style={{fontSize: 11, marginTop: 4, color: '#5d6d7e'}}>
                                    {`${ui.skippedHits.toLocaleString()} ${this.tx('skipped')}`}
                                </div>
                            ) : null}
                            {(ui.unreachableBreakpoints || []).length ? (
                                <div style={{fontSize: 11, marginTop: 4, color: '#7f8c8d'}}>
                                    {this.tx('unreachableWhy')}
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>

                {/* VDP screen — video output from machines with a TMS9918A.
                    Polls runner.video() per animation frame. Only renders
                    when video() returns non-null (the machine has a VDP). */}
                {this.state.runner && typeof this.state.runner.video === 'function' ? (
                    <React.Suspense fallback={null}>
                        <VdpScreen
                            videoFn={this._videoFn}
                            {...(this.state.runner && typeof this.state.runner.keyIn === 'function'
                                ? {sendScancodeFn: this._scancodeFn} : {})}
                            lang={this.props.locale}
                            data-testid="bw-vdp-screen"
                        />
                    </React.Suspense>
                ) : null}

                {/* SWITCHES AND SENSORS. Mounted only when the machine
                    declares inputs -- a panel of toggles that drive nothing
                    is indistinguishable from a program ignoring the user, so
                    the absence of hardware is the absence of the control. */}
                {this.state.runner && Array.isArray(this.state.runner.inputs)
                    && this.state.runner.inputs.length ? (
                        <React.Suspense fallback={null}>
                            <SwitchPanel
                                inputs={this.state.runner.inputs}
                                setInputFn={this._setInputFn}
                            />
                        </React.Suspense>
                    ) : null}

                {/* What is happening, in the user's own nouns. This comes FIRST
                    and the machine's view comes underneath — the order every
                    mature debugger uses, and the one this could not offer until
                    the symbol table learned which memory holds `counter`. */}
                {this.state.runner ? (
                    <DebugInspector runner={this.state.runner} locale={this.props.locale} />
                ) : null}

                {/* Where the program is, and what may honestly be said about
                    how it got there (D28). Sits between the user's nouns and
                    the machine's view because that is what it is: the position
                    in the user's terms, with the addresses that make it
                    checkable. On the C target it leads with the reason there
                    is no call stack to list. */}
                {this.state.runner ? (
                    <DebugFrames
                        runner={this.state.runner}
                        ui={ui}
                        kind={this.state.kind}
                        locale={this.props.locale}
                    />
                ) : null}

                {/* Parity with emu8051's TUI, closed by default: opening it is
                    the user declaring they want the engineer's view. */}
                {this.state.runner ? (
                    <DebugDrawer
                        runner={this.state.runner}
                        ui={ui}
                        locale={this.props.locale}
                        clockHz={this.props.clockHz}
                    />
                ) : null}

                {/* Serial console — print output from the AVR USART / 8051 UART,
                    and the BASIC/monitor prompt on a retro bench. The runner
                    buffers serialLines and exposes snapshot.serialOutput; this
                    is the UI consumer.

                    It shows as soon as the machine can RECEIVE, not only once
                    it has said something: a console that is output-only is a
                    terminal with the keyboard unplugged — you can watch BBC
                    BASIC print its banner and have no way to answer it. */}
                {(ui.serialOutput && ui.serialOutput.length) || canSendSerial ? (
                    <div style={{borderTop: '1px solid #2c3e50', paddingTop: 8}}>
                        <div style={{color: '#7f8c8d', marginBottom: 4}}>
                            {'Serial'}
                            {ui.serialOutput && ui.serialOutput.length
                                ? ` (${ui.serialOutput.length})` : ''}
                        </div>
                        <pre
                            data-testid="bw-serial-console"
                            style={{
                                margin: 0, padding: 6, maxHeight: 120, overflow: 'auto',
                                background: '#0d1117', color: '#2ecc71', fontSize: 11,
                                borderRadius: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                fontFamily: 'monospace'
                            }}
                        >{(ui.serialOutput || []).join('\n')}</pre>
                        {canSendSerial ? (
                            <div style={{display: 'flex', gap: 6, marginTop: 4, alignItems: 'center'}}>
                                <span style={{color: '#2ecc71'}}>{'>'}</span>
                                <input
                                    data-testid="bw-serial-input"
                                    type="text"
                                    value={this.state.serialInput}
                                    onChange={this.onSerialInput}
                                    onKeyDown={this.onSerialKeyDown}
                                    placeholder={this.tx('serialHint')}
                                    aria-label={this.tx('serialSend')}
                                    style={{
                                        flex: '1 1 auto', minWidth: 0, padding: '4px 6px',
                                        background: '#0d1117', color: '#2ecc71',
                                        border: '1px solid #2c3e50', borderRadius: 4,
                                        fontFamily: 'monospace', fontSize: 11
                                    }}
                                />
                                <button
                                    data-testid="bw-serial-send"
                                    style={{...BTN, padding: '3px 10px'}}
                                    onClick={this.onSerialSend}
                                    title={this.tx('serialSend')}
                                >{'⏎'}</button>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {/* Level 1 is yield-to-yield. Say so, rather than letting the
                    highlight imply a precision the position does not have. */}
                {paused && why ? (
                    <div style={{color: '#95a5a6'}}>
                        <div>
                            {this.tx('pausedAt')}
                            {' '}
                            <code style={{color: '#ecf0f1'}}>
                                {`PC ${Number.isFinite(why.pc) ? '0x' + why.pc.toString(16).padStart(4, '0') : '?'}`}
                            </code>
                            {' '}
                            {this.tx('afterMs')}
                            {' '}
                            {`${(Number(why.tNs) / 1e6).toFixed(2)} ms`}
                        </div>
                        {/* A watchpoint halt is the one stop whose subject is
                            an ADDRESS rather than a PC. "Paused at PC 0x0142"
                            is not an answer to "what wrote my variable?", so
                            the byte and its transition are reported here. The
                            previous value travels with the new one because the
                            transition is the evidence — a value with no before
                            is half a measurement. */}
                        {why.cause === 'watchpoint' && Number.isFinite(why.addr) ? (
                            <div style={{marginTop: 4}} data-watch-hit>
                                <span style={{color: '#f39c12'}}>{this.tx('watchHit')}</span>
                                {' '}
                                <code style={{color: '#ecf0f1'}}>
                                    {`${why.space || 'iram'} 0x${why.addr.toString(16).toUpperCase().padStart(2, '0')}`}
                                </code>
                                {Number.isFinite(why.value) ? (
                                    <span>
                                        {' — '}
                                        {this.tx('watchWas')}
                                        {' '}
                                        <code style={{color: '#95a5a6'}}>
                                            {`0x${(why.prev >>> 0).toString(16).toUpperCase().padStart(2, '0')}`}
                                        </code>
                                        {', '}
                                        {this.tx('watchNow')}
                                        {' '}
                                        <code style={{color: '#2ecc71'}}>
                                            {`0x${(why.value >>> 0).toString(16).toUpperCase().padStart(2, '0')}`}
                                        </code>
                                        {` (${why.value})`}
                                    </span>
                                ) : null}
                                <div style={{fontSize: 11, marginTop: 2, color: '#7f8c8d'}}>
                                    {this.tx('watchNote')}
                                </div>
                            </div>
                        ) : null}
                        <div style={{fontSize: 11, marginTop: 4}}>{this.tx('yieldNote')}</div>
                    </div>
                ) : null}
            </div>
        );
    }
}

DebugPanel.propTypes = {
    clockHz: PropTypes.number,
    onRunnerChange: PropTypes.func,
    runToken: PropTypes.number,
    stopToken: PropTypes.number,
    locale: PropTypes.string,
    vm: PropTypes.shape({toJSON: PropTypes.func, runtime: PropTypes.object}).isRequired
};

export default connect(state => ({
    vm: state.scratchGui.vm,
    locale: state.locales.locale
}))(DebugPanel);
