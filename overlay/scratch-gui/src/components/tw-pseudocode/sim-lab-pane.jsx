// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Sim Lab (beta): a LEGO model built from real parts, simulated with
// physics, driven by the virtual SPIKE hub that every programming route
// already talks to (docs/SIM-LAB-PLAN.md). This pane only loads a model,
// runs the clock and shows the 3D view; everything else is in lib/bw-sim,
// reached through ONE dynamic import so the first load does not grow.
//
// One clock (docs/SPIKE-ARENA.md): while the Sim Lab runs, its session owns
// the hub's motor clock; the arena is not mounted at the same time (the
// simulator pane shows one or the other).
//
// The model is saved with the project (C8) the way every other Brickwright
// surface is (lib/bw-project-bundle.js): one localStorage key, carried as the
// bundle's `simLab` section. On `bw-project-bundle-collect` the pane writes
// the model it shows; on mount and on `bw-project-bundle-loaded` it opens the
// stored one. While the pane is not mounted the key simply keeps what the
// project load put there, so nothing is lost and nothing is pending.

import React from 'react';
import {pickLocale, browserLocale} from '../../lib/bw-i18n.js';
import {SIM_LAB_STORAGE_KEY, simLabRecordFromText, readSimLabStorage, isStorableName} from '../../lib/bw-sim/model/sim-lab-persist.js';
import SimLabPalette from './sim-lab-palette.jsx';
import SimLabInstructions from './sim-lab-instructions.jsx';
import {INSIGHT_TEXT, issueSentence, fillText} from './sim-lab-insight-text.js';

const TEXT = {
    en: {
        title: 'Robot Lab (beta)',
        intro: 'A model from real LEGO® Technic parts with physics. Write a SPIKE Prime program (ports A and B drive the wheels) and press Run: it starts on the green flag.',
        model: 'Model', importModel: 'Open .ldr…', run: 'Run', pause: 'Pause', reset: 'Reset',
        loading: 'Loading the model and the physics engine…', ready: 'Ready', running: 'Running', paused: 'Paused',
        failed: 'Could not load the model: {error}', physicsFailed: 'The physics stopped: {error}. Press Reset to start again.', noWebgl: 'This browser cannot show the 3D view ({error}). The simulation still runs.',
        connectFailed: 'Could not connect the program to the virtual hub: {error}',
        noProgram: 'No SPIKE program is loaded yet, so nothing tells the motors to turn. Write one in the Code tab and press ⇦ To blocks (or build it with blocks), then press Run — or drive the robot with the arrows below.',
        example: 'Load example program', exampleOffer: 'This robot comes with an example program. Press Load example program to put it in the Code tab, then press Run.',
        exampleLoaded: 'The example program is in the Code tab now. Press Run.',
        exampleGoal: {
            'line-follower.bw': 'The example program is in the Code tab now. Press Run and watch the robot follow the black line.',
            'wall-stopper.bw': 'The example program is in the Code tab now. Press Run and watch the robot stop before the wall. Challenge: make it stop 20 cm away.',
            'colour-explorer.bw': 'The example program is in the Code tab now. Press Run and watch the robot find the red square. Challenge: make it find the green one.'
        },
        exampleFailed: 'Could not load the example program: {error}',
        mat: 'Mat', drive: 'Drive', forward: 'Forward', back: 'Back', left: 'Left', right: 'Right', stop: 'Stop', speed: 'Speed',
        driveHelp: 'Hold an arrow (or use the arrow keys) to drive with motors A and B.', readout: 'Hub',
        issues: 'Notes about this model', time: 'Simulated time: {s} s', canvasLabel: '3D view of the simulated model',
        simulate: 'Simulate', build: 'Build', parts: 'Parts', undo: 'Undo', redo: 'Redo', remove: 'Delete',
        save: 'Save .ldr', port: 'Port', none: 'none',
        instructions: 'Instructions', instructionsHelp: 'Step-by-step building instructions for this robot, to build it from real LEGO® parts',
        search: 'Search parts', searchHint: 'Search: name or number', clearSearch: 'Clear the search', recent: 'Recently used',
        noMatches: 'No part matches “{q}”.', partTitle: '{name} · part {number}',
        paletteHelp: 'Click a part, then click in the view. Or drag it into the view.',
        move: 'Move (W)', turn: 'Turn (E)', grid: 'Grid', ldu: 'LDU', turnUp: 'Turn ↻ (R)', tip: 'Tip (T)',
        duplicate: 'Duplicate', group: 'Group', ungroup: 'Ungroup', groupKey: 'Ctrl+G', ungroupKey: 'Ctrl+Shift+G', home: 'Home', fit: 'Fit (F)', top: 'Top', front: 'Front', side: 'Side',
        selectedOne: 'Selected: {name}', selectedMany: 'Selected: {n} parts',
        st: {
            idle: 'Click a part to select it. Drag it to move it; Shift+click adds parts; drag empty space to look around.',
            hover: '{part}: click to select, drag to move', hoverSelected: '{part}: drag to move, R turns, Delete removes',
            placing: 'Placing {part}: click to place, R turns, Alt: no magnet, Esc stops',
            dragging: 'Drag {part} into the view and let go to place it (Esc cancels)',
            snap: 'Snaps to {target} hole {hole}', snapNoHole: 'Snaps to {target}', snapped: 'Snapped to {target} hole {hole}', snappedNoHole: 'Snapped to {target}',
            floor: 'On the floor', onTop: 'On top of {target}', moving: 'Moving x {x}, y {y}, z {z} LDU (1 hole = 20)',
            turning: 'Turning {deg}° (hold Shift for 15° steps)', turned: 'Turned 90°', turnedAbout: 'Turned about its connection to {target}',
            grouped: '{n} parts grouped: clicking one selects all', ungrouped: 'Group taken apart',
            groupNeedsTwo: 'Select at least two parts to group them (Shift+click).', notGrouped: 'The selection is not in a group.',
            moved: 'Moved', placed: 'Placed {part}', selected: '{n} selected', deleted: 'Deleted {n}', pasted: 'Added {n} copies', copied: 'Copied {n}',
            undone: 'Undone', redone: 'Redone',
            gizmoArrow: 'Drag the {color} arrow to move along {axis}', gizmoPlane: 'Drag the square to move in the {axis} plane',
            gizmoRing: 'Drag the {color} ring to turn (90° steps, Shift: 15°)', red: 'red', green: 'green', blue: 'blue',
            nothingSelected: 'Select a part first (click it).', clipboardEmpty: 'Nothing copied yet: select parts and press Ctrl+C.', noRoom: 'No free spot next to it: move the parts apart first.',
            nothingToUndo: 'Nothing to undo.', nothingToRedo: 'Nothing to redo.', invalid: 'That does not work here: {detail}',
            blocked: 'Would go into {target}: let go and it stays where it was',
            overlapMove: 'Not moved: it would go into {target}.', overlapPlace: 'Not placed: it would go into {target}.',
            overlapTurn: 'Not turned: it would go into {target}.'
        }
    },
    de: {
        title: 'Roboter-Labor (Beta)',
        intro: 'Ein Modell aus echten LEGO®-Technic-Teilen mit Physik. Schreibe ein SPIKE-Prime-Programm (Ports A und B treiben die Räder an) und drücke Start: es beginnt mit der grünen Flagge.',
        model: 'Modell', importModel: '.ldr öffnen…', run: 'Start', pause: 'Pause', reset: 'Zurücksetzen',
        loading: 'Modell und Physik-Engine werden geladen…', ready: 'Bereit', running: 'Läuft', paused: 'Pausiert',
        failed: 'Das Modell konnte nicht geladen werden: {error}', physicsFailed: 'Die Physik ist stehen geblieben: {error}. Mit Zurücksetzen geht es neu los.', noWebgl: 'Dieser Browser kann die 3D-Ansicht nicht zeigen ({error}). Die Simulation läuft trotzdem.',
        connectFailed: 'Das Programm konnte nicht mit dem virtuellen Hub verbunden werden: {error}',
        noProgram: 'Es ist noch kein SPIKE-Programm geladen, darum dreht sich kein Motor. Schreibe eins im Code-Tab und drücke ⇦ Zu Blöcken (oder baue es aus Blöcken), dann Start — oder fahre den Roboter mit den Pfeilen unten.',
        example: 'Beispielprogramm laden', exampleOffer: 'Zu diesem Roboter gibt es ein Beispielprogramm. Drücke Beispielprogramm laden, dann steht es im Code-Tab, und drücke Start.',
        exampleLoaded: 'Das Beispielprogramm steht jetzt im Code-Tab. Drücke Start.',
        exampleGoal: {
            'line-follower.bw': 'Das Beispielprogramm steht jetzt im Code-Tab. Drücke Start und schau zu, wie der Roboter der schwarzen Linie folgt.',
            'wall-stopper.bw': 'Das Beispielprogramm steht jetzt im Code-Tab. Drücke Start und schau zu, wie der Roboter vor der Wand anhält. Aufgabe: Lass ihn 20 cm vor der Wand anhalten.',
            'colour-explorer.bw': 'Das Beispielprogramm steht jetzt im Code-Tab. Drücke Start und schau zu, wie der Roboter das rote Feld findet. Aufgabe: Lass ihn das grüne finden.'
        },
        exampleFailed: 'Das Beispielprogramm konnte nicht geladen werden: {error}',
        mat: 'Matte', drive: 'Fahren', forward: 'Vorwärts', back: 'Rückwärts', left: 'Links', right: 'Rechts', stop: 'Stopp', speed: 'Tempo',
        driveHelp: 'Halte einen Pfeil gedrückt (oder nutze die Pfeiltasten), um mit den Motoren A und B zu fahren.', readout: 'Hub',
        issues: 'Hinweise zu diesem Modell', time: 'Simulierte Zeit: {s} s', canvasLabel: '3D-Ansicht des simulierten Modells',
        simulate: 'Simulieren', build: 'Bauen', parts: 'Teile', undo: 'Rückgängig', redo: 'Wiederholen', remove: 'Löschen',
        save: '.ldr speichern', port: 'Port', none: 'keiner',
        instructions: 'Bauanleitung', instructionsHelp: 'Bauanleitung für diesen Roboter, Schritt für Schritt, zum Nachbauen mit echten LEGO®-Teilen',
        search: 'Teile suchen', searchHint: 'Suche: Name oder Nummer', clearSearch: 'Suche löschen', recent: 'Zuletzt benutzt',
        noMatches: 'Kein Teil passt zu „{q}“.', partTitle: '{name} · Teil {number}',
        paletteHelp: 'Klicke ein Teil an, dann in die Ansicht. Oder zieh es in die Ansicht.',
        move: 'Schieben (W)', turn: 'Drehen (E)', grid: 'Raster', ldu: 'LDU', turnUp: 'Drehen ↻ (R)', tip: 'Kippen (T)',
        duplicate: 'Verdoppeln', group: 'Gruppieren', ungroup: 'Gruppe lösen', groupKey: 'Strg+G', ungroupKey: 'Strg+Umschalt+G', home: 'Start', fit: 'Einpassen (F)', top: 'Oben', front: 'Vorne', side: 'Seite',
        selectedOne: 'Ausgewählt: {name}', selectedMany: 'Ausgewählt: {n} Teile',
        st: {
            idle: 'Klicke ein Teil an, um es auszuwählen. Ziehen verschiebt es; Umschalt+Klick wählt mehr Teile; Ziehen auf leerer Fläche dreht die Ansicht.',
            hover: '{part}: klicken wählt aus, ziehen verschiebt', hoverSelected: '{part}: ziehen verschiebt, R dreht, Entf löscht',
            placing: '{part} platzieren: klicken setzt, R dreht, Alt: ohne Magnet, Esc beendet',
            dragging: 'Zieh {part} in die Ansicht und lass los, um es zu setzen (Esc bricht ab)',
            snap: 'Rastet an {target} Loch {hole} ein', snapNoHole: 'Rastet an {target} ein', snapped: 'An {target} Loch {hole} eingerastet', snappedNoHole: 'An {target} eingerastet',
            floor: 'Auf dem Boden', onTop: 'Oben auf {target}', moving: 'Verschieben x {x}, y {y}, z {z} LDU (1 Loch = 20)',
            turning: 'Drehen {deg}° (Umschalt halten: 15°-Schritte)', turned: 'Um 90° gedreht', turnedAbout: 'Um die Verbindung zu {target} gedreht',
            grouped: '{n} Teile gruppiert: ein Klick wählt alle', ungrouped: 'Gruppe aufgelöst',
            groupNeedsTwo: 'Wähle mindestens zwei Teile aus, um sie zu gruppieren (Umschalt+Klick).', notGrouped: 'Die Auswahl ist in keiner Gruppe.',
            moved: 'Verschoben', placed: '{part} gesetzt', selected: '{n} ausgewählt', deleted: '{n} gelöscht', pasted: '{n} Kopien eingefügt', copied: '{n} kopiert',
            undone: 'Rückgängig gemacht', redone: 'Wiederhergestellt',
            gizmoArrow: 'Ziehe den {color} Pfeil, um entlang {axis} zu schieben', gizmoPlane: 'Ziehe das Quadrat, um in der {axis}-Ebene zu schieben',
            gizmoRing: 'Ziehe den {color} Ring zum Drehen (90°-Schritte, Umschalt: 15°)', red: 'roten', green: 'grünen', blue: 'blauen',
            nothingSelected: 'Wähle zuerst ein Teil aus (anklicken).', clipboardEmpty: 'Noch nichts kopiert: Teile auswählen und Strg+C drücken.', noRoom: 'Kein freier Platz daneben: rück die Teile erst auseinander.',
            nothingToUndo: 'Nichts rückgängig zu machen.', nothingToRedo: 'Nichts zu wiederholen.', invalid: 'Das geht hier nicht: {detail}',
            blocked: 'Würde in {target} hineinragen: loslassen lässt es, wo es war',
            overlapMove: 'Nicht verschoben: Es würde in {target} hineinragen.', overlapPlace: 'Nicht gesetzt: Es würde in {target} hineinragen.',
            overlapTurn: 'Nicht gedreht: Es würde in {target} hineinragen.'
        }
    }
};

/** Longest step the pane hands the physics per frame: a backgrounded tab must not jump seconds ahead. */
const MAX_FRAME_MS = 50;
/** Build mode recompiles the model this long after the last edit (ms), for the issues and the motion overlay. */
const INSIGHT_DEBOUNCE_MS = 150;
/** How long "show me these parts" pulses them in Simulate (ms). */
const HIGHLIGHT_MS = 3000;
/** The `0 <title>` line every model the pane writes carries (it is not parsed back, so it must not vary). */
const MODEL_TITLE = 'Robot Lab model';

class SimLabPane extends React.Component {
    constructor (props) {
        super(props);
        const locale = pickLocale(props.locale || browserLocale(), TEXT);
        this.locale = locale;
        this.text = TEXT[locale];
        this.itext = INSIGHT_TEXT[locale] || INSIGHT_TEXT.en;
        this.state = {status: 'loading', message: '', info: '', driveSpeed: 50, issues: [], modelFile: null, simMs: 0, view3d: 'loading',
            mode: 'simulate', placing: null, selection: [], editorTick: 0, mat: null,
            buildStatus: {kind: 'idle'}, gizmoMode: 'move', grid: 10, recent: [], thumbTick: 0,
            showPorts: true, showMotion: false, blockers: [], portPicker: null, instructions: null};
        this.viewWrap = React.createRef();
        this.box = React.createRef();
        this.file = React.createRef();
        this.lib = null;
        this.session = null;
        this.view = null;
        this.frame = this.frame.bind(this);
        this.onBundleCollect = this.onBundleCollect.bind(this);
        this.onBundleLoaded = this.onBundleLoaded.bind(this);
        this.requestThumb = this.requestThumb.bind(this);
        this.armPart = this.armPart.bind(this);
        this.pressPart = this.pressPart.bind(this);
        /** Palette parts waiting for their picture (drawn a few per frame in `frame`). */
        this.thumbQueue = new Set();
        this.thumbs = null;
        this.last = null;
    }

    t (key, values = {}) {
        return this.text[key].replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));
    }

    async componentDidMount () {
        window.__bwSimLab = {
            get status () { return this._pane.state.status; },
            get issues () { return this._pane.state.issues; },
            get snapshot () { return this._pane.session ? this._pane.session.snapshot() : null; },
            /** Whether the physics runs in the Web Worker (false: on the main thread, see workerError). */
            get worker () { return this._pane.session ? this._pane.session.worker : null; },
            get workerError () { return this._pane.session ? this._pane.session.workerError : null; },
            get view3d () { return this._pane.state.view3d; },
            get mode () { return this._pane.state.mode; },
            get editor () { return this._pane.editor || null; },
            get editView () { return this._pane.editView || null; },
            get projectRecord () { return this._pane.currentRecord(); },
            get blockers () { return this._pane.state.blockers; },
            /** The last Build-mode compile for the issues and the overlay: {ms, parts}. */
            get insight () { return this._pane.lastInsight || null; },
            _pane: this
        };
        window.addEventListener('bw-project-bundle-collect', this.onBundleCollect);
        window.addEventListener('bw-project-bundle-loaded', this.onBundleLoaded);
        try {
            this.lib = await import(/* webpackChunkName: "bw-sim-lab" */ '../../lib/bw-sim/sim-lab.js');
        } catch (error) {
            if (!this.disposed) this.setState({status: 'failed', message: this.t('failed', {error: error.message})});
            return;
        }
        if (this.disposed) return;
        this.raf = requestAnimationFrame(this.frame);
        await this.openStored();
    }

    componentWillUnmount () {
        // Flush first: a Build-mode edit made just before switching to the arena
        // tab must still be in the next save.
        this.onBundleCollect();
        window.removeEventListener('bw-project-bundle-collect', this.onBundleCollect);
        window.removeEventListener('bw-project-bundle-loaded', this.onBundleLoaded);
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        this.teardown();
        this.teardownEditor();
        if (this.physics) this.physics.terminate();
        this.physics = null;
        if (window.__bwSimLab && window.__bwSimLab._pane === this) delete window.__bwSimLab;
    }

    teardownEditor () {
        clearTimeout(this.insightTimer);
        if (this.unsubscribeInsight) this.unsubscribeInsight();
        this.unsubscribeInsight = null;
        if (this.editView) { try { this.editView.dispose(); } catch { /* a lost context may already be gone */ } }
        this.editView = null;
        this.editor = null;
        // The pictures stay drawn (part-thumbnails.js keeps them); only the renderer goes.
        if (this.thumbs) { try { this.thumbs.dispose(); } catch { /* a lost context may already be gone */ } }
        this.thumbs = null;
        this.thumbQueue.clear();
    }

    /** Build mode: the current model (or an empty one) in the editor. */
    async enterBuild () {
        const {createEditor, createEditorView3D, createPartThumbnails, fetchLDrawClosure, parseLDConfig, CATALOG, DEFAULT_COLOR} = this.lib;
        const model = this.session ? this.session.model : {version: 1, parts: []};
        this.pause();
        this.teardown();
        this.teardownEditor();
        this.setState({mode: 'build', status: 'loading', message: '', placing: null, selection: [], buildStatus: {kind: 'idle'}, gizmoMode: 'move', portPicker: null});
        // Any palette part may be placed, so load the whole catalog's geometry once.
        if (!this.catalogFiles) this.catalogFiles = await fetchLDrawClosure([...CATALOG.keys()], {withConfig: true});
        if (this.disposed) return;
        const {read} = this.catalogFiles;
        this.editor = createEditor({model, catalog: CATALOG});
        const colors = parseLDConfig(read('ldconfig.ldr'));
        try {
            this.editView = createEditorView3D({container: this.box.current, read, colors,
                catalog: CATALOG, editor: this.editor,
                // A port picker belongs to the one part it was opened for.
                onSelect: selection => this.setState(s => ({selection,
                    portPicker: s.portPicker && selection.includes(s.portPicker.id) ? s.portPicker : null})),
                onChange: (model, info) => this.setState(s => ({editorTick: s.editorTick + 1,
                    recent: info && info.placed ? this.lib.pushRecent(s.recent, info.placed) : s.recent})),
                onStatus: buildStatus => this.setState({buildStatus}),
                onTool: placing => this.setState({placing}),
                onMode: gizmoMode => this.setState({gizmoMode}),
                portLabel: item => this.portLabelText(item),
                onPortLabel: (id, rect) => this.openPortPicker(id, rect)});
            this.editView.setGrid(this.state.grid);
            // Palette pictures: null without WebGL (the palette then shows names only).
            this.thumbs = createPartThumbnails({read, colors, color: DEFAULT_COLOR});
            this.editView.setOverlay({ports: this.state.showPorts, motion: this.state.showMotion});
            this.unsubscribeInsight = this.editor.subscribe(() => this.scheduleInsight());
            this.runInsight();
        } catch (error) {
            this.setState({status: 'failed', message: this.t('noWebgl', {error: error.message})});
            return;
        }
        this.setState({status: 'ready'});
    }

    /** Build: recompile shortly after the last edit (a drag is many edits). */
    scheduleInsight () {
        clearTimeout(this.insightTimer);
        this.insightTimer = setTimeout(() => this.runInsight(), INSIGHT_DEBOUNCE_MS);
    }

    /** Build: compile the editor's model; list its issues and redraw the motion overlay. */
    runInsight () {
        if (!this.editor || !this.lib) return;
        const result = this.lib.modelInsight(this.editor.model, this.lib.CATALOG);
        this.lastInsight = {ms: result.ms, parts: this.editor.model.parts.length};
        this.editView?.setMotion({joints: result.joints, gears: result.gears, tints: result.tints.parts});
        this.setState({issues: result.issues, blockers: result.blockers});
    }

    /** The accessible name of a port badge. */
    portLabelText (item) {
        const part = this.partName(item.part);
        return item.port ? fillText(this.itext.portLabel, {part, port: item.port}) : fillText(this.itext.portLabelNone, {part});
    }

    /** Build: a port badge was clicked — select its part and offer the ports next to the badge. */
    openPortPicker (id, rect) {
        if (!this.editView) return;
        this.editView.select([id]);
        const wrap = this.viewWrap.current?.getBoundingClientRect();
        const left = wrap ? Math.max(0, rect.left - wrap.left) : 0;
        const top = wrap ? rect.bottom - wrap.top + 4 : 0;
        this.setState({portPicker: {id, left, top}});
    }

    pickPort (id, port) {
        if (!this.editor) return;
        this.editor.apply({type: 'setPort', id, port: port || null});
        this.setState(s => ({portPicker: null, editorTick: s.editorTick + 1}));
    }

    setOverlay (change) {
        this.setState(change, () => {
            const shown = {ports: this.state.showPorts, motion: this.state.showMotion};
            this.editView?.setOverlay(shown);
            this.view?.setOverlay?.(shown);
        });
    }

    /** The parts an issue names, shown: selected and framed in Build, pulsing in Simulate. */
    focusIssue (issue) {
        const ids = issue.parts || [];
        if (!ids.length) return;
        if (this.editView) {
            this.editView.select(ids);
            this.editView.fitSelection();
        } else if (this.view?.highlight) {
            this.view.highlight(ids, HIGHLIGHT_MS);
        }
    }

    /** A placed part's name in the learner's language, from its id in the model on show. */
    partNameById (id) {
        const model = this.editor ? this.editor.model : this.session?.model;
        const placed = model && model.parts.find(p => p.id === id);
        return placed ? this.partName(placed.part) : fillText(this.itext.part, {id});
    }

    /**
     * The model the pane shows, as the project stores it, or null when there is
     * no model (an empty Build scene). `undefined` means "unknown": the pane is
     * still loading or failed to load, and must not erase what is stored.
     * @returns {object|null|undefined} a sim-lab-persist record
     */
    currentRecord () {
        if (!this.lib) return undefined;
        const model = this.editor ? this.editor.model : this.session?.model;
        if (!model) return undefined;
        // The name is written into the text's `0 Name:` line; one the record could not
        // keep would make the reopened text differ, so such a name is not used at all.
        const name = !this.editor && isStorableName(this.state.modelFile) ? this.state.modelFile : 'my-model.ldr';
        return simLabRecordFromText(this.lib.serializeModel(model, {name, title: MODEL_TITLE}),
            {name, mat: this.state.mat});
    }

    /** Before a save reads the bundle's keys: write the model the pane shows. */
    onBundleCollect () {
        try {
            const record = this.currentRecord();
            if (record) localStorage.setItem(SIM_LAB_STORAGE_KEY, JSON.stringify(record));
            else if (record === null) localStorage.removeItem(SIM_LAB_STORAGE_KEY);
        } catch { /* the Scratch half of the save must survive this */ }
    }

    /** A project was opened: its model (or none) is in storage now. */
    async onBundleLoaded (event) {
        const outcome = event && event.detail && event.detail.outcome;
        if (outcome !== 'loaded' && outcome !== 'legacy') return;
        // Mount reads storage itself once the chunk is in.
        if (!this.lib || this.disposed) return;
        if (this.state.status === 'running') this.pause();
        if (this.editor) {
            this.teardownEditor();
            this.setState({mode: 'simulate', placing: null, selection: []});
        }
        await this.openStored();
    }

    /** Open the project's model, or the default model when the project has none. */
    async openStored () {
        let stored;
        try {
            stored = readSimLabStorage(localStorage.getItem(SIM_LAB_STORAGE_KEY));
        } catch {
            stored = {record: null, refusals: []}; // storage disabled: nothing was restored
        }
        const {record, refusals} = stored;
        this.setState({mat: record && record.mat ? record.mat : null});
        if (record) {
            this.lastText = record.ldraw;
            await this.openText(record.ldraw, record.name || 'my-model.ldr');
        } else {
            await this.openShipped(this.lib.MODELS[0].file);
        }
        if (refusals.length && !this.disposed) this.setState(s => ({issues: [...refusals, ...s.issues]}));
    }

    /** Back to simulation: compile what was built. */
    async exitBuild () {
        const text = this.lib.serializeModel(this.editor.model, {name: 'my-model.ldr', title: MODEL_TITLE});
        this.lastText = text;
        this.teardownEditor();
        this.setState({mode: 'simulate', placing: null, selection: []});
        await this.openText(text, 'my-model.ldr');
    }

    saveLdr () {
        const text = this.lib.serializeModel(this.editor.model, {name: 'my-model.ldr', title: MODEL_TITLE});
        const url = URL.createObjectURL(new Blob([text], {type: 'text/plain'}));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'my-model.ldr';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    teardown () {
        if (this.view) { try { this.view.dispose(); } catch { /* a lost context may already be gone */ } }
        this.view = null;
        if (this.session) this.session.dispose();
        this.session = null;
    }

    async openShipped (file) {
        const response = await fetch(`${this.lib.MODELS_BASE}${file}`);
        if (!response.ok) {
            this.setState({status: 'failed', message: this.t('failed', {error: `HTTP ${response.status}`})});
            return;
        }
        await this.openText(await response.text(), file);
        // A model that comes with an example offers it while the Code tab has no SPIKE program.
        if (!this.disposed) this.setState({info: this.shippedModel()?.example && !this.spikeLoaded() ? this.text.exampleOffer : ''});
    }

    /** The MODELS entry of the model on show, or null for a built or imported one. */
    shippedModel () {
        return this.lib?.MODELS.find(m => m.file === this.state.modelFile) || null;
    }

    /**
     * The model's example program (static/sim-lab/programs/, DEVICE SPIKE text) into the
     * Code tab, built into blocks as the arena's reference solutions are; the robot goes
     * onto the mat the program is written for.
     */
    async loadExample () {
        const entry = this.shippedModel();
        if (!entry?.example) return;
        let code;
        try {
            const response = await fetch(`${this.lib.PROGRAMS_BASE}${entry.example}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            code = await response.text();
        } catch (error) {
            this.setState({message: this.t('exampleFailed', {error: error.message})});
            return;
        }
        if (this.disposed) return;
        if (this.state.status === 'running') this.pause();
        window.dispatchEvent(new CustomEvent('bw-load-pseudocode', {detail: {code, source: `sim-lab:${entry.file}`}}));
        this.setState({info: this.text.exampleGoal[entry.example] || this.text.exampleLoaded});
        if (entry.mat && this.state.mat !== entry.mat) await this.setMat(entry.mat);
    }

    async openImported (event) {
        const f = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!f) return;
        this.lastText = await f.text();
        await this.openText(this.lastText, f.name);
    }

    async openText (text, name) {
        const token = this.loadToken = {};
        this.teardown();
        this.setState({status: 'loading', message: '', issues: [], blockers: [], modelFile: name, simMs: 0, view3d: 'loading'});
        const {SimSession, fetchLDrawClosure, createSimView3D, CATALOG} = this.lib;
        let result;
        try {
            result = await SimSession.fromText(text, {hubState: this.props.hubState, catalog: CATALOG, mat: this.state.mat,
                worker: this.physicsClient()});
        } catch (error) {
            if (token === this.loadToken) this.setState({status: 'failed', message: this.t('failed', {error: error.message})});
            return;
        }
        if (token !== this.loadToken || this.disposed) { result.session?.dispose(); return; }
        const {session, issues, model, runModel} = result;
        if (!session) {
            this.setState({status: 'failed', issues, blockers: this.lib.runBlockers(issues, model, CATALOG),
                message: this.t('failed', {error: issues.at(-1)?.message || ''})});
            return;
        }
        const insight = this.lib.insightOf(runModel, session.mechanism, CATALOG, issues);
        this.session = session;
        // The worker could not run the scene (no WebAssembly in workers, say): the physics runs
        // here, and later models do not try the worker again.
        if (session.workerError && this.physics) { this.physics.terminate(); this.physics = false; }
        let view3d = 'webgl';
        try {
            const {read} = await fetchLDrawClosure([...new Set(model.parts.map(p => p.part))], {withConfig: true});
            if (token !== this.loadToken || this.disposed) return;
            this.view = createSimView3D({container: this.box.current, model: runModel, mechanism: session.mechanism, read, catalog: CATALOG});
            this.view.canvas.setAttribute('aria-label', this.t('canvasLabel'));
            this.view.setPorts(insight.ports.map(item => ({...item, label: this.portLabelText(item)})));
            this.view.setMotion({joints: insight.joints, gears: insight.gears, tints: insight.tints.bodies});
            this.view.setOverlay({ports: this.state.showPorts, motion: this.state.showMotion});
            this.view.render(session.snapshot());
        } catch (error) {
            view3d = 'fallback';
            this.setState({message: this.t('noWebgl', {error: error.message})});
        }
        this.setState({status: 'ready', issues, blockers: insight.blockers, view3d});
    }

    /**
     * One physics worker for every model this pane opens (Jolt loads once), started on
     * first use; null where there are no workers, or once the worker has failed.
     */
    physicsClient () {
        if (this.physics === undefined) this.physics = this.lib.startPhysicsClient();
        return this.physics || null;
    }

    frame (now) {
        this.raf = requestAnimationFrame(this.frame);
        const dt = this.last === null ? 0 : Math.min(MAX_FRAME_MS, now - this.last);
        this.last = now;
        if (this.editView) { this.drawThumbs(); this.editView.render(); return; }
        if (!this.session) return;
        if (this.session.failed && this.state.status !== 'failed') {
            this.setState({status: 'failed', message: this.t('physicsFailed', {error: this.session.failed.message})});
        }
        if (this.state.status === 'running' && dt > 0) {
            this.session.tick(dt);
        }
        // With the physics in the worker, simulated time advances when a batch comes back.
        if (Math.floor(this.session.time / 100) !== Math.floor(this.state.simMs / 100)) {
            this.setState({simMs: this.session.time});
        }
        if (this.view) this.view.render(this.session.snapshot());
    }

    spikeLoaded () {
        const vm = this.props.vm;
        return Boolean(vm && vm.extensionManager && vm.extensionManager.isExtensionLoaded('spikeprime'));
    }

    /** As the arena's Start: connect the spikeprime blocks to the shared virtual hub, then green flag. */
    async run () {
        if (!this.session) return;
        const hubState = this.props.hubState;
        hubState.setSimulationEnabled(true);
        this.setState({status: 'running'});
        const vm = this.props.vm;
        // Without a SPIKE program the clock still runs (the arrows below drive the motors),
        // but say plainly why nothing moves on its own.
        if (!this.spikeLoaded()) {
            this.setState({info: this.shippedModel()?.example ? `${this.text.noProgram} ${this.text.exampleOffer}` : this.text.noProgram});
            return;
        }
        this.setState({info: ''});
        const peripheral = vm.runtime.peripheralExtensions && vm.runtime.peripheralExtensions.spikeprime;
        try {
            const {connectVirtualSpike} = this.lib;
            await connectVirtualSpike({host: window, hubState,
                connected: () => vm.getPeripheralIsConnected('spikeprime'),
                disconnect: () => vm.disconnectPeripheral('spikeprime'),
                connect: async () => {
                    if (typeof peripheral.setMode === 'function') peripheral.setMode('web-ble');
                    await peripheral.scan();
                }});
        } catch (error) {
            this.setState({message: this.t('connectFailed', {error: error.message})});
            return;
        }
        if (this.state.status === 'running') vm.greenFlag();
    }
    /** Puts the current model on another mat (its start pose, if the mat has one) and reloads it. */
    async setMat (mat) {
        if (!this.session) return;
        const text = this.lib.serializeModel(this.session.model, {name: this.state.modelFile || 'model.ldr'});
        this.pause();
        this.setState({mat: mat || null}, () => this.openText(text, this.state.modelFile));
    }

    /** Hold-to-drive with the movement pair (A left, mounted mirrored; B right), as the arena's drive pad. */
    drive (direction) {
        if (!this.session || !this.session.bridge) return;
        const hub = this.props.hubState;
        hub.setSimulationEnabled(true);
        if (this.state.status !== 'running') this.setState({status: 'running'});
        const [left, right] = hub.movementPair || ['A', 'B'];
        const pct = this.state.driveSpeed;
        const dps = port => hub.motors.percentToDps(port, pct);
        const set = (l, r) => {
            if (l === 0) hub.motors.stop(left); else hub.motors.runAtSpeed(left, -l * dps(left));
            if (r === 0) hub.motors.stop(right); else hub.motors.runAtSpeed(right, r * dps(right));
        };
        // Wheel-forward is left counter-clockwise (negative), right clockwise (positive).
        if (direction === 'forward') set(1, 1);
        else if (direction === 'back') set(-1, -1);
        else if (direction === 'left') set(-0.6, 0.6);
        else if (direction === 'right') set(0.6, -0.6);
        else set(0, 0);
        this.driving = direction === 'stop' ? null : direction;
    }

    onDriveKey (event, down) {
        const map = {ArrowUp: 'forward', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right'};
        const dir = map[event.key];
        if (!dir || this.state.mode !== 'simulate') return;
        event.preventDefault();
        if (down && this.driving !== dir) this.drive(dir);
        if (!down && this.driving === dir) this.drive('stop');
    }

    pause () {
        if (!this.session) return;
        if (this.spikeLoaded()) { try { this.props.vm.stopAll(); } catch { /* the VM may be mid-load */ } }
        this.props.hubState.backend.cancel();
        this.setState({status: 'paused'});
    }

    async reset () {
        if (!this.session) return;
        this.props.hubState.stopAll?.();
        const name = this.state.modelFile;
        const shipped = this.lib.MODELS.find(m => m.file === name);
        if (shipped) await this.openShipped(shipped.file);
        else if (this.lastText) await this.openText(this.lastText, name);
    }

    renderDrive (button) {
        const hold = dir => ({
            onPointerDown: e => { e.currentTarget.setPointerCapture?.(e.pointerId); this.drive(dir); },
            onPointerUp: () => this.drive('stop'),
            onPointerCancel: () => this.drive('stop'),
            onLostPointerCapture: () => this.driving === dir && this.drive('stop')
        });
        const arrow = {...button, minWidth: 34, fontSize: 15, lineHeight: '18px', userSelect: 'none', touchAction: 'none'};
        const hub = this.props.hubState.data;
        const ports = [...new Set(this.session.mechanism.joints.filter(j => j.motor).map(j => j.motor.port))].sort();
        const sensorPorts = (this.session.mechanism.sensors || []).map(s => s.port).sort();
        const fmt = (port, s) => {
            if (!s) return '–';
            if (s.kind === 'distance') return s.distance < 0 ? '–' : `${s.distance} mm`;
            if (s.kind === 'color') return `${s.color} · ${s.reflection} %`;
            if (s.kind === 'force') return `${s.force} %${s.pressed ? ' ●' : ''}`;
            return s.kind;
        };
        return (
            <div data-testid="bw-sim-lab-drive" tabIndex={0} onKeyDown={e => this.onDriveKey(e, true)} onKeyUp={e => this.onDriveKey(e, false)}
                style={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, fontSize: 12, outline: 'none'}}>
                <span style={{fontWeight: 600}}>{this.text.drive}</span>
                <button type="button" style={arrow} data-testid="bw-sim-lab-drive-left" aria-label={this.text.left} {...hold('left')}>◀</button>
                <button type="button" style={arrow} data-testid="bw-sim-lab-drive-forward" aria-label={this.text.forward} {...hold('forward')}>▲</button>
                <button type="button" style={arrow} data-testid="bw-sim-lab-drive-back" aria-label={this.text.back} {...hold('back')}>▼</button>
                <button type="button" style={arrow} data-testid="bw-sim-lab-drive-right" aria-label={this.text.right} {...hold('right')}>▶</button>
                <label>{this.text.speed}{' '}
                    <input type="range" min={10} max={100} step={10} value={this.state.driveSpeed} data-testid="bw-sim-lab-drive-speed"
                        onChange={e => this.setState({driveSpeed: Number(e.target.value)})} style={{verticalAlign: 'middle', width: 90}} />
                    {' '}{this.state.driveSpeed} %
                </label>
                <span data-testid="bw-sim-lab-readout" style={{color: '#475569'}} title={this.text.driveHelp}>
                    {this.text.readout}: {ports.map(p => `${p} ${Math.round(hub.motors['ABCDEF'.indexOf(p)].position)}°`).join(' · ')}
                    {sensorPorts.length ? ' · ' + sensorPorts.map(p => `${p} ${fmt(p, hub.sensors['ABCDEF'.indexOf(p)])}`).join(' · ') : ''}
                    {hub.imu ? ` · yaw ${Math.round(hub.imu.yaw)}°` : ''}
                </span>
            </div>
        );
    }

    /** A palette tile came into view: its picture is drawn in a coming frame. */
    requestThumb (part) {
        if (this.thumbs && !this.thumbs.has(part)) this.thumbQueue.add(part);
    }

    /** Draws waiting palette pictures for at most a few milliseconds per frame, so opening Build stays smooth. */
    drawThumbs () {
        if (!this.thumbs || !this.thumbQueue.size) return;
        const start = performance.now();
        for (const part of this.thumbQueue) {
            this.thumbQueue.delete(part);
            this.thumbs.render(part);
            if (performance.now() - start > 6) break;
        }
        this.setState(s => ({thumbTick: s.thumbTick + 1}));
    }

    /** A click on a palette tile arms (or disarms) the placing tool, unless the press was dragged out. */
    armPart (part) {
        if (this.paletteDragged) { this.paletteDragged = false; return; }
        const next = this.state.placing === part ? null : part;
        this.editView?.setTool(next);
        this.setState({placing: next});
    }

    /** A press on a palette tile: the editor view follows it; dragged into the view, it places the part there. */
    pressPart (part, event) {
        this.paletteDragged = false;
        if (event.button !== 0 || !this.editView) return;
        event.preventDefault(); // no text selection or native image drag while it is dragged out
        this.editView.pressPalettePart(part, event, ({dragged}) => { this.paletteDragged = dragged; });
    }

    renderPalette () {
        return (
            <SimLabPalette key={this.thumbs ? 'pictures' : 'names'} text={this.text} lib={this.lib} locale={this.locale}
                placing={this.state.placing} recent={this.state.recent} thumbs={this.thumbs} thumbTick={this.state.thumbTick}
                requestThumb={this.requestThumb} onArm={this.armPart} onPress={this.pressPart} />
        );
    }

    /** The build view's status (what is happening / what a click will do), in the learner's language. */
    buildStatusText () {
        const st = this.state.buildStatus || {kind: 'idle'};
        const T = this.text.st;
        const name = part => this.partName(part);
        const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));
        const hole = st.connector && /^[a-z](\d+)$/.exec(st.connector);
        switch (st.kind) {
        case 'hover': return fill(st.selected ? T.hoverSelected : T.hover, {part: name(st.part)});
        case 'placing': return fill(T.placing, {part: name(st.part)});
        case 'dragging': return fill(T.dragging, {part: name(st.part)});
        case 'snap': case 'snapped': case 'turnedAbout': {
            const target = st.target ? name(st.target) : '';
            if (st.kind === 'turnedAbout') return fill(T.turnedAbout, {target});
            return hole ? fill(T[st.kind], {target, hole: Number(hole[1]) + 1}) : fill(T[`${st.kind}NoHole`], {target});
        }
        case 'gizmo': {
            const color = T[{X: 'red', Y: 'green', Z: 'blue'}[st.axis]] || '';
            if (st.mode === 'rotate') return fill(T.gizmoRing, {color});
            return fill(st.axis.length === 1 ? T.gizmoArrow : T.gizmoPlane, {color, axis: st.axis.toLowerCase()});
        }
        case 'onTop': return fill(T.onTop, {target: name(st.target)});
        case 'moving': return fill(T.moving, {x: st.delta[0], y: -st.delta[1], z: -st.delta[2]});
        case 'turning': return fill(T.turning, {deg: st.degrees});
        case 'placed': return fill(T.placed, {part: name(st.part)});
        case 'blocked': return fill(T.blocked, {target: name(st.target)});
        case 'refused': return fill(T[st.reason] || T.invalid, {detail: st.detail || '', target: st.target ? name(st.target) : ''});
        default: return T[st.kind] ? fill(T[st.kind], {n: st.count}) : T.idle;
        }
    }

    partName (part) {
        const m = this.lib && this.lib.CATALOG.get(part);
        return m ? ((this.locale === 'de' && m.nameDe) || m.name) : part;
    }

    renderBuildBar (button) {
        const editor = this.editor;
        const view = this.editView;
        const parts = editor ? editor.model.parts : [];
        const selection = this.state.selection.map(id => parts.find(p => p.id === id)).filter(Boolean);
        const sel = selection.length === 1 ? selection[0] : null;
        const meta = sel ? this.lib.CATALOG.get(sel.part) : null;
        const portable = meta && (meta.motor || meta.sensor);
        const tick = () => this.setState(s => ({editorTick: s.editorTick + 1}));
        const small = {...button, padding: '3px 8px', marginRight: 0};
        const pressed = on => ({...small, background: on ? '#dbeafe' : '#fff', borderColor: on ? '#2563eb' : '#94a3b8', fontWeight: on ? 600 : 400});
        const st = this.state.buildStatus || {};
        const refused = st.kind === 'refused';
        const blocked = st.kind === 'blocked';
        const T = this.text;
        return (
            <div style={{display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12}}>
                <div style={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4}}>
                    <button type="button" style={pressed(this.state.gizmoMode === 'move')} data-testid="bw-sim-lab-mode-move"
                        aria-pressed={this.state.gizmoMode === 'move'} onClick={() => view?.setMode('move')}>{T.move}</button>
                    <button type="button" style={pressed(this.state.gizmoMode === 'rotate')} data-testid="bw-sim-lab-mode-rotate"
                        aria-pressed={this.state.gizmoMode === 'rotate'} onClick={() => view?.setMode('rotate')}>{T.turn}</button>
                    <label style={{marginLeft: 4}}>{T.grid}{' '}
                        <select data-testid="bw-sim-lab-grid" value={this.state.grid}
                            onChange={e => { const g = Number(e.target.value); view?.setGrid(g); this.setState({grid: g}); }}>
                            {[1, 5, 10, 20].map(g => <option key={g} value={g}>{g} {T.ldu}</option>)}
                        </select>
                    </label>
                    <span style={{width: 6}} />
                    <button type="button" style={small} data-testid="bw-sim-lab-turn" disabled={!selection.length} onClick={() => view?.turn('up', 1)}>{T.turnUp}</button>
                    <button type="button" style={small} data-testid="bw-sim-lab-tip" disabled={!selection.length} onClick={() => view?.turn('facing', 1)}>{T.tip}</button>
                    <button type="button" style={small} data-testid="bw-sim-lab-group" disabled={selection.length < 2}
                        title={T.groupKey} onClick={() => { view?.groupSelection(); tick(); }}>{T.group}</button>
                    <button type="button" style={small} data-testid="bw-sim-lab-ungroup"
                        disabled={!(editor?.model.groups || []).some(g => g.parts.some(id => this.state.selection.includes(id)))}
                        title={T.ungroupKey} onClick={() => { view?.ungroupSelection(); tick(); }}>{T.ungroup}</button>
                    <button type="button" style={small} data-testid="bw-sim-lab-duplicate" disabled={!selection.length} onClick={() => view?.duplicate()}>{T.duplicate}</button>
                    <button type="button" style={small} data-testid="bw-sim-lab-delete" disabled={!selection.length} onClick={() => view?.deleteSelection()}>{T.remove}</button>
                    <span style={{width: 6}} />
                    <button type="button" style={small} data-testid="bw-sim-lab-undo" disabled={!editor?.canUndo} onClick={() => { view?.undo(); tick(); }}>{T.undo}</button>
                    <button type="button" style={small} data-testid="bw-sim-lab-redo" disabled={!editor?.canRedo} onClick={() => { view?.redo(); tick(); }}>{T.redo}</button>
                    <span style={{width: 6}} />
                    {['home', 'fit', 'top', 'front', 'side'].map(v => (
                        <button key={v} type="button" style={small} data-testid={`bw-sim-lab-view-${v}`}
                            onClick={() => (v === 'fit' ? view?.fitSelection() : view?.view(v))}>{T[v]}</button>
                    ))}
                    <span style={{width: 6}} />
                    <button type="button" style={small} data-testid="bw-sim-lab-save" disabled={!editor} onClick={() => this.saveLdr()}>{T.save}</button>
                </div>
                <div style={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, minHeight: 22}}>
                    {selection.length > 0 && (
                        <span data-testid="bw-sim-lab-selection" style={{fontWeight: 600, color: '#1e3a8a'}}>
                            {sel ? this.t('selectedOne', {name: this.partName(sel.part)}) : this.t('selectedMany', {n: selection.length})}
                        </span>
                    )}
                    {portable && (
                        <label>{T.port}{': '}
                            <select data-testid="bw-sim-lab-port" value={sel.port || ''}
                                onChange={e => { editor.apply({type: 'setPort', id: sel.id, port: e.target.value || null}); tick(); }}>
                                <option value="">{T.none}</option>
                                {['A', 'B', 'C', 'D', 'E', 'F'].map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </label>
                    )}
                    <span role="status" data-testid="bw-sim-lab-build-status" data-kind={st.kind || 'idle'}
                        style={{color: refused || blocked ? '#b91c1c' : '#475569', fontWeight: refused ? 600 : 400}}>
                        {this.buildStatusText()}
                    </span>
                </div>
            </div>
        );
    }

    /** One issue in a child's words; one that names parts is a button that shows them. */
    renderIssue (issue, key) {
        const sentence = issueSentence(this.itext, issue, id => this.partNameById(id));
        const color = issue.severity === 'error' ? '#b91c1c' : '#334155';
        if (!(issue.parts && issue.parts.length)) {
            return <li key={key} data-testid="bw-sim-lab-issue" data-code={issue.code} title={issue.message} style={{color}}>{sentence}</li>;
        }
        return (
            <li key={key} data-testid="bw-sim-lab-issue" data-code={issue.code} style={{color}}>
                <button type="button" data-testid={`bw-sim-lab-issue-${issue.code}`} data-parts={issue.parts.join(' ')}
                    title={this.itext.issueHelp} onClick={() => this.focusIssue(issue)}
                    style={{font: 'inherit', color: 'inherit', textAlign: 'left', background: 'none', border: 'none', padding: 0,
                        cursor: 'pointer', textDecoration: 'underline dotted'}}>
                    {sentence}
                </button>
            </li>
        );
    }

    /** What stops Run from doing what a child expects, said before Run. */
    renderBlockers () {
        const blockers = this.state.blockers || [];
        if (!blockers.length || this.state.status === 'loading') return null;
        return (
            <div role="alert" data-testid="bw-sim-lab-blockers"
                style={{fontSize: 12, color: '#7c2d12', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 6, padding: '6px 8px'}}>
                <strong>{this.itext.blockersTitle}</strong>
                <ul style={{margin: '2px 0 0', paddingLeft: 18}}>
                    {blockers.map(b => this.renderIssue({...b, severity: 'warning'}, b.code))}
                </ul>
            </div>
        );
    }

    /** The overlay switches: port badges, and "show how it moves" (tints, axes, gear pairs). */
    renderInsightBar () {
        const T = this.itext;
        return (
            <div data-testid="bw-sim-lab-insight-bar" style={{display: 'flex', alignItems: 'center', gap: 12, fontSize: 12}}>
                <label title={T.showPortsHelp}>
                    <input type="checkbox" data-testid="bw-sim-lab-show-ports" checked={this.state.showPorts}
                        onChange={e => this.setOverlay({showPorts: e.target.checked})} />{' '}{T.showPorts}
                </label>
                <label title={T.showMotionHelp}>
                    <input type="checkbox" data-testid="bw-sim-lab-show-motion" checked={this.state.showMotion}
                        onChange={e => this.setOverlay({showMotion: e.target.checked})} />{' '}{T.showMotion}
                </label>
            </div>
        );
    }

    /** Build: the ports offered next to a clicked port badge. */
    renderPortPicker (button) {
        const picker = this.state.portPicker;
        if (!picker || !this.editor) return null;
        const placed = this.editor.model.parts.find(p => p.id === picker.id);
        if (!placed) return null;
        const title = fillText(this.itext.portPick, {part: this.partName(placed.part)});
        const small = {...button, padding: '2px 7px', marginRight: 0};
        return (
            <div role="dialog" aria-label={title} data-testid="bw-sim-lab-port-picker"
                onKeyDown={e => e.key === 'Escape' && this.setState({portPicker: null})}
                style={{position: 'absolute', left: picker.left, top: picker.top, zIndex: 5, display: 'flex', alignItems: 'center', flexWrap: 'wrap',
                    gap: 3, maxWidth: 320, fontSize: 12, background: '#fff', border: '1px solid #94a3b8', borderRadius: 6, padding: 5,
                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.2)'}}>
                <span style={{fontWeight: 600, marginRight: 4}}>{title}</span>
                {['', 'A', 'B', 'C', 'D', 'E', 'F'].map(port => (
                    <button key={port || 'none'} type="button" data-testid={`bw-sim-lab-port-pick-${port || 'none'}`}
                        aria-pressed={(placed.port || '') === port}
                        style={{...small, fontWeight: (placed.port || '') === port ? 700 : 400, background: (placed.port || '') === port ? '#dbeafe' : '#fff'}}
                        onClick={() => this.pickPort(picker.id, port)}>
                        {port || this.itext.portNone}
                    </button>
                ))}
                <button type="button" style={small} aria-label={this.itext.close} onClick={() => this.setState({portPicker: null})}>×</button>
            </div>
        );
    }

    render () {
        const {status, message, issues, simMs, modelFile} = this.state;
        const busy = status === 'loading';
        const button = {padding: '4px 10px', marginRight: 6, borderRadius: 6, border: '1px solid #94a3b8', background: '#fff', cursor: 'pointer'};
        return (
            <div data-testid="bw-sim-lab" data-status={status} style={{display: 'flex', flexDirection: 'column', gap: 8, padding: 10, height: '100%', boxSizing: 'border-box'}}>
                <div style={{fontSize: 12, color: '#334155'}}>{this.text.intro}</div>
                <div role="tablist" style={{display: 'flex', gap: 4}}>
                    {['simulate', 'build'].map(mode => (
                        <button key={mode} type="button" role="tab" aria-selected={this.state.mode === mode} disabled={busy || !this.lib}
                            data-testid={`bw-sim-lab-mode-${mode}`} style={{...button, fontWeight: this.state.mode === mode ? 600 : 400}}
                            onClick={() => (mode === 'build' ? this.state.mode !== 'build' && this.enterBuild() : this.state.mode !== 'simulate' && this.exitBuild())}>
                            {this.text[mode]}
                        </button>
                    ))}
                    <button type="button" style={button} data-testid="bw-sim-lab-instructions" title={this.text.instructionsHelp}
                        disabled={busy || !this.lib || !(this.editor ? this.editor.model : this.session?.model)?.parts.length}
                        onClick={() => this.setState({instructions: this.editor ? this.editor.model : this.session.model})}>
                        {this.text.instructions}
                    </button>
                </div>
                {this.state.instructions && (
                    <SimLabInstructions lib={this.lib} model={this.state.instructions} locale={this.locale}
                        title={this.editor ? null : this.shippedModel()?.title[this.locale] || this.state.modelFile}
                        onClose={() => this.setState({instructions: null})} />
                )}
                {this.state.mode === 'simulate' && <div style={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6}}>
                    <label style={{fontSize: 12}}>{this.text.model}{': '}
                        <select data-testid="bw-sim-lab-model" disabled={busy || !this.lib} value={this.lib?.MODELS.some(m => m.file === modelFile) ? modelFile : ''}
                            onChange={e => e.target.value && this.openShipped(e.target.value)}>
                            {this.lib && this.lib.MODELS.map(m => <option key={m.file} value={m.file}>{m.title[this.locale] || m.title.en}</option>)}
                            {modelFile && !this.lib?.MODELS.some(m => m.file === modelFile) && <option value="">{modelFile}</option>}
                        </select>
                    </label>
                    <button type="button" style={button} disabled={busy || !this.lib} onClick={() => this.file.current.click()}>{this.text.importModel}</button>
                    <input ref={this.file} type="file" accept=".ldr,.mpd" style={{display: 'none'}} data-testid="bw-sim-lab-file"
                        onChange={e => this.openImported(e)} />
                    <label style={{fontSize: 12}}>{this.text.mat}{': '}
                        <select data-testid="bw-sim-lab-mat" disabled={busy || !this.session} value={this.state.mat || 'plain'}
                            onChange={e => this.setMat(e.target.value === 'plain' ? null : e.target.value)}>
                            {this.lib && this.lib.MATS.map(m => <option key={m.id} value={m.id}>{m.title[this.locale] || m.title.en}</option>)}
                        </select>
                    </label>
                    {status === 'running' ?
                        <button type="button" style={button} data-testid="bw-sim-lab-pause" onClick={() => this.pause()}>{this.text.pause}</button> :
                        <button type="button" style={button} data-testid="bw-sim-lab-run" disabled={!this.session || busy} onClick={() => this.run()}>{this.text.run}</button>}
                    <button type="button" style={button} data-testid="bw-sim-lab-reset" disabled={!this.session || busy} onClick={() => this.reset()}>{this.text.reset}</button>
                    {this.shippedModel()?.example && (
                        <button type="button" style={button} data-testid="bw-sim-lab-example" disabled={busy} onClick={() => this.loadExample()}>{this.text.example}</button>
                    )}
                    <span role="status" data-testid="bw-sim-lab-status" style={{fontSize: 12, color: '#475569'}}>
                        {busy ? this.text.loading : this.text[status] || ''}{this.session ? ` · ${this.t('time', {s: (simMs / 1000).toFixed(1)})}` : ''}
                    </span>
                </div>}
                {message && <div role="alert" data-testid="bw-sim-lab-message" style={{fontSize: 12, color: '#b91c1c'}}>{message}</div>}
                {this.state.info && this.state.mode === 'simulate' && (
                    <div role="status" data-testid="bw-sim-lab-info" style={{fontSize: 12, color: '#1e3a8a', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '6px 8px'}}>{this.state.info}</div>
                )}
                {this.state.mode === 'simulate' && this.session && this.session.bridge && this.renderDrive(button)}
                {this.state.mode === 'build' && this.renderBuildBar(button)}
                {this.lib && this.renderInsightBar()}
                {this.renderBlockers()}
                <div style={{display: 'flex', flex: '1 1 auto', minHeight: 240, gap: 8}}>
                    {this.state.mode === 'build' && this.renderPalette()}
                    <div ref={this.viewWrap} style={{flex: '1 1 auto', minHeight: 240, position: 'relative', display: 'flex'}}>
                        <div ref={this.box} data-testid="bw-sim-lab-view" style={{flex: '1 1 auto', minHeight: 240, position: 'relative'}} />
                        {this.renderPortPicker(button)}
                    </div>
                </div>
                {issues.length > 0 && (
                    <details data-testid="bw-sim-lab-issues" style={{fontSize: 12}} open>
                        <summary>{this.text.issues} ({issues.length})</summary>
                        <ul style={{margin: '4px 0', paddingLeft: 18}}>{issues.map((i, n) => this.renderIssue(i, n))}</ul>
                    </details>
                )}
            </div>
        );
    }
}

export default SimLabPane;
