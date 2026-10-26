// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Checkpoint candidates are deliberately separate from the qualified registry.
export const EXPERIMENTAL_MODELS = Object.freeze([
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
    },
    {
        "file": "impulse-line.ldr",
        "title": {
            "en": "Impulse Line — contact transfer",
            "de": "Impulse Line — Impulsübertragung durch Kontakt"
        },
        "example": "impulse-line.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A separate motor pusher launches the first of three free pendulums, then withdraws. Follow motion through actual bob contacts and compare a physical middle-pendulum-absent control.",
            "de": "Ein eigener motorisierter Anhebearm regt das erste von drei freien Pendeln an und zieht sich zurück. Beobachte die Bewegung durch echte Kontakte zwischen den Pendelkörpern und vergleiche mit dem physisch entfernten mittleren Pendel."
        },
        "manualJog": {
            "A": {
                "minDeg": -24,
                "maxDeg": 0,
                "stepDeg": 4,
                "speedDps": 15
            }
        }
    },
    {
        "file": "impulse-line-missing-middle.ldr",
        "title": {
            "en": "Impulse Line Control — middle pendulum removed",
            "de": "Impulse-Line-Kontrolle — ohne mittleres Pendel"
        },
        "example": "impulse-line.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Impulse Line with the middle pendulum removed and everything else unchanged. The same launch no longer reaches the last pendulum, which stays practically still.",
            "de": "Impulse Line ohne das mittlere Pendel, sonst unverändert. Derselbe Anstoß erreicht das letzte Pendel nicht mehr; es bleibt praktisch still."
        },
        "manualJog": {
            "A": {
                "minDeg": -24,
                "maxDeg": 0,
                "stepDeg": 4,
                "speedDps": 15
            }
        }
    },
    {
        "file": "final-squeeze.ldr",
        "title": {
            "en": "Final Squeeze — a knee press",
            "de": "Final Squeeze — eine Kniehebelpresse"
        },
        "example": "final-squeeze.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "One motor straightens two equal links against a stock shock load. The passive platen advances less per degree near alignment while the ideal output force per input torque rises. The finite program stops short of dead centre and returns.",
            "de": "Ein Motor streckt zwei gleich lange Glieder gegen eine Federlast. Die passive Druckplatte bewegt sich nahe der Strecklage je Grad weniger, während die ideale Ausgangskraft je Eingangsdrehmoment steigt. Das endliche Programm bleibt vor dem Totpunkt und kehrt zurück."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 25,
                "stepDeg": 5,
                "speedDps": 8
            }
        }
    },
    {
        "file": "travel-dial-wheel-raised.ldr",
        "title": {
            "en": "Travel Dial Control — wheel raised",
            "de": "Travel-Dial-Kontrolle — Rad angehoben"
        },
        "example": "travel-dial.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Travel Dial with the measuring wheel lifted clear of the sled. The sled makes the same strokes, but without contact the wheel barely turns.",
            "de": "Travel Dial mit vom Schlitten abgehobenem Messrad. Der Schlitten fährt dieselben Hübe, doch ohne Kontakt dreht sich das Rad kaum."
        },
        "manualJog": {
            "A": {
                "minDeg": -60,
                "maxDeg": 60,
                "stepDeg": 15,
                "speedDps": 15
            }
        }
    },
    {
        "file": "ghost-pivot-unequal-link.ldr",
        "title": {
            "en": "Ghost Pivot Control — one link lengthened",
            "de": "Ghost-Pivot-Kontrolle — ein Glied verlängert"
        },
        "example": "ghost-pivot.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Ghost Pivot with one loop link replaced by a longer beam. The same motor sweep now moves the empty end hole by about 21 mm: the remote centre depends on exact link lengths.",
            "de": "Ghost Pivot mit einem längeren Balken als Glied der Schleife. Derselbe Motorschwenk verschiebt das leere Endloch nun um etwa 21 mm: Der fernliegende Drehpunkt hängt von genauen Gliedlängen ab."
        },
        "manualJog": {
            "A": {
                "minDeg": -35,
                "maxDeg": 35,
                "stepDeg": 5,
                "speedDps": 10
            }
        }
    },
    {
        "file": "afterturn.ldr",
        "title": {
            "en": "Afterturn — a closed shape cycle",
            "de": "Afterturn — ein geschlossener Formzyklus"
        },
        "example": "afterturn.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Two motors turn a reaction wheel and reposition balanced masses on a freely rotating platform. Compare the remaining platform heading after both internal motions return home, then reverse the cycle and test physically fixed masses.",
            "de": "Zwei Motoren drehen ein Reaktionsrad und versetzen ausgewuchtete Massen auf einer frei drehbaren Plattform. Vergleiche die verbleibende Plattformdrehung nach der Rückkehr beider innerer Bewegungen, kehre den Zyklus um und prüfe physisch festgesetzte Massen."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 900,
                "stepDeg": 90,
                "speedDps": 90
            },
            "B": {
                "minDeg": 0,
                "maxDeg": 70,
                "stepDeg": 10,
                "speedDps": 10
            }
        }
    },
    {
        "file": "afterturn-fixed-masses.ldr",
        "title": {
            "en": "Afterturn Control — masses fixed",
            "de": "Afterturn-Kontrolle — Massen fest"
        },
        "example": "afterturn.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Afterturn with both radial masses fixed at their outer position. The same wheel cycle now leaves practically no net heading, because the platform inertia never changes.",
            "de": "Afterturn mit beiden radialen Massen fest in der äußeren Stellung. Derselbe Radzyklus hinterlässt nun praktisch keine Nettodrehung, weil sich das Trägheitsmoment der Plattform nie ändert."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 900,
                "stepDeg": 90,
                "speedDps": 90
            },
            "B": {
                "minDeg": 0,
                "maxDeg": 70,
                "stepDeg": 10,
                "speedDps": 10
            }
        }
    },
    {
        "file": "quiet-partner.ldr",
        "title": {
            "en": "Quiet Partner — a passive vibration absorber",
            "de": "Quiet Partner — ein passiver Schwingungstilger"
        },
        "example": "quiet-partner.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "One fixed motor excites a passive primary rotor through two bands. Two more bands connect an unpowered partner. Compare the primary response with the matching control while the input keeps rocking.",
            "de": "Ein fest montierter Motor regt einen passiven Hauptrotor über zwei Bänder an. Zwei weitere Bänder koppeln einen ebenfalls unmotorisierten Partner an. Vergleiche die Antwort des Hauptrotors mit dem Kontrollmodell, während der Eingang weiter schwingt."
        },
        "manualJog": {
            "A": {
                "minDeg": -2,
                "maxDeg": 2,
                "stepDeg": 1,
                "speedDps": 13
            }
        }
    },
    {
        "file": "quiet-partner-control.ldr",
        "title": {
            "en": "Quiet Partner Control — absorber bands removed",
            "de": "Quiet Partner Control — ohne Tilgerbänder"
        },
        "example": "quiet-partner.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "The same rigid assembly and program, with only the two bands joining primary and partner removed. Compare primary motion during continuing drive with Quiet Partner; reload the saved model before every run.",
            "de": "Derselbe starre Aufbau und dasselbe Programm; nur die beiden Bänder zwischen Hauptrotor und Partner fehlen. Vergleiche die Bewegung des Hauptrotors während fortgesetzter Anregung mit Quiet Partner. Lade vor jedem Lauf das gespeicherte Modell neu."
        },
        "manualJog": {
            "A": {
                "minDeg": -2,
                "maxDeg": 2,
                "stepDeg": 1,
                "speedDps": 13
            }
        }
    },
    {
        "file": "high-select.ldr",
        "title": {
            "en": "High Select — mechanical maximum",
            "de": "High Select — mechanisches Maximum"
        },
        "example": "high-select.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Two independently driven supports lift a separate gravity-loaded bridge. The higher support determines its settled height. Compare lower-input motion, handover and equal-height ties, then exchange the two input sequences.",
            "de": "Zwei unabhängig angetriebene Stützen heben eine separate, schwerkraftbelastete Brücke. Die höhere Stütze bestimmt ihre Höhe nach dem Einschwingen. Vergleiche Bewegungen der niedrigeren Eingabe, den Kontaktwechsel und gleiche Höhen; vertausche anschließend die beiden Eingabefolgen."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 152,
                "stepDeg": 19,
                "speedDps": 38
            },
            "B": {
                "minDeg": 0,
                "maxDeg": 152,
                "stepDeg": 19,
                "speedDps": 38
            }
        }
    },
    {
        "file": "high-select-mirror.ldr",
        "title": {
            "en": "High Select — exchanged-input comparison",
            "de": "High Select — Vergleich mit vertauschten Eingaben"
        },
        "example": "high-select-mirror.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Exchange the A and B input-height sequences on the same saved mechanism. Compare the passive bridge height at corresponding settled stages: max(a,b) equals max(b,a), although the active supporting side changes.",
            "de": "Vertausche die Höhenfolgen für A und B am selben gespeicherten Mechanismus. Vergleiche die passive Brückenhöhe in entsprechenden eingeschwungenen Stufen: max(a,b) ist gleich max(b,a), obwohl die tragende Seite wechselt."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 152,
                "stepDeg": 19,
                "speedDps": 38
            },
            "B": {
                "minDeg": 0,
                "maxDeg": 152,
                "stepDeg": 19,
                "speedDps": 38
            }
        }
    },
    {
        "file": "obliquity-orrery.ldr",
        "title": {
            "en": "Obliquity Orrery — the tilt behind the seasons",
            "de": "Obliquity Orrery — die Neigung hinter den Jahreszeiten"
        },
        "example": "obliquity-orrery.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A parallelogram carries a tilted Earth round the Sun without turning it. Watch the axis keep its direction while the Sun's declination falls from +22.5° at midsummer to 0° at the equinox.",
            "de": "Ein Parallelogramm führt eine geneigte Erde um die Sonne, ohne sie zu drehen. Beobachte, wie die Achse ihre Richtung behält, während die Sonnendeklination vom Hochsommer (+22,5°) bis zur Tagundnachtgleiche (0°) fällt."
        },
        "manualJog": {
            "A": {
                "minDeg": -90,
                "maxDeg": 0,
                "stepDeg": 5,
                "speedDps": 12
            }
        }
    },
    {
        "file": "obliquity-orrery-turned-axis.ldr",
        "title": {
            "en": "Obliquity Orrery — turned axis (control)",
            "de": "Obliquity Orrery — gedrehte Achse (Kontrolle)"
        },
        "example": "obliquity-orrery-turned-axis.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Control: the same orrery with the Earth's tilt turned 90° about its spindle. The tilt and the program are unchanged, but midsummer moves a quarter of an orbit along.",
            "de": "Kontrolle: dasselbe Orrery, die Neigung der Erde um 90° um ihre Spindel gedreht. Neigung und Programm sind gleich, aber der Hochsommer wandert um eine Viertelbahn."
        },
        "manualJog": {
            "A": {
                "minDeg": -90,
                "maxDeg": 0,
                "stepDeg": 5,
                "speedDps": 12
            }
        }
    },
    {
        "file": "pivot-exchange.ldr",
        "title": {
            "en": "Pivot Exchange — nearly equal periods from different pivots",
            "de": "Pivot Exchange — nahezu gleiche Perioden an verschiedenen Aufhängungen"
        },
        "example": "pivot-exchange.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Three identical weighted arms hang from different holes. From an 8° saved release, compare two nearly conjugate suspensions with a slower central-hole control. One shared observation program lets gravity provide the motion.",
            "de": "Drei identische beschwerte Arme hängen an verschiedenen Bohrungen. Vergleiche aus einer gespeicherten 8°-Auslenkung zwei nahezu konjugierte Aufhängungen mit der langsameren Kontrolle an der mittleren Bohrung. Ein gemeinsames Beobachtungsprogramm lässt die Schwerkraft für die Bewegung sorgen."
        }
    },
    {
        "file": "pivot-exchange-wide.ldr",
        "title": {
            "en": "Pivot Exchange — 20° release comparison",
            "de": "Pivot Exchange — Vergleich mit 20° Anfangsauslenkung"
        },
        "example": "pivot-exchange.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Load the same three pendulum constructions with a saved 20° release. Compare actual cycle periods and amplitudes with the fresh 8° model, keeping each arm’s parts, ballast and suspension hole unchanged.",
            "de": "Lade dieselben drei Pendelkonstruktionen mit einer gespeicherten 20°-Auslenkung. Vergleiche tatsächliche Perioden und Amplituden mit dem frisch geladenen 8°-Modell. Teile, Zusatzmasse und Aufhängungsbohrung jedes Arms bleiben gleich."
        }
    },
    {
        "file": "air-budget-two-tanks.ldr",
        "title": {
            "en": "Air Budget — two-tank comparison",
            "de": "Air Budget — Vergleich mit zwei Lufttanks"
        },
        "example": "air-budget.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Add a second connected stock air tank and repeat the same forward-and-return program. Compare pressure gain per observed compression travel with the one-tank model.",
            "de": "Schließe einen zweiten Standard-Lufttank an und wiederhole dasselbe Vorwärts-und-zurück-Programm. Vergleiche den Druckanstieg je beobachtetem Verdichtungsweg mit dem Modell mit einem Tank."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 3240,
                "stepDeg": 180,
                "speedDps": 270
            }
        }
    },
    {
        "file": "foldback-open.ldr",
        "title": {
            "en": "Foldback — open parallelogram (comparison)",
            "de": "Foldback — offenes Parallelogramm (Vergleich)"
        },
        "example": "foldback.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "The same parts re-assembled as an open parallelogram. The same program now makes the output copy the input one-for-one, in the same direction.",
            "de": "Dieselben Teile als offenes Parallelogramm zusammengebaut. Dasselbe Programm lässt den Abtrieb dem Eingang jetzt eins zu eins und in derselben Richtung folgen."
        },
        "manualJog": {
            "A": {
                "minDeg": -20,
                "maxDeg": 70,
                "stepDeg": 5,
                "speedDps": 15
            }
        }
    },
    {
        "file": "thirdline-control.ldr",
        "title": {
            "en": "Thirdline — shorter mark (control)",
            "de": "Thirdline — kürzere Markierung (Kontrolle)"
        },
        "example": "thirdline.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Control: the ruler's marked joint is one hole inward (24 mm instead of 32 mm). The line still moves freely, but it follows a different law and no longer trisects the angle.",
            "de": "Kontrolle: Das markierte Gelenk des Lineals sitzt ein Loch weiter innen (24 mm statt 32 mm). Die Gerade bewegt sich weiter frei, folgt aber einem anderen Gesetz und drittelt den Winkel nicht mehr."
        },
        "manualJog": {
            "A": {
                "minDeg": -5,
                "maxDeg": 40,
                "stepDeg": 5,
                "speedDps": 8
            }
        }
    },
    {
        "file": "samebeat.ldr",
        "title": {
            "en": "Samebeat — reversible pendulum",
            "de": "Samebeat — Reversionspendel"
        },
        "example": "samebeat.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "A brief motor pulse moves a support and releases a passive rigid pendulum. Rehang the same body at its unequal paired pivot and compare periods; then test a third suspension with the same parts and program.",
            "de": "Ein kurzer Motorimpuls bewegt die Aufhängung eines passiven starren Pendels. Hänge denselben Körper am ungleichen zweiten Punkt auf und vergleiche die Perioden; prüfe danach einen dritten Punkt mit denselben Teilen und demselben Programm."
        },
        "manualJog": {
            "A": {
                "minDeg": -8,
                "maxDeg": 8,
                "stepDeg": 4,
                "speedDps": 60
            }
        }
    },
    {
        "file": "samebeat-conjugate.ldr",
        "title": {
            "en": "Samebeat — paired pivot",
            "de": "Samebeat — Partnerdrehpunkt"
        },
        "example": "samebeat.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "The same pendulum hung from its paired hole, 69% farther from its centre of mass. The period stays almost exactly the same.",
            "de": "Dasselbe Pendel am Partnerloch, 69 % weiter vom Schwerpunkt entfernt. Die Periode bleibt fast genau gleich."
        },
        "manualJog": {
            "A": {
                "minDeg": -8,
                "maxDeg": 8,
                "stepDeg": 4,
                "speedDps": 60
            }
        }
    },
    {
        "file": "samebeat-control.ldr",
        "title": {
            "en": "Samebeat — control pivot",
            "de": "Samebeat — Kontrolldrehpunkt"
        },
        "example": "samebeat.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "The same pendulum hung from a hole close to its centre of mass. It swings about 40% more slowly, as the formula predicts.",
            "de": "Dasselbe Pendel an einem Loch nahe am Schwerpunkt. Es schwingt etwa 40 % langsamer, wie die Formel vorhersagt."
        },
        "manualJog": {
            "A": {
                "minDeg": -8,
                "maxDeg": 8,
                "stepDeg": 4,
                "speedDps": 60
            }
        }
    },
    {
        "file": "carry-ratio-control.ldr",
        "title": {
            "en": "Carry Ratio — ball on the base (control)",
            "de": "Carry Ratio — Kugel auf dem Boden (Kontrolle)"
        },
        "example": "carry-ratio.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Control: the same ball lies on the fixed base instead of the moving deck. The deck moves exactly as before, but the ball is no longer carried.",
            "de": "Kontrolle: Dieselbe Kugel liegt auf der festen Grundplatte statt auf dem bewegten Tisch. Der Tisch fährt wie zuvor, aber die Kugel wird nicht mehr mitgenommen."
        },
        "manualJog": {
            "A": {
                "minDeg": -180,
                "maxDeg": 2880,
                "stepDeg": 90,
                "speedDps": 120
            }
        }
    },
    {
        "file": "sarrus-lift-single-chain.ldr",
        "title": {
            "en": "Sarrus Lift — single chain (control)",
            "de": "Sarrus Lift — nur eine Kette (Kontrolle)"
        },
        "example": "sarrus-lift-single-chain.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Control: Sarrus Lift with its perpendicular passive chain removed. With the motor held, the deck can no longer stay level: it sinks, tips and slides.",
            "de": "Kontrolle: Sarrus Lift ohne die senkrechte passive Kette. Bei gehaltenem Motor bleibt der Tisch nicht mehr waagerecht: Er sinkt, kippt und rutscht."
        }
    },
    {
        "file": "phasor-twin.ldr",
        "title": {
            "en": "Phasor Twin — the Stirling phase loop",
            "de": "Phasor Twin — die Stirling-Phasenschleife"
        },
        "example": "phasor-twin.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Two vertical crank-slider pistons, coupled by a 40-tooth idler and two 16-tooth gears, run 90 degrees out of phase. Plotting the two passive piston displacements against each other gives a closed loop of area pi r^2; clocking both throws together collapses it to a line.",
            "de": "Zwei senkrechte Kurbelschleifen-Kolben, über ein 40-Zahn-Zwischenrad und zwei 16-Zahn-Ritzel gekoppelt, laufen um 90 Grad versetzt. Trägt man die beiden passiven Kolbenwege gegeneinander auf, entsteht ein geschlossener Ring der Fläche pi r^2; bei gleichphasigen Kurbeln fällt er zu einer Geraden zusammen."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 720,
                "stepDeg": 45,
                "speedDps": 45
            }
        }
    },
    {
        "file": "phasor-twin-control.ldr",
        "title": {
            "en": "Phasor Twin — in phase (control)",
            "de": "Phasor Twin — gleichphasig (Kontrolle)"
        },
        "example": "phasor-twin.bw",
        "mat": "plain",
        "experimental": true,
        "blocked": false,
        "intro": {
            "en": "Control: both crank plates clocked to the same angle. The pistons keep their 32 mm strokes but move together, and the loop collapses to a line.",
            "de": "Kontrolle: Beide Kurbelscheiben stehen im selben Winkel. Die Kolben behalten ihren Hub von 32 mm, bewegen sich aber gemeinsam, und die Schleife fällt zu einer Geraden zusammen."
        },
        "manualJog": {
            "A": {
                "minDeg": 0,
                "maxDeg": 720,
                "stepDeg": 45,
                "speedDps": 45
            }
        }
    }
]);
export const EXPERIMENTAL_MODEL_DETAILS = Object.freeze({
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
    },
    "impulse-line.ldr": {
        "pieces": 140,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "inertia",
        "description": {
            "en": "A separate motor pusher launches the first of three free pendulums, then withdraws. Follow motion through actual bob contacts and compare a physical middle-pendulum-absent control.",
            "de": "Ein eigener motorisierter Anhebearm regt das erste von drei freien Pendeln an und zieht sich zurück. Beobachte die Bewegung durch echte Kontakte zwischen den Pendelkörpern und vergleiche mit dem physisch entfernten mittleren Pendel."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Dissipative pendulum impact chain",
            "de": "Dissipative Stoßkette aus Pendeln"
        },
        "keywords": [
            "impulse",
            "impact chain",
            "pendulum collision",
            "contact transfer",
            "dissipation",
            "Newton cradle comparison",
            "Impuls",
            "Stoßkette",
            "Pendelstoß",
            "Kontaktübertragung",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "impulse-line-missing-middle.ldr": {
        "pieces": 128,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "inertia",
        "description": {
            "en": "Impulse Line with the middle pendulum removed and everything else unchanged. The same launch no longer reaches the last pendulum, which stays practically still.",
            "de": "Impulse Line ohne das mittlere Pendel, sonst unverändert. Derselbe Anstoß erreicht das letzte Pendel nicht mehr; es bleibt praktisch still."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Dissipative pendulum impact chain",
            "de": "Dissipative Stoßkette aus Pendeln"
        },
        "keywords": [
            "impulse",
            "impact chain",
            "pendulum collision",
            "contact transfer",
            "dissipation",
            "Newton cradle comparison",
            "Impuls",
            "Stoßkette",
            "Pendelstoß",
            "Kontaktübertragung",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "final-squeeze.ldr": {
        "pieces": 167,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "forces",
        "description": {
            "en": "One motor straightens two equal links against a stock shock load. The passive platen advances less per degree near alignment while the ideal output force per input torque rises. The finite program stops short of dead centre and returns.",
            "de": "Ein Motor streckt zwei gleich lange Glieder gegen eine Federlast. Die passive Druckplatte bewegt sich nahe der Strecklage je Grad weniger, während die ideale Ausgangskraft je Eingangsdrehmoment steigt. Das endliche Programm bleibt vor dem Totpunkt und kehrt zurück."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "equal-link knee press with passive spring-loaded platen",
            "de": "Kniehebelpresse mit gleichen Gliedern und passiver federbelasteter Druckplatte"
        },
        "keywords": [
            "knee press",
            "toggle press",
            "equal-link slider-crank",
            "mechanical advantage",
            "virtual work",
            "shock absorber",
            "platen",
            "Kniehebelpresse",
            "Kniehebel",
            "Totpunkt",
            "virtuelle Arbeit",
            "Kraftübersetzung",
            "Feder",
            "Druckplatte",
            "experimental",
            "experimentell",
            "prototype",
            "unverified"
        ],
        "experimental": true
    },
    "travel-dial-wheel-raised.ldr": {
        "pieces": 197,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "motion",
        "description": {
            "en": "Travel Dial with the measuring wheel lifted clear of the sled. The sled makes the same strokes, but without contact the wheel barely turns.",
            "de": "Travel Dial mit vom Schlitten abgehobenem Messrad. Der Schlitten fährt dieselben Hübe, doch ohne Kontakt dreht sich das Rad kaum."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Passive rolling odometer",
            "de": "Passive Wegmessung durch ein abrollendes Rad"
        },
        "keywords": [
            "measuring wheel",
            "odometer",
            "rolling contact",
            "linear measurement",
            "slip",
            "Messrad",
            "Wegmessung",
            "Abrollen",
            "Schlupf",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "ghost-pivot-unequal-link.ldr": {
        "pieces": 86,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "motion",
        "description": {
            "en": "Ghost Pivot with one loop link replaced by a longer beam. The same motor sweep now moves the empty end hole by about 21 mm: the remote centre depends on exact link lengths.",
            "de": "Ghost Pivot mit einem längeren Balken als Glied der Schleife. Derselbe Motorschwenk verschiebt das leere Endloch nun um etwa 21 mm: Der fernliegende Drehpunkt hängt von genauen Gliedlängen ab."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Double-parallelogram remote centre of motion",
            "de": "Doppelparallelogramm mit fernliegendem Drehpunkt"
        },
        "keywords": [
            "remote centre",
            "remote center",
            "RCM",
            "virtual pivot",
            "double parallelogram",
            "passive linkage",
            "Fernzentrum",
            "Drehpunkt",
            "Doppelparallelogramm",
            "Koppelgetriebe",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "afterturn.ldr": {
        "pieces": 296,
        "motors": 2,
        "hubs": [
            "spike-prime"
        ],
        "topic": "inertia",
        "description": {
            "en": "Two motors turn a reaction wheel and reposition balanced masses on a freely rotating platform. Compare the remaining platform heading after both internal motions return home, then reverse the cycle and test physically fixed masses.",
            "de": "Zwei Motoren drehen ein Reaktionsrad und versetzen ausgewuchtete Massen auf einer frei drehbaren Plattform. Vergleiche die verbleibende Plattformdrehung nach der Rückkehr beider innerer Bewegungen, kehre den Zyklus um und prüfe physisch festgesetzte Massen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Geometric-phase reorientation through a closed internal shape cycle",
            "de": "Umorientierung durch einen geschlossenen inneren Formzyklus"
        },
        "keywords": [
            "geometric phase",
            "shape cycle",
            "reaction wheel",
            "variable inertia",
            "angular momentum",
            "free yaw",
            "geometrische Phase",
            "Formzyklus",
            "Reaktionsrad",
            "veränderliches Trägheitsmoment",
            "Drehimpuls",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "afterturn-fixed-masses.ldr": {
        "pieces": 296,
        "motors": 2,
        "hubs": [
            "spike-prime"
        ],
        "topic": "inertia",
        "description": {
            "en": "Afterturn with both radial masses fixed at their outer position. The same wheel cycle now leaves practically no net heading, because the platform inertia never changes.",
            "de": "Afterturn mit beiden radialen Massen fest in der äußeren Stellung. Derselbe Radzyklus hinterlässt nun praktisch keine Nettodrehung, weil sich das Trägheitsmoment der Plattform nie ändert."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Geometric-phase reorientation through a closed internal shape cycle",
            "de": "Umorientierung durch einen geschlossenen inneren Formzyklus"
        },
        "keywords": [
            "geometric phase",
            "shape cycle",
            "reaction wheel",
            "variable inertia",
            "angular momentum",
            "free yaw",
            "geometrische Phase",
            "Formzyklus",
            "Reaktionsrad",
            "veränderliches Trägheitsmoment",
            "Drehimpuls",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "quiet-partner.ldr": {
        "pieces": 234,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "forces",
        "description": {
            "en": "One fixed motor excites a passive primary rotor through two bands. Two more bands connect an unpowered partner. Compare the primary response with the matching control while the input keeps rocking.",
            "de": "Ein fest montierter Motor regt einen passiven Hauptrotor über zwei Bänder an. Zwei weitere Bänder koppeln einen ebenfalls unmotorisierten Partner an. Vergleiche die Antwort des Hauptrotors mit dem Kontrollmodell, während der Eingang weiter schwingt."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "passive tuned vibration absorber comparison",
            "de": "Vergleich eines passiven abgestimmten Schwingungstilgers"
        },
        "keywords": [
            "vibration absorber",
            "tuned mass damper",
            "passive rotor",
            "continued drive",
            "finite comparison",
            "antiresonance",
            "control",
            "passiver Schwingungstilger",
            "Schwingungstilger",
            "Tilger",
            "Schwingung",
            "Kontrollmodell",
            "Gummiband",
            "experimental",
            "experimentell",
            "prototype",
            "unverified"
        ],
        "experimental": true
    },
    "quiet-partner-control.ldr": {
        "pieces": 232,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "forces",
        "description": {
            "en": "The same rigid assembly and program, with only the two bands joining primary and partner removed. Compare primary motion during continuing drive with Quiet Partner; reload the saved model before every run.",
            "de": "Derselbe starre Aufbau und dasselbe Programm; nur die beiden Bänder zwischen Hauptrotor und Partner fehlen. Vergleiche die Bewegung des Hauptrotors während fortgesetzter Anregung mit Quiet Partner. Lade vor jedem Lauf das gespeicherte Modell neu."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "passive tuned vibration absorber comparison",
            "de": "Vergleich eines passiven abgestimmten Schwingungstilgers"
        },
        "keywords": [
            "vibration absorber",
            "tuned mass damper",
            "passive rotor",
            "continued drive",
            "finite comparison",
            "antiresonance",
            "control",
            "passiver Schwingungstilger",
            "Schwingungstilger",
            "Tilger",
            "Schwingung",
            "Kontrollmodell",
            "Gummiband",
            "experimental",
            "experimentell",
            "prototype",
            "unverified"
        ],
        "experimental": true
    },
    "high-select.ldr": {
        "pieces": 284,
        "motors": 2,
        "hubs": [
            "spike-prime"
        ],
        "topic": "forces",
        "description": {
            "en": "Two independently driven supports lift a separate gravity-loaded bridge. The higher support determines its settled height. Compare lower-input motion, handover and equal-height ties, then exchange the two input sequences.",
            "de": "Zwei unabhängig angetriebene Stützen heben eine separate, schwerkraftbelastete Brücke. Die höhere Stütze bestimmt ihre Höhe nach dem Einschwingen. Vergleiche Bewegungen der niedrigeren Eingabe, den Kontaktwechsel und gleiche Höhen; vertausche anschließend die beiden Eingabefolgen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "gravity-loaded unilateral maximum selector",
            "de": "schwerkraftbelasteter Maximumwähler mit einseitigen Kontakten"
        },
        "keywords": [
            "mechanical maximum",
            "maximum selector",
            "MAX",
            "rack",
            "gravity",
            "contact",
            "handover",
            "commutativity",
            "mechanisches Maximum",
            "Maximumwähler",
            "Zahnstange",
            "Schwerkraft",
            "Kontaktwechsel",
            "Kommutativität",
            "experimental",
            "experimentell",
            "prototype",
            "unverified"
        ],
        "experimental": true
    },
    "high-select-mirror.ldr": {
        "pieces": 284,
        "motors": 2,
        "hubs": [
            "spike-prime"
        ],
        "topic": "forces",
        "description": {
            "en": "Exchange the A and B input-height sequences on the same saved mechanism. Compare the passive bridge height at corresponding settled stages: max(a,b) equals max(b,a), although the active supporting side changes.",
            "de": "Vertausche die Höhenfolgen für A und B am selben gespeicherten Mechanismus. Vergleiche die passive Brückenhöhe in entsprechenden eingeschwungenen Stufen: max(a,b) ist gleich max(b,a), obwohl die tragende Seite wechselt."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "gravity-loaded unilateral maximum selector",
            "de": "schwerkraftbelasteter Maximumwähler mit einseitigen Kontakten"
        },
        "keywords": [
            "mechanical maximum",
            "maximum selector",
            "MAX",
            "rack",
            "gravity",
            "contact",
            "handover",
            "commutativity",
            "mechanisches Maximum",
            "Maximumwähler",
            "Zahnstange",
            "Schwerkraft",
            "Kontaktwechsel",
            "Kommutativität",
            "experimental",
            "experimentell",
            "prototype",
            "unverified"
        ],
        "experimental": true
    },
    "obliquity-orrery.ldr": {
        "pieces": 52,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "A parallelogram carries a tilted Earth round the Sun without turning it. Watch the axis keep its direction while the Sun's declination falls from +22.5° at midsummer to 0° at the equinox.",
            "de": "Ein Parallelogramm führt eine geneigte Erde um die Sonne, ohne sie zu drehen. Beobachte, wie die Achse ihre Richtung behält, während die Sonnendeklination vom Hochsommer (+22,5°) bis zur Tagundnachtgleiche (0°) fällt."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Parallel-crank orrery with a fixed tilted axis",
            "de": "Parallelkurbel-Orrery mit fest geneigter Achse"
        },
        "keywords": [
            "orrery",
            "obliquity",
            "axial tilt",
            "solar declination",
            "seasons",
            "solstice",
            "equinox",
            "parallelogram linkage",
            "Schiefe der Ekliptik",
            "Achsneigung",
            "Sonnendeklination",
            "Jahreszeiten",
            "Sonnenwende",
            "Parallelogramm",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "obliquity-orrery-turned-axis.ldr": {
        "pieces": 50,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "Control: the same orrery with the Earth's tilt turned 90° about its spindle. The tilt and the program are unchanged, but midsummer moves a quarter of an orbit along.",
            "de": "Kontrolle: dasselbe Orrery, die Neigung der Erde um 90° um ihre Spindel gedreht. Neigung und Programm sind gleich, aber der Hochsommer wandert um eine Viertelbahn."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Parallel-crank orrery with a fixed tilted axis",
            "de": "Parallelkurbel-Orrery mit fest geneigter Achse"
        },
        "keywords": [
            "orrery",
            "obliquity",
            "axial tilt",
            "solar declination",
            "seasons",
            "solstice",
            "equinox",
            "parallelogram linkage",
            "Schiefe der Ekliptik",
            "Achsneigung",
            "Sonnendeklination",
            "Jahreszeiten",
            "Sonnenwende",
            "Parallelogramm",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "pivot-exchange.ldr": {
        "pieces": 159,
        "motors": 0,
        "hubs": [
            "spike-prime"
        ],
        "topic": "inertia",
        "description": {
            "en": "Three identical weighted arms hang from different holes. From an 8° saved release, compare two nearly conjugate suspensions with a slower central-hole control. One shared observation program lets gravity provide the motion.",
            "de": "Drei identische beschwerte Arme hängen an verschiedenen Bohrungen. Vergleiche aus einer gespeicherten 8°-Auslenkung zwei nahezu konjugierte Aufhängungen mit der langsameren Kontrolle an der mittleren Bohrung. Ein gemeinsames Beobachtungsprogramm lässt die Schwerkraft für die Bewegung sorgen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "compound pendulum with nearly conjugate suspension choices",
            "de": "physikalisches Pendel mit nahezu konjugierten Aufhängungen"
        },
        "keywords": [
            "compound pendulum",
            "reversible pendulum",
            "conjugate pivots",
            "parallel axis theorem",
            "radius of gyration",
            "period",
            "gravity",
            "amplitude",
            "rotational inertia",
            "physikalisches Pendel",
            "Reversionspendel",
            "konjugierte Aufhängungen",
            "Steinerscher Satz",
            "Trägheitsradius",
            "Schwingungsdauer",
            "Schwerkraft",
            "Auslenkung",
            "Trägheitsmoment",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "pivot-exchange-wide.ldr": {
        "pieces": 159,
        "motors": 0,
        "hubs": [
            "spike-prime"
        ],
        "topic": "inertia",
        "description": {
            "en": "Load the same three pendulum constructions with a saved 20° release. Compare actual cycle periods and amplitudes with the fresh 8° model, keeping each arm’s parts, ballast and suspension hole unchanged.",
            "de": "Lade dieselben drei Pendelkonstruktionen mit einer gespeicherten 20°-Auslenkung. Vergleiche tatsächliche Perioden und Amplituden mit dem frisch geladenen 8°-Modell. Teile, Zusatzmasse und Aufhängungsbohrung jedes Arms bleiben gleich."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "compound pendulum with nearly conjugate suspension choices",
            "de": "physikalisches Pendel mit nahezu konjugierten Aufhängungen"
        },
        "keywords": [
            "compound pendulum",
            "reversible pendulum",
            "conjugate pivots",
            "parallel axis theorem",
            "radius of gyration",
            "period",
            "gravity",
            "amplitude",
            "rotational inertia",
            "physikalisches Pendel",
            "Reversionspendel",
            "konjugierte Aufhängungen",
            "Steinerscher Satz",
            "Trägheitsradius",
            "Schwingungsdauer",
            "Schwerkraft",
            "Auslenkung",
            "Trägheitsmoment",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "air-budget-two-tanks.ldr": {
        "pieces": 168,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "fluids",
        "description": {
            "en": "Add a second connected stock air tank and repeat the same forward-and-return program. Compare pressure gain per observed compression travel with the one-tank model.",
            "de": "Schließe einen zweiten Standard-Lufttank an und wiederhole dasselbe Vorwärts-und-zurück-Programm. Vergleiche den Druckanstieg je beobachtetem Verdichtungsweg mit dem Modell mit einem Tank."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "crank-driven pneumatic pump with finite reservoir comparison",
            "de": "kurbelgetriebene Pneumatikpumpe mit Vergleich begrenzter Speichervolumina"
        },
        "keywords": [
            "pneumatics",
            "air pressure",
            "pump",
            "reservoir volume",
            "one-way pump",
            "stored air",
            "swept volume",
            "compression travel",
            "check valve",
            "Pneumatik",
            "Luftdruck",
            "Pumpe",
            "Speichervolumen",
            "Rückschlagventil",
            "Luftvorrat",
            "Hubvolumen",
            "Verdichtungsweg",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "foldback-open.ldr": {
        "pieces": 95,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "The same parts re-assembled as an open parallelogram. The same program now makes the output copy the input one-for-one, in the same direction.",
            "de": "Dieselben Teile als offenes Parallelogramm zusammengebaut. Dasselbe Programm lässt den Abtrieb dem Eingang jetzt eins zu eins und in derselben Richtung folgen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Antiparallelogram / crossed four-bar linkage",
            "de": "Antiparallelogramm / gekreuztes Viergelenk"
        },
        "keywords": [
            "antiparallelogram",
            "crossed parallelogram",
            "crossed four-bar",
            "assembly branch",
            "tangent half angle",
            "Antiparallelogramm",
            "gekreuztes Viergelenk",
            "Montagezweig",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "thirdline-control.ldr": {
        "pieces": 179,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "Control: the ruler's marked joint is one hole inward (24 mm instead of 32 mm). The line still moves freely, but it follows a different law and no longer trisects the angle.",
            "de": "Kontrolle: Das markierte Gelenk des Lineals sitzt ein Loch weiter innen (24 mm statt 32 mm). Die Gerade bewegt sich weiter frei, folgt aber einem anderen Gesetz und drittelt den Winkel nicht mehr."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Archimedes / neusis angle trisector",
            "de": "Archimedische Winkeldreiteilung / Neusis-Konstruktion"
        },
        "keywords": [
            "angle trisector",
            "angle trisection",
            "neusis",
            "marked ruler",
            "Archimedes",
            "gearless angle division",
            "Winkeldreiteilung",
            "Neusis",
            "markiertes Lineal",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "samebeat.ldr": {
        "pieces": 92,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "forces",
        "description": {
            "en": "A brief motor pulse moves a support and releases a passive rigid pendulum. Rehang the same body at its unequal paired pivot and compare periods; then test a third suspension with the same parts and program.",
            "de": "Ein kurzer Motorimpuls bewegt die Aufhängung eines passiven starren Pendels. Hänge denselben Körper am ungleichen zweiten Punkt auf und vergleiche die Perioden; prüfe danach einen dritten Punkt mit denselben Teilen und demselben Programm."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Reversible compound pendulum — Kater principle",
            "de": "Reversionspendel — Kater-Prinzip"
        },
        "keywords": [
            "reversible pendulum",
            "compound pendulum",
            "physical pendulum",
            "Kater pendulum",
            "conjugate pivots",
            "centre of oscillation",
            "Reversionspendel",
            "physikalisches Pendel",
            "konjugierte Aufhängepunkte",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "samebeat-conjugate.ldr": {
        "pieces": 92,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "forces",
        "description": {
            "en": "The same pendulum hung from its paired hole, 69% farther from its centre of mass. The period stays almost exactly the same.",
            "de": "Dasselbe Pendel am Partnerloch, 69 % weiter vom Schwerpunkt entfernt. Die Periode bleibt fast genau gleich."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Reversible compound pendulum — Kater principle",
            "de": "Reversionspendel — Kater-Prinzip"
        },
        "keywords": [
            "reversible pendulum",
            "compound pendulum",
            "physical pendulum",
            "Kater pendulum",
            "conjugate pivots",
            "centre of oscillation",
            "Reversionspendel",
            "physikalisches Pendel",
            "konjugierte Aufhängepunkte",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "samebeat-control.ldr": {
        "pieces": 92,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "forces",
        "description": {
            "en": "The same pendulum hung from a hole close to its centre of mass. It swings about 40% more slowly, as the formula predicts.",
            "de": "Dasselbe Pendel an einem Loch nahe am Schwerpunkt. Es schwingt etwa 40 % langsamer, wie die Formel vorhersagt."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Reversible compound pendulum — Kater principle",
            "de": "Reversionspendel — Kater-Prinzip"
        },
        "keywords": [
            "reversible pendulum",
            "compound pendulum",
            "physical pendulum",
            "Kater pendulum",
            "conjugate pivots",
            "centre of oscillation",
            "Reversionspendel",
            "physikalisches Pendel",
            "konjugierte Aufhängepunkte",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "carry-ratio-control.ldr": {
        "pieces": 64,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "motion",
        "description": {
            "en": "Control: the same ball lies on the fixed base instead of the moving deck. The deck moves exactly as before, but the ball is no longer carried.",
            "de": "Kontrolle: Dieselbe Kugel liegt auf der festen Grundplatte statt auf dem bewegten Tisch. Der Tisch fährt wie zuvor, aber die Kugel wird nicht mehr mitgenommen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Free ball rolling on a slider-crank tray",
            "de": "Freie Kugel rollt auf einem Kurbeltisch"
        },
        "keywords": [
            "rolling without slipping",
            "no-slip transport",
            "rolling contact",
            "inertia-limited transport",
            "moment of inertia ratio",
            "friction cone",
            "contact limit",
            "Coulomb friction",
            "ungrasped payload",
            "spool on a plank",
            "Rollkontakt",
            "Rollen ohne Gleiten",
            "Transportverhältnis",
            "Trägheitsverhältnis",
            "Haftreibung",
            "Kontaktgrenze",
            "ungriffige Förderung",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "sarrus-lift-single-chain.ldr": {
        "pieces": 135,
        "motors": 1,
        "hubs": [
            "spike-prime"
        ],
        "topic": "linkages",
        "description": {
            "en": "Control: Sarrus Lift with its perpendicular passive chain removed. With the motor held, the deck can no longer stay level: it sinks, tips and slides.",
            "de": "Kontrolle: Sarrus Lift ohne die senkrechte passive Kette. Bei gehaltenem Motor bleibt der Tisch nicht mehr waagerecht: Er sinkt, kippt und rutscht."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Sarrus linkage with one hinge chain removed",
            "de": "Sarrus-Getriebe mit nur einer Gelenkkette"
        },
        "keywords": [
            "Sarrus linkage",
            "straight-line linkage",
            "degrees of freedom",
            "hinge chain",
            "control",
            "Sarrus-Getriebe",
            "Geradführung",
            "Freiheitsgrade",
            "Gelenkkette",
            "Kontrolle",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "phasor-twin.ldr": {
        "pieces": 63,
        "motors": 1,
        "hubs": [],
        "topic": "linkages",
        "description": {
            "en": "Two vertical crank-slider pistons, coupled by a 40-tooth idler and two 16-tooth gears, run 90 degrees out of phase. Plotting the two passive piston displacements against each other gives a closed loop of area pi r^2; clocking both throws together collapses it to a line.",
            "de": "Zwei senkrechte Kurbelschleifen-Kolben, über ein 40-Zahn-Zwischenrad und zwei 16-Zahn-Ritzel gekoppelt, laufen um 90 Grad versetzt. Trägt man die beiden passiven Kolbenwege gegeneinander auf, entsteht ein geschlossener Ring der Fläche pi r^2; bei gleichphasigen Kurbeln fällt er zu einer Geraden zusammen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Two crank-sliders clocked 90° apart (Stirling phase loop)",
            "de": "Zwei Schubkurbeln mit 90° Versatz (Stirling-Phasenschleife)"
        },
        "keywords": [
            "Stirling cycle",
            "Stirling engine",
            "alpha Stirling",
            "Schmidt analysis",
            "phase angle",
            "90 degree volume phase",
            "quadrature piston phasing",
            "kinematic Stirling analogy",
            "crank-slider",
            "Stirling-Zyklus",
            "Stirling-Motor",
            "Alpha-Stirling",
            "Schmidt-Analyse",
            "Phasenwinkel",
            "90-Grad-Volumenphase",
            "Phasenquadratur",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    },
    "phasor-twin-control.ldr": {
        "pieces": 63,
        "motors": 1,
        "hubs": [],
        "topic": "linkages",
        "description": {
            "en": "Control: both crank plates clocked to the same angle. The pistons keep their 32 mm strokes but move together, and the loop collapses to a line.",
            "de": "Kontrolle: Beide Kurbelscheiben stehen im selben Winkel. Die Kolben behalten ihren Hub von 32 mm, bewegen sich aber gemeinsam, und die Schleife fällt zu einer Geraden zusammen."
        },
        "author": "CrispStrobe",
        "license": "BSD-3-Clause",
        "mechanism": {
            "en": "Two crank-sliders clocked 90° apart (Stirling phase loop)",
            "de": "Zwei Schubkurbeln mit 90° Versatz (Stirling-Phasenschleife)"
        },
        "keywords": [
            "Stirling cycle",
            "Stirling engine",
            "alpha Stirling",
            "Schmidt analysis",
            "phase angle",
            "90 degree volume phase",
            "quadrature piston phasing",
            "kinematic Stirling analogy",
            "crank-slider",
            "Stirling-Zyklus",
            "Stirling-Motor",
            "Alpha-Stirling",
            "Schmidt-Analyse",
            "Phasenwinkel",
            "90-Grad-Volumenphase",
            "Phasenquadratur",
            "experimental",
            "prototype",
            "unverified",
            "experimentell"
        ],
        "experimental": true
    }
});
