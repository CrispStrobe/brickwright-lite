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
// simulator pane shows one or the other). And the program's clock is the
// world's (docs/SIM-LAB-PLAN.md §4.9, lib/bw-sim/sim-clock.js): while it runs,
// each VM step buys one step of simulated time and the VM waits for the world,
// so a slow machine runs the whole program slower (the status line shows the
// real-time factor) instead of letting the program's `wait`s outrun the world.
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
import {firmwareRefusalSentence} from './sim-lab-firmware-text.js';
import {EDITOR_TEXT} from './sim-lab-editor-text.js';
import SimLabProperties from './sim-lab-properties.jsx';
import SimLabShortcuts from './sim-lab-shortcuts.jsx';

/** A MODELS entry's key: its `id` when one model file is listed more than once, else its file. */
const modelKey = m => m.id || m.file;

const TEXT = {
    en: {
        title: 'Robot Lab (beta)',
        intro: 'A model from real LEGO® Technic parts with physics. Write a SPIKE Prime program (ports A and B drive the wheels) and press Run: it starts on the green flag.',
        model: 'Model', importModel: 'Open…', importHelp: 'Open a model: LDraw (.ldr, .mpd), BrickLink Studio (.io) or LEGO Digital Designer (.lxf)', run: 'Run', pause: 'Pause', reset: 'Reset',
        loading: 'Loading the model and the physics engine…', ready: 'Ready', running: 'Running', paused: 'Paused',
        failed: 'Could not load the model: {error}', physicsFailed: 'The physics stopped: {error}. Press Reset to start again.', noWebgl: 'This browser cannot show the 3D view ({error}). The simulation still runs.',
        connectFailed: 'Could not connect the program to the virtual hub: {error}',
        noProgram: 'No SPIKE program is loaded yet, so nothing tells the motors to turn. Write one in the Code tab and press ⇦ To blocks (or build it with blocks), then press Run — or drive the robot with the arrows below.',
        example: 'Load example program', exampleOffer: 'This robot comes with an example program. Press Load example program to put it in the Code tab, then press Run.',
        exampleLoaded: 'The example program is in the Code tab now. Press Run.',
        exampleGoal: {
            'line-follower.bw': 'The example program is in the Code tab now. Press Run and watch the robot follow the black line.',
            'wall-stopper.bw': 'The example program is in the Code tab now. Press Run and watch the robot stop before the wall. Challenge: make it stop 20 cm away.',
            'colour-explorer.bw': 'The example program is in the Code tab now. Press Run and watch the robot find the red square. Challenge: make it find the green one.',
            'sumo.bw': 'The example program is in the Code tab now. Press Run: the robot drives around and turns back whenever it sees the black ring. Challenge: make it turn the other way, or faster.'
        },
        exampleFailed: 'Could not load the example program: {error}',
        mat: 'Mat', drive: 'Drive', forward: 'Forward', back: 'Back', left: 'Left', right: 'Right', stop: 'Stop', speed: 'Speed',
        driveHelp: 'Hold an arrow (or use the arrow keys) to drive with motors A and B.', readout: 'Hub',
        issues: 'Notes about this model', time: 'Simulated time: {s} s', canvasLabel: '3D view of the simulated model',
        simulate: 'Simulate', build: 'Build', parts: 'Parts', undo: 'Undo', redo: 'Redo', remove: 'Delete',
        save: 'Save as…', saveHelp: 'Save the model as a file', port: 'Port', none: 'none',
        saveFormats: {ldr: 'LDraw (.ldr)', mpd: 'LDraw multi-part (.mpd)', io: 'BrickLink Studio (.io)'},
        fileFailed: 'Could not open {name}: {error}',
        fileErrors: {
            'io-encrypted': 'this BrickLink Studio file is password-protected (an older Studio made it). Open it in a current Studio and save it again, or export it there as LDraw (File › Export As).',
            'io-no-model': 'this BrickLink Studio file holds no LDraw model (model.ldr).',
            'not-a-zip': 'the file is damaged or not the kind its name says.',
            'lxf-no-lxfml': 'this LEGO Digital Designer file holds no model (.LXFML).',
            'lxf-unreadable': 'this LEGO Digital Designer model could not be read.',
            'lxf-version': 'this LEGO Digital Designer file is from a version the Robot Lab cannot read (only LDD 4).',
            'unsupported-format': 'the Robot Lab opens .ldr, .mpd, .io and .lxf files.'
        },
        instructions: 'Instructions', instructionsHelp: 'Step-by-step building instructions for this robot, to build it from real LEGO® parts',
        search: 'Search parts', searchHint: 'Search: name or number', clearSearch: 'Clear the search', recent: 'Recently used',
        noMatches: 'No part matches “{q}”.', partTitle: '{name} · part {number}',
        paletteHelp: 'Click a part, then click in the view. Or drag it into the view.',
        move: 'Move (W)', turn: 'Turn (E)', grid: 'Grid', ldu: 'LDU', turnUp: 'Turn ↻ (R)', tip: 'Tip (T)',
        turnBack: 'Turn ↺ (Shift+R)', copy: 'Copy', paste: 'Paste', selectAll: 'Select all', cancel: 'Cancel (Esc)',
        copyKey: 'Ctrl+C', pasteKey: 'Ctrl+V', selectAllKey: 'Ctrl+A',
        duplicate: 'Duplicate', group: 'Group', ungroup: 'Ungroup', groupKey: 'Ctrl+G', ungroupKey: 'Ctrl+Shift+G', home: 'Home', fit: 'Fit (F)', top: 'Top', front: 'Front', side: 'Side',
        selectedOne: 'Selected: {name}', selectedMany: 'Selected: {n} parts',
        more: 'More…', moreHelp: 'More actions', large: 'Open the Robot Lab large (full screen)', timeShort: '{s} s',
        partsToggle: 'Show or hide the parts', infoToggle: 'Show or hide the whole note',
        route: 'Program', routeScratch: 'SPIKE blocks', routeFirmware: 'SPIKE firmware (desktop)',
        routeUnavailable: 'Not available: this build has no managed Renode runtime with lockstep.',
        realTime: '{f}× real time', firmwareFailed: 'Could not start the SPIKE firmware: {error}',
        stopping: 'Stopping the program…',
        firmwareReloading: 'The program changed: starting the emulated hub again with the new program…',
        firmwareFault: 'The program on the SPIKE firmware stopped with an error ({error}). Press Run to start it again.',
        firmwareControlFailed: 'The SPIKE firmware did not take the command: {error}',
        st: {
            idle: 'Click a part to select it. Drag it to move it; Shift+click adds parts; drag empty space to look around.',
            hover: '{part}: click to select, drag to move', hoverSelected: '{part}: drag to move, R turns, Delete removes',
            placing: 'Placing {part}: click to place, R turns, Alt: no magnet, Esc stops',
            idleTouch: 'Tap a part to select it and drag it to move it. A long press adds parts. Drag empty space to look around, pinch to zoom; long-press empty space, then drag, to select with a box.',
            placingTouch: 'Placing {part}: tap where it goes, Turn ↻ turns it, Cancel stops',
            boxing: 'Now drag a box around the parts to select',
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
        model: 'Modell', importModel: 'Öffnen…', importHelp: 'Ein Modell öffnen: LDraw (.ldr, .mpd), BrickLink Studio (.io) oder LEGO Digital Designer (.lxf)', run: 'Start', pause: 'Pause', reset: 'Zurücksetzen',
        loading: 'Modell und Physik-Engine werden geladen…', ready: 'Bereit', running: 'Läuft', paused: 'Pausiert',
        failed: 'Das Modell konnte nicht geladen werden: {error}', physicsFailed: 'Die Physik ist stehen geblieben: {error}. Mit Zurücksetzen geht es neu los.', noWebgl: 'Dieser Browser kann die 3D-Ansicht nicht zeigen ({error}). Die Simulation läuft trotzdem.',
        connectFailed: 'Das Programm konnte nicht mit dem virtuellen Hub verbunden werden: {error}',
        noProgram: 'Es ist noch kein SPIKE-Programm geladen, darum dreht sich kein Motor. Schreibe eins im Code-Tab und drücke ⇦ Zu Blöcken (oder baue es aus Blöcken), dann Start — oder fahre den Roboter mit den Pfeilen unten.',
        example: 'Beispielprogramm laden', exampleOffer: 'Zu diesem Roboter gibt es ein Beispielprogramm. Drücke Beispielprogramm laden, dann steht es im Code-Tab, und drücke Start.',
        exampleLoaded: 'Das Beispielprogramm steht jetzt im Code-Tab. Drücke Start.',
        exampleGoal: {
            'line-follower.bw': 'Das Beispielprogramm steht jetzt im Code-Tab. Drücke Start und schau zu, wie der Roboter der schwarzen Linie folgt.',
            'wall-stopper.bw': 'Das Beispielprogramm steht jetzt im Code-Tab. Drücke Start und schau zu, wie der Roboter vor der Wand anhält. Aufgabe: Lass ihn 20 cm vor der Wand anhalten.',
            'colour-explorer.bw': 'Das Beispielprogramm steht jetzt im Code-Tab. Drücke Start und schau zu, wie der Roboter das rote Feld findet. Aufgabe: Lass ihn das grüne finden.',
            'sumo.bw': 'Das Beispielprogramm steht jetzt im Code-Tab. Drücke Start: Der Roboter fährt herum und kehrt um, sobald er den schwarzen Ring sieht. Aufgabe: Lass ihn andersherum oder schneller drehen.'
        },
        exampleFailed: 'Das Beispielprogramm konnte nicht geladen werden: {error}',
        mat: 'Matte', drive: 'Fahren', forward: 'Vorwärts', back: 'Rückwärts', left: 'Links', right: 'Rechts', stop: 'Stopp', speed: 'Tempo',
        driveHelp: 'Halte einen Pfeil gedrückt (oder nutze die Pfeiltasten), um mit den Motoren A und B zu fahren.', readout: 'Hub',
        issues: 'Hinweise zu diesem Modell', time: 'Simulierte Zeit: {s} s', canvasLabel: '3D-Ansicht des simulierten Modells',
        simulate: 'Simulieren', build: 'Bauen', parts: 'Teile', undo: 'Rückgängig', redo: 'Wiederholen', remove: 'Löschen',
        save: 'Speichern unter…', saveHelp: 'Das Modell als Datei speichern', port: 'Port', none: 'keiner',
        saveFormats: {ldr: 'LDraw (.ldr)', mpd: 'LDraw mehrteilig (.mpd)', io: 'BrickLink Studio (.io)'},
        fileFailed: '{name} konnte nicht geöffnet werden: {error}',
        fileErrors: {
            'io-encrypted': 'Diese BrickLink-Studio-Datei ist mit einem Passwort geschützt (von einer älteren Studio-Version). Öffne sie in einem aktuellen Studio und speichere sie neu, oder exportiere sie dort als LDraw (Datei › Exportieren als).',
            'io-no-model': 'Diese BrickLink-Studio-Datei enthält kein LDraw-Modell (model.ldr).',
            'not-a-zip': 'Die Datei ist beschädigt oder nicht das, was ihr Name sagt.',
            'lxf-no-lxfml': 'Diese LEGO-Digital-Designer-Datei enthält kein Modell (.LXFML).',
            'lxf-unreadable': 'Dieses LEGO-Digital-Designer-Modell konnte nicht gelesen werden.',
            'lxf-version': 'Diese LEGO-Digital-Designer-Datei stammt aus einer Version, die das Roboter-Labor nicht lesen kann (nur LDD 4).',
            'unsupported-format': 'Das Roboter-Labor öffnet .ldr-, .mpd-, .io- und .lxf-Dateien.'
        },
        instructions: 'Bauanleitung', instructionsHelp: 'Bauanleitung für diesen Roboter, Schritt für Schritt, zum Nachbauen mit echten LEGO®-Teilen',
        search: 'Teile suchen', searchHint: 'Suche: Name oder Nummer', clearSearch: 'Suche löschen', recent: 'Zuletzt benutzt',
        noMatches: 'Kein Teil passt zu „{q}“.', partTitle: '{name} · Teil {number}',
        paletteHelp: 'Klicke ein Teil an, dann in die Ansicht. Oder zieh es in die Ansicht.',
        move: 'Schieben (W)', turn: 'Drehen (E)', grid: 'Raster', ldu: 'LDU', turnUp: 'Drehen ↻ (R)', tip: 'Kippen (T)',
        turnBack: 'Drehen ↺ (Umschalt+R)', copy: 'Kopieren', paste: 'Einfügen', selectAll: 'Alle wählen', cancel: 'Abbrechen (Esc)',
        copyKey: 'Strg+C', pasteKey: 'Strg+V', selectAllKey: 'Strg+A',
        duplicate: 'Verdoppeln', group: 'Gruppieren', ungroup: 'Gruppe lösen', groupKey: 'Strg+G', ungroupKey: 'Strg+Umschalt+G', home: 'Start', fit: 'Einpassen (F)', top: 'Oben', front: 'Vorne', side: 'Seite',
        selectedOne: 'Ausgewählt: {name}', selectedMany: 'Ausgewählt: {n} Teile',
        more: 'Mehr…', moreHelp: 'Weitere Aktionen', large: 'Roboter-Labor groß öffnen (Vollbild)', timeShort: '{s} s',
        partsToggle: 'Teile zeigen oder ausblenden', infoToggle: 'Den ganzen Hinweis zeigen oder einklappen',
        route: 'Programm', routeScratch: 'SPIKE-Blöcke', routeFirmware: 'SPIKE-Firmware (Desktop)',
        routeUnavailable: 'Nicht verfügbar: Dieser Build hat keine verwaltete Renode-Laufzeit mit Lockstep.',
        realTime: '{f}× Echtzeit', firmwareFailed: 'Die SPIKE-Firmware konnte nicht starten: {error}',
        stopping: 'Das Programm hält an…',
        firmwareReloading: 'Das Programm hat sich geändert: Der emulierte Hub startet neu mit dem neuen Programm…',
        firmwareFault: 'Das Programm auf der SPIKE-Firmware hat mit einem Fehler angehalten ({error}). Drücke Ausführen, um es neu zu starten.',
        firmwareControlFailed: 'Die SPIKE-Firmware hat den Befehl nicht angenommen: {error}',
        st: {
            idle: 'Klicke ein Teil an, um es auszuwählen. Ziehen verschiebt es; Umschalt+Klick wählt mehr Teile; Ziehen auf leerer Fläche dreht die Ansicht.',
            hover: '{part}: klicken wählt aus, ziehen verschiebt', hoverSelected: '{part}: ziehen verschiebt, R dreht, Entf löscht',
            placing: '{part} platzieren: klicken setzt, R dreht, Alt: ohne Magnet, Esc beendet',
            idleTouch: 'Tippe ein Teil an, um es auszuwählen, und zieh es, um es zu verschieben. Lange drücken wählt mehr Teile. Ziehen auf leerer Fläche dreht die Ansicht, zwei Finger zoomen; lange auf leere Fläche drücken und ziehen wählt mit einem Rahmen.',
            placingTouch: '{part} platzieren: tippe, wo es hin soll, Drehen ↻ dreht es, Abbrechen beendet',
            boxing: 'Zieh jetzt einen Rahmen um die Teile, die du auswählen willst',
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

/**
 * Longest step the pane hands the physics per frame, on the paths that tick by wall time (the
 * firmware route, or a VM whose step hook is inert): a backgrounded tab must not jump seconds ahead.
 */
const MAX_FRAME_MS = 50;
/** The real-time factor is shown below this (a timer's jitter keeps a machine that keeps up near 1). */
const SHOW_RTF_BELOW = 0.95;
/** Build mode recompiles the model this long after the last edit (ms), for the issues and the motion overlay. */
const INSIGHT_DEBOUNCE_MS = 150;
/** How long "show me these parts" pulses them in Simulate (ms). */
const HIGHLIGHT_MS = 3000;
/**
 * What "Open…" accepts (lib/bw-sim/model/model-file.js OPEN_ACCEPT, kept here so the first load does not
 * pull the model readers in; test/bw-sim-model-file.test.mjs holds the two equal) and what "Save as…" offers.
 */
const OPEN_ACCEPT = '.ldr,.mpd,.io,.lxf';
const SAVE_FORMATS = ['ldr', 'mpd', 'io'];
/** The `0 <title>` line every model the pane writes carries (it is not parsed back, so it must not vary). */
const MODEL_TITLE = 'Robot Lab model';
/**
 * Below this width of the PANE (not the window: the pane can be narrow inside a wide window)
 * the pane is compact: icon toolbars with a "More…" menu, the parts palette as a drawer over
 * the view, notes folded to one line, so the 3D view keeps most of the height.
 */
const COMPACT_BELOW_PX = 640;
/** Below this pane width the compact toolbars show glyphs only (a 1024 px tablet's side pane). */
const NARROW_BELOW_PX = 420;
/** From this pane width the properties panel stands beside the 3D view; narrower, it opens over the view's right edge. */
const DOCK_PROPERTIES_PX = 1280;
/** What is hidden in Build stays hidden for the browser session (view state, not the model). */
const HIDDEN_STORAGE_KEY = 'bw-sim-lab-hidden';

/** The compact toolbars' faces: drawn, not font glyphs, so every school device shows the same icon. */
const ICONS = {
    parts: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    move: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
    rotate: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
    turn: 'M18 12a6 6 0 1 1-1.8-4.3M18 5v4h-4',
    reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
    undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
    redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
    delete: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    cancel: 'M6 6l12 12M18 6L6 18',
    run: 'M7 4l13 8-13 8z',
    pause: 'M8 5v14M16 5v14',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    large: 'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7'
};
const drawIcon = name => (
    <svg aria-hidden="true" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"
        strokeWidth={name === 'more' ? 3.5 : 2} style={{display: 'block', flex: '0 0 auto'}}>
        <path d={ICONS[name]} />
    </svg>
);
/** A button's face: an icon, and words beside it when there is room. */
const face = (name, words) => (
    <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, whiteSpace: 'nowrap'}}>
        {drawIcon(name)}{words}
    </span>
);

class SimLabPane extends React.Component {
    constructor (props) {
        super(props);
        const locale = pickLocale(props.locale || browserLocale(), TEXT);
        this.locale = locale;
        this.text = TEXT[locale];
        this.itext = INSIGHT_TEXT[locale] || INSIGHT_TEXT.en;
        this.etext = EDITOR_TEXT[locale] || EDITOR_TEXT.en;
        this.state = {status: 'loading', message: '', info: '', driveSpeed: 50, issues: [], modelFile: null, shipped: null, simMs: 0, rtf: null, view3d: 'loading',
            mode: 'simulate', placing: null, selection: [], editorTick: 0, mat: null,
            buildStatus: {kind: 'idle'}, gizmoMode: 'move', grid: 10, recent: [], thumbTick: 0,
            showPorts: true, showMotion: false, blockers: [], portPicker: null, instructions: null, coarse: false,
            paneWidth: 0, more: false, drawer: false, paletteDragging: false, infoOpen: false, route: 'scratch', saveMenu: false,
            hidden: [], editGroup: null, pick: null, measurement: null, placeColor: null, propsOpen: false, shortcuts: false};
        this.root = React.createRef();
        this.moreRef = React.createRef();
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
        this.onPointerKind = this.onPointerKind.bind(this);
        this.onOutsidePress = this.onOutsidePress.bind(this);
        /** Palette parts waiting for their picture (drawn a few per frame in `frame`). */
        this.thumbQueue = new Set();
        this.thumbs = null;
        this.last = null;
        /** The program clock (lib/bw-sim/sim-clock.js), made when the chunk is in; installed while running. */
        this.clock = null;
    }

    onPointerKind () {
        const coarse = Boolean(this.coarseQuery && this.coarseQuery.matches);
        if (coarse !== this.state.coarse) this.setState({coarse});
    }

    /** The pane's own width decides the layout (a ResizeObserver, so a dragged divider counts too). */
    measure (width) {
        const paneWidth = Math.round(width);
        if (paneWidth !== this.state.paneWidth) this.setState({paneWidth});
    }

    compact () {
        return this.state.paneWidth > 0 && this.state.paneWidth < COMPACT_BELOW_PX;
    }

    /** So narrow that even the compact toolbars drop their words. */
    narrow () {
        return this.state.paneWidth > 0 && this.state.paneWidth < NARROW_BELOW_PX;
    }

    /** A press outside the open "More…" menu closes it. */
    onOutsidePress (event) {
        if (this.state.more && this.moreRef.current && !this.moreRef.current.contains(event.target)) this.setState({more: false});
    }

    /** A number as the learner's language writes it (German: decimal comma). */
    decimal (text) {
        return this.locale === 'de' ? String(text).replace('.', ',') : String(text);
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
            /** The hub state a scene drives (it owns that hub's clock: spike3-python-run.js leaves it alone), or null. */
            get hubState () { return this._pane.session ? this._pane.session.hubState : null; },
            get view3d () { return this._pane.state.view3d; },
            get mode () { return this._pane.state.mode; },
            get editor () { return this._pane.editor || null; },
            get editView () { return this._pane.editView || null; },
            get projectRecord () { return this._pane.currentRecord(); },
            get blockers () { return this._pane.state.blockers; },
            /** The firmware route's program on the emulated hub: its state name ('ready', 'running', …) or null. */
            get firmwareProgram () { return this._pane.firmware?.program?.stateName ?? null; },
            /** The last Build-mode compile for the issues and the overlay: {ms, parts}. */
            get insight () { return this._pane.lastInsight || null; },
            _pane: this
        };
        window.addEventListener('bw-project-bundle-collect', this.onBundleCollect);
        window.addEventListener('bw-project-bundle-loaded', this.onBundleLoaded);
        // A tablet (a finger is the main pointer): bigger buttons and touch wording.
        this.coarseQuery = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
        if (this.coarseQuery && this.coarseQuery.addEventListener) this.coarseQuery.addEventListener('change', this.onPointerKind);
        this.onPointerKind();
        window.addEventListener('pointerdown', this.onOutsidePress, true);
        if (this.root.current) {
            this.measure(this.root.current.getBoundingClientRect().width);
            if (typeof ResizeObserver === 'function') {
                this.resizer = new ResizeObserver(entries => this.measure(entries[0].target.getBoundingClientRect().width));
                this.resizer.observe(this.root.current);
            }
        }
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
        window.removeEventListener('pointerdown', this.onOutsidePress, true);
        if (this.resizer) this.resizer.disconnect();
        if (this.coarseQuery && this.coarseQuery.removeEventListener) this.coarseQuery.removeEventListener('change', this.onPointerKind);
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        this.stopClock();
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
        if (!this.disposed) this.setState({editGroup: null, pick: null, measurement: null, shortcuts: false});
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
        // Any palette part may be placed: the whole catalogue (its second piece is fetched the first
        // time Build opens, sim-lab.js loadFullCatalog), then its geometry, once.
        try {
            await this.lib.loadFullCatalog();
        } catch (error) {
            if (!this.disposed) this.setState({status: 'failed', message: this.t('failed', {error: error.message})});
            return;
        }
        if (this.disposed) return;
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
                // A part dragged out of the palette drawer: the drawer steps aside while it is carried.
                onTool: placing => this.setState({placing, paletteDragging: Boolean(placing && this.editView?.draggingFromPalette)}),
                onMode: gizmoMode => this.setState({gizmoMode}),
                portLabel: item => this.portLabelText(item),
                onPortLabel: (id, rect) => this.openPortPicker(id, rect),
                onViewState: view => this.onEditorViewState(view),
                onColorPicked: color => this.pickColour(color),
                measureLabel: m => fillText(this.etext.measureLabel, {ldu: this.decimal(m.ldu), studs: this.decimal(m.studs), mm: this.decimal(m.mm)}),
                onShortcuts: () => this.setState({shortcuts: true})});
            this.editView.setGrid(this.state.grid);
            this.colors = colors;
            const palette = this.lib.colorPalette(colors);
            this.palette = {...palette, byCode: new Map([...palette.common, ...palette.more].map(c => [c.code, c]))};
            this.editView.setPlaceColor(this.state.placeColor ?? DEFAULT_COLOR);
            this.editView.setHidden(this.storedHidden());
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

    /** Hidden parts (ids) kept for this browser session. */
    storedHidden () {
        try {
            const ids = JSON.parse(sessionStorage.getItem(HIDDEN_STORAGE_KEY) || '[]');
            return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [];
        } catch {
            return [];
        }
    }

    /** The build view's hidden parts, edited group, picking tool or measurement changed. */
    onEditorViewState ({hidden, group, pick, measure}) {
        this.setState({hidden, editGroup: group, pick, measurement: measure});
        try {
            sessionStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(hidden));
        } catch { /* storage off: hidden only until the pane closes */ }
    }

    /** An LDraw colour's name: German for the common palette, else LDConfig's English name. */
    colourName (code) {
        const own = this.etext.colourNames && this.etext.colourNames[code];
        if (own) return own;
        const c = this.colors && this.colors.get(code);
        return c ? c.name.replace(/_/g, ' ') : String(code);
    }

    /** The colour picker (or the eyedropper): new parts get this colour, and a selection is painted with it. */
    pickColour (color) {
        this.setState({placeColor: color});
        if (!this.editView) return;
        this.editView.setPlaceColor(color);
        if (this.editView.selection.length) this.editView.paint(color);
        this.setState(s => ({editorTick: s.editorTick + 1}));
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
        // The editor's model is frozen: its id map is built once (lib partsByIdOf), not a scan per issue.
        const placed = model && (Object.isFrozen(model.parts) ? this.lib.partsByIdOf(model).get(id) : model.parts.find(p => p.id === id));
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
            await this.openShipped(modelKey(this.lib.MODELS[0]));
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

    /** "Save as…": the model on show (built or simulated) as a .ldr, .mpd or .io file (lib/bw-sim/model/model-file.js). */
    async saveAs (format) {
        this.setState({saveMenu: false});
        const model = this.editor ? this.editor.model : this.session?.model;
        if (!model || !this.lib) return;
        const name = !this.editor && isStorableName(this.state.modelFile) ? this.state.modelFile : 'my-model.ldr';
        const {data, filename, mime} = await this.lib.saveModelFile(model, format, {name, title: MODEL_TITLE});
        const url = URL.createObjectURL(new Blob([data], {type: mime}));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /** The "Save as…" button and, while it is open, one button per format. */
    renderSaveAs (style, disabled) {
        const T = this.text;
        const open = this.state.saveMenu && !disabled;
        return (
            <span key="save-as" style={{display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap'}}>
                <button type="button" style={style} data-testid="bw-sim-lab-save" disabled={disabled} title={T.saveHelp}
                    aria-haspopup="true" aria-expanded={open} onClick={() => this.setState(s => ({saveMenu: !s.saveMenu}))}>{T.save}</button>
                {open && SAVE_FORMATS.map(format => (
                    <button key={format} type="button" style={style} data-testid={`bw-sim-lab-save-${format}`}
                        onClick={() => this.saveAs(format)}>{T.saveFormats[format]}</button>
                ))}
            </span>
        );
    }

    /**
     * Puts the VM on the session's clock (sim-clock.js). Not for the firmware route: its emulated
     * hub runs the program and paces the scene itself (routes/renode-lockstep).
     */
    startClock () {
        const vm = this.props.vm;
        if (!this.session || this.session.lockstep || !vm || !vm.runtime || this.clockInert) return;
        if (!this.clock) this.clock = new this.lib.SimLabClock();
        this.clock.install(vm.runtime, this.session);
    }

    /** Back to wall time (Pause, a new model, the pane closing). */
    stopClock () {
        if (this.clock) this.clock.uninstall();
    }

    teardown () {
        this.stopClock();
        if (this.view) { try { this.view.dispose(); } catch { /* a lost context may already be gone */ } }
        this.view = null;
        if (this.session) this.session.dispose();
        this.session = null;
    }

    /** Opens a MODELS entry by its key (`id`, else its file): one model file may be listed twice, with different examples. */
    async openShipped (key) {
        const entry = this.lib.MODELS.find(m => modelKey(m) === key);
        if (!entry) return;
        const file = entry.file;
        const response = await fetch(`${this.lib.MODELS_BASE}${file}`);
        if (!response.ok) {
            this.setState({status: 'failed', message: this.t('failed', {error: `HTTP ${response.status}`})});
            return;
        }
        await this.openText(await response.text(), file, key);
        // A model that comes with an example offers it while the Code tab has no SPIKE program.
        if (!this.disposed) this.setState({info: this.shippedModel()?.example && !this.spikeLoaded() ? this.text.exampleOffer : ''});
    }

    /** The MODELS entry of the model on show, or null for a built or imported one. */
    shippedModel () {
        return this.lib?.MODELS.find(m => modelKey(m) === this.state.shipped) || null;
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

    /**
     * "Open…": an LDraw, BrickLink Studio or LEGO Digital Designer file, turned into LDraw
     * text (lib/bw-sim/model/model-file.js). A file that cannot be opened at all leaves the
     * model on show as it is and says why; what the import left out joins the model's notes.
     */
    async openImported (event) {
        const f = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!f) return;
        let opened;
        try {
            const bytes = new Uint8Array(await f.arrayBuffer());
            const ldconfig = /\.lxf$/i.test(f.name) ?
                (await this.lib.fetchLDrawClosure([], {withConfig: true})).read('ldconfig.ldr') || '' : '';
            opened = await this.lib.openModelFile(f.name, bytes, {ldconfig, title: MODEL_TITLE});
        } catch (error) {
            const reason = (error && this.text.fileErrors[error.code]) || (error && error.message) || String(error);
            if (!this.disposed) this.setState({message: this.t('fileFailed', {name: f.name, error: reason})});
            return;
        }
        if (this.disposed) return;
        this.lastText = opened.text;
        await this.openText(opened.text, opened.name);
        if (opened.refusals.length && !this.disposed) {
            this.setState(s => ({issues: this.lib.mergeImportIssues(opened.refusals, s.issues)}));
        }
    }

    async openText (text, name, shipped = null) {
        const token = this.loadToken = {};
        this.opened = {text, name};
        this.teardown();
        this.setState({status: 'loading', message: '', issues: [], blockers: [], modelFile: name, shipped, simMs: 0, rtf: null, view3d: 'loading'});
        const {SimSession, fetchLDrawClosure, createSimView3D, CATALOG} = this.lib;
        // The SPIKE firmware route (desktop): the emulated hub starts first; the scene then runs
        // in lockstep with it (lib/bw-sim/routes/renode-lockstep).
        let firmware = null;
        let refusal = null;
        this.firmware = null;
        if (this.state.route === 'firmware') {
            // The program the emulated hub runs: the Code tab's blocks, compiled by the SPIKE
            // arena's firmware compiler and uploaded before lockstep. A block it cannot express
            // is named in the pane; the route still opens, with no program (the robot stands).
            const compiled = this.compileFirmware();
            refusal = compiled.error;
            try {
                firmware = await this.lib.openFirmwareRoute({capabilities: this.renodeCapabilities(), hubState: this.props.hubState,
                    program: compiled.program, onProgramChange: control => this.onFirmwareProgram(control)});
            } catch (error) {
                if (token !== this.loadToken) return;
                // The packaged runtime has no lockstep/v1: not a failure, an unavailable route.
                if (error.code === 'lockstep-unsupported') {
                    this.setState({status: 'failed', route: 'scratch', firmwareUnsupported: true, message: this.text.routeUnavailable});
                } else {
                    this.setState({status: 'failed', message: this.t('firmwareFailed', {error: error.message})});
                }
                return;
            }
        }
        let result;
        try {
            // A model naming a part beyond the catalogue's core (sim-lab.js) loads the rest first.
            await this.lib.catalogFor(text);
            if (token !== this.loadToken || this.disposed) { firmware?.driver.end().catch(() => {}); return; }
            result = await SimSession.fromText(text, {hubState: this.props.hubState, catalog: CATALOG, mat: this.state.mat,
                worker: this.physicsClient(), ...(firmware ? {createHub: firmware.createHub} : {})});
        } catch (error) {
            firmware?.driver.end().catch(() => {});
            if (token === this.loadToken) this.setState({status: 'failed', message: this.t('failed', {error: error.message})});
            return;
        }
        if (!result.session) firmware?.driver.end().catch(() => {});
        if (token !== this.loadToken || this.disposed) { result.session?.dispose(); return; }
        if (result.session && firmware) {
            this.firmware = firmware;
            if (refusal) this.setState({message: firmwareRefusalSentence(this.locale, refusal)});
        }
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
        if (session.workerError && this.physics && !session.lockstep) { this.physics.terminate(); this.physics = false; }
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

    /** In the desktop app (or with injected capabilities): the SPIKE firmware route can be offered. */
    desktop () {
        return Boolean(this.props.renodeCapabilities || (typeof window !== 'undefined' && window.__TAURI_INTERNALS__));
    }

    /** The desktop app's native Renode capabilities (made once), or the injected ones. */
    renodeCapabilities () {
        if (this.props.renodeCapabilities) return this.props.renodeCapabilities;
        if (this._renodeCapabilities === undefined) this._renodeCapabilities = this.lib.desktopRenodeCapabilities(window);
        return this._renodeCapabilities;
    }

    /** Switches the program route and reloads the model on it (the firmware route starts the emulator). */
    setRoute (route) {
        if (route === this.state.route) return;
        const opened = this.opened;
        if (this.state.status === 'running') this.pause();
        this.setState({route}, () => {
            if (opened) this.openText(opened.text, opened.name);
        });
    }

    /** The Code tab's program for the firmware route: {program} or {error} (which block, why). */
    compileFirmware () {
        return this.lib.compileRouteProgram(this.props.vm, {topology: 'default'});
    }

    /**
     * Run on the firmware route: the program as it is now (a changed one restarts the
     * emulated hub with it: program packets cannot cross during lockstep), then START.
     */
    async runFirmware () {
        const compiled = this.compileFirmware();
        if (compiled.error) {
            this.setState({message: firmwareRefusalSentence(this.locale, compiled.error)});
            return;
        }
        const key = JSON.stringify(compiled.program.instructions);
        if (this.firmware?.program?.key !== key) {
            this.setState({info: this.text.firmwareReloading});
            const opened = this.opened;
            if (!opened) return;
            await this.openText(opened.text, opened.name, this.state.shipped);
            if (this.disposed || this.firmware?.program?.key !== key) return;
        }
        const program = this.firmware.program;
        this.setState({status: 'running', info: '', message: ''});
        try {
            await program.start();
        } catch (error) {
            this.setState({status: 'paused', message: this.t('firmwareControlFailed', {error: error.message})});
        }
    }

    /** Pause on the firmware route: STOP, and the clock runs on until the hub has taken it (the robot brakes). */
    pauseFirmware () {
        const program = this.firmware?.program;
        if (!program || (!program.running && program.idle)) { this.setState({status: 'paused'}); return; }
        this.setState({status: 'stopping'});
        program.stop().catch(error => this.setState({status: 'paused', message: this.t('firmwareControlFailed', {error: error.message})}));
    }

    /** The emulated hub's program changed state (lib/bw-sim/routes/renode-lockstep/program.js onChange). */
    onFirmwareProgram (control) {
        if (this.disposed || this.firmware?.program !== control) return;
        if (control.failed) {
            this.setState({status: this.state.status === 'stopping' ? 'paused' : this.state.status,
                message: this.t('firmwareControlFailed', {error: control.failed.message})});
            return;
        }
        if (control.fault !== null && control.stateName === 'fault') {
            this.setState({message: this.t('firmwareFault', {error: control.fault})});
        }
        if (this.state.status === 'stopping' && !control.running && control.idle) this.setState({status: 'paused'});
    }

    frame (now) {
        this.raf = requestAnimationFrame(this.frame);
        const dt = this.last === null ? 0 : Math.min(MAX_FRAME_MS, now - this.last);
        const clocked = Boolean(this.clock && this.clock.installed);
        if (clocked) {
            this.clock.noteFrame();
            // The VM steps around the hook (arena-clock.js isInert): fall back to wall time, loudly in
            // behaviour rather than freezing the world and every wait with it.
            if (this.clock.inert) {
                this.stopClock();
                this.clockInert = true;
            }
        }
        this.last = now;
        if (this.editView) { this.drawThumbs(); this.editView.render(); return; }
        if (!this.session) return;
        if (this.session.failed && this.state.status !== 'failed') {
            this.setState({status: 'failed', message: this.t('physicsFailed', {error: this.session.failed.message})});
        }
        // 'stopping': the firmware route keeps its clock until the emulated hub has taken STOP.
        // With the program clock installed the VM's steps tick the world (sim-clock.js), not frames.
        if ((this.state.status === 'running' || this.state.status === 'stopping') && dt > 0 && !(this.clock && this.clock.installed)) {
            this.session.tick(dt);
        }
        // With the physics in the worker, simulated time advances when a batch comes back.
        if (Math.floor(this.session.time / 100) !== Math.floor(this.state.simMs / 100)) {
            this.setState({simMs: this.session.time, rtf: this.clock && this.clock.installed ? this.clock.realTimeFactor : null});
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
        if (this.session.lockstep) { await this.runFirmware(); return; }
        const hubState = this.props.hubState;
        hubState.setSimulationEnabled(true);
        // Connecting runs on wall time (its timeouts are the browser's); the program clock goes in
        // just before the green flag, so the program's first `wait` starts on the world's clock.
        this.stopClock();
        this.setState({status: 'running'});
        const vm = this.props.vm;
        // Without a SPIKE program the clock still runs (the arrows below drive the motors),
        // but say plainly why nothing moves on its own.
        if (!this.spikeLoaded()) {
            this.startClock();
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
        if (this.state.status === 'running') {
            this.startClock();
            vm.greenFlag();
        }
    }
    /** Puts the current model on another mat (its start pose, if the mat has one) and reloads it. */
    async setMat (mat) {
        if (!this.session) return;
        const text = this.lib.serializeModel(this.session.model, {name: this.state.modelFile || 'model.ldr'});
        this.pause();
        this.setState({mat: mat || null}, () => this.openText(text, this.state.modelFile, this.state.shipped));
    }

    /** Hold-to-drive with the movement pair (A left, mounted mirrored; B right), as the arena's drive pad. */
    drive (direction) {
        if (!this.session || !this.session.bridge) return;
        const hub = this.props.hubState;
        hub.setSimulationEnabled(true);
        if (this.state.status !== 'running') {
            this.startClock();
            this.setState({status: 'running'});
        }
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
        if (this.session.lockstep) { this.pauseFirmware(); return; }
        if (this.spikeLoaded()) { try { this.props.vm.stopAll(); } catch { /* the VM may be mid-load */ } }
        this.props.hubState.backend.cancel();
        this.stopClock();
        this.setState({status: 'paused'});
    }

    async reset () {
        if (!this.session) return;
        this.props.hubState.stopAll?.();
        const name = this.state.modelFile;
        if (this.state.shipped) await this.openShipped(this.state.shipped);
        else if (this.lastText) await this.openText(this.lastText, name);
    }

    renderDrive (button) {
        // The arrow follows the finger (or button) that pressed it: captured, so sliding off does not
        // let go, and it stops when THAT finger lifts or the browser takes it away (another finger on
        // another arrow has taken over by then and keeps driving).
        const release = e => {
            if (this.drivePointer !== e.pointerId) return;
            this.drivePointer = null;
            this.drive('stop');
        };
        const hold = dir => ({
            onPointerDown: e => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                this.drivePointer = e.pointerId;
                this.drive(dir);
            },
            onPointerUp: release,
            onPointerCancel: release,
            onLostPointerCapture: release,
            onContextMenu: e => e.preventDefault()
        });
        const compact = this.compact();
        const arrow = {...button, minWidth: this.state.coarse ? 48 : 34, fontSize: 15, lineHeight: '18px', userSelect: 'none',
            WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'none', ...(compact ? {padding: '4px 6px', flex: '0 0 auto'} : {})};
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
                role="group" aria-label={this.text.drive}
                style={{display: 'flex', alignItems: 'center', flexWrap: compact ? 'nowrap' : 'wrap', gap: compact ? 4 : 6, fontSize: 12, outline: 'none', minWidth: 0}}>
                {!compact && <span style={{fontWeight: 600}}>{this.text.drive}</span>}
                <button type="button" style={arrow} data-testid="bw-sim-lab-drive-left" aria-label={this.text.left} {...hold('left')}>◀</button>
                <button type="button" style={arrow} data-testid="bw-sim-lab-drive-forward" aria-label={this.text.forward} {...hold('forward')}>▲</button>
                <button type="button" style={arrow} data-testid="bw-sim-lab-drive-back" aria-label={this.text.back} {...hold('back')}>▼</button>
                <button type="button" style={arrow} data-testid="bw-sim-lab-drive-right" aria-label={this.text.right} {...hold('right')}>▶</button>
                <label style={{whiteSpace: 'nowrap', flex: '0 0 auto'}}>{compact ? null : `${this.text.speed} `}
                    <input type="range" min={10} max={100} step={10} value={this.state.driveSpeed} data-testid="bw-sim-lab-drive-speed"
                        aria-label={this.text.speed}
                        onChange={e => this.setState({driveSpeed: Number(e.target.value)})} style={{verticalAlign: 'middle', width: compact ? 64 : 90}} />
                    {' '}{this.state.driveSpeed} %
                </label>
                <span data-testid="bw-sim-lab-readout" title={this.text.driveHelp}
                    style={{color: '#475569', ...(compact ? {flex: '1 1 0', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'} : {})}}>
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
        // The drawer closes once a part is armed, so the whole view is free for the click that places it.
        this.setState({placing: next, drawer: next && this.compact() ? false : this.state.drawer});
    }

    /** A press on a palette tile: the editor view follows it; dragged into the view, it places the part there. */
    pressPart (part, event) {
        this.paletteDragged = false;
        if (event.button !== 0 || !this.editView) return;
        event.preventDefault(); // no text selection or native image drag while it is dragged out
        this.editView.pressPalettePart(part, event, ({dragged}) => {
            this.paletteDragged = dragged;
            if (dragged) this.setState({paletteDragging: false, drawer: false});
        });
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
        const E = this.etext.st;
        const name = part => this.partName(part);
        const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));
        const hole = st.connector && /^[a-z](\d+)$/.exec(st.connector);
        switch (st.kind) {
        case 'hover': return fill(st.selected ? T.hoverSelected : T.hover, {part: name(st.part)});
        case 'placing': return fill(this.state.coarse ? T.placingTouch : T.placing, {part: name(st.part)});
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
        case 'refused': return fill(T[st.reason] || E[st.reason] || T.invalid, {detail: st.detail || '', target: st.target ? name(st.target) : ''});
        case 'painted': return fill(E.painted, {n: st.count, colour: this.colourName(st.color)});
        case 'pickedColor': return fill(E.pickedColor, {colour: this.colourName(st.color), part: name(st.part)});
        case 'measured': return fill(E.measured, {ldu: this.decimal(st.ldu), studs: this.decimal(st.studs), mm: this.decimal(st.mm)});
        case 'mirrored': return fill(st.kept ? E.mirroredKept : st.swapped ? E.mirroredSwapped : E.mirrored, {n: st.count, s: st.swapped, k: st.kept});
        case 'groupEdit': case 'groupLeft': return fill(E[st.kind], {name: st.name || ''});
        case 'turnedBy': return fill(E.turnedBy, {deg: st.degrees});
        case 'idle': return this.state.coarse ? T.idleTouch : T.idle;
        default:
            if (E[st.kind]) return fill(E[st.kind], {n: st.count});
            return T[st.kind] ? fill(T[st.kind], {n: st.count}) : (this.state.coarse ? T.idleTouch : T.idle);
        }
    }

    partName (part) {
        const m = this.lib && this.lib.CATALOG.get(part);
        return m ? ((this.locale === 'de' && m.nameDe) || m.name) : part;
    }

    /**
     * The "More…" menu: the actions a compact toolbar has no room for, with their full
     * labels (and the same test ids as on the wide toolbar). Picking an action closes it.
     */
    renderMore (button, children) {
        const open = this.state.more;
        return (
            <div ref={this.moreRef} style={{position: 'relative', flex: '0 0 auto'}}>
                <button type="button" style={{...button, marginRight: 0}} data-testid="bw-sim-lab-more" aria-haspopup="true" aria-expanded={open}
                    aria-label={this.text.moreHelp} title={this.text.moreHelp} onClick={() => this.setState(s => ({more: !s.more}))}>
                    {this.narrow() ? face('more') : this.text.more}
                </button>
                {open && (
                    <div role="group" aria-label={this.text.moreHelp} data-testid="bw-sim-lab-more-menu"
                        onKeyDown={e => { if (e.key === 'Escape') this.setState({more: false}); }}
                        onClick={e => { if (e.target.closest('button')) this.setState({more: false}); }}
                        style={{position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 30, width: 260, maxWidth: '80vw', maxHeight: '60vh',
                            overflowY: 'auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: 8, fontSize: 12,
                            background: '#fff', border: '1px solid #94a3b8', borderRadius: 8, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.25)', boxSizing: 'border-box'}}>
                        {children}
                    </div>
                )}
            </div>
        );
    }

    /** Wide enough for the properties panel to stand beside the 3D view. */
    dockProperties () {
        return this.state.paneWidth >= DOCK_PROPERTIES_PX;
    }

    /** Build: the properties panel, docked beside the view or over its right edge. */
    renderProperties (button, docked) {
        if (!this.editor || !this.palette) return null;
        const field = this.state.coarse ? {minHeight: 40} : undefined;
        return (
            <SimLabProperties T={this.etext} lib={this.lib} editor={this.editor} view={this.editView} selectionIds={this.state.selection}
                palette={this.palette} colourName={code => this.colourName(code)} placeColor={this.state.placeColor ?? this.lib.DEFAULT_COLOR}
                pick={this.state.pick} editGroup={this.state.editGroup} partName={part => this.partName(part)} tick={this.state.editorTick}
                onColour={code => this.pickColour(code)} onTick={() => this.setState(s => ({editorTick: s.editorTick + 1}))}
                onClose={docked ? null : () => this.setState({propsOpen: false})} button={button} field={field} docked={docked} />
        );
    }

    renderBuildBar (button) {
        const editor = this.editor;
        const view = this.editView;
        const parts = editor ? editor.model.parts : [];
        const byId = editor ? this.lib.partsByIdOf(editor.model) : new Map();
        const selection = this.state.selection.map(id => byId.get(id)).filter(Boolean);
        const sel = selection.length === 1 ? selection[0] : null;
        const meta = sel ? this.lib.CATALOG.get(sel.part) : null;
        const portable = meta && this.lib.isPortPart(meta);
        const tick = () => this.setState(s => ({editorTick: s.editorTick + 1}));
        const compact = this.compact();
        const narrow = this.narrow();
        const small = {...button, padding: this.state.coarse ? '6px 10px' : '3px 8px', marginRight: 0};
        const icon = {...small, padding: this.state.coarse ? '4px 6px' : '3px 6px', minWidth: this.state.coarse ? 40 : 32, minHeight: this.state.coarse ? 40 : 30};
        const field = this.state.coarse ? {minHeight: 40} : undefined;
        const pressed = (on, base = small) => ({...base, background: on ? '#dbeafe' : '#fff', borderColor: on ? '#2563eb' : '#94a3b8', fontWeight: on ? 600 : 400});
        const st = this.state.buildStatus || {};
        const refused = st.kind === 'refused';
        const blocked = st.kind === 'blocked';
        const T = this.text;
        const E = this.etext;
        const docked = this.dockProperties();
        const nothing = !selection.length && !this.state.placing;
        /** Every Build action once: id, label, what it does; `glyph` is its face on the compact toolbar. */
        const act = {
            turn: {label: T.turnUp, glyph: 'turn', words: '90°', disabled: nothing, run: () => view?.turn('up', 1)},
            'turn-back': {label: T.turnBack, disabled: nothing, run: () => view?.turn('up', -1)},
            tip: {label: T.tip, disabled: !selection.length, run: () => view?.turn('facing', 1)},
            group: {label: T.group, title: T.groupKey, disabled: selection.length < 2, run: () => { view?.groupSelection(); tick(); }},
            ungroup: {label: T.ungroup, title: T.ungroupKey,
                disabled: !(editor?.model.groups || []).some(g => g.parts.some(id => this.state.selection.includes(id))),
                run: () => { view?.ungroupSelection(); tick(); }},
            duplicate: {label: T.duplicate, disabled: !selection.length, run: () => view?.duplicate()},
            delete: {label: T.remove, glyph: 'delete', disabled: !selection.length, run: () => view?.deleteSelection()},
            copy: {label: T.copy, title: T.copyKey, disabled: !selection.length, run: () => view?.copy()},
            paste: {label: T.paste, title: T.pasteKey, run: () => view?.paste()},
            'select-all': {label: T.selectAll, title: T.selectAllKey, disabled: !parts.length, run: () => view?.selectAll()},
            cancel: {label: T.cancel, glyph: 'cancel', disabled: nothing, run: () => view?.escape()},
            undo: {label: T.undo, glyph: 'undo', disabled: !editor?.canUndo, run: () => { view?.undo(); tick(); }},
            redo: {label: T.redo, glyph: 'redo', disabled: !editor?.canRedo, run: () => { view?.redo(); tick(); }},
            'view-home': {label: T.home, run: () => view?.view('home')},
            'view-fit': {label: T.fit, run: () => view?.fitSelection()},
            'view-top': {label: T.top, run: () => view?.view('top')},
            'view-front': {label: T.front, run: () => view?.view('front')},
            'view-side': {label: T.side, run: () => view?.view('side')},
            // Studio's tools (sim-lab-editor-text.js): mirror, hide / isolate, measure, eyedropper, properties, shortcuts.
            'mirror-x': {label: E.mirrorX, title: E.mirrorXHelp, disabled: !selection.length, run: () => { view?.mirror('x'); tick(); }},
            'mirror-z': {label: E.mirrorZ, title: E.mirrorZHelp, disabled: !selection.length, run: () => { view?.mirror('z'); tick(); }},
            hide: {label: E.hide, disabled: !selection.length, run: () => view?.hideSelection()},
            isolate: {label: E.isolate, disabled: !selection.length, run: () => view?.isolate()},
            'show-all': {label: E.showAll, disabled: !this.state.hidden.length, run: () => view?.showAll()},
            measure: {label: E.measure, pressed: this.state.pick === 'measure', run: () => view?.setPick('measure')},
            eyedropper: {label: E.eyedropper, title: E.eyedropperHelp, pressed: this.state.pick === 'color', run: () => view?.setPick('color')},
            properties: {label: E.properties, title: E.propertiesHelp, pressed: this.state.propsOpen, run: () => this.setState(s => ({propsOpen: !s.propsOpen}))},
            shortcuts: {label: E.shortcuts, title: E.shortcutsHelp, run: () => this.setState({shortcuts: true})}
        };
        const full = id => {
            const a = act[id];
            return (
                <button key={id} type="button" style={a.pressed === undefined ? small : pressed(a.pressed)} data-testid={`bw-sim-lab-${id}`}
                    disabled={a.disabled} title={a.title} aria-pressed={a.pressed} onClick={a.run}>{a.label}</button>
            );
        };
        // On the compact toolbar a glyph carries the action; its name is the accessible name and the tooltip.
        const glyph = id => {
            const a = act[id];
            return (
                <button key={id} type="button" style={icon} data-testid={`bw-sim-lab-${id}`} disabled={a.disabled}
                    aria-label={a.label} title={a.title ? `${a.label} · ${a.title}` : a.label} onClick={a.run}>{face(a.glyph, a.words)}</button>
            );
        };
        const gap = key => <span key={key} style={{width: 6}} />;
        const modes = [['move', T.move], ['rotate', T.turn]].map(([m, label]) => (
            <button key={m} type="button" style={pressed(this.state.gizmoMode === m, compact ? icon : small)} data-testid={`bw-sim-lab-mode-${m}`}
                aria-pressed={this.state.gizmoMode === m} aria-label={compact ? label : undefined} title={compact ? label : undefined}
                onClick={() => view?.setMode(m)}>{compact ? face(m) : label}</button>
        ));
        const grid = (
            <label key="grid" style={{marginLeft: compact ? 0 : 4}}>{T.grid}{' '}
                <select data-testid="bw-sim-lab-grid" value={this.state.grid} style={field}
                    onChange={e => { const g = Number(e.target.value); view?.setGrid(g); this.setState({grid: g}); }}>
                    {[1, 5, 10, 20].map(g => <option key={g} value={g}>{g} {T.ldu}</option>)}
                </select>
            </label>
        );
        const oneLine = compact ? {flexWrap: 'nowrap', minWidth: 0} : {flexWrap: 'wrap'};
        return (
            <div style={{display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, minWidth: 0}}>
                {compact ? (
                    <div data-testid="bw-sim-lab-build-bar" style={{display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap'}}>
                        <button type="button" style={pressed(this.state.drawer, icon)} data-testid="bw-sim-lab-parts-toggle"
                            aria-expanded={this.state.drawer} aria-label={T.partsToggle} title={T.partsToggle}
                            onClick={() => this.setState(s => ({drawer: !s.drawer}))}>{face('parts', narrow && this.state.coarse ? null : T.parts)}</button>
                        {modes}
                        {glyph('turn')}
                        {/* While a part is armed there is nothing to delete; the same place stops placing. */}
                        {this.state.placing ? glyph('cancel') : glyph('delete')}
                        {glyph('undo')}
                        {!narrow && glyph('redo')}
                        <span style={{flex: '1 1 0'}} />
                        {this.renderMore(button, [
                            grid,
                            ...[...(narrow ? ['redo'] : []), 'turn-back', 'tip', 'duplicate', 'copy', 'paste', 'select-all', 'group', 'ungroup',
                                ...(this.state.placing ? ['delete'] : ['cancel']),
                                'mirror-x', 'mirror-z', 'hide', 'isolate', 'show-all', 'measure', 'eyedropper', 'properties',
                                'view-home', 'view-fit', 'view-top', 'view-front', 'view-side', 'shortcuts'].map(full),
                            this.renderSaveAs(small, !editor),
                            this.renderInsightBar()
                        ])}
                    </div>
                ) : (
                    <div data-testid="bw-sim-lab-build-bar" style={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4}}>
                        {modes}
                        {grid}
                        {gap('g1')}
                        {['turn', 'turn-back', 'tip', 'group', 'ungroup', 'duplicate', 'delete', 'copy', 'paste', 'select-all', 'cancel'].map(full)}
                        {gap('g2')}
                        {['undo', 'redo'].map(full)}
                        {gap('g3')}
                        {['view-home', 'view-fit', 'view-top', 'view-front', 'view-side'].map(full)}
                        {gap('g4')}
                        {this.renderSaveAs(small, !editor)}
                        {gap('g5')}
                        {['mirror-x', 'mirror-z', 'hide', 'isolate', 'show-all', 'measure', 'eyedropper', ...(docked ? [] : ['properties']), 'shortcuts'].map(full)}
                    </div>
                )}
                <div style={{display: 'flex', alignItems: 'center', gap: 8, minHeight: 22, ...oneLine}}>
                    {this.state.hidden.length > 0 && (
                        <button type="button" data-testid="bw-sim-lab-hidden-count" title={E.showAll} onClick={() => view?.showAll()}
                            style={{...small, padding: '1px 6px', background: '#f1f5f9', whiteSpace: 'nowrap'}}>
                            {E.hiddenCount.replace('{n}', this.state.hidden.length)}
                        </button>
                    )}
                    {this.state.editGroup && (
                        <span data-testid="bw-sim-lab-group-edit-chip" style={{whiteSpace: 'nowrap', color: '#5b21b6', fontWeight: 600}}>
                            {E.groupBanner.replace('{name}', this.state.editGroup.name)}
                        </span>
                    )}
                    {selection.length > 0 && (
                        <span data-testid="bw-sim-lab-selection" style={{fontWeight: 600, color: '#1e3a8a', whiteSpace: compact ? 'nowrap' : undefined}}>
                            {sel ? this.t('selectedOne', {name: this.partName(sel.part)}) : this.t('selectedMany', {n: selection.length})}
                        </span>
                    )}
                    {portable && (
                        <label style={{whiteSpace: 'nowrap'}}>{T.port}{': '}
                            <select data-testid="bw-sim-lab-port" value={sel.port || ''} style={field}
                                onChange={e => { editor.apply({type: 'setPort', id: sel.id, port: e.target.value || null}); tick(); }}>
                                <option value="">{T.none}</option>
                                {['A', 'B', 'C', 'D', 'E', 'F'].map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </label>
                    )}
                    <span role="status" data-testid="bw-sim-lab-build-status" data-kind={st.kind || 'idle'} title={compact ? this.buildStatusText() : undefined}
                        style={{color: refused || blocked ? '#b91c1c' : '#475569', fontWeight: refused ? 600 : 400,
                            ...(compact ? {flex: '1 1 0', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'} : {})}}>
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
        if (this.compact()) {
            // One line ("Before you press Run: (2)") that opens to the list.
            return (
                <details role="alert" data-testid="bw-sim-lab-blockers"
                    style={{fontSize: 12, color: '#7c2d12', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 6, padding: '4px 8px', minWidth: 0}}>
                    <summary style={{cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                        <strong>{this.itext.blockersTitle}</strong> ({blockers.length})
                    </summary>
                    <ul style={{margin: '2px 0 0', paddingLeft: 18}}>
                        {blockers.map(b => this.renderIssue({...b, severity: 'warning'}, b.code))}
                    </ul>
                </details>
            );
        }
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

    /** A note for the learner (the info box); compact, it is one line that opens on a click. */
    renderInfo () {
        const info = this.state.info;
        if (!info || this.state.mode !== 'simulate') return null;
        const box = {fontSize: 12, color: '#1e3a8a', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '6px 8px'};
        if (!this.compact()) return <div role="status" data-testid="bw-sim-lab-info" style={box}>{info}</div>;
        const open = this.state.infoOpen;
        return (
            <div role="status" data-testid="bw-sim-lab-info" style={{...box, padding: '4px 8px', minWidth: 0}}>
                <button type="button" data-testid="bw-sim-lab-info-toggle" aria-expanded={open} title={this.text.infoToggle}
                    onClick={() => this.setState(s => ({infoOpen: !s.infoOpen}))}
                    style={{display: 'block', width: '100%', font: 'inherit', color: 'inherit', textAlign: 'left', background: 'none', border: 'none',
                        padding: 0, cursor: 'pointer', ...(open ? {} : {whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'})}}>
                    <span aria-hidden="true">{open ? '▾ ' : '▸ '}</span>{info}
                </button>
            </div>
        );
    }

    render () {
        const {status, message, issues, simMs, modelFile, shipped} = this.state;
        const busy = status === 'loading';
        const compact = this.compact();
        const narrow = this.narrow();
        const button = {padding: compact ? '4px 8px' : '4px 10px', marginRight: compact ? 0 : 6, borderRadius: 6, border: '1px solid #94a3b8', background: '#fff', cursor: 'pointer',
            // Under a finger: at least 40 px each way.
            ...(this.state.coarse ? {minHeight: 40, minWidth: 40, padding: compact ? '6px 8px' : '6px 12px'} : {})};
        const icon = {...button, minWidth: this.state.coarse ? 40 : 32, minHeight: this.state.coarse ? 40 : 30, padding: this.state.coarse ? '4px 6px' : '3px 6px'};
        const T = this.text;
        const simulate = this.state.mode === 'simulate';
        const running = status === 'running';
        // The firmware route's emulator pace (always shown); the program clock's only when the world holds
        // the program back (sim-clock.js): on a machine that keeps up there is nothing to say.
        const programRtf = this.state.rtf !== null && this.state.rtf !== undefined && this.state.rtf < SHOW_RTF_BELOW ? this.state.rtf : null;
        const rtf = this.session?.lockstep ? this.session.realTimeFactor : programRtf;
        const statusText = `${busy ? T.loading : T[status] || ''}${this.session ? ` · ${compact ? this.t('timeShort', {s: (simMs / 1000).toFixed(1)}) : this.t('time', {s: (simMs / 1000).toFixed(1)})}` : ''}` +
            (rtf !== null && running ? ` · ${this.t('realTime', {f: this.decimal(rtf < 0.1 ? rtf.toFixed(3) : rtf.toFixed(2))})}` : '');
        // Desktop only (the web build has no managed Renode runtime): the program route.
        const firmwareReady = this.lib && this.desktop() &&
            this.lib.firmwareRouteReady(this.renodeCapabilities(), {unsupported: this.state.firmwareUnsupported});
        const routeSelect = this.lib && this.desktop() && (
            <label style={{fontSize: 12}}>{T.route}{': '}
                <select data-testid="bw-sim-lab-route" disabled={busy} value={this.state.route} onChange={e => this.setRoute(e.target.value)}>
                    <option value="scratch">{T.routeScratch}</option>
                    <option value="firmware" disabled={!firmwareReady} title={firmwareReady ? undefined : T.routeUnavailable}>{T.routeFirmware}</option>
                </select>
            </label>
        );
        const modelSelect = (
            <select data-testid="bw-sim-lab-model" disabled={busy || !this.lib} value={shipped || ''}
                aria-label={compact ? T.model : undefined} title={compact ? T.model : undefined}
                style={compact ? {flex: '1 1 0', minWidth: 0, ...(this.state.coarse ? {minHeight: 40} : {})} : undefined}
                onChange={e => e.target.value && this.openShipped(e.target.value)}>
                {this.lib && this.lib.MODELS.map(m => <option key={modelKey(m)} value={modelKey(m)}>{m.title[this.locale] || m.title.en}</option>)}
                {modelFile && !shipped && <option value="">{modelFile}</option>}
            </select>
        );
        const matSelect = (
            <select data-testid="bw-sim-lab-mat" disabled={busy || !this.session} value={this.state.mat || 'plain'}
                aria-label={compact ? T.mat : undefined} title={compact ? T.mat : undefined}
                style={compact ? {flex: '1 1 0', minWidth: 0, ...(this.state.coarse ? {minHeight: 40} : {})} : undefined}
                onChange={e => this.setMat(e.target.value === 'plain' ? null : e.target.value)}>
                {this.lib && this.lib.MATS.map(m => <option key={m.id} value={m.id}>{m.title[this.locale] || m.title.en}</option>)}
            </select>
        );
        const importButton = (
            <button key="import" type="button" style={button} data-testid="bw-sim-lab-open" title={T.importHelp} disabled={busy || !this.lib}
                onClick={() => this.file.current.click()}>{T.importModel}</button>
        );
        const saveAsControl = this.renderSaveAs(button, busy || !this.session);
        const runButton = running ?
            <button type="button" style={button} data-testid="bw-sim-lab-pause" onClick={() => this.pause()}>{compact ? face('pause', T.pause) : T.pause}</button> :
            <button type="button" style={button} data-testid="bw-sim-lab-run" disabled={!this.session || busy || status === 'stopping'} onClick={() => this.run()}>{compact ? face('run', T.run) : T.run}</button>;
        const resetButton = (
            <button type="button" style={compact ? icon : button} data-testid="bw-sim-lab-reset" disabled={!this.session || busy}
                aria-label={compact ? T.reset : undefined} title={compact ? T.reset : undefined} onClick={() => this.reset()}>
                {compact ? face('reset') : T.reset}
            </button>
        );
        const exampleButton = this.shippedModel()?.example && (
            <button type="button" style={button} data-testid="bw-sim-lab-example" disabled={busy} onClick={() => this.loadExample()}>{T.example}</button>
        );
        const statusLine = (
            <span role="status" data-testid="bw-sim-lab-status"
                style={{fontSize: 12, color: '#475569', ...(compact ? {flex: '1 1 0', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'} : {})}}>
                {statusText}
            </span>
        );
        const large = compact && this.props.onEnterFullScreen && !this.props.isFullScreen;
        return (
            <div ref={this.root} data-testid="bw-sim-lab" data-status={status} data-layout={compact ? 'compact' : 'wide'}
                style={{position: 'relative', display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8, padding: compact ? 8 : 10, height: '100%', boxSizing: 'border-box', minWidth: 0}}>
                {!compact && <div style={{fontSize: 12, color: '#334155'}}>{T.intro}</div>}
                <div style={{display: 'flex', alignItems: 'center', gap: 4, minWidth: 0}}>
                    <div role="tablist" style={{display: 'flex', gap: 4}}>
                        {['simulate', 'build'].map(mode => (
                            <button key={mode} type="button" role="tab" aria-selected={this.state.mode === mode} disabled={busy || !this.lib}
                                data-testid={`bw-sim-lab-mode-${mode}`} style={{...button, marginRight: 0, fontWeight: this.state.mode === mode ? 600 : 400,
                                    ...(this.state.mode === mode ? {background: '#e0e7ff', borderColor: '#4f46e5'} : {})}}
                                onClick={() => (mode === 'build' ? this.state.mode !== 'build' && this.enterBuild() : this.state.mode !== 'simulate' && this.exitBuild())}>
                                {T[mode]}
                            </button>
                        ))}
                    </div>
                    <button type="button" style={button} data-testid="bw-sim-lab-instructions" title={T.instructionsHelp}
                        disabled={busy || !this.lib || !(this.editor ? this.editor.model : this.session?.model)?.parts.length}
                        onClick={() => this.setState({instructions: this.editor ? this.editor.model : this.session.model})}>
                        {T.instructions}
                    </button>
                    {large && <span style={{flex: '1 1 0'}} />}
                    {large && (
                        <button type="button" data-testid="bw-sim-lab-large" aria-label={T.large} title={T.large} onClick={() => this.props.onEnterFullScreen()}
                            style={{...icon, background: '#4f46e5', borderColor: '#4338ca', color: '#fff'}}>{face('large')}</button>
                    )}
                </div>
                {this.state.instructions && (
                    <SimLabInstructions lib={this.lib} model={this.state.instructions} locale={this.locale}
                        title={this.editor ? null : this.shippedModel()?.title[this.locale] || this.state.modelFile}
                        onClose={() => this.setState({instructions: null})} />
                )}
                <input ref={this.file} type="file" accept={OPEN_ACCEPT} style={{display: 'none'}} data-testid="bw-sim-lab-file"
                    onChange={e => this.openImported(e)} />
                {simulate && !compact && <div style={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6}}>
                    <label style={{fontSize: 12}}>{T.model}{': '}{modelSelect}</label>
                    {importButton}
                    {saveAsControl}
                    <label style={{fontSize: 12}}>{T.mat}{': '}{matSelect}</label>
                    {routeSelect}
                    {runButton}
                    {resetButton}
                    {exampleButton}
                    {statusLine}
                </div>}
                {simulate && compact && (
                    <React.Fragment>
                        <div style={{display: 'flex', alignItems: 'center', gap: 4, minWidth: 0}}>
                            {runButton}
                            {resetButton}
                            {statusLine}
                            {this.renderMore(button, [
                                <div key="intro" style={{fontSize: 12, color: '#334155', flex: '1 1 100%'}}>{T.intro}</div>,
                                importButton,
                                saveAsControl,
                                this.lib ? <div key="insight" style={{flex: '1 1 100%'}}>{this.renderInsightBar()}</div> : null
                            ])}
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flexWrap: narrow && exampleButton ? 'wrap' : 'nowrap'}}>
                            {modelSelect}
                            {matSelect}
                            {routeSelect}
                            {exampleButton}
                        </div>
                    </React.Fragment>
                )}
                {message && <div role="alert" data-testid="bw-sim-lab-message" style={{fontSize: 12, color: '#b91c1c'}}>{message}</div>}
                {this.renderInfo()}
                {simulate && this.session && this.session.bridge && !this.session.lockstep && this.renderDrive(button)}
                {this.state.mode === 'build' && this.renderBuildBar(button)}
                {this.lib && !compact && this.renderInsightBar()}
                {this.renderBlockers()}
                <div style={{display: 'flex', flex: '1 1 auto', minHeight: compact ? 220 : 240, gap: 8, position: 'relative'}}>
                    {this.state.mode === 'build' && (compact ? (
                        // The palette as a drawer over the view's left edge; it stays mounted (search and open
                        // categories survive), and steps aside while a part is carried out of it.
                        <div data-testid="bw-sim-lab-palette-drawer" style={{position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 6,
                            display: this.state.drawer ? 'flex' : 'none', visibility: this.state.paletteDragging ? 'hidden' : 'visible',
                            maxWidth: 'calc(100% - 48px)', background: '#fff', padding: '6px 0 6px 6px', borderRadius: '0 8px 8px 0',
                            boxShadow: '4px 0 14px rgba(15, 23, 42, 0.25)', boxSizing: 'border-box'}}>
                            {this.renderPalette()}
                        </div>
                    ) : this.renderPalette())}
                    <div ref={this.viewWrap} style={{flex: '1 1 auto', minHeight: compact ? 220 : 240, minWidth: 0, position: 'relative', display: 'flex'}}>
                        <div ref={this.box} data-testid="bw-sim-lab-view" style={{flex: '1 1 auto', minHeight: compact ? 220 : 240, minWidth: 0, position: 'relative'}} />
                        {this.renderPortPicker(button)}
                        {this.state.mode === 'build' && !this.dockProperties() && this.state.propsOpen && (
                            <div data-testid="bw-sim-lab-properties-drawer" style={{position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 6, maxWidth: 'calc(100% - 48px)',
                                display: 'flex', boxShadow: '-4px 0 14px rgba(15, 23, 42, 0.25)', borderRadius: '8px 0 0 8px'}}>
                                {this.renderProperties(button, false)}
                            </div>
                        )}
                    </div>
                    {this.state.mode === 'build' && this.dockProperties() && (
                        <div style={{flex: '0 0 auto', display: 'flex', minHeight: 0}}>{this.renderProperties(button, true)}</div>
                    )}
                </div>
                {this.state.mode === 'build' && this.state.shortcuts && (
                    <SimLabShortcuts T={this.etext} onClose={() => {
                        this.setState({shortcuts: false});
                        this.editView?.canvas.focus();
                    }} />
                )}
                {issues.length > 0 && (
                    <details data-testid="bw-sim-lab-issues" style={{fontSize: 12}} open={!compact}>
                        <summary style={compact ? {whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer'} : undefined}>
                            {T.issues} ({issues.length})
                        </summary>
                        <ul style={{margin: '4px 0', paddingLeft: 18}}>{issues.map((i, n) => this.renderIssue(i, n))}</ul>
                    </details>
                )}
            </div>
        );
    }
}

export default SimLabPane;
