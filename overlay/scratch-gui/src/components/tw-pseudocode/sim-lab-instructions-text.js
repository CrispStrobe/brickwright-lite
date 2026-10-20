// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's building instructions in the learner's words, English and
// German (sim-lab-instructions.jsx reads it; the pane's own table has the
// button that opens them). Placeholders: {n} a step number or a count,
// {total} the number of steps, {name} a sub-assembly's name.

export const INSTRUCTIONS_TEXT = {
    en: {
        title: 'Building instructions',
        intro: 'Build this robot from real LEGO® parts, one step at a time.',
        step: 'Step {n} / {total}',
        counter: '{n} / {total}',
        previous: 'Previous',
        next: 'Next',
        keys: 'Turn the pages with ← and →.',
        partsNeeded: 'Parts needed',
        partsList: 'Parts list',
        total: '{n} parts in all',
        print: 'Print / Save as PDF',
        printHelp: 'Opens all the pages in a new window and asks the browser to print them. Choose “Save as PDF” there to keep a PDF.',
        printing: 'Drawing the pages…',
        printBlocked: 'The browser blocked the print window. Allow pop-ups for this page and press Print again.',
        close: 'Close',
        loading: 'Drawing the instructions…',
        failed: 'The instructions could not be drawn: {error}',
        empty: 'There is nothing to build yet: add some parts in Build.',
        subassembly: 'Build this part first: {name}',
        attach: 'Now attach: {name}',
        loose: 'This part does not connect to the rest yet.',
        pins: 'First push these pins and axles into the model, where they are shown in orange.',
        fromFile: 'Steps from the model file',
        derived: 'Steps worked out from how the parts connect',
        canvasLabel: 'Step {n} of {total}: the new parts are outlined in orange',
        lengthLabel: 'length {n}',
        documentTitle: '{name}: building instructions'
    },
    de: {
        title: 'Bauanleitung',
        intro: 'Bau diesen Roboter aus echten LEGO®-Teilen, Schritt für Schritt.',
        step: 'Schritt {n} / {total}',
        counter: '{n} / {total}',
        previous: 'Zurück',
        next: 'Weiter',
        keys: 'Blättere mit ← und →.',
        partsNeeded: 'Diese Teile brauchst du',
        partsList: 'Teileliste',
        total: '{n} Teile insgesamt',
        print: 'Drucken / Als PDF speichern',
        printHelp: 'Öffnet alle Seiten in einem neuen Fenster und lässt den Browser sie drucken. Wähle dort „Als PDF speichern“, um eine PDF-Datei zu behalten.',
        printing: 'Die Seiten werden gezeichnet…',
        printBlocked: 'Der Browser hat das Druckfenster blockiert. Erlaube Pop-ups für diese Seite und drücke noch einmal Drucken.',
        close: 'Schließen',
        loading: 'Die Bauanleitung wird gezeichnet…',
        failed: 'Die Bauanleitung konnte nicht gezeichnet werden: {error}',
        empty: 'Es gibt noch nichts zu bauen: Füge im Bauen-Modus Teile hinzu.',
        subassembly: 'Baue zuerst dieses Teilstück: {name}',
        attach: 'Jetzt ansetzen: {name}',
        loose: 'Dieses Teil ist noch mit nichts verbunden.',
        pins: 'Stecke zuerst diese Pins und Achsen ins Modell, dort, wo sie orange zu sehen sind.',
        fromFile: 'Schritte aus der Modelldatei',
        derived: 'Schritte, ausgerechnet aus den Verbindungen der Teile',
        canvasLabel: 'Schritt {n} von {total}: die neuen Teile sind orange umrandet',
        lengthLabel: 'Länge {n}',
        documentTitle: '{name}: Bauanleitung'
    }
};
