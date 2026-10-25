// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Checkpoint candidates are deliberately separate from the qualified registry.
export const EXPERIMENTAL_MODELS = Object.freeze([
    {
        "file": "cross-ratio.ldr",
        "title": {
            "en": "Cross Ratio — crossed four-bar",
            "de": "Cross Ratio — gekreuztes Viergelenk"
        },
        "example": "cross-ratio.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A crossed four-bar (antiparallelogram): motor A steps the input arm, and the passive output follows tan(φ/2) = 3·tan(θ/2), so equal input steps give shrinking output steps.",
            "de": "Ein gekreuztes Viergelenk (Antiparallelogramm): Motor A fährt den Antriebsarm schrittweise, der passive Abtrieb folgt tan(φ/2) = 3·tan(θ/2) – gleiche Antriebsschritte ergeben immer kleinere Abtriebsschritte."
        },
        "manualJog": {
            "A": {
                "minDeg": -30,
                "maxDeg": 90,
                "stepDeg": 15,
                "speedDps": 12
            }
        }
    },
    {
        "file": "bend-ripple.ldr",
        "title": {
            "en": "Bend Ripple — variable-bend Cardan joint",
            "de": "Bend Ripple — Kardangelenk mit verstellbarem Knickwinkel"
        },
        "example": "bend-ripple.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A single Cardan joint whose bend is a second motor input: compare the output’s lead and lag at 10° and 30° bend, and watch the output turn while the input is held.",
            "de": "Ein einzelnes Kardangelenk, dessen Knickwinkel ein zweiter Motor verstellt: Vergleiche das Vor- und Nacheilen bei 10° und 30° und beobachte, wie sich der Ausgang bei festgehaltenem Eingang dreht."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 765,
                "stepDeg": 45,
                "speedDps": 24
            },
            "B": {
                "minDeg": 0,
                "maxDeg": 20,
                "stepDeg": 5,
                "speedDps": 4
            }
        }
    },
    {
        "file": "apex.ldr",
        "title": {
            "en": "Apex — Wankel rotary geometry",
            "de": "Apex — Wankel-Rotorgeometrie"
        },
        "example": "apex.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Wankel engine kinematics without combustion: the carrier acts as eccentric shaft and gears make the three-apex rotor turn at exactly one third of its speed.",
            "de": "Wankel-Kinematik ohne Verbrennung: Der Träger wirkt als Exzenterwelle, und Zahnräder lassen den Rotor mit drei Spitzen mit genau einem Drittel seiner Drehzahl umlaufen."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 1512,
                "stepDeg": 126,
                "speedDps": 36
            }
        }
    },
    {
        "file": "bloom.ldr",
        "title": {
            "en": "Bloom — expanding scissor sphere",
            "de": "Bloom — expandierende Scherenkugel"
        },
        "example": "bloom.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Three rings of angulated scissors with a fixed 135° kink: one motor through a 72:1 drive opens the cage, and every pivot slides along a straight radial line.",
            "de": "Drei Ringe aus abgewinkelten Scheren mit festem 135°-Knick: Ein Motor öffnet den Käfig über eine 72:1-Untersetzung, und jedes Gelenk gleitet auf einer radialen Geraden."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 1296,
                "stepDeg": 144,
                "speedDps": 144
            }
        }
    },
    {
        "file": "vector-delta.ldr",
        "title": {
            "en": "Vector — parallel Delta robot",
            "de": "Vector — paralleler Delta-Roboter"
        },
        "example": "vector-delta.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A Delta parallel robot: three base motors and parallelogram arms move a tool head that can only translate, and the program computes the inverse kinematics for every waypoint.",
            "de": "Ein paralleler Delta-Roboter: Drei Motoren an der Basis und Parallelogrammarme bewegen einen Werkzeugkopf, der nur verschoben werden kann; das Programm berechnet für jeden Wegpunkt die inverse Kinematik."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 24,
                "stepDeg": 3,
                "speedDps": 15
            },
            "B": {
                "minDeg": 0,
                "maxDeg": 24,
                "stepDeg": 3,
                "speedDps": 15
            },
            "C": {
                "minDeg": 0,
                "maxDeg": 24,
                "stepDeg": 3,
                "speedDps": 15
            }
        }
    },
    {
        "file": "cadence-geneva.ldr",
        "title": {
            "en": "Cadence — Geneva indexing",
            "de": "Cadence — Malteserkreuz-Schaltung"
        },
        "example": "cadence-geneva.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A four-slot Geneva drive (Maltese cross) turns a steadily driven crank into twelve 30° dial steps with a dwell in between; a friction clutch holds the dial while it rests.",
            "de": "Ein Malteserkreuzgetriebe mit vier Schlitzen macht aus einer gleichmäßig gedrehten Kurbel zwölf Zeigerschritte zu 30° mit Rast dazwischen; eine Rutschkupplung hält den Zeiger in der Ruhe."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 4320,
                "stepDeg": 45,
                "speedDps": 30
            }
        }
    },
    {
        "file": "equinox-differential.ldr",
        "title": {
            "en": "Equinox — differential lab",
            "de": "Equinox — Differenzial-Labor"
        },
        "example": "equinox-differential.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "An open bevel differential on a bench: motor A drives the carrier, while motors B and C only coast or brake the outputs, so you can test ω_L + ω_R = 2·ω_carrier stage by stage.",
            "de": "Ein offenes Kegelraddifferenzial auf dem Prüfstand: Motor A treibt den Träger, die Motoren B und C lassen die Abtriebe nur auslaufen oder bremsen sie – so lässt sich ω_L + ω_R = 2·ω_Träger Stufe für Stufe prüfen."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 2520,
                "stepDeg": 210,
                "speedDps": 105
            }
        }
    },
    {
        "file": "kestrel-flapper.ldr",
        "title": {
            "en": "Kestrel — flapping linkage",
            "de": "Kestrel — Schlagflügel-Gestänge"
        },
        "example": "kestrel-flapper.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A Grashof crank-rocker turns motor A’s full crank rotation into a rocking wing: one stroke each way per turn, with slightly unequal stroke times.",
            "de": "Eine Kurbelschwinge nach Grashof macht aus der vollen Kurbeldrehung von Motor A einen schwingenden Flügel: ein Schlag in jede Richtung je Umdrehung, mit leicht ungleichen Schlagzeiten."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 720,
                "stepDeg": 30,
                "speedDps": 45
            }
        }
    },
    {
        "file": "lumen-iris.ldr",
        "title": {
            "en": "Lumen — six-leaf iris",
            "de": "Lumen — sechsblättrige Iris"
        },
        "example": "lumen-iris.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "One motor turns a 12-tooth pinion, a 60-tooth ring and six 20-tooth leaf gears together, so six overlapping plates open a centred iris aperture.",
            "de": "Ein Motor dreht über ein 12er-Ritzel einen 60er-Drehkranz und sechs 20er-Lamellenräder gemeinsam; sechs überlappende Platten öffnen so eine mittige Irisblende."
        },
        "manualJog": {
            "A": {
                "minDeg": -55.2168,
                "maxDeg": 0,
                "stepDeg": 13.8042,
                "speedDps": 15
            }
        }
    },
    {
        "file": "helios-transmission.ldr",
        "title": {
            "en": "Helios — epicyclic transmission",
            "de": "Helios — Planetengetriebe"
        },
        "example": "helios-transmission.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A stepped-planet epicyclic set adds two motor inputs: A turns the sun at constant speed while B’s carrier speed alone steps the output through ×3, ×2, ×1, standstill and reverse.",
            "de": "Ein Umlaufgetriebe mit Stufenplaneten überlagert zwei Motoren: A dreht das Sonnenrad konstant, und allein die Trägerdrehzahl von B schaltet den Abtrieb durch ×3, ×2, ×1, Stillstand und Rückwärtslauf."
        }
    },
    {
        "file": "aster-governor.ldr",
        "title": {
            "en": "Aster — centrifugal governor",
            "de": "Aster — Fliehkraftregler"
        },
        "example": "aster-governor.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Passive flyweights on a hinged rhombus lift a sliding collar as motor A spins the spindle faster; it senses speed (ω²) but, with no throttle, does not regulate it.",
            "de": "Passive Fliehgewichte an einer Gelenkraute heben eine Gleitmuffe, wenn Motor A die Spindel schneller dreht; der Regler misst die Drehzahl (ω²), regelt sie aber mangels Drossel nicht."
        }
    },
    {
        "file": "orion-cardan.ldr",
        "title": {
            "en": "Orion — double Cardan drive",
            "de": "Orion — Doppel-Kardanantrieb"
        },
        "example": "orion-cardan.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Two equally bent, correctly phased Cardan joints: the middle shaft speeds up and slows down twice per turn, while the output follows the input evenly.",
            "de": "Zwei gleich abgewinkelte, richtig ausgerichtete Kardangelenke: Die Zwischenwelle wird zweimal je Umdrehung schneller und langsamer, der Abtrieb folgt dem Eingang gleichförmig."
        }
    },
    {
        "file": "meridian-linkage.ldr",
        "title": {
            "en": "Meridian — straight-line linkage",
            "de": "Meridian — Geradführungs-Gestänge"
        },
        "example": "meridian-linkage.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A Peaucellier–Lipkin cell inverts a crank circle through its pivot into an exact straight line: the passive output point moves straight with no guide at all.",
            "de": "Eine Peaucellier-Lipkin-Zelle bildet einen Kurbelkreis durch ihren Drehpunkt auf eine exakte Gerade ab: Der passive Abtriebspunkt läuft ganz ohne Führung geradeaus."
        },
        "manualJog": {
            "A": {
                "minDeg": -60,
                "maxDeg": 60,
                "stepDeg": 10,
                "speedDps": 15
            }
        }
    },
    {
        "file": "solstice-pumpjack.ldr",
        "title": {
            "en": "Solstice — walking-beam pumpjack",
            "de": "Solstice — Schwingbalken-Pumpenantrieb"
        },
        "example": "solstice-pumpjack.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A Grashof crank-rocker nods a walking beam, and a hanging rod drives a guided rack up and down as a pump plunger; no fluid is modelled.",
            "de": "Eine Kurbelschwinge nach Grashof lässt einen Schwengel nicken, und eine Hängestange bewegt eine geführte Zahnstange als Pumpenkolben auf und ab; Flüssigkeit wird nicht modelliert."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 360,
                "stepDeg": 30,
                "speedDps": 30
            }
        }
    },
    {
        "file": "inertia-loop.ldr",
        "title": {
            "en": "Inertia Loop — closed shape cycle",
            "de": "Inertia Loop — geschlossener Formzyklus"
        },
        "example": "inertia-loop.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A flywheel and movable masses ride on a free-turning platform: spin, spread, spin back and retract, and the platform ends up facing a new direction although both motors return home. Experimental: the effect has not yet been independently measured.",
            "de": "Schwungrad und verschiebbare Massen sitzen auf einer frei drehbaren Plattform: Drehen, Spreizen, Zurückdrehen, Einziehen – und die Plattform zeigt in eine neue Richtung, obwohl beide Motoren zurückkehren. Experimentell: Der Effekt wurde noch nicht unabhängig gemessen."
        },
        "manualJog": {
            "A": {
                "minDeg": -5,
                "maxDeg": 10805,
                "stepDeg": 1080,
                "speedDps": 420
            },
            "B": {
                "minDeg": -315,
                "maxDeg": 9.5,
                "stepDeg": 76.4,
                "speedDps": 90
            }
        }
    },
    {
        "file": "offset-relay.ldr",
        "title": {
            "en": "Offset Relay — variable-offset coupling",
            "de": "Offset Relay — Kupplung mit variablem Versatz"
        },
        "example": "offset-relay.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A Schmidt coupling: three discs joined by parallel links keep the output turning exactly with the input while motor B shifts the output shaft sideways. Experimental: not yet independently measured.",
            "de": "Eine Schmidt-Kupplung: Drei durch parallele Lenker verbundene Scheiben halten den Ausgang exakt im Gleichlauf mit dem Eingang, während Motor B die Ausgangswelle seitlich verschiebt. Experimentell: noch nicht unabhängig gemessen."
        },
        "manualJog": {
            "A": {
                "minDeg": -3,
                "maxDeg": 2883,
                "stepDeg": 90,
                "speedDps": 90
            },
            "B": {
                "minDeg": -160,
                "maxDeg": 84,
                "stepDeg": 19.1,
                "speedDps": 15
            }
        }
    },
    {
        "file": "rack-decoder.ldr",
        "title": {
            "en": "Rack Decoder — mechanical selection",
            "de": "Rack Decoder — mechanische Auswahl"
        },
        "example": "rack-decoder.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Two motor-driven racks share one free pinion: their average moves the carriage, their difference turns the pointer – a differential in straight lines. Experimental: not yet independently measured.",
            "de": "Zwei motorgetriebene Zahnstangen teilen sich ein freies Ritzel: Ihr Mittelwert verschiebt den Schlitten, ihre Differenz dreht den Zeiger – ein Differenzial auf geraden Wegen. Experimentell: noch nicht unabhängig gemessen."
        },
        "manualJog": {
            "A": {
                "minDeg": -122,
                "maxDeg": 122,
                "stepDeg": 19.1,
                "speedDps": 14.3
            },
            "B": {
                "minDeg": -122,
                "maxDeg": 122,
                "stepDeg": 19.1,
                "speedDps": 14.3
            }
        }
    },
    {
        "file": "tangent-table.ldr",
        "title": {
            "en": "Tangent Table — mechanical angle mapping",
            "de": "Tangent Table — mechanische Winkelabbildung"
        },
        "example": "tangent-table.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "One motor tilts a guide, the other sets a reach; where the guides cross, a free slider shows y = x·tan θ – a variable-gain mechanical multiplier. Experimental: not yet independently measured.",
            "de": "Ein Motor neigt eine Kulisse, der andere stellt eine Reichweite ein; wo sich die Führungen kreuzen, zeigt ein freier Schieber y = x·tan θ – ein mechanischer Multiplizierer mit veränderlicher Verstärkung. Experimentell: noch nicht unabhängig gemessen."
        },
        "manualJog": {
            "A": {
                "minDeg": -16,
                "maxDeg": 16,
                "stepDeg": 1,
                "speedDps": 8
            },
            "B": {
                "minDeg": -2627,
                "maxDeg": 2627,
                "stepDeg": 597,
                "speedDps": 300
            }
        }
    },
    {
        "file": "pan-shift.ldr",
        "title": {
            "en": "Pan Shift — load-position experiment",
            "de": "Pan Shift — Versuch zur Lastposition"
        },
        "example": "pan-shift.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A Roberval balance: moving a weight across the parallelogram-guided pan should not tip the beam, while moving a trim weight on the beam must. Experimental: not yet independently measured.",
            "de": "Eine Roberval-Waage: Ein Gewicht auf der parallel geführten Schale zu verschieben, sollte den Balken nicht kippen – ein Trimmgewicht auf dem Balken dagegen schon. Experimentell: noch nicht unabhängig gemessen."
        },
        "manualJog": {
            "A": {
                "minDeg": -1,
                "maxDeg": 181,
                "stepDeg": 15,
                "speedDps": 10
            },
            "B": {
                "minDeg": -61,
                "maxDeg": 61,
                "stepDeg": 5,
                "speedDps": 5
            }
        }
    },
    {
        "file": "remote-pivot.ldr",
        "title": {
            "en": "Remote Pivot — empty-centre rotation",
            "de": "Remote Pivot — Drehung um ein freies Zentrum"
        },
        "example": "remote-pivot.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A double parallelogram swings its output link about an empty point where no bearing exists – the remote centre of motion used in surgical robots. Experimental: not yet independently measured.",
            "de": "Ein Doppelparallelogramm schwenkt seinen Ausgangslenker um einen leeren Punkt ohne Lager – das entfernte Drehzentrum, wie es Chirurgieroboter nutzen. Experimentell: noch nicht unabhängig gemessen."
        },
        "manualJog": {
            "A": {
                "minDeg": -31,
                "maxDeg": 31,
                "stepDeg": 5,
                "speedDps": 8
            }
        }
    },
    {
        "file": "vesper-quickreturn.ldr",
        "title": {
            "en": "Vesper — quick-return shaper",
            "de": "Vesper — Schnellrücklauf mit Kurbelschleife"
        },
        "example": "vesper-quickreturn.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A crank and slotted lever turn steady motor rotation into a slow working stroke and a quick return, about 1.46 : 1, as in a metal shaping machine. Experimental: not yet independently measured.",
            "de": "Kurbel und schwingende Kurbelschleife machen aus gleichmäßiger Motordrehung einen langsamen Arbeitshub und einen schnellen Rücklauf, etwa 1,46 : 1, wie in einer Stoßmaschine. Experimentell: noch nicht unabhängig gemessen."
        },
        "manualJog": {
            "A": {
                "minDeg": -2,
                "maxDeg": 1082,
                "stepDeg": 15,
                "speedDps": 30
            }
        }
    },
    {
        "file": "tempest-pendulum.ldr",
        "title": {
            "en": "Tempest — serial double pendulum",
            "de": "Tempest — serielles Doppelpendel"
        },
        "example": "tempest-pendulum.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A serial double pendulum: motor A pulses a short carrier, then two free 64mm arms swing under gravity alone. Small swings settle into normal modes with periods near 0.66s and 0.27s.",
            "de": "Ein serielles Doppelpendel: Motor A gibt einem kurzen Träger einen Impuls, danach schwingen zwei freie, 64mm lange Arme allein unter der Schwerkraft. Kleine Ausschläge zerfallen in Eigenschwingungen mit Perioden um 0,66s und 0,27s."
        },
        "manualJog": {
            "A": {
                "minDeg": -60,
                "maxDeg": 60,
                "stepDeg": 15,
                "speedDps": 90
            }
        }
    },
    {
        "file": "schmidt-shift.ldr",
        "title": {
            "en": "Schmidt Shift — offset coupling",
            "de": "Schmidt Shift — Kupplung für versetzte Wellen"
        },
        "example": "schmidt-shift.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "One motor drives a coupling of three carriers and six connecting rods between parallel, offset shafts. Compare the input, floating middle and passive output angles through full turns and reversal.",
            "de": "Ein Motor treibt eine Kupplung aus drei Drehträgern und sechs Koppelstangen zwischen parallelen, versetzten Wellen. Vergleiche die Winkel von Antrieb, frei getragenem Mittelträger und passivem Abtrieb bei vollen Umdrehungen und Richtungswechsel."
        },
        "manualJog": {
            "A": {
                "minDeg": -360,
                "maxDeg": 720,
                "stepDeg": 45,
                "speedDps": 30
            }
        }
    },
    {
        "file": "poise.ldr",
        "title": {
            "en": "Poise — Roberval balance",
            "de": "Poise — Roberval-Waage"
        },
        "example": "poise.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A Roberval balance: two motors move equal weights across level pans, and the passive balance should stay level wherever on the pan the weights sit.",
            "de": "Eine Roberval-Waage: Zwei Motoren verschieben gleiche Gewichte auf waagerechten Schalen, und die passive Waage sollte waagerecht bleiben, gleich wo die Gewichte auf der Schale liegen."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 180,
                "stepDeg": 45,
                "speedDps": 15
            },
            "B": {
                "minDeg": 0,
                "maxDeg": 180,
                "stepDeg": 45,
                "speedDps": 15
            }
        }
    },
    {
        "file": "poise-mass-control.ldr",
        "title": {
            "en": "Poise Mass Control — 1.5 g added to the left pan",
            "de": "Poise-Kontrolle — 1,5 g Zusatzmasse links"
        },
        "example": "poise.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Poise with one small beam and two pins added under the left pan: the same program now tilts the balance, which settles near −2.9° after about two minutes.",
            "de": "Poise mit einem kleinen Balken und zwei Pins unter der linken Schale: Dasselbe Programm neigt nun die Waage, die sich nach etwa zwei Minuten bei −2,9° einpendelt."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 180,
                "stepDeg": 45,
                "speedDps": 15
            },
            "B": {
                "minDeg": 0,
                "maxDeg": 180,
                "stepDeg": 45,
                "speedDps": 15
            }
        }
    },
    {
        "file": "equal-share.ldr",
        "title": {
            "en": "Equal Share — whippletree force equalizer",
            "de": "Equal Share — Kraftausgleich mit Ausgleichsbalken"
        },
        "example": "equal-share.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A whippletree: one motor pushes the free centre of a balance beam against one spring on the left and two in parallel on the right, so the single spring gives way twice as far while both sides carry equal force.",
            "de": "Ein Ausgleichsbalken: Ein Motor schiebt die frei drehbare Mitte eines Balkens gegen eine Feder links und zwei parallele rechts; die einzelne Feder gibt doppelt so weit nach, während beide Seiten gleich viel Kraft tragen."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 35,
                "stepDeg": 5,
                "speedDps": 8
            }
        }
    },
    {
        "file": "equal-share-even-springs.ldr",
        "title": {
            "en": "Equal Share Even Springs — one spring per side",
            "de": "Equal-Share-Kontrolle — je eine Feder pro Seite"
        },
        "example": "equal-share.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Equal Share with the right-hand pair replaced by one matching spring: the same program now compresses both springs equally and the beam stays square.",
            "de": "Equal Share, bei dem eine gleiche Feder das rechte Paar ersetzt: Dasselbe Programm drückt nun beide Federn gleich weit zusammen, und der Balken bleibt gerade."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 35,
                "stepDeg": 5,
                "speedDps": 8
            }
        }
    },
    {
        "file": "spiral-scribe.ldr",
        "title": {
            "en": "Spiral Scribe — one-motor radial feed",
            "de": "Spiral Scribe — radialer Vorschub mit einem Motor"
        },
        "example": "spiral-scribe.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "One motor turns a carrier around a fixed sun gear; the orbiting planet’s pinion feeds a rack outward, so a passive marker traces an Archimedean spiral (about 37.7 mm per turn).",
            "de": "Ein Motor dreht einen Träger um ein festes Sonnenrad; das Ritzel des umlaufenden Planeten schiebt eine Zahnstange nach außen, sodass eine passive Markierung eine archimedische Spirale beschreibt (etwa 37,7 mm je Umdrehung)."
        },
        "manualJog": {
            "A": {
                "minDeg": -1080,
                "maxDeg": 0,
                "stepDeg": 90,
                "speedDps": 60
            }
        }
    },
    {
        "file": "stroke-shift.ldr",
        "title": {
            "en": "Stroke Shift — adjustable crank throw",
            "de": "Stroke Shift — verstellbarer Kurbelradius"
        },
        "example": "stroke-shift.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Motor B sets a real crank radius of 16, 22 or 28 mm while A holds; A then turns the crank once and back, and the same connecting rod drives a passive piston through strokes of 2r = 32, 44 and 56 mm.",
            "de": "Motor B stellt den Kurbelradius auf 16, 22 oder 28 mm, während A hält; danach dreht A die Kurbel einmal hin und zurück, und dasselbe Pleuel bewegt einen passiven Schlitten mit Hüben von 2r = 32, 44 und 56 mm."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 1080,
                "stepDeg": 90,
                "speedDps": 180
            },
            "B": {
                "minDeg": 0,
                "maxDeg": 3582.446015,
                "stepDeg": 1791.223007,
                "speedDps": 360
            }
        }
    },
    {
        "file": "triad-table.ldr",
        "title": {
            "en": "Triad Table — three lengths, one pose",
            "de": "Triad Table — drei Längen, eine Pose"
        },
        "example": "triad-table.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Three motor-driven screw legs (R-P-R) jointly set the x, y position and heading of one passive platform; no motor is an axis on its own. The program visits 15 poses: ±4.8 mm, ±10° and four combined poses.",
            "de": "Drei motorgetriebene Schraubbeine (R-P-R) bestimmen gemeinsam x, y und Ausrichtung einer passiven Plattform; kein Motor ist für sich eine Achse. Das Programm fährt 15 Posen an: ±4,8 mm, ±10° und vier kombinierte Posen."
        },
        "manualJog": {
            "A": {
                "minDeg": -1500,
                "maxDeg": 1500,
                "stepDeg": 150,
                "speedDps": 180
            },
            "B": {
                "minDeg": -1500,
                "maxDeg": 1500,
                "stepDeg": 150,
                "speedDps": 180
            },
            "C": {
                "minDeg": -1500,
                "maxDeg": 1500,
                "stepDeg": 150,
                "speedDps": 180
            }
        }
    },
    {
        "file": "paired-door-sync.ldr",
        "title": {
            "en": "Paired Door Sync — one pinion, two opposed racks",
            "de": "Doppeltür-Synchron — ein Ritzel, zwei gegenläufige Zahnstangen"
        },
        "example": "paired-door-sync.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "One 16T pinion drives two 64781 racks placed on opposite sides, so the two door leaves travel with equal speed in opposite directions and their sum of positions stays constant. The measured rack markers show the declared equal-and-opposite law, and a control with the front chain removed shows that one rack alone cannot synchronize a pair.",
            "de": "Ein 16-Zahn-Ritzel treibt zwei gegenüberliegende 64781-Zahnstangen, sodass sich beide Türblätter gleich schnell und gegenläufig bewegen und ihre Positionssumme konstant bleibt. Die gemessenen Zahnstangenmarker zeigen das erklärte gegenläufige Gesetz; eine Kontrolle ohne vordere Antriebskette zeigt, dass eine einzelne Zahnstange ein Paar nicht synchronisieren kann."
        },
        "manualJog": {
            "A": {
                "minDeg": -150,
                "maxDeg": 150,
                "stepDeg": 15,
                "speedDps": 15
            }
        }
    }
]);
export const EXPERIMENTAL_MODEL_DETAILS = Object.freeze({
    "cross-ratio.ldr": {
        "pieces": 127,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "A crossed four-bar (antiparallelogram): motor A steps the input arm, and the passive output follows tan(φ/2) = 3·tan(θ/2), so equal input steps give shrinking output steps.",
            "de": "Ein gekreuztes Viergelenk (Antiparallelogramm): Motor A fährt den Antriebsarm schrittweise, der passive Abtrieb folgt tan(φ/2) = 3·tan(θ/2) – gleiche Antriebsschritte ergeben immer kleinere Abtriebsschritte."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "crossed four-bar",
            "de": "gekreuztes Viergelenk"
        },
        "keywords": [
            "antiparallelogram",
            "crossed four-bar",
            "crossed parallelogram",
            "half-angle",
            "variable ratio",
            "Antiparallelogramm",
            "gekreuztes Viergelenk",
            "veränderliche Übersetzung",
            "half-angle transform",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "bend-ripple.ldr": {
        "pieces": 156,
        "motors": 2,
        "hubs": [
            "spike-prime"
        ],
        "topic": "gears",
        "description": {
            "en": "A single Cardan joint whose bend is a second motor input: compare the output’s lead and lag at 10° and 30° bend, and watch the output turn while the input is held.",
            "de": "Ein einzelnes Kardangelenk, dessen Knickwinkel ein zweiter Motor verstellt: Vergleiche das Vor- und Nacheilen bei 10° und 30° und beobachte, wie sich der Ausgang bei festgehaltenem Eingang dreht."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "variable-bend Cardan joint",
            "de": "Kardan mit veränderlichem Winkel"
        },
        "keywords": [
            "Cardan joint",
            "universal joint",
            "Hooke joint",
            "speed ripple",
            "bend angle",
            "Kardangelenk",
            "Kreuzgelenk",
            "Knickwinkel",
            "Drehzahlschwankung",
            "Cardan",
            "angular velocity ripple",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "apex.ldr": {
        "pieces": 477,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "gears",
        "description": {
            "en": "Wankel engine kinematics without combustion: the carrier acts as eccentric shaft and gears make the three-apex rotor turn at exactly one third of its speed.",
            "de": "Wankel-Kinematik ohne Verbrennung: Der Träger wirkt als Exzenterwelle, und Zahnräder lassen den Rotor mit drei Spitzen mit genau einem Drittel seiner Drehzahl umlaufen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Wankel rotary geometry",
            "de": "Wankel-Rotorgeometrie"
        },
        "keywords": [
            "Wankel",
            "rotary engine",
            "epitrochoid",
            "eccentric shaft",
            "three-apex rotor",
            "Wankelmotor",
            "Kreiskolbenmotor",
            "Epitrochoide",
            "Exzenterwelle",
            "rotary mechanism",
            "eccentric rotor",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "bloom.ldr": {
        "pieces": 781,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "Three rings of angulated scissors with a fixed 135° kink: one motor through a 72:1 drive opens the cage, and every pivot slides along a straight radial line.",
            "de": "Drei Ringe aus abgewinkelten Scheren mit festem 135°-Knick: Ein Motor öffnet den Käfig über eine 72:1-Untersetzung, und jedes Gelenk gleitet auf einer radialen Geraden."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "expanding scissor sphere",
            "de": "expandierende Scherenkugel"
        },
        "keywords": [
            "angulated scissors",
            "Hoberman",
            "expanding sphere",
            "deployable structure",
            "scissor linkage",
            "Scherengitter",
            "Hoberman-Kugel",
            "entfaltbares Tragwerk",
            "Scherenmechanismus",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "vector-delta.ldr": {
        "pieces": 353,
        "motors": 3,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "A Delta parallel robot: three base motors and parallelogram arms move a tool head that can only translate, and the program computes the inverse kinematics for every waypoint.",
            "de": "Ein paralleler Delta-Roboter: Drei Motoren an der Basis und Parallelogrammarme bewegen einen Werkzeugkopf, der nur verschoben werden kann; das Programm berechnet für jeden Wegpunkt die inverse Kinematik."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "parallel Delta robot",
            "de": "paralleler Delta-Roboter"
        },
        "keywords": [
            "Delta robot",
            "parallel robot",
            "Clavel",
            "inverse kinematics",
            "pick and place",
            "parallelogram",
            "Delta-Roboter",
            "Parallelkinematik",
            "inverse Kinematik",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "cadence-geneva.ldr": {
        "pieces": 200,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "A four-slot Geneva drive (Maltese cross) turns a steadily driven crank into twelve 30° dial steps with a dwell in between; a friction clutch holds the dial while it rests.",
            "de": "Ein Malteserkreuzgetriebe mit vier Schlitzen macht aus einer gleichmäßig gedrehten Kurbel zwölf Zeigerschritte zu 30° mit Rast dazwischen; eine Rutschkupplung hält den Zeiger in der Ruhe."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Geneva indexing",
            "de": "Malteserkreuz-Schaltung"
        },
        "keywords": [
            "Geneva drive",
            "Maltese cross",
            "intermittent motion",
            "indexing",
            "dwell",
            "Malteserkreuz",
            "Schrittgetriebe",
            "Rastgetriebe",
            "Taktgetriebe",
            "Geneva",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "equinox-differential.ldr": {
        "pieces": 98,
        "motors": 3,
        "hubs": [
            "spike-prime"
        ],
        "topic": "gears",
        "description": {
            "en": "An open bevel differential on a bench: motor A drives the carrier, while motors B and C only coast or brake the outputs, so you can test ω_L + ω_R = 2·ω_carrier stage by stage.",
            "de": "Ein offenes Kegelraddifferenzial auf dem Prüfstand: Motor A treibt den Träger, die Motoren B und C lassen die Abtriebe nur auslaufen oder bremsen sie – so lässt sich ω_L + ω_R = 2·ω_Träger Stufe für Stufe prüfen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "differential lab",
            "de": "Differenzial-Labor"
        },
        "keywords": [
            "differential",
            "open differential",
            "bevel gears",
            "carrier",
            "planetary bevel",
            "Differenzial",
            "Ausgleichsgetriebe",
            "Kegelrad",
            "Achswellenrad",
            "angular velocity sum",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "kestrel-flapper.ldr": {
        "pieces": 61,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "A Grashof crank-rocker turns motor A’s full crank rotation into a rocking wing: one stroke each way per turn, with slightly unequal stroke times.",
            "de": "Eine Kurbelschwinge nach Grashof macht aus der vollen Kurbeldrehung von Motor A einen schwingenden Flügel: ein Schlag in jede Richtung je Umdrehung, mit leicht ungleichen Schlagzeiten."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "flapping linkage",
            "de": "Schlagflügel-Gestänge"
        },
        "keywords": [
            "crank-rocker",
            "four-bar linkage",
            "Grashof",
            "flapping wing",
            "ornithopter",
            "quick return",
            "dead centre",
            "Kurbelschwinge",
            "Viergelenk",
            "Schlagflügel",
            "Totlage",
            "Schnellrücklauf",
            "crank rocker",
            "flapping linkage",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "lumen-iris.ldr": {
        "pieces": 146,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "One motor turns a 12-tooth pinion, a 60-tooth ring and six 20-tooth leaf gears together, so six overlapping plates open a centred iris aperture.",
            "de": "Ein Motor dreht über ein 12er-Ritzel einen 60er-Drehkranz und sechs 20er-Lamellenräder gemeinsam; sechs überlappende Platten öffnen so eine mittige Irisblende."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "six-leaf iris",
            "de": "sechsblättrige Iris"
        },
        "keywords": [
            "iris diaphragm",
            "aperture",
            "iris",
            "turntable",
            "gear ring",
            "synchronised leaves",
            "Irisblende",
            "Blende",
            "Lamellen",
            "Drehkranz",
            "Zahnkranz",
            "radial linkage",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "helios-transmission.ldr": {
        "pieces": 156,
        "motors": 2,
        "hubs": [
            "spike-prime"
        ],
        "topic": "gears",
        "description": {
            "en": "A stepped-planet epicyclic set adds two motor inputs: A turns the sun at constant speed while B’s carrier speed alone steps the output through ×3, ×2, ×1, standstill and reverse.",
            "de": "Ein Umlaufgetriebe mit Stufenplaneten überlagert zwei Motoren: A dreht das Sonnenrad konstant, und allein die Trägerdrehzahl von B schaltet den Abtrieb durch ×3, ×2, ×1, Stillstand und Rückwärtslauf."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "epicyclic transmission",
            "de": "Planetengetriebe"
        },
        "keywords": [
            "epicyclic gear",
            "planetary gear",
            "compound planet",
            "stepped planet",
            "power split",
            "Willis equation",
            "eCVT",
            "Umlaufgetriebe",
            "Planetengetriebe",
            "Stufenplanet",
            "Leistungsverzweigung",
            "Willis-Gleichung",
            "epicyclic",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "aster-governor.ldr": {
        "pieces": 144,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "forces",
        "description": {
            "en": "Passive flyweights on a hinged rhombus lift a sliding collar as motor A spins the spindle faster; it senses speed (ω²) but, with no throttle, does not regulate it.",
            "de": "Passive Fliehgewichte an einer Gelenkraute heben eine Gleitmuffe, wenn Motor A die Spindel schneller dreht; der Regler misst die Drehzahl (ω²), regelt sie aber mangels Drossel nicht."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "centrifugal governor",
            "de": "Fliehkraftregler"
        },
        "keywords": [
            "centrifugal governor",
            "flyball governor",
            "Porter governor",
            "Watt governor",
            "collar",
            "flyweights",
            "angular speed squared",
            "Fliehkraftregler",
            "Muffe",
            "Fliehgewichte",
            "Drehzahlregler",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "orion-cardan.ldr": {
        "pieces": 118,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "gears",
        "description": {
            "en": "Two equally bent, correctly phased Cardan joints: the middle shaft speeds up and slows down twice per turn, while the output follows the input evenly.",
            "de": "Zwei gleich abgewinkelte, richtig ausgerichtete Kardangelenke: Die Zwischenwelle wird zweimal je Umdrehung schneller und langsamer, der Abtrieb folgt dem Eingang gleichförmig."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "double Cardan drive",
            "de": "Doppel-Kardanantrieb"
        },
        "keywords": [
            "Cardan joint",
            "universal joint",
            "Hooke joint",
            "double Cardan",
            "drive shaft",
            "constant velocity",
            "phasing",
            "Kardangelenk",
            "Kreuzgelenk",
            "Gelenkwelle",
            "Doppelkardan",
            "Gleichlauf",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "meridian-linkage.ldr": {
        "pieces": 91,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "A Peaucellier–Lipkin cell inverts a crank circle through its pivot into an exact straight line: the passive output point moves straight with no guide at all.",
            "de": "Eine Peaucellier-Lipkin-Zelle bildet einen Kurbelkreis durch ihren Drehpunkt auf eine exakte Gerade ab: Der passive Abtriebspunkt läuft ganz ohne Führung geradeaus."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "straight-line linkage",
            "de": "Geradführungs-Gestänge"
        },
        "keywords": [
            "Peaucellier–Lipkin",
            "Peaucellier linkage",
            "inversor",
            "exact straight-line linkage",
            "circle inversion",
            "straight-line mechanism",
            "Peaucellier-Lipkin",
            "Inversor",
            "Geradführung",
            "Kreisinversion",
            "straight-line linkage",
            "geometric closure",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "solstice-pumpjack.ldr": {
        "pieces": 93,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "A Grashof crank-rocker nods a walking beam, and a hanging rod drives a guided rack up and down as a pump plunger; no fluid is modelled.",
            "de": "Eine Kurbelschwinge nach Grashof lässt einen Schwengel nicken, und eine Hängestange bewegt eine geführte Zahnstange als Pumpenkolben auf und ab; Flüssigkeit wird nicht modelliert."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "walking-beam pumpjack",
            "de": "Schwingbalken-Pumpenantrieb"
        },
        "keywords": [
            "pumpjack",
            "beam pump",
            "nodding donkey",
            "walking beam",
            "crank-rocker",
            "Grashof",
            "Pferdekopfpumpe",
            "Tiefpumpe",
            "Schwengel",
            "Kurbelschwinge",
            "Balancier",
            "crank rocker",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "inertia-loop.ldr": {
        "pieces": 314,
        "motors": 2,
        "hubs": [
            "spike-prime"
        ],
        "topic": "inertia",
        "description": {
            "en": "A flywheel and movable masses ride on a free-turning platform: spin, spread, spin back and retract, and the platform ends up facing a new direction although both motors return home. Experimental: the effect has not yet been independently measured.",
            "de": "Schwungrad und verschiebbare Massen sitzen auf einer frei drehbaren Plattform: Drehen, Spreizen, Zurückdrehen, Einziehen – und die Plattform zeigt in eine neue Richtung, obwohl beide Motoren zurückkehren. Experimentell: Der Effekt wurde noch nicht unabhängig gemessen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "closed shape cycle",
            "de": "geschlossener Formzyklus"
        },
        "keywords": [
            "angular momentum",
            "conservation of angular momentum",
            "reaction wheel",
            "flywheel",
            "moment of inertia",
            "geometric phase",
            "falling cat",
            "zero angular momentum reorientation",
            "Drehimpulserhaltung",
            "Schwungrad",
            "Reaktionsrad",
            "Trägheitsmoment",
            "geometrische Phase",
            "Katzenreflex",
            "shape cycle",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "offset-relay.ldr": {
        "pieces": 456,
        "motors": 2,
        "hubs": [
            "spike-prime"
        ],
        "topic": "gears",
        "description": {
            "en": "A Schmidt coupling: three discs joined by parallel links keep the output turning exactly with the input while motor B shifts the output shaft sideways. Experimental: not yet independently measured.",
            "de": "Eine Schmidt-Kupplung: Drei durch parallele Lenker verbundene Scheiben halten den Ausgang exakt im Gleichlauf mit dem Eingang, während Motor B die Ausgangswelle seitlich verschiebt. Experimentell: noch nicht unabhängig gemessen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "variable-offset coupling",
            "de": "Kupplung mit variablem Versatz"
        },
        "keywords": [
            "Schmidt coupling",
            "offset coupling",
            "parallel offset coupling",
            "parallelogram linkage",
            "constant velocity",
            "shaft misalignment",
            "Schmidt-Kupplung",
            "Parallelversatz",
            "Wellenversatz",
            "Parallelogramm",
            "Gleichlauf",
            "parallel shafts",
            "phase transmission",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "rack-decoder.ldr": {
        "pieces": 245,
        "motors": 2,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "Two motor-driven racks share one free pinion: their average moves the carriage, their difference turns the pointer – a differential in straight lines. Experimental: not yet independently measured.",
            "de": "Zwei motorgetriebene Zahnstangen teilen sich ein freies Ritzel: Ihr Mittelwert verschiebt den Schlitten, ihre Differenz dreht den Zeiger – ein Differenzial auf geraden Wegen. Experimentell: noch nicht unabhängig gemessen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "mechanical selection",
            "de": "mechanische Auswahl"
        },
        "keywords": [
            "rack differential",
            "linear differential",
            "rack and pinion",
            "sum and difference",
            "average",
            "Zahnstangen-Differenzial",
            "Zahnstange",
            "Ritzel",
            "Mittelwert",
            "Differenz",
            "mechanical decoder",
            "position logic",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "tangent-table.ldr": {
        "pieces": 297,
        "motors": 2,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "One motor tilts a guide, the other sets a reach; where the guides cross, a free slider shows y = x·tan θ – a variable-gain mechanical multiplier. Experimental: not yet independently measured.",
            "de": "Ein Motor neigt eine Kulisse, der andere stellt eine Reichweite ein; wo sich die Führungen kreuzen, zeigt ein freier Schieber y = x·tan θ – ein mechanischer Multiplizierer mit veränderlicher Verstärkung. Experimentell: noch nicht unabhängig gemessen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "mechanical angle mapping",
            "de": "mechanische Winkelabbildung"
        },
        "keywords": [
            "tangent mechanism",
            "mechanical multiplier",
            "variable gain",
            "slotted guide",
            "analog computer",
            "y = x tan θ",
            "Tangens",
            "Kulisse",
            "mechanischer Multiplizierer",
            "Analogrechner",
            "veränderliche Verstärkung",
            "tangent",
            "analog computation",
            "line intersection",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "pan-shift.ldr": {
        "pieces": 197,
        "motors": 2,
        "hubs": [
            "spike-prime"
        ],
        "topic": "forces",
        "description": {
            "en": "A Roberval balance: moving a weight across the parallelogram-guided pan should not tip the beam, while moving a trim weight on the beam must. Experimental: not yet independently measured.",
            "de": "Eine Roberval-Waage: Ein Gewicht auf der parallel geführten Schale zu verschieben, sollte den Balken nicht kippen – ein Trimmgewicht auf dem Balken dagegen schon. Experimentell: noch nicht unabhängig gemessen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "load-position experiment",
            "de": "Versuch zur Lastposition"
        },
        "keywords": [
            "Roberval balance",
            "Roberval paradox",
            "parallelogram balance",
            "scale",
            "corner-load error",
            "moment",
            "couple",
            "Roberval-Waage",
            "Robervalsches Paradoxon",
            "Parallelogrammwaage",
            "Ecklastfehler",
            "Kräftepaar",
            "balance",
            "load position",
            "parallelogram",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "remote-pivot.ldr": {
        "pieces": 153,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "A double parallelogram swings its output link about an empty point where no bearing exists – the remote centre of motion used in surgical robots. Experimental: not yet independently measured.",
            "de": "Ein Doppelparallelogramm schwenkt seinen Ausgangslenker um einen leeren Punkt ohne Lager – das entfernte Drehzentrum, wie es Chirurgieroboter nutzen. Experimentell: noch nicht unabhängig gemessen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "empty-centre rotation",
            "de": "Drehung um ein freies Zentrum"
        },
        "keywords": [
            "remote centre of motion",
            "remote center of motion",
            "RCM",
            "double parallelogram",
            "virtual pivot",
            "surgical robot",
            "parallelogram linkage",
            "entferntes Drehzentrum",
            "Doppelparallelogramm",
            "virtueller Drehpunkt",
            "Chirurgieroboter",
            "remote center",
            "parallelogram",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "vesper-quickreturn.ldr": {
        "pieces": 91,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "A crank and slotted lever turn steady motor rotation into a slow working stroke and a quick return, about 1.46 : 1, as in a metal shaping machine. Experimental: not yet independently measured.",
            "de": "Kurbel und schwingende Kurbelschleife machen aus gleichmäßiger Motordrehung einen langsamen Arbeitshub und einen schnellen Rücklauf, etwa 1,46 : 1, wie in einer Stoßmaschine. Experimentell: noch nicht unabhängig gemessen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "quick-return shaper",
            "de": "Schnellrücklauf-Hobel"
        },
        "keywords": [
            "quick return",
            "quick-return mechanism",
            "crank and slotted lever",
            "shaper",
            "shaping machine",
            "Whitworth",
            "time ratio",
            "Schnellrücklauf",
            "schwingende Kurbelschleife",
            "Kurbelschleife",
            "Stoßmaschine",
            "Shapingmaschine",
            "Zeitverhältnis",
            "stroke timing",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "tempest-pendulum.ldr": {
        "pieces": 69,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "forces",
        "description": {
            "en": "A serial double pendulum: motor A pulses a short carrier, then two free 64mm arms swing under gravity alone. Small swings settle into normal modes with periods near 0.66s and 0.27s.",
            "de": "Ein serielles Doppelpendel: Motor A gibt einem kurzen Träger einen Impuls, danach schwingen zwei freie, 64mm lange Arme allein unter der Schwerkraft. Kleine Ausschläge zerfallen in Eigenschwingungen mit Perioden um 0,66s und 0,27s."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "serial double pendulum",
            "de": "serielles Doppelpendel"
        },
        "keywords": [
            "double pendulum",
            "coupled oscillators",
            "normal modes",
            "chaos",
            "Doppelpendel",
            "Eigenschwingung",
            "gekoppelte Pendel",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "schmidt-shift.ldr": {
        "pieces": 170,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "One motor drives a coupling of three carriers and six connecting rods between parallel, offset shafts. Compare the input, floating middle and passive output angles through full turns and reversal.",
            "de": "Ein Motor treibt eine Kupplung aus drei Drehträgern und sechs Koppelstangen zwischen parallelen, versetzten Wellen. Vergleiche die Winkel von Antrieb, frei getragenem Mittelträger und passivem Abtrieb bei vollen Umdrehungen und Richtungswechsel."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Schmidt coupling",
            "de": "Schmidt-Kupplung"
        },
        "keywords": [
            "Schmidt coupling",
            "Schmidt-Kupplung",
            "parallel offset shafts",
            "parallel versetzte Wellen",
            "constant velocity coupling",
            "Gleichlaufkupplung",
            "connecting rods",
            "Koppelstangen",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "poise.ldr": {
        "pieces": 159,
        "motors": 2,
        "hubs": [
            "spike-prime"
        ],
        "topic": "forces",
        "description": {
            "en": "A Roberval balance: two motors move equal weights across level pans, and the passive balance should stay level wherever on the pan the weights sit.",
            "de": "Eine Roberval-Waage: Zwei Motoren verschieben gleiche Gewichte auf waagerechten Schalen, und die passive Waage sollte waagerecht bleiben, gleich wo die Gewichte auf der Schale liegen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Roberval balance",
            "de": "Roberval-Waage"
        },
        "keywords": [
            "Roberval balance",
            "Roberval-Waage",
            "equal-arm balance",
            "parallelogram",
            "load position",
            "weighing",
            "Waage",
            "Lastposition",
            "Parallelogramm",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "poise-mass-control.ldr": {
        "pieces": 162,
        "motors": 2,
        "hubs": [
            "spike-prime"
        ],
        "topic": "forces",
        "description": {
            "en": "Poise with one small beam and two pins added under the left pan: the same program now tilts the balance, which settles near −2.9° after about two minutes.",
            "de": "Poise mit einem kleinen Balken und zwei Pins unter der linken Schale: Dasselbe Programm neigt nun die Waage, die sich nach etwa zwei Minuten bei −2,9° einpendelt."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "1.5 g added to the left pan",
            "de": "1,5 g Zusatzmasse links"
        },
        "keywords": [
            "Roberval balance",
            "added mass",
            "control",
            "weighing",
            "Kontrollversuch",
            "Zusatzmasse",
            "Roberval-Waage",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "equal-share.ldr": {
        "pieces": 148,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "forces",
        "description": {
            "en": "A whippletree: one motor pushes the free centre of a balance beam against one spring on the left and two in parallel on the right, so the single spring gives way twice as far while both sides carry equal force.",
            "de": "Ein Ausgleichsbalken: Ein Motor schiebt die frei drehbare Mitte eines Balkens gegen eine Feder links und zwei parallele rechts; die einzelne Feder gibt doppelt so weit nach, während beide Seiten gleich viel Kraft tragen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "whippletree force equalizer",
            "de": "Kraftausgleich mit Ausgleichsbalken"
        },
        "keywords": [
            "whippletree",
            "whiffletree",
            "force equalizer",
            "parallel springs",
            "stiffness",
            "Ausgleichsbalken",
            "Waagscheit",
            "parallele Federn",
            "Kraftverteilung",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "equal-share-even-springs.ldr": {
        "pieces": 142,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "forces",
        "description": {
            "en": "Equal Share with the right-hand pair replaced by one matching spring: the same program now compresses both springs equally and the beam stays square.",
            "de": "Equal Share, bei dem eine gleiche Feder das rechte Paar ersetzt: Dasselbe Programm drückt nun beide Federn gleich weit zusammen, und der Balken bleibt gerade."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "one spring per side",
            "de": "je eine Feder pro Seite"
        },
        "keywords": [
            "whippletree",
            "control",
            "equal springs",
            "Ausgleichsbalken",
            "Kontrollversuch",
            "gleiche Federn",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "spiral-scribe.ldr": {
        "pieces": 185,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "gears",
        "description": {
            "en": "One motor turns a carrier around a fixed sun gear; the orbiting planet’s pinion feeds a rack outward, so a passive marker traces an Archimedean spiral (about 37.7 mm per turn).",
            "de": "Ein Motor dreht einen Träger um ein festes Sonnenrad; das Ritzel des umlaufenden Planeten schiebt eine Zahnstange nach außen, sodass eine passive Markierung eine archimedische Spirale beschreibt (etwa 37,7 mm je Umdrehung)."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "one-motor radial feed",
            "de": "radialer Vorschub mit einem Motor"
        },
        "keywords": [
            "Archimedean spiral",
            "polar coordinates",
            "radial feed",
            "fixed sun",
            "planet carrier",
            "rack and pinion",
            "polar tracer",
            "archimedische Spirale",
            "Polarkoordinaten",
            "radialer Vorschub",
            "Planetenträger",
            "Zahnstange",
            "experimental",
            "prototype",
            "experimentell",
            "unverified"
        ],
        "experimental": true
    },
    "stroke-shift.ldr": {
        "pieces": 295,
        "motors": 2,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "Motor B sets a real crank radius of 16, 22 or 28 mm while A holds; A then turns the crank once and back, and the same connecting rod drives a passive piston through strokes of 2r = 32, 44 and 56 mm.",
            "de": "Motor B stellt den Kurbelradius auf 16, 22 oder 28 mm, während A hält; danach dreht A die Kurbel einmal hin und zurück, und dasselbe Pleuel bewegt einen passiven Schlitten mit Hüben von 2r = 32, 44 und 56 mm."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "adjustable crank throw",
            "de": "verstellbarer Kurbelradius"
        },
        "keywords": [
            "adjustable crank throw",
            "variable stroke",
            "slider-crank",
            "connecting rod",
            "linear actuator",
            "passive piston",
            "crank radius",
            "verstellbarer Kurbelradius",
            "verstellbarer Hub",
            "Schubkurbel",
            "Pleuel",
            "Linearaktuator",
            "experimental",
            "prototype",
            "experimentell",
            "unverified"
        ],
        "experimental": true
    },
    "triad-table.ldr": {
        "pieces": 258,
        "motors": 3,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "Three motor-driven screw legs (R-P-R) jointly set the x, y position and heading of one passive platform; no motor is an axis on its own. The program visits 15 poses: ±4.8 mm, ±10° and four combined poses.",
            "de": "Drei motorgetriebene Schraubbeine (R-P-R) bestimmen gemeinsam x, y und Ausrichtung einer passiven Plattform; kein Motor ist für sich eine Achse. Das Programm fährt 15 Posen an: ±4,8 mm, ±10° und vier kombinierte Posen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "three lengths, one pose",
            "de": "drei Längen, eine Pose"
        },
        "keywords": [
            "parallel robot",
            "3-RPR",
            "planar parallel platform",
            "XY-theta stage",
            "positioning table",
            "inverse kinematics",
            "pose",
            "yaw",
            "linear actuator",
            "singularity",
            "Parallelroboter",
            "Positioniertisch",
            "ebene Parallelplattform",
            "inverse Kinematik",
            "Gierwinkel",
            "Linearaktuator",
            "experimental",
            "prototype",
            "experimentell",
            "unverified"
        ],
        "experimental": true
    },
    "paired-door-sync.ldr": {
        "pieces": 88,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "gears",
        "description": {
            "en": "One 16T pinion drives two 64781 racks placed on opposite sides, so the two door leaves travel with equal speed in opposite directions and their sum of positions stays constant. The measured rack markers show the declared equal-and-opposite law, and a control with the front chain removed shows that one rack alone cannot synchronize a pair.",
            "de": "Ein 16-Zahn-Ritzel treibt zwei gegenüberliegende 64781-Zahnstangen, sodass sich beide Türblätter gleich schnell und gegenläufig bewegen und ihre Positionssumme konstant bleibt. Die gemessenen Zahnstangenmarker zeigen das erklärte gegenläufige Gesetz; eine Kontrolle ohne vordere Antriebskette zeigt, dass eine einzelne Zahnstange ein Paar nicht synchronisieren kann."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "opposed rack and pinion",
            "de": "gegenläufige Zahnstangen mit Ritzel"
        },
        "keywords": [
            "rack and pinion",
            "opposed racks",
            "paired sliding doors",
            "synchronization",
            "equal and opposite motion",
            "constant sum constraint",
            "direction reversal",
            "backlash",
            "Zahnstange und Ritzel",
            "gegenläufige Zahnstangen",
            "Doppelschiebetür",
            "Synchronisierung",
            "gleich große, entgegengesetzte Bewegung",
            "konstante Summenbedingung",
            "Richtungsumkehr",
            "Umkehrspiel",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    }
});
