// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab build editor's Studio-style tools, in the learner's language:
// colour picker, properties panel, hide / isolate, mirror, align, measure,
// editing inside a group and the shortcut sheet (sim-lab-pane.jsx,
// sim-lab-properties.jsx, sim-lab-shortcuts.jsx). English colour names come
// from LDConfig; the common palette has German names here.

export const EDITOR_TEXT = {
    en: {
        mirrorX: 'Mirror ↔', mirrorXHelp: 'Mirror left ↔ right (a left part becomes its right part)',
        mirrorZ: 'Mirror ⇅', mirrorZHelp: 'Mirror front ↔ back',
        hide: 'Hide (H)', isolate: 'Isolate (I)', showAll: 'Show all (Shift+H)',
        measure: 'Measure (M)', eyedropper: 'Eyedropper (K)', shortcuts: 'Shortcuts (?)', shortcutsHelp: 'All mouse, keyboard and touch controls',
        properties: 'Properties', propertiesHelp: 'Show or hide the properties of the selected parts',
        nothingSelected: 'Select a part to see and change it here.',
        partNumber: 'Part {number}', manyParts: '{n} parts', mixed: 'mixed',
        colour: 'Colour', moreColours: 'All LDraw colours…', currentColour: 'New parts: {name}',
        eyedropperHelp: 'Take the colour from a part: click this, then click the part',
        port: 'Port', none: 'none',
        position: 'Position (LDU, 20 = one hole)', positionMany: 'Move all by (LDU)', x: 'X', y: 'Y ↑', z: 'Z',
        rotation: 'Rotation (°)', turnAbout: 'Turn about {axis}', minus90: '−90°', plus90: '+90°',
        group: 'Group', notInGroup: 'Not in a group', groupName: 'Name', editGroup: 'Edit inside', leaveGroup: 'Leave group (Esc)',
        ungroup: 'Ungroup',
        align: 'Line up', alignAxis: 'Direction', axisX: 'Left – right', axisY: 'Down – up', axisZ: 'Back – front',
        alignX: ['Left edges', 'Centres', 'Right edges'], alignY: ['Bottoms', 'Centres', 'Tops'], alignZ: ['Backs', 'Centres', 'Fronts'],
        distribute: 'Spread evenly', toGrid: 'Snap to grid', mirror: 'Mirror', view: 'View',
        hiddenCount: '{n} hidden', groupBanner: 'Inside group “{name}”: click its parts one by one.',
        measureLabel: '{ldu} LDU · {studs} studs · {mm} mm',
        close: 'Close',
        sheetTitle: 'Controls: mouse, keyboard and touch',
        sheet: [
            ['Mouse', [
                ['Click', 'select a part (a grouped part selects its group)'],
                ['Shift+click', 'add or remove a part'], ['Shift+drag', 'select with a box'],
                ['Drag a part', 'move it (it rests on what is under it; magnets snap)'],
                ['Double click', 'edit inside a group'], ['Drag empty space / right drag', 'turn the view'],
                ['Middle drag / Shift+right drag', 'slide the view'], ['Wheel', 'zoom']
            ]],
            ['Keyboard', [
                ['W / E', 'move / turn with the handles'], ['R, Shift+R', 'turn 90° about the up axis'], ['T, Shift+T', 'tip 90°'],
                ['Shift (while turning)', '15° steps'], ['Alt (while moving)', 'no magnet'],
                ['Delete', 'delete'], ['Ctrl+D', 'duplicate'], ['Ctrl+C / Ctrl+V', 'copy / paste (LDraw text: works with Studio and LeoCAD too)'],
                ['Ctrl+A', 'select all'], ['Ctrl+G / Ctrl+Shift+G', 'group / ungroup'], ['Ctrl+Z / Ctrl+Y', 'undo / redo'],
                ['H / I / Shift+H', 'hide / isolate / show all'], ['K', 'eyedropper: take a part\'s colour'], ['M', 'measure between two points'],
                ['F', 'fit the selection in view'], ['Esc', 'stop / leave the group / clear the selection'], ['?', 'this sheet']
            ]],
            ['Touch', [
                ['Tap', 'select a part'], ['Drag a part', 'move it'], ['Long press', 'add or remove a part'],
                ['Long press on empty space, then drag', 'select with a box'], ['One finger on empty space', 'turn the view'],
                ['Two fingers', 'zoom and slide the view']
            ]]
        ],
        st: {
            hidden: '{n} hidden: Shift+H (Show all) brings them back', isolated: 'Only {n} shown: Shift+H (Show all) brings the rest back',
            shownAll: 'All parts shown again ({n})', nothingHidden: 'Nothing is hidden.',
            mirrored: 'Mirrored {n}', mirroredSwapped: 'Mirrored {n}: {s} became their mirror part',
            mirroredKept: 'Mirrored {n}: {k} kept their own shape (a real LEGO part cannot be mirrored)',
            mirrorSame: 'It is its own mirror image: nothing changes.',
            aligned: 'Lined up ({n} moved)', distributed: 'Spread evenly ({n} moved)', gridded: 'Snapped to the grid ({n} moved)',
            onGridAlready: 'Already on the grid.', alignNeedsTwo: 'Select at least two parts to line them up.',
            distributeNeedsThree: 'Select at least three parts to spread them.', nothingMoves: 'Nothing to change.',
            painted: 'Painted {n} {colour}', sameColour: 'Already that colour.',
            eyedropper: 'Eyedropper: click a part to take its colour (Esc stops)', pickedColor: 'Took {colour} from {part}',
            pickAPart: 'Click on a part to take its colour.',
            measureFirst: 'Measuring: click the first point (holes and pins snap)', measureSecond: 'Now click the second point',
            measured: '{ldu} LDU = {studs} studs = {mm} mm. Click again to measure anew, Esc stops.',
            groupEdit: 'Inside group “{name}”: click its parts one by one, Esc leaves', groupLeft: 'Left group “{name}”',
            turnedBy: 'Turned {deg}°', clipboardUnknown: 'The clipboard holds LDraw parts this lab does not have.'
        }
    },
    de: {
        mirrorX: 'Spiegeln ↔', mirrorXHelp: 'Links ↔ rechts spiegeln (ein linkes Teil wird zum rechten)',
        mirrorZ: 'Spiegeln ⇅', mirrorZHelp: 'Vorne ↔ hinten spiegeln',
        hide: 'Ausblenden (H)', isolate: 'Nur diese (I)', showAll: 'Alle zeigen (Umschalt+H)',
        measure: 'Messen (M)', eyedropper: 'Pipette (K)', shortcuts: 'Tastenkürzel (?)', shortcutsHelp: 'Alle Maus-, Tastatur- und Touch-Bedienungen',
        properties: 'Eigenschaften', propertiesHelp: 'Eigenschaften der ausgewählten Teile zeigen oder ausblenden',
        nothingSelected: 'Wähle ein Teil aus, um es hier zu sehen und zu ändern.',
        partNumber: 'Teil {number}', manyParts: '{n} Teile', mixed: 'gemischt',
        colour: 'Farbe', moreColours: 'Alle LDraw-Farben…', currentColour: 'Neue Teile: {name}',
        eyedropperHelp: 'Farbe von einem Teil nehmen: hier klicken, dann auf das Teil',
        port: 'Port', none: 'keiner',
        position: 'Position (LDU, 20 = ein Loch)', positionMany: 'Alle verschieben um (LDU)', x: 'X', y: 'Y ↑', z: 'Z',
        rotation: 'Drehung (°)', turnAbout: 'Um {axis} drehen', minus90: '−90°', plus90: '+90°',
        group: 'Gruppe', notInGroup: 'In keiner Gruppe', groupName: 'Name', editGroup: 'Innen bearbeiten', leaveGroup: 'Gruppe verlassen (Esc)',
        ungroup: 'Gruppe lösen',
        align: 'Ausrichten', alignAxis: 'Richtung', axisX: 'Links – rechts', axisY: 'Unten – oben', axisZ: 'Hinten – vorne',
        alignX: ['Linke Kanten', 'Mitten', 'Rechte Kanten'], alignY: ['Unterseiten', 'Mitten', 'Oberseiten'], alignZ: ['Hinterseiten', 'Mitten', 'Vorderseiten'],
        distribute: 'Gleichmäßig verteilen', toGrid: 'Aufs Raster', mirror: 'Spiegeln', view: 'Ansicht',
        hiddenCount: '{n} ausgeblendet', groupBanner: 'In der Gruppe „{name}“: klicke ihre Teile einzeln an.',
        measureLabel: '{ldu} LDU · {studs} Noppen · {mm} mm',
        close: 'Schließen',
        sheetTitle: 'Bedienung: Maus, Tastatur und Touch',
        sheet: [
            ['Maus', [
                ['Klick', 'ein Teil auswählen (ein Teil einer Gruppe wählt die Gruppe)'],
                ['Umschalt+Klick', 'ein Teil dazu nehmen oder weglassen'], ['Umschalt+Ziehen', 'mit einem Rahmen auswählen'],
                ['Teil ziehen', 'verschieben (es liegt auf dem, was darunter ist; Magnete rasten ein)'],
                ['Doppelklick', 'in einer Gruppe bearbeiten'], ['Leere Fläche ziehen / rechts ziehen', 'Ansicht drehen'],
                ['Mittlere Taste ziehen / Umschalt+rechts ziehen', 'Ansicht schieben'], ['Mausrad', 'zoomen']
            ]],
            ['Tastatur', [
                ['W / E', 'mit den Griffen schieben / drehen'], ['R, Umschalt+R', 'um 90° um die Hochachse drehen'], ['T, Umschalt+T', 'um 90° kippen'],
                ['Umschalt (beim Drehen)', '15°-Schritte'], ['Alt (beim Schieben)', 'ohne Magnet'],
                ['Entf', 'löschen'], ['Strg+D', 'verdoppeln'], ['Strg+C / Strg+V', 'kopieren / einfügen (LDraw-Text: geht auch mit Studio und LeoCAD)'],
                ['Strg+A', 'alle wählen'], ['Strg+G / Strg+Umschalt+G', 'gruppieren / Gruppe lösen'], ['Strg+Z / Strg+Y', 'rückgängig / wiederholen'],
                ['H / I / Umschalt+H', 'ausblenden / nur diese / alle zeigen'], ['K', 'Pipette: Farbe eines Teils nehmen'], ['M', 'zwischen zwei Punkten messen'],
                ['F', 'Auswahl einpassen'], ['Esc', 'abbrechen / Gruppe verlassen / Auswahl aufheben'], ['?', 'diese Übersicht']
            ]],
            ['Touch', [
                ['Tippen', 'ein Teil auswählen'], ['Teil ziehen', 'verschieben'], ['Lange drücken', 'ein Teil dazu nehmen oder weglassen'],
                ['Lange auf leere Fläche drücken, dann ziehen', 'mit einem Rahmen auswählen'], ['Ein Finger auf leerer Fläche', 'Ansicht drehen'],
                ['Zwei Finger', 'zoomen und Ansicht schieben']
            ]]
        ],
        st: {
            hidden: '{n} ausgeblendet: Umschalt+H (Alle zeigen) holt sie zurück', isolated: 'Nur {n} sichtbar: Umschalt+H (Alle zeigen) holt den Rest zurück',
            shownAll: 'Alle Teile wieder sichtbar ({n})', nothingHidden: 'Nichts ist ausgeblendet.',
            mirrored: '{n} gespiegelt', mirroredSwapped: '{n} gespiegelt: {s} wurden zu ihrem Spiegelteil',
            mirroredKept: '{n} gespiegelt: {k} behalten ihre Form (ein echtes LEGO-Teil kann man nicht spiegeln)',
            mirrorSame: 'Es ist sein eigenes Spiegelbild: Es ändert sich nichts.',
            aligned: 'Ausgerichtet ({n} verschoben)', distributed: 'Gleichmäßig verteilt ({n} verschoben)', gridded: 'Aufs Raster gesetzt ({n} verschoben)',
            onGridAlready: 'Schon auf dem Raster.', alignNeedsTwo: 'Wähle mindestens zwei Teile zum Ausrichten aus.',
            distributeNeedsThree: 'Wähle mindestens drei Teile zum Verteilen aus.', nothingMoves: 'Es gibt nichts zu ändern.',
            painted: '{n} {colour} gefärbt', sameColour: 'Hat schon diese Farbe.',
            eyedropper: 'Pipette: klicke ein Teil an, um seine Farbe zu nehmen (Esc beendet)', pickedColor: '{colour} von {part} genommen',
            pickAPart: 'Klicke auf ein Teil, um seine Farbe zu nehmen.',
            measureFirst: 'Messen: klicke den ersten Punkt an (Löcher und Pins rasten ein)', measureSecond: 'Jetzt den zweiten Punkt anklicken',
            measured: '{ldu} LDU = {studs} Noppen = {mm} mm. Nochmal klicken misst neu, Esc beendet.',
            groupEdit: 'In der Gruppe „{name}“: klicke ihre Teile einzeln an, Esc verlässt sie', groupLeft: 'Gruppe „{name}“ verlassen',
            turnedBy: 'Um {deg}° gedreht', clipboardUnknown: 'In der Zwischenablage sind LDraw-Teile, die es hier nicht gibt.'
        },
        colourNames: {
            15: 'Weiß', 0: 'Schwarz', 71: 'Hellgrau', 72: 'Dunkelgrau', 4: 'Rot', 320: 'Dunkelrot', 25: 'Orange', 191: 'Hellorange',
            14: 'Gelb', 226: 'Hellgelb', 27: 'Limettengrün', 2: 'Grün', 288: 'Dunkelgrün', 10: 'Hellgrün', 322: 'Mittelazur', 321: 'Dunkelazur',
            73: 'Mittelblau', 1: 'Blau', 272: 'Dunkelblau', 212: 'Hellblau', 22: 'Lila', 30: 'Mittellavendel', 26: 'Magenta', 5: 'Dunkelpink',
            13: 'Rosa', 19: 'Beige', 28: 'Dunkelbeige', 84: 'Mittel-Nougat', 70: 'Rotbraun', 308: 'Dunkelbraun', 378: 'Sandgrün', 379: 'Sandblau'
        }
    }
};
