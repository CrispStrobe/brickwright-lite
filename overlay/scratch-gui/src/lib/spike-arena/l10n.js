// SPDX-License-Identifier: BSD-3-Clause
// Every word the SPIKE arena shows, in English and German (docs/I18N.md,
// "a shared table for the whole feature"). Challenge texts live in the
// challenge files themselves, beside the world they describe.

import {makeT, pickLocale} from '../bw-i18n.js';

export const ARENA_L10N = {
    en: {
        title: 'SPIKE arena',
        unit: 'Unit',
        challenge: 'Challenge',
        start: '▶ Start',
        stop: '⏸ Stop',
        reset: '↺ Reset',
        step: '⏭ Step',
        hints: 'Hints',
        hint: 'Hint {n}',
        loadSolution: 'Load reference solution',
        loadSolutionTitle: 'Replace the Code tab with this challenge\'s reference solution (lite SPIKE dialect) and build its blocks',
        loading: 'Loading challenges…',
        loadFailed: 'Could not load the challenges: {error}',
        noHub: 'The virtual SPIKE hub is not available in this build.',
        noProgram: 'No SPIKE program is loaded. Write one in the Code tab (DEVICE SPIKE) or load the reference solution; the world still runs.',
        connecting: 'Connecting the program to the virtual hub…',
        connectFailed: 'The SPIKE blocks could not connect to the virtual hub: {error}',
        running: 'Running',
        paused: 'Paused',
        ready: 'Ready',
        time: 'Time',
        position: 'Position',
        heading: 'Yaw',
        motors: 'Motors',
        color: 'Colour',
        distance: 'Distance',
        force: 'Force',
        pressed: 'pressed',
        released: 'released',
        noReading: 'no reading',
        canvasLabel: 'Arena: the mat, the rover and its sensors',
        'pass.reached': 'Mission complete: reached the {zone}.',
        'pass.stoppedIn': 'Mission complete: stopped inside the {zone}.',
        'pass.heading': 'Mission complete: turned {target}° on the spot.',
        'pass.sequence': 'Mission complete: every waypoint visited in order.',
        'pass.touched': 'Mission complete: touched the {object}.',
        'pass.pushed': 'Mission complete: the {object} is in the {zone}.',
        'fail.enteredZone': 'Mission failed: the rover drove into the {zone}.',
        'fail.leftZone': 'Mission failed: the rover left the {zone}.',
        'fail.hitWall': 'Mission failed: the rover hit a wall.',
        'fail.touched': 'Mission failed: the rover touched the {object}.',
        'fail.timeLimit': 'Mission failed: time is up after {seconds} s.',
        colors: {black: 'black', magenta: 'magenta', violet: 'violet', blue: 'blue', azure: 'azure',
            turquoise: 'turquoise', green: 'green', yellow: 'yellow', orange: 'orange', red: 'red', white: 'white'}
    },
    de: {
        title: 'SPIKE-Arena',
        unit: 'Einheit',
        challenge: 'Aufgabe',
        start: '▶ Start',
        stop: '⏸ Anhalten',
        reset: '↺ Zurücksetzen',
        step: '⏭ Schritt',
        hints: 'Tipps',
        hint: 'Tipp {n}',
        loadSolution: 'Musterlösung laden',
        loadSolutionTitle: 'Den Code-Tab durch die Musterlösung dieser Aufgabe (lite-SPIKE-Dialekt) ersetzen und die Blöcke erzeugen',
        loading: 'Aufgaben werden geladen…',
        loadFailed: 'Die Aufgaben konnten nicht geladen werden: {error}',
        noHub: 'Der virtuelle SPIKE-Hub ist in diesem Build nicht verfügbar.',
        noProgram: 'Kein SPIKE-Programm geladen. Schreibe eines im Code-Tab (DEVICE SPIKE) oder lade die Musterlösung; die Welt läuft trotzdem.',
        connecting: 'Das Programm wird mit dem virtuellen Hub verbunden…',
        connectFailed: 'Die SPIKE-Blöcke konnten sich nicht mit dem virtuellen Hub verbinden: {error}',
        running: 'Läuft',
        paused: 'Angehalten',
        ready: 'Bereit',
        time: 'Zeit',
        position: 'Position',
        heading: 'Gierwinkel',
        motors: 'Motoren',
        color: 'Farbe',
        distance: 'Abstand',
        force: 'Kraft',
        pressed: 'gedrückt',
        released: 'nicht gedrückt',
        noReading: 'kein Messwert',
        canvasLabel: 'Arena: die Matte, der Rover und seine Sensoren',
        'pass.reached': 'Mission erfüllt: {zone} erreicht.',
        'pass.stoppedIn': 'Mission erfüllt: im Bereich „{zone}“ angehalten.',
        'pass.heading': 'Mission erfüllt: {target}° auf der Stelle gedreht.',
        'pass.sequence': 'Mission erfüllt: alle Wegpunkte in der richtigen Reihenfolge besucht.',
        'pass.touched': 'Mission erfüllt: {object} berührt.',
        'pass.pushed': 'Mission erfüllt: {object} liegt im Bereich „{zone}“.',
        'fail.enteredZone': 'Mission gescheitert: Der Rover ist in den Bereich „{zone}“ gefahren.',
        'fail.leftZone': 'Mission gescheitert: Der Rover hat den Bereich „{zone}“ verlassen.',
        'fail.hitWall': 'Mission gescheitert: Der Rover ist gegen eine Wand gefahren.',
        'fail.touched': 'Mission gescheitert: Der Rover hat {object} berührt.',
        'fail.timeLimit': 'Mission gescheitert: Die Zeit ist nach {seconds} s abgelaufen.',
        colors: {black: 'schwarz', magenta: 'magenta', violet: 'violett', blue: 'blau', azure: 'azurblau',
            turquoise: 'türkis', green: 'grün', yellow: 'gelb', orange: 'orange', red: 'rot', white: 'weiß'}
    }
};

const lookup = makeT(ARENA_L10N);
/** The translate function for a locale: t(key, params). */
export const arenaT = locale => (key, params) => lookup(locale, key, params);
export const arenaLocale = locale => pickLocale(locale, ARENA_L10N);

/** A challenge's own text ({en, de}) in the locale, English as the fallback. */
export const localText = (value, locale) => (value && (value[arenaLocale(locale)] || value.en)) || '';

/**
 * The verdict as a sentence: zone and object ids become their labels from the
 * challenge, in the locale.
 */
export const verdictText = (verdict, world, locale) => {
    if (!verdict || !verdict.reason) return '';
    const t = arenaT(locale);
    const label = id => {
        const thing = [...(world.zones || []), ...(world.objects || [])].find(entry => entry.id === id);
        return thing && thing.label ? localText(thing.label, locale) : id;
    };
    const params = {...verdict.params};
    if (params.zone) params.zone = label(params.zone);
    if (params.object) params.object = label(params.object);
    return t(verdict.reason, params);
};
