#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {readFileSync, writeFileSync} from 'node:fs';
import {MODELS, prepareModel, catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
const root = new URL('../', import.meta.url);
const catalog = catalogFrom(JSON.parse(readFileSync(new URL('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', root))));
// The topic and challenge describe an observable physical effect, not just the model's shape.
const lessons = {
    'orbit-mixer': ['gears', 'Compare orbital travel and paddle heading: two inputs select forward spin, heading compensation or reverse spin.', 'Vergleiche Umlauf und Paddelausrichtung: Zwei Eingänge wählen Vorwärtslauf, Ausrichtungsausgleich oder Rückwärtslauf.'],
    'phase-bridge': ['gears', 'Equal bends and correctly phased forks cancel the speed ripple of two universal joints. Compare the middle shaft with the output.', 'Gleiche Knickwinkel und richtig ausgerichtete Gabeln gleichen die Drehzahlschwankung zweier Kardangelenke aus. Vergleiche Zwischenwelle und Abtrieb.'],
    'phase-bridge-misphased': ['gears', 'A quarter-turn phasing error makes the two universal joints reinforce their speed ripple. Compare with the correctly phased bridge.', 'Ein Ausrichtungsfehler von einer Vierteldrehung verstärkt die Drehzahlschwankung beider Kardangelenke. Vergleiche mit der richtig ausgerichteten Brücke.'],
    'axis-plotter': ['forces', 'Two rack stages coordinate XY drawing while a third lifts the marker. Compare motor feedback, travel, diagonals and pen-up moves.', 'Zwei Zahnstangenachsen koordinieren XY-Zeichnungen, eine dritte hebt den Stift. Vergleiche Motorfeedback, Wege, Diagonalen und Fahrten mit angehobenem Stift.'],
    "mean-machine": ["gears", "Two motors drive a differential; the pointer computes their signed mean while the spider absorbs their difference.", "Zwei Motoren treiben ein Differential. Der Zeiger bildet ihren vorzeichenbehafteten Mittelwert; das Ausgleichsrad nimmt die Differenz auf."],
    "stepworks": ["forces", "A phased six-gear train lifts a loose pallet, carries it forward and returns underneath. Three transfers, then reset or reload.", "Ein phasenrichtiges Sechser-Zahnradgetriebe hebt eine freie Palette, trägt sie vor und fährt darunter zurück. Drei Hübe, dann zurücksetzen oder neu auflegen."],
    "stride-lab": ["linkages", "One crank drives a Hoeken-type coupler tip through a nearly straight working stroke and curved return.", "Eine Kurbel führt den Koppelpunkt eines Hoeken-Viergelenks durch einen fast geraden Arbeitshub und einen gekrümmten Rücklauf."],
    "twinpoint": ["linkages", "Two base-mounted motors coordinate a five-bar loop to draw a circle and a bounded vertical line.", "Zwei feststehende Motoren koordinieren ein Fünfgelenk und zeichnen einen Kreis sowie eine begrenzte senkrechte Linie."],
    "butterfly": ["linkages", "One crank and a sliding crosshead lift two rigid triangular wings together.", "Eine Kurbel und ein gleitender Kreuzkopf heben zwei starre Dreiecksflügel gemeinsam."],
    'tempo-loop': ['linkages', 'Two full-turn cranks share a coupler: equal revolution counts, changing angular-speed ratio.', 'Zwei umlaufende Kurbeln teilen eine Koppel: gleiche Umdrehungszahlen, wechselndes Winkelgeschwindigkeitsverhältnis.'],
    'tilt-lab': ['forces', 'Two nested motor axes tilt a maze tray beneath a free ball. Explore slope, gravity, inertia and wall contacts; use ±6° on A and ±10° on B.', 'Zwei verschachtelte Motorachsen neigen eine Labyrinthschale unter einer freien Kugel. Untersuche Neigung, Schwerkraft, Trägheit und Wandkontakte; nutze ±6° an A und ±10° an B.'],
    'atlas-arm': ['forces', 'Two 24:1 worm drives position an articulated arm; a third motor opens the gripper. Compare shaft turns, joint angles and active holding.', 'Zwei 24:1-Schneckengetriebe positionieren einen Gelenkarm; ein dritter Motor öffnet den Greifer. Vergleiche Wellenumdrehungen, Gelenkwinkel und Halten.'],
    'switchback-lift': ['forces', 'Lift a free ball 64 mm, tip it onto a sloping track, catch its return at a gate, and reload the lowered cradle.', 'Hebe eine freie Kugel um 64 mm, kippe sie auf eine schräge Bahn, halte ihren Rücklauf am Tor und lade die abgesenkte Wiege.'],
    'straight-eight': ['linkages', 'Seven moving links make the red marker trace a straight line through a bounded ±60° crank sector, with no sliding guide.', 'Sieben bewegliche Glieder führen den roten Punkt geradlinig durch einen Kurbelbereich von ±60°, ohne Gleitführung.'],
    'pendulum-array': ['inertia', 'Spin and stop the support; three free arms compare length-dependent periods and phase drift.', 'Drehe und stoppe die Aufhängung: Drei freie Arme vergleichen längenabhängige Perioden und Phasendrift.'],
    'clutch-bench': ['forces', 'A drives a 24-tooth slipping clutch and 40-tooth output; B returns the output to zero and holds it, then releases it.', 'A treibt eine 24-Zähne-Rutschkupplung mit 40-Zähne-Abtrieb. B fährt den Abtrieb auf null, hält ihn und gibt ihn wieder frei.'],
    'pulse-percussion': ['forces', 'One camshaft lifts and releases three gravity beaters. Compare shaft phase, falling motion and tempo.', 'Eine Nockenwelle hebt drei Schwerkraftschlägel und gibt sie frei. Vergleiche Wellenphase, Fallbewegung und Tempo.'],
    'centrifugal-governor': ['forces', 'Free arms swing outward as the rotor speeds up. Compare angular speed squared with gravity; reverse and compare again.', 'Freie Arme schwingen bei höherer Drehzahl nach außen. Vergleiche das Quadrat der Winkelgeschwindigkeit mit der Schwerkraft und kehre die Drehrichtung um.'],
    'tidal-trio': ['linkages', 'Wave: three 16/48/32/48 mm four-bar linkages compare crank phase and nonlinear rocker motion. Offsets [0, 120, 240] degrees.', 'Welle: Drei Viergelenke mit 16/48/32/48 mm vergleichen Kurbelphase und nichtlineare Schwingbewegung. Versatz [0, 120, 240] Grad.'],
    'tidal-trio-together': ['linkages', 'Together: three 16/48/32/48 mm four-bar linkages compare crank phase and nonlinear rocker motion. Offsets [0, 0, 0] degrees.', 'Gleichlauf: Drei Viergelenke mit 16/48/32/48 mm vergleichen Kurbelphase und nichtlineare Schwingbewegung. Versatz [0, 0, 0] Grad.'],
    'tidal-trio-alternating': ['linkages', 'Alternating: three 16/48/32/48 mm four-bar linkages compare crank phase and nonlinear rocker motion. Offsets [0, 180, 0] degrees.', 'Abwechselnd: Drei Viergelenke mit 16/48/32/48 mm vergleichen Kurbelphase und nichtlineare Schwingbewegung. Versatz [0, 180, 0] Grad.'],
    'tidal-trio-reverse': ['linkages', 'Reverse wave: three 16/48/32/48 mm four-bar linkages compare crank phase and nonlinear rocker motion. Offsets [0, 240, 120] degrees.', 'Gegenwelle: Drei Viergelenke mit 16/48/32/48 mm vergleichen Kurbelphase und nichtlineare Schwingbewegung. Versatz [0, 240, 120] Grad.'],
    'orbital-loom': ['linkages', 'Fivefold pattern: 1 paper turns and 5 pen turns trace a live curve on rotating paper. Two motors, a 20:60 mesh and an offset crank.', 'Fünffach-Muster: 1 Papierumdrehungen und 5 Stiftumdrehungen zeichnen eine Kurve auf rotierendem Papier. Zwei Motoren, 20:60-Getriebe und versetzte Kurbel.'],
    'orbital-loom-sevenfold': ['linkages', 'Sevenfold pattern: 2 paper turns and 7 pen turns trace a live curve on rotating paper. Two motors, a 20:60 mesh and an offset crank.', 'Siebenfach-Muster: 2 Papierumdrehungen und 7 Stiftumdrehungen zeichnen eine Kurve auf rotierendem Papier. Zwei Motoren, 20:60-Getriebe und versetzte Kurbel.'],
    'orbital-loom-elevenfold': ['linkages', 'Elevenfold pattern: 4 paper turns and 11 pen turns trace a live curve on rotating paper. Two motors, a 20:60 mesh and an offset crank.', 'Elffach-Muster: 4 Papierumdrehungen und 11 Stiftumdrehungen zeichnen eine Kurve auf rotierendem Papier. Zwei Motoren, 20:60-Getriebe und versetzte Kurbel.'],
    'orbital-loom-eightfold': ['linkages', 'Eightfold pattern: 3 paper turns and 8 pen turns trace a live curve on rotating paper. Two motors, a 20:60 mesh and an offset crank.', 'Achtfach-Muster: 3 Papierumdrehungen und 8 Stiftumdrehungen zeichnen eine Kurve auf rotierendem Papier. Zwei Motoren, 20:60-Getriebe und versetzte Kurbel.'],
    'positioning-arm': ['linkages', 'Two independently driven joints position the tip. Compare measured coordinates with the 80 mm / 64 mm serial-arm equations.', 'Zwei unabhängig angetriebene Gelenke positionieren die Spitze. Vergleiche die Koordinaten mit den Gleichungen für 80 mm / 64 mm Glieder.'],
    'ratio-workbench': ['gears', 'Three drives compare idlers (1:1), two compound stages (1:15) and five stages (1:243). Count output turns and direction, not only motor turns.', 'Drei Antriebe vergleichen Zwischenräder (1:1), zwei Verbundstufen (1:15) und fünf Stufen (1:243). Zähle Abtriebsumdrehungen und Richtung.'],
    'rack-shuttle': ['forces', 'An 8-tooth pinion translates a guided horizontal table. Compare travel with pitch radius times shaft angle; two turns give 50.27 mm.', 'Ein Ritzel mit acht Zähnen verschiebt einen geführten Tisch. Vergleiche den Weg mit Teilkreisradius mal Drehwinkel: zwei Umdrehungen ergeben 50,27 mm.'],
    'crank-rocker': ['linkages', 'A rotating crank makes the output rock. Compare its measured angle with the four-bar loop equation.', 'Eine umlaufende Kurbel bewegt die Schwinge. Vergleiche ihren Winkel mit der Viergelenk-Gleichung.'],
    'parallel-lift': ['linkages', 'Equal side links keep the tray level while its path curves. Physical stops limit the lifting sweep.', 'Gleich lange Seiten halten die Bühne waagerecht, obwohl sie einer Kurve folgt. Anschläge begrenzen den Hub.'],
    'screw-crane': ['forces', 'Motor A lifts the boom through a screw actuator; C slews it through an 8:28 reduction. Compare turns, extension and boom height.', 'Motor A hebt den Ausleger über eine Spindel; C schwenkt ihn mit 8:28-Untersetzung. Vergleiche Umdrehungen, Hub und Höhe.'],
    'pivot-rover': ['motion', 'A/B drive; C steers the front bogie within ±20°. Free front half-shafts allow different wheel speeds. Compare pivot steering with Ackermann geometry.', 'A/B fahren; C lenkt den Drehschemel innerhalb ±20°. Freie vordere Halbachsen erlauben unterschiedliche Raddrehzahlen. Vergleiche mit Ackermann-Lenkung.'],
    'driving-base': ['motion', 'Differential steering: vary the wheel speeds to change the turning radius.', 'Differenziallenkung: Ändere die Raddrehzahlen und damit den Kurvenradius.'],
    'line-follower': ['sensing', 'Feedback control: use reflected light to steer along a line.', 'Regelung: Nutze reflektiertes Licht, um einer Linie zu folgen.'],
    'wall-stopper': ['sensing', 'Stopping distance: compare the distance reading with the braking motion.', 'Anhalteweg: Vergleiche den Abstandsmesswert mit der Bremsbewegung.'],
    'colour-explorer': ['sensing', 'Use colour feedback and heading to reach a target on the floor.', 'Erreiche mit Farb- und Richtungsrückmeldung ein Ziel auf dem Boden.'],
    sumo: ['motion', 'Traction and turning: keep the robot within the ring.', 'Haftung und Lenken: Halte den Roboter im Ring.'],
    forklift: ['forces', 'A rack and pinion turns rotation into lift: measure height per motor turn.', 'Eine Zahnstange wandelt Drehung in Hub um: Miss den Hub je Motorumdrehung.'],
    'maze-runner': ['sensing', 'Navigate with distance and colour measurements.', 'Navigiere mit Abstands- und Farbmessungen.'],
    gearbox: ['gears', 'A sliding clutch selects a transmission ratio. Compare input and output turns.', 'Eine Schaltkupplung wählt die Übersetzung. Vergleiche An- und Abtriebsumdrehungen.'],
    differential: ['gears', 'Hold one output: the other takes twice the carrier speed.', 'Halte einen Abtrieb fest: Der andere dreht mit doppelter Korbdrehzahl.'],
    'chain-drive': ['chains', 'A chain couples separated shafts in the same direction with a tooth-count ratio.', 'Eine Kette koppelt getrennte Wellen gleichsinnig mit dem Zähnezahlverhältnis.'],
    'pneumatic-press': ['fluids', 'Pressure drives a cylinder; the valve reverses its motion.', 'Druck bewegt einen Zylinder; das Ventil kehrt die Bewegung um.'],
    'drawing-robot': ['motion', 'The trailing pen traces the geometry of motion and turning.', 'Der nachlaufende Stift zeichnet die Geometrie von Fahrt und Drehung.'],
    'chain-transmission': ['chains', '59 pieces, including a real 42-link chain. Three 16T input turns give two 24T output turns in the same direction.', '59 Teile mit einer echten Kette aus 42 Gliedern. Drei Antriebsumdrehungen am 16er ergeben zwei gleichsinnige am 24er.'],
    'flywheel-differential': ['inertia', 'Two stacks of three flywheels add rotational inertia. Brake one side and measure how the differential shares speed.', 'Zwei Stapel aus je drei Schwungrädern erhöhen die Rotationsträgheit. Bremse eine Seite und miss die Drehzahlverteilung im Differenzial.'],
    'survey-rover': ['forces', 'Gravity back-drives the sensor head unless the motor actively holds its position.', 'Die Schwerkraft verdreht den Sensorkopf, wenn der Motor seine Position nicht aktiv hält.'],
    excavator: ['forces', 'A slewing frame and three screw actuators: leverage, self-locking and end-of-travel clutches.', 'Drehgestell und drei Spindelantriebe: Hebelwirkung, Selbsthemmung und Rutschkupplungen am Hubende.'],
    'rcx-bumper-car': ['sensing', 'Contact feedback stops or reverses a moving robot.', 'Eine Kontaktrückmeldung stoppt den fahrenden Roboter oder kehrt ihn um.'],
    'rcx-line-follower': ['sensing', 'An RCX light sensor closes the steering feedback loop.', 'Ein RCX-Lichtsensor schließt den Regelkreis der Lenkung.'],
    'ev3-wall-stopper': ['sensing', 'Ultrasonic distance feedback controls the stopping point.', 'Eine Ultraschall-Abstandsrückmeldung bestimmt den Haltepunkt.'],
    'nxt-bumper-bot': ['sensing', 'A touch sensor gives contact feedback to the NXT controller.', 'Ein Tastsensor meldet dem NXT die Berührung.'],
    'motor-bench': ['inertia', 'A motor accelerates an axle and gear; compare running and braking.', 'Ein Motor beschleunigt Achse und Zahnrad; vergleiche Antrieb und Bremsung.'],
    'technic-hub-bench': ['inertia', 'Drive a motor and measure its encoder through a Technic hub.', 'Steuere einen Motor und miss seinen Drehgeber über einen Technic-Hub.'],
    'boost-rover': ['motion', 'Two built-in wheel motors produce straight motion and rotation.', 'Zwei eingebaute Radmotoren erzeugen Geradeausfahrt und Drehung.'],
    'wedo-milo': ['sensing', 'Distance feedback stops a one-motor rover.', 'Eine Abstandsrückmeldung stoppt einen Rover mit einem Motor.']
};
const output = {};
for (const entry of MODELS) {
    const key = entry.id || entry.file;
    const id = key.replace(/\.ldr$/, '');
    if (!lessons[id]) throw new Error(`Missing lesson: ${id}`);
    const {model, mechanism} = prepareModel(readFileSync(new URL(`overlay/scratch-gui/static/sim-lab/models/${entry.file}`, root), 'utf8'), catalog);
    const [topic, en, de] = lessons[id];
    output[key] = {pieces: model.parts.length, motors: mechanism.actuators.length,
        hubs: [...new Set(mechanism.hubs.map(h => h.profile))], topic, description: {en, de},
        author: /^(orbit-mixer|phase-bridge|axis-plotter|tilt-lab|tempo-loop|mean-machine|stepworks|stride-lab|twinpoint|butterfly|atlas-arm|switchback-lift|straight-eight|orbital-loom|tidal-trio|pulse-percussion|centrifugal-governor)/.test(id) ? 'CrispStrobe' : 'Brickwright contributors',
        license: 'BSD-3-Clause'};
}
const text = '// SPDX-License-Identifier: BSD-3-Clause\n// Generated by scripts/gen-robot-lab-catalog.mjs; counts come from the actual compiled models.\n' +
    `export const MODEL_LESSONS = Object.freeze(${JSON.stringify(output, null, 4)});\n`;
const dest = new URL('overlay/scratch-gui/src/lib/bw-sim/model/example-catalog.js', root);
if (process.argv.includes('--check')) {
    if (readFileSync(dest, 'utf8') !== text) throw new Error('Robot Lab example metadata is stale; regenerate with scripts/gen-robot-lab-catalog.mjs');
} else writeFileSync(dest, text);
