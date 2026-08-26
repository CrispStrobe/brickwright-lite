// Original, playable game examples for the pseudocode gallery. Kept in a separate
// module so the language examples remain readable. Every game uses only commands
// accepted by SB3Creator and is compiled to ordinary Scratch blocks.
const gameExamples = {
    sky_skim: `# Sky Skimmer — surf the rolling hills to charge lift, then release Down to soar.
# Down dives. Up gives a small emergency flap. Near-ground passes build a combo;
# clipping a hill costs a life. The landscape gets faster every ten points.
GLOBAL score
GLOBAL lives
GLOBAL speed
GLOBAL birdy
GLOBAL vy
GLOBAL diving
GLOBAL hillx
GLOBAL hilly
GLOBAL combo
GLOBAL alive

SPRITE Skimmer:
  COSTUME cruise triangle 34 #ff4b4b
  COSTUME charged triangle 40 #ffd23f
  SOUND boost 760
  SOUND crash 130
  WHEN flag clicked:
    show variable score
    show variable lives
    set score to 0
    set lives to 3
    set speed to 4
    set birdy to 40
    set vy to 0
    set combo to 1
    set alive to 1
    set rotation style all around
    go to x: -120 y: birdy
    show
  WHEN flag clicked:
    FOREVER:
      IF alive = 1 THEN:
        set diving to 0
        IF key down arrow pressed? THEN:
          set diving to 1
          change vy by -0.8
        ELSE:
          change vy by -0.28
        IF key up arrow pressed? THEN:
          change vy by 0.45
        change birdy by vy
        IF birdy > 165 THEN:
          set birdy to 165
          set vy to -2
        IF birdy < -155 THEN:
          set birdy to -155
        point in direction (90 - (vy * 5))
        go to x: -120 y: birdy
        IF birdy < -105 and vy < 0 THEN:
          switch costume to charged
        ELSE:
          switch costume to cruise
        IF touching Hill THEN:
          IF diving = 1 and vy < -1 THEN:
            set vy to (abs of vy) + 5
            change combo by 1
            change score by combo
            play sound "boost"
            wait 0.18 seconds
          ELSE:
            change lives by -1
            set combo to 1
            set birdy to 20
            set vy to 4
            play sound "crash"
            wait 0.7 seconds
            IF lives < 1 THEN:
              set alive to 0
              say ("Flight score: " join score) for 3 seconds
              stop all
        IF score > 9 THEN:
          set speed to 5
        IF score > 29 THEN:
          set speed to 6
      wait 0.02 seconds

SPRITE Hill:
  SHAPE circle 150 #35b779
  WHEN flag clicked:
    hide
    set hillx to -180
    REPEAT 7:
      set hilly to pick random -205 to -175
      go to x: hillx y: hilly
      create clone of myself
      change hillx by 80
  WHEN I start as a clone:
    show
    FOREVER:
      change x by (0 - speed)
      IF x position < -280 THEN:
        change x by 560
        set y to pick random -205 to -175
        change score by 1
      wait 0.02 seconds`,

    chroma_code: `# Chroma Vault — crack a four-gem code in eight turns. Enter colours as digits:
# 1 red, 2 orange, 3 yellow, 4 green, 5 blue, 6 violet. Exact reports the right
# colour in the right slot; Near reports a right colour in the wrong slot.
GLOBAL turn
GLOBAL exact
GLOBAL near
GLOBAL i
GLOBAL j
GLOBAL v
GLOBAL found
GLOBAL won

SPRITE Vault:
  LIST secret
  LIST guess
  LIST usedSecret
  LIST usedGuess
  COSTUME red circle 34 #ef476f
  COSTUME orange circle 34 #ff8c42
  COSTUME yellow circle 34 #ffd166
  COSTUME green circle 34 #06d6a0
  COSTUME blue circle 34 #118ab2
  COSTUME violet circle 34 #8e5bd9

  DEFINE FAST make code:
    delete all of secret
    REPEAT 4:
      set v to pick random 1 to 6
      add v to secret

  DEFINE ask gem (slot):
    ask (("Gem " join slot) join "? 1R 2O 3Y 4G 5B 6V") and wait
    set v to answer
    IF v < 1 or v > 6 THEN:
      set v to 1
    add round v to guess

  DEFINE FAST score guess:
    delete all of usedSecret
    delete all of usedGuess
    REPEAT 4:
      add 0 to usedSecret
      add 0 to usedGuess
    set exact to 0
    set near to 0
    set i to 1
    REPEAT 4:
      IF item i of guess = item i of secret THEN:
        change exact by 1
        replace item i of usedSecret with 1
        replace item i of usedGuess with 1
      change i by 1
    set i to 1
    REPEAT 4:
      IF item i of usedGuess = 0 THEN:
        set found to 0
        set j to 1
        REPEAT 4:
          IF found = 0 and item j of usedSecret = 0 and item i of guess = item j of secret THEN:
            set found to 1
            replace item j of usedSecret with 1
            change near by 1
          change j by 1
      change i by 1

  DEFINE paint row:
    set i to 1
    REPEAT 4:
      set v to item i of guess
      IF v = 1 THEN:
        switch costume to red
      IF v = 2 THEN:
        switch costume to orange
      IF v = 3 THEN:
        switch costume to yellow
      IF v = 4 THEN:
        switch costume to green
      IF v = 5 THEN:
        switch costume to blue
      IF v = 6 THEN:
        switch costume to violet
      go to x: (-90 + (i * 48)) y: (155 - (turn * 38))
      stamp
      change i by 1

  WHEN flag clicked:
    hide
    clear
    make code
    set turn to 1
    set won to 0
    say "Crack the Chroma Vault in 8 turns!" for 2 seconds
    REPEAT UNTIL turn > 8 or won = 1:
      delete all of guess
      ask gem 1
      ask gem 2
      ask gem 3
      ask gem 4
      score guess
      paint row
      IF exact = 4 THEN:
        set won to 1
        say ("Vault open in " join turn) for 3 seconds
      ELSE:
        say ((("Exact " join exact) join "  Near ") join near) for 2 seconds
        change turn by 1
    IF won = 0 THEN:
      say ((((("Code: " join item 1 of secret) join item 2 of secret) join item 3 of secret) join item 4 of secret) for 4 seconds`,

    fusion_foundry: `# Fusion Foundry — choose a bay with Left/Right and drop with Space. Matching
# cores fuse upward: circles become squares, then diamonds, then stars. Cascades
# multiply the score, so building several merges into one drop is the key.
GLOBAL score
GLOBAL column
GLOBAL level
GLOBAL row
GLOBAL idx
GLOBAL chain
GLOBAL over
GLOBAL i
GLOBAL r
GLOBAL c
GLOBAL v

SPRITE Foundry:
  LIST grid
  COSTUME empty tile "" #26344a
  COSTUME core1 circle 38 #55d6ff
  COSTUME core2 square 38 #44e08a
  COSTUME core3 tile "◆" #ffcf4a #7b3ff2
  COSTUME core4 tile "★" #ff6b6b #fff2a8
  COSTUME cursor tile "▼" #172033 #ffffff
  SOUND fuse 680

  DEFINE FAST reset:
    delete all of grid
    REPEAT 42:
      add 0 to grid
    set score to 0
    set column to 3
    set over to 0

  DEFINE FAST render:
    clear
    set i to 0
    REPEAT 42:
      set r to floor of (i / 6)
      set c to i mod 6
      set v to item (i + 1) of grid
      IF v = 0 THEN:
        switch costume to empty
      ELSE:
        switch costume to ("core" join v)
      go to x: (-125 + (c * 50)) y: (115 - (r * 45))
      stamp
      change i by 1
    switch costume to cursor
    go to x: (-125 + (column * 50)) y: 160
    stamp

  DEFINE drop core:
    IF over = 0 THEN:
      set row to 6
      REPEAT UNTIL row < 0 or item ((row * 6) + column) + 1 of grid = 0:
        change row by -1
      IF row < 0 THEN:
        set over to 1
        say ("Foundry sealed! Score " join score) for 3 seconds
        stop all
      ELSE:
        set level to 1
        IF pick random 1 to 5 = 1 THEN:
          set level to 2
        replace item ((row * 6) + column) + 1 of grid with level
        set chain to 1
        REPEAT UNTIL row = 6 or level > 3 or item (((row + 1) * 6) + column) + 1 of grid = 0 or not item (((row + 1) * 6) + column) + 1 of grid = level:
          replace item ((row * 6) + column) + 1 of grid with 0
          change row by 1
          change level by 1
          replace item ((row * 6) + column) + 1 of grid with level
          change score by level * chain * 10
          change chain by 1
          play sound "fuse"
          render
          wait 0.12 seconds
        render

  WHEN flag clicked:
    hide
    show variable score
    reset
    render
  WHEN left arrow key pressed:
    IF column > 0 THEN:
      change column by -1
      render
  WHEN right arrow key pressed:
    IF column < 5 THEN:
      change column by 1
      render
  WHEN space key pressed:
    drop core`,

    missile_ballet: `# Missile Ballet — steer with the mouse. Homing rockets constantly turn toward
# you; curve between them so they collide with each other. Every near miss raises
# the tempo. The gold pulse recharges one shield hit.
GLOBAL score
GLOBAL shield
GLOBAL tempo
GLOBAL spawnx
GLOBAL spawny
GLOBAL alive

SPRITE Jet:
  SHAPE triangle 34 #58c7ff
  SOUND hit 120
  WHEN flag clicked:
    show variable score
    show variable shield
    set score to 0
    set shield to 1
    set tempo to 1.5
    set alive to 1
    go to x: 0 y: 0
    show
  WHEN flag clicked:
    FOREVER:
      IF alive = 1 THEN:
        point towards mouse-pointer
        go to x: mouse x y: mouse y
        IF touching Rocket THEN:
          change shield by -1
          play sound "hit"
          wait 0.6 seconds
          IF shield < 0 THEN:
            set alive to 0
            say ("Final dance: " join score) for 3 seconds
            stop all
      wait 0.02 seconds

SPRITE Rocket:
  SHAPE triangle 30 #ff4d6d
  SOUND boom 70
  WHEN flag clicked:
    hide
  WHEN flag clicked:
    FOREVER:
      set spawnx to pick random -220 to 220
      set spawny to 175
      go to x: spawnx y: spawny
      create clone of myself
      wait tempo seconds
      IF tempo > 0.45 THEN:
        change tempo by -0.025
  WHEN I start as a clone:
    show
    point towards Jet
    REPEAT UNTIL touching edge or alive = 0:
      point towards Jet
      turn right pick random -5 to 5 degrees
      move 4 steps
      IF touching Rocket THEN:
        change score by 2
        play sound "boom"
        delete this clone
      wait 0.025 seconds
    delete this clone

SPRITE Pulse:
  SHAPE circle 22 #ffd23f
  WHEN flag clicked:
    hide
    FOREVER:
      wait 8 seconds
      go to x: pick random -180 to 180 y: pick random -120 to 120
      show
      REPEAT UNTIL touching Jet:
        change color effect by 8
        wait 0.04 seconds
      set shield to 1
      change score by 5
      hide`,

    orbit_ward: `# Orbit Ward — Pong turned inside-out. Left/Right rotates the cyan shield around
# the reactor. Keep the spark inside the ring while it smashes the eight red seals.
# Each seal speeds the spark up; clear all eight to win.
GLOBAL angle
GLOBAL ballx
GLOBAL bally
GLOBAL vx
GLOBAL vy
GLOBAL score
GLOBAL lives
GLOBAL sealangle

SPRITE Shield:
  SHAPE rect 58 15 #43e8e0
  WHEN flag clicked:
    set angle to 0
    FOREVER:
      IF key left arrow pressed? THEN:
        change angle by -4
      IF key right arrow pressed? THEN:
        change angle by 4
      go to x: ((sin of angle) * 145) y: ((cos of angle) * 145)
      point in direction (angle + 90)
      wait 0.02 seconds

SPRITE Spark:
  SHAPE circle 18 #fff4a3
  SOUND ping 880
  WHEN flag clicked:
    show variable score
    show variable lives
    set score to 0
    set lives to 3
    set ballx to 0
    set bally to 0
    set vx to 4
    set vy to 6
    show
  WHEN flag clicked:
    FOREVER:
      change ballx by vx
      change bally by vy
      go to x: ballx y: bally
      IF touching Shield THEN:
        set vx to (0 - ((sin of angle) * (7 + (score / 3))))
        set vy to (0 - ((cos of angle) * (7 + (score / 3))))
        play sound "ping"
        wait 0.08 seconds
      IF touching Seal THEN:
        set vx to vx * -1
        set vy to vy * -1
      IF (ballx * ballx) + (bally * bally) > 28500 THEN:
        change lives by -1
        set ballx to 0
        set bally to 0
        set vx to pick random 4 to 7
        set vy to pick random -6 to 6
        IF lives < 1 THEN:
          say "The reactor escaped!" for 3 seconds
          stop all
      IF score > 7 THEN:
        say "Orbit secured!" for 3 seconds
        stop all
      wait 0.02 seconds

SPRITE Seal:
  SHAPE square 28 #f04464
  WHEN flag clicked:
    hide
    set sealangle to 0
    REPEAT 8:
      go to x: ((sin of sealangle) * 82) y: ((cos of sealangle) * 82)
      create clone of myself
      change sealangle by 45
  WHEN I start as a clone:
    show
    FOREVER:
      IF touching Spark THEN:
        change score by 1
        delete this clone
      wait 0.02 seconds`,

    rooftop_relay: `# Rooftop Relay — an endless runner with two moves: Up jumps, Down slides.
# Clear drones and vents, collect batteries, and survive as the city accelerates.
# A battery streak triggers a short neon overdrive worth double points.
GLOBAL score
GLOBAL speed
GLOBAL runy
GLOBAL vy
GLOBAL grounded
GLOBAL sliding
GLOBAL spawnKind
GLOBAL overdrive

SPRITE Runner:
  COSTUME run square 34 #5ee7ff
  COSTUME slide rect 52 20 #5ee7ff
  SOUND jump 620
  WHEN flag clicked:
    show variable score
    set score to 0
    set speed to 6
    set runy to -125
    set vy to 0
    set grounded to 1
    set sliding to 0
    set overdrive to 0
    go to x: -120 y: runy
    show
  WHEN up arrow key pressed:
    IF grounded = 1 THEN:
      set vy to 12
      set grounded to 0
      play sound "jump"
  WHEN flag clicked:
    FOREVER:
      set sliding to 0
      IF key down arrow pressed? and grounded = 1 THEN:
        set sliding to 1
        switch costume to slide
      ELSE:
        switch costume to run
      change vy by -0.75
      change runy by vy
      IF runy < -125 THEN:
        set runy to -125
        set vy to 0
        set grounded to 1
      go to x: -120 y: runy
      IF touching Hazard THEN:
        IF overdrive > 0 THEN:
          change score by 4
          wait 0.2 seconds
        ELSE:
          say ("Relay ended: " join score) for 3 seconds
          stop all
      IF touching Battery THEN:
        change overdrive by 80
        change score by 3
        wait 0.15 seconds
      IF overdrive > 0 THEN:
        change overdrive by -1
        change color effect by 10
      ELSE:
        clear graphic effects
      IF score > 14 THEN:
        set speed to 7
      IF score > 39 THEN:
        set speed to 8
      wait 0.02 seconds

SPRITE Hazard:
  COSTUME vent rect 35 48 #ff5d73
  COSTUME drone rect 58 22 #ff9f43
  WHEN flag clicked:
    hide
    FOREVER:
      set spawnKind to pick random 1 to 2
      IF spawnKind = 1 THEN:
        switch costume to vent
        go to x: 250 y: -122
      ELSE:
        switch costume to drone
        go to x: 250 y: -70
      create clone of myself
      wait pick random 1 to 2 seconds
  WHEN I start as a clone:
    show
    REPEAT UNTIL x position < -250:
      change x by (0 - speed)
      wait 0.02 seconds
    change score by 1
    delete this clone

SPRITE Battery:
  SHAPE circle 20 #ffe66d
  WHEN flag clicked:
    hide
    FOREVER:
      wait pick random 3 to 6 seconds
      go to x: 250 y: pick random -80 to 70
      create clone of myself
  WHEN I start as a clone:
    show
    REPEAT UNTIL x position < -250 or touching Runner:
      turn right 12 degrees
      change x by (0 - speed)
      wait 0.02 seconds
    delete this clone`,

    twinwall: `# Twinwall — Breakout with a paddle on both sides. W/S controls the left wall;
# Up/Down controls the right. The ball can never escape, so the challenge is to
# smash every shifting brick quickly and keep a rally multiplier alive.
GLOBAL score
GLOBAL bricks
GLOBAL rally
GLOBAL bx
GLOBAL by
GLOBAL vx
GLOBAL vy

SPRITE LeftWall:
  SHAPE rect 14 86 #49d6ff
  WHEN flag clicked:
    set ly to 0
    FOREVER:
      IF key w pressed? THEN:
        change ly by 9
      IF key s pressed? THEN:
        change ly by -9
      IF ly > 135 THEN:
        set ly to 135
      IF ly < -135 THEN:
        set ly to -135
      go to x: -220 y: ly

SPRITE RightWall:
  SHAPE rect 14 86 #ffcf4a
  WHEN flag clicked:
    set ry to 0
    FOREVER:
      IF key up arrow pressed? THEN:
        change ry by 9
      IF key down arrow pressed? THEN:
        change ry by -9
      IF ry > 135 THEN:
        set ry to 135
      IF ry < -135 THEN:
        set ry to -135
      go to x: 220 y: ry

SPRITE Comet:
  SHAPE circle 16 #ffffff
  SOUND hit 840
  WHEN flag clicked:
    show variable score
    set score to 0
    set rally to 1
    set bx to 0
    set by to -120
    set vx to 7
    set vy to 5
    go to x: bx y: by
    show
  WHEN flag clicked:
    FOREVER:
      change bx by vx
      change by by vy
      go to x: bx y: by
      IF by > 165 or by < -165 THEN:
        set vy to vy * -1
      IF touching LeftWall THEN:
        set vx to abs of vx
        change rally by 1
        play sound "hit"
      IF touching RightWall THEN:
        set vx to 0 - (abs of vx)
        change rally by 1
        play sound "hit"
      IF touching Shifter THEN:
        set vy to vy * -1
        wait 0.05 seconds
      IF bx < -238 or bx > 238 THEN:
        set bx to 0
        set by to 0
        set rally to 1
        set vx to vx * -1
      IF bricks < 1 THEN:
        say ("Twinwall cleared! " join score) for 3 seconds
        stop all
      wait 0.015 seconds

SPRITE Shifter:
  SHAPE square 28 #a66cff
  WHEN flag clicked:
    hide
    set bricks to 24
    set gy to -90
    REPEAT 6:
      set gx to -60
      REPEAT 4:
        go to x: gx y: gy
        create clone of myself
        change gx by 40
      change gy by 36
  WHEN I start as a clone:
    show
    set drift to pick random -1 to 1
    FOREVER:
      change x by drift
      IF x position > 95 or x position < -95 THEN:
        set drift to drift * -1
      IF touching Comet THEN:
        change score by rally
        change bricks by -1
        delete this clone
      wait 0.03 seconds`,

    turbo_chicane: `# Turbo Chicane — a neon time-trial distilled from grand-prix and motorcycle
# racing. Steer with Left/Right, draft behind blue rivals for boost, avoid red oil,
# and pass checkpoint gates before the clock drains. Up spends boost.
GLOBAL score
GLOBAL roadSpeed
GLOBAL fuel
GLOBAL boost
GLOBAL lane
GLOBAL kind

SPRITE Racer:
  SHAPE triangle 38 #ffe04b
  WHEN flag clicked:
    show variable score
    show variable fuel
    show variable boost
    set score to 0
    set fuel to 100
    set boost to 0
    set roadSpeed to 6
    set lane to 0
    go to x: 0 y: -125
    show
  WHEN flag clicked:
    FOREVER:
      IF key left arrow pressed? THEN:
        change lane by -8
      IF key right arrow pressed? THEN:
        change lane by 8
      IF lane < -145 THEN:
        set lane to -145
      IF lane > 145 THEN:
        set lane to 145
      IF key up arrow pressed? and boost > 0 THEN:
        set roadSpeed to 10
        change boost by -1
      ELSE:
        set roadSpeed to 6 + (score / 20)
      go to x: lane y: -125
      change fuel by -0.04
      IF touching Rival THEN:
        change boost by 2
      IF touching Oil THEN:
        set roadSpeed to 2
        change fuel by -8
        wait 0.35 seconds
      IF fuel < 1 THEN:
        say ("Out of time — " join score) for 3 seconds
        stop all
      wait 0.02 seconds

SPRITE Rival:
  SHAPE triangle 34 #49b6ff
  WHEN flag clicked:
    hide
    FOREVER:
      go to x: pick random -130 to 130 y: 190
      create clone of myself
      wait pick random 1 to 2 seconds
  WHEN I start as a clone:
    show
    REPEAT UNTIL y position < -190:
      change y by (0 - roadSpeed)
      wait 0.02 seconds
    change score by 2
    change fuel by 3
    delete this clone

SPRITE Oil:
  SHAPE circle 30 #ff4267
  WHEN flag clicked:
    hide
    FOREVER:
      wait pick random 2 to 4 seconds
      go to x: pick random -140 to 140 y: 190
      create clone of myself
  WHEN I start as a clone:
    show
    REPEAT UNTIL y position < -190:
      change y by (0 - roadSpeed)
      wait 0.02 seconds
    delete this clone

SPRITE Gate:
  SHAPE rect 330 10 #62ffad
  WHEN flag clicked:
    hide
    FOREVER:
      wait 7 seconds
      go to x: 0 y: 190
      show
      REPEAT UNTIL y position < -190:
        change y by (0 - roadSpeed)
        wait 0.02 seconds
      change score by 5
      change fuel by 18
      hide`,

    abyss_rescue: `# Abyss Rescue — pilot a tiny submarine through a living trench. Space adds
# buoyancy; gravity pulls you down. Rescue gold divers, dodge mines and cave walls,
# and use the current rather than fighting it. Three hull points buy close calls.
GLOBAL score
GLOBAL hull
GLOBAL suby
GLOBAL vy
GLOBAL current
GLOBAL scroll

SPRITE Sub:
  SHAPE ellipse 54 28 #55d9ff
  SOUND sonar 540
  WHEN flag clicked:
    show variable score
    show variable hull
    set score to 0
    set hull to 3
    set suby to 20
    set vy to 0
    set scroll to 4
    go to x: -130 y: suby
    show
  WHEN flag clicked:
    FOREVER:
      IF key space pressed? THEN:
        change vy by 0.65
      change vy by -0.28
      set current to (sin of timer * 90) * 0.08
      change suby by vy + current
      go to x: -130 y: suby
      IF suby > 155 or suby < -155 or touching Mine THEN:
        change hull by -1
        set suby to 20
        set vy to 0
        wait 0.7 seconds
        IF hull < 1 THEN:
          say ("Trench score: " join score) for 3 seconds
          stop all
      IF touching Diver THEN:
        change score by 5
        play sound "sonar"
        wait 0.15 seconds
      IF score > 19 THEN:
        set scroll to 5
      wait 0.02 seconds

SPRITE Mine:
  SHAPE circle 30 #f24f6b
  WHEN flag clicked:
    hide
    FOREVER:
      go to x: 250 y: pick random -145 to 145
      create clone of myself
      wait pick random 1 to 3 seconds
  WHEN I start as a clone:
    show
    REPEAT UNTIL x position < -250:
      turn right 4 degrees
      change x by (0 - scroll)
      wait 0.02 seconds
    change score by 1
    delete this clone

SPRITE Diver:
  SHAPE circle 22 #ffd45a
  WHEN flag clicked:
    hide
    FOREVER:
      wait pick random 4 to 7 seconds
      go to x: 250 y: pick random -120 to 120
      create clone of myself
  WHEN I start as a clone:
    show
    REPEAT UNTIL x position < -250 or touching Sub:
      change ghost effect by 3
      change x by (0 - scroll)
      wait 0.02 seconds
    delete this clone`,

    specter_sweep: `# Specter Sweep — aim with the mouse and click to launch a spirit orb. Orbs
# ricochet off the room edges, so bank shots can catch ghosts behind the pillars.
# Clear twelve before three ghosts reach the ward in the centre.
GLOBAL score
GLOBAL ward
GLOBAL shotx
GLOBAL shoty

SPRITE Hunter:
  SHAPE circle 32 #8be9fd
  WHEN flag clicked:
    show variable score
    show variable ward
    set score to 0
    set ward to 3
    go to x: 0 y: 0
    show
  WHEN flag clicked:
    FOREVER:
      point towards mouse-pointer
      IF score > 11 THEN:
        say "The manor is clear!" for 3 seconds
        stop all
      IF ward < 1 THEN:
        say "The ward has fallen!" for 3 seconds
        stop all
      wait 0.02 seconds
  WHEN flag clicked:
    FOREVER:
      IF mouse down? THEN:
        broadcast "cast"
        wait until not mouse down?
      wait 0.02 seconds

SPRITE Orb:
  SHAPE circle 14 #fff7a8
  SOUND zap 930
  WHEN flag clicked:
    hide
  WHEN I receive "cast":
    go to x: 0 y: 0
    point towards mouse-pointer
    create clone of myself
  WHEN I start as a clone:
    show
    set life to 180
    REPEAT UNTIL life < 1 or touching Ghost:
      move 10 steps
      if on edge bounce
      change life by -1
      wait 0.02 seconds
    IF touching Ghost THEN:
      play sound "zap"
    delete this clone

SPRITE Ghost:
  SHAPE circle 34 #d08cff
  WHEN flag clicked:
    hide
    FOREVER:
      go to x: pick random -220 to 220 y: pick random -160 to 160
      create clone of myself
      wait 1.3 seconds
  WHEN I start as a clone:
    show
    REPEAT UNTIL touching Hunter or touching Orb:
      point towards Hunter
      move 1.8 steps
      change ghost effect by 4
      wait 0.03 seconds
    IF touching Orb THEN:
      change score by 1
    ELSE:
      change ward by -1
    delete this clone`,

    moonlight_heist: `# Moonlight Heist — you are a mouse stealing cheese from a sleeping cat.
# Arrow keys move. Sprint only when the cat looks away: every cheese makes it faster,
# but hiding inside a blue tunnel breaks line-of-sight and resets the chase.
GLOBAL score
GLOBAL alert
GLOBAL px
GLOBAL py
GLOBAL cheeseX
GLOBAL cheeseY

SPRITE Mouse:
  SHAPE circle 25 #e8edf7
  WHEN flag clicked:
    show variable score
    show variable alert
    set score to 0
    set alert to 0
    set px to -180
    set py to -120
    go to x: px y: py
    show
  WHEN flag clicked:
    FOREVER:
      IF key left arrow pressed? THEN:
        change px by -5
      IF key right arrow pressed? THEN:
        change px by 5
      IF key up arrow pressed? THEN:
        change py by 5
      IF key down arrow pressed? THEN:
        change py by -5
      IF px < -225 THEN:
        set px to -225
      IF px > 225 THEN:
        set px to 225
      IF py < -165 THEN:
        set py to -165
      IF py > 165 THEN:
        set py to 165
      go to x: px y: py
      IF touching Tunnel THEN:
        set alert to 0
      ELSE:
        change alert by 0.03
      IF touching Cat THEN:
        say ("Caught with " join score) for 3 seconds
        stop all
      IF touching Cheese THEN:
        change score by 1
        broadcast "new cheese"
        wait 0.2 seconds
      wait 0.02 seconds

SPRITE Cat:
  SHAPE circle 44 #ff9f68
  WHEN flag clicked:
    go to x: 170 y: 110
    show
    FOREVER:
      IF alert > 1 THEN:
        point towards Mouse
        move 1 + (score * 0.12) steps
      ELSE:
        turn right 2 degrees
      wait 0.03 seconds

SPRITE Cheese:
  SHAPE triangle 24 #ffd84a
  WHEN flag clicked:
    go to x: 0 y: 0
    show
  WHEN I receive "new cheese":
    go to x: pick random -200 to 200 y: pick random -140 to 140

SPRITE Tunnel:
  SHAPE rect 74 54 #3978c6
  WHEN flag clicked:
    go to x: -40 y: 100
    show`,

    cloud_court: `# Cloud Court — arcade volleyball above the clouds. A/D moves, W jumps. The
# computer reads the ball and leaps for returns. First to seven, but every long
# rally makes the ball faster and the winning point more valuable.
GLOBAL playerScore
GLOBAL cpuScore
GLOBAL rally
GLOBAL bx
GLOBAL by
GLOBAL vx
GLOBAL vy
GLOBAL py
GLOBAL pvy

SPRITE Player:
  SHAPE circle 46 #4fc3f7
  WHEN flag clicked:
    show variable playerScore
    show variable cpuScore
    set px to -150
    set py to -125
    set pvy to 0
    FOREVER:
      IF key a pressed? THEN:
        change px by -7
      IF key d pressed? THEN:
        change px by 7
      IF key w pressed? and py = -125 THEN:
        set pvy to 11
      change pvy by -0.7
      change py by pvy
      IF py < -125 THEN:
        set py to -125
        set pvy to 0
      IF px < -220 THEN:
        set px to -220
      IF px > -35 THEN:
        set px to -35
      go to x: px y: py
      wait 0.02 seconds

SPRITE CloudBot:
  SHAPE circle 46 #ff7a8a
  WHEN flag clicked:
    set cy to -125
    set cvy to 0
    go to x: 150 y: cy
    FOREVER:
      set target to x position of Ball
      IF target > x position + 5 THEN:
        change x by 5
      IF target < x position - 5 THEN:
        change x by -5
      IF x position < 35 THEN:
        set x to 35
      IF x position > 220 THEN:
        set x to 220
      IF y position of Ball > -45 and cy = -125 THEN:
        set cvy to 9
      change cvy by -0.7
      change cy by cvy
      IF cy < -125 THEN:
        set cy to -125
        set cvy to 0
      set y to cy
      wait 0.02 seconds

SPRITE Ball:
  SHAPE circle 24 #fff06a
  SOUND bump 760
  WHEN flag clicked:
    set playerScore to 0
    set cpuScore to 0
    set rally to 1
    set bx to 0
    set by to 80
    set vx to -4
    set vy to 4
    FOREVER:
      change vy by -0.32
      change bx by vx
      change by by vy
      go to x: bx y: by
      IF touching Player THEN:
        set vx to (abs of vx) + 0.2
        set vy to 8
        change rally by 1
        play sound "bump"
        wait 0.06 seconds
      IF touching CloudBot THEN:
        set vx to 0 - ((abs of vx) + 0.2)
        set vy to 8
        change rally by 1
        play sound "bump"
        wait 0.06 seconds
      IF touching Net THEN:
        set vx to vx * -1
        wait 0.06 seconds
      IF by < -165 THEN:
        IF bx > 0 THEN:
          change playerScore by rally
          set vx to -4
        ELSE:
          change cpuScore by rally
          set vx to 4
        set rally to 1
        set bx to 0
        set by to 100
        set vy to 3
      IF playerScore > 6 or cpuScore > 6 THEN:
        say (("Final " join playerScore) join (" - " join cpuScore)) for 3 seconds
        stop all
      wait 0.02 seconds

SPRITE Net:
  SHAPE rect 12 110 #ffffff
  WHEN flag clicked:
    go to x: 0 y: -115
    show`,

    ember_dojo: `# Ember Dojo — a tiny shogun boss fight. Left/Right moves, Up dashes, Space
# swings the moon blade. Deflect the dragon's fireballs during a swing to damage it;
# a mistimed hit costs one heart. The dragon enrages below half health.
GLOBAL hearts
GLOBAL dragonHP
GLOBAL heroX
GLOBAL swinging
GLOBAL fireSpeed

SPRITE Ronin:
  SHAPE rect 30 48 #d9e5ff
  WHEN flag clicked:
    show variable hearts
    show variable dragonHP
    set hearts to 4
    set dragonHP to 12
    set heroX to -120
    set swinging to 0
    set fireSpeed to 5
    go to x: heroX y: -125
    show
  WHEN flag clicked:
    FOREVER:
      IF key left arrow pressed? THEN:
        change heroX by -6
      IF key right arrow pressed? THEN:
        change heroX by 6
      IF key up arrow pressed? THEN:
        change heroX by 12
      IF heroX < -220 THEN:
        set heroX to -220
      IF heroX > 180 THEN:
        set heroX to 180
      go to x: heroX y: -125
      IF dragonHP < 7 THEN:
        set fireSpeed to 8
      IF dragonHP < 1 THEN:
        say "The Ember Dragon bows." for 3 seconds
        stop all
      IF hearts < 1 THEN:
        say "The dojo goes dark." for 3 seconds
        stop all
      wait 0.02 seconds
  WHEN space key pressed:
    set swinging to 1
    broadcast "swing"
    wait 0.22 seconds
    set swinging to 0

SPRITE Blade:
  SHAPE rect 58 12 #aef6ff
  WHEN flag clicked:
    hide
  WHEN I receive "swing":
    go to x: heroX + 28 y: -105
    show
    turn right 100 degrees
    wait 0.2 seconds
    hide

SPRITE Dragon:
  SHAPE triangle 75 #e64b3c
  WHEN flag clicked:
    go to x: 145 y: 90
    show
    FOREVER:
      glide 1 secs to x: pick random 80 to 190 y: pick random 40 to 130
      broadcast "fire"
      wait 0.7 seconds

SPRITE Fireball:
  SHAPE circle 24 #ff9d24
  SOUND clash 820
  WHEN flag clicked:
    hide
  WHEN I receive "fire":
    go to Dragon
    point towards Ronin
    create clone of myself
  WHEN I start as a clone:
    show
    REPEAT UNTIL touching Ronin or touching edge or touching Blade:
      move fireSpeed steps
      wait 0.02 seconds
    IF touching Blade THEN:
      change dragonHP by -1
      play sound "clash"
    ELSE:
      IF touching Ronin THEN:
        change hearts by -1
    delete this clone`,

    lockstep_lagoon: `# Lockstep Lagoon — race a hydrofoil through tidal locks. Left/Right changes
# channels; Up burns boost. Blue gates award time, red buoys cost hull. Enter a lift
# lock while its light is green to ride the surge and multiply the next gate score.
GLOBAL score
GLOBAL hull
GLOBAL timeLeft
GLOBAL lane
GLOBAL speed
GLOBAL surge
GLOBAL gateY

SPRITE Foil:
  SHAPE triangle 42 #38d9ff
  COSTUME surge triangle 50 #ffe66d
  SOUND splash 260
  WHEN flag clicked:
    show variable score
    show variable hull
    show variable timeLeft
    set score to 0
    set hull to 3
    set timeLeft to 45
    set lane to 0
    set speed to 5
    set surge to 1
    point in direction 0
    go to x: 0 y: -125
    show
  WHEN flag clicked:
    FOREVER:
      IF key left arrow pressed? THEN:
        change lane by -1
        wait 0.12 seconds
      IF key right arrow pressed? THEN:
        change lane by 1
        wait 0.12 seconds
      IF lane < -1 THEN:
        set lane to -1
      IF lane > 1 THEN:
        set lane to 1
      glide 0.08 secs to x: lane * 105 y: -125
      IF key up arrow pressed? and timeLeft > 1 THEN:
        set speed to 8
        switch costume to surge
        change timeLeft by -0.08
      ELSE:
        set speed to 5
        switch costume to costume1
      IF hull < 1 or timeLeft < 1 THEN:
        say ("Harbour score: " join score) for 3 seconds
        stop all
      wait 0.02 seconds
  WHEN flag clicked:
    FOREVER:
      wait 1 seconds
      change timeLeft by -1

SPRITE LockGate:
  SHAPE rect 56 18 #4de39a
  COSTUME buoy circle 34 #ff5263
  SOUND lock 720
  WHEN flag clicked:
    hide
    FOREVER:
      set gateY to 210
      set x to pick random -1 to 1 * 105
      IF pick random 1 to 4 = 1 THEN:
        switch costume to buoy
      ELSE:
        switch costume to costume1
      go to x: x position y: gateY
      show
      REPEAT UNTIL y position < -190:
        change y by 0 - speed
        IF touching Foil THEN:
          IF costume name = buoy THEN:
            change hull by -1
            play sound "splash"
          ELSE:
            change score by 5 * surge
            set surge to 1
            change timeLeft by 2
            play sound "lock"
          hide
          set y to -220
        wait 0.02 seconds
      hide
      wait 0.3 seconds

SPRITE LiftLock:
  SHAPE rect 72 24 #9c7cff
  WHEN flag clicked:
    hide
    FOREVER:
      wait pick random 5 to 9 seconds
      go to x: pick random -1 to 1 * 105 y: 210
      show
      REPEAT UNTIL y position < -190:
        change y by 0 - speed
        IF touching Foil THEN:
          set surge to 3
          change timeLeft by 4
          hide
          set y to -220
        wait 0.02 seconds
      hide`,

    rink_riot: `# Rink Riot — compact ice hockey with slippery momentum. Arrows skate, Space
# slap-shoots when the puck is close. Bank shots off the boards, beat the moving keeper,
# and chain quick goals before the shot clock expires.
GLOBAL goals
GLOBAL clock
GLOBAL skaterX
GLOBAL skaterY
GLOBAL vx
GLOBAL vy
GLOBAL puckLive
GLOBAL keeperY

SPRITE Skater:
  SHAPE circle 38 #55aaff
  WHEN flag clicked:
    show variable goals
    show variable clock
    set goals to 0
    set clock to 30
    set skaterX to -150
    set skaterY to 0
    set vx to 0
    set vy to 0
    go to x: skaterX y: skaterY
    show
  WHEN flag clicked:
    FOREVER:
      IF key left arrow pressed? THEN:
        change vx by -0.7
      IF key right arrow pressed? THEN:
        change vx by 0.7
      IF key up arrow pressed? THEN:
        change vy by 0.7
      IF key down arrow pressed? THEN:
        change vy by -0.7
      set vx to vx * 0.94
      set vy to vy * 0.94
      change skaterX by vx
      change skaterY by vy
      IF skaterX < -220 THEN:
        set skaterX to -220
      IF skaterX > 180 THEN:
        set skaterX to 180
      IF skaterY < -150 THEN:
        set skaterY to -150
      IF skaterY > 150 THEN:
        set skaterY to 150
      go to x: skaterX y: skaterY
      IF clock < 1 THEN:
        say ("Rink Riot goals: " join goals) for 3 seconds
        stop all
      wait 0.02 seconds
  WHEN flag clicked:
    FOREVER:
      wait 1 seconds
      change clock by -1

SPRITE Puck:
  SHAPE circle 18 #202936
  SOUND goal 880
  WHEN flag clicked:
    set puckLive to 0
    go to x: -30 y: 0
    show
  WHEN flag clicked:
    FOREVER:
      IF puckLive = 0 and touching Skater and key space pressed? THEN:
        set puckLive to 1
        point towards Goal
        turn right pick random -18 to 18 degrees
      IF puckLive = 1 THEN:
        move 11 steps
        IF y position > 165 or y position < -165 THEN:
          if on edge bounce
        IF touching Keeper THEN:
          point in direction 180 - direction
          move 14 steps
        IF touching Goal THEN:
          change goals by 1
          change clock by 4
          play sound "goal"
          set puckLive to 0
          go to x: -30 y: pick random -80 to 80
        IF x position < -235 THEN:
          set puckLive to 0
          go to x: -30 y: 0
      wait 0.02 seconds

SPRITE Keeper:
  SHAPE rect 18 70 #ff5b6e
  WHEN flag clicked:
    set keeperY to 0
    go to x: 185 y: keeperY
    show
    FOREVER:
      change keeperY by pick random -12 to 12
      IF keeperY > 115 THEN:
        set keeperY to 115
      IF keeperY < -115 THEN:
        set keeperY to -115
      glide 0.12 secs to x: 185 y: keeperY

SPRITE Goal:
  SHAPE rect 12 120 #a8ffdf
  WHEN flag clicked:
    go to x: 220 y: 0
    show`,

    rim_reactor: `# Rim Reactor — an arcade basketball laboratory. Hold Space to charge, release
# to launch. Left/Right changes the angle while airborne. The hoop slides faster after
# every score; swishes build a reactor multiplier, rim hits reset it.
GLOBAL score
GLOBAL streak
GLOBAL charge
GLOBAL ballX
GLOBAL ballY
GLOBAL ballVX
GLOBAL ballVY
GLOBAL flying
GLOBAL hoopX

SPRITE Ball:
  SHAPE circle 28 #ff8c32
  SOUND swish 900
  SOUND clang 190
  WHEN flag clicked:
    show variable score
    show variable streak
    set score to 0
    set streak to 1
    set charge to 0
    set flying to 0
    set ballX to -150
    set ballY to -125
    go to x: ballX y: ballY
    show
  WHEN flag clicked:
    FOREVER:
      IF flying = 0 THEN:
        IF key space pressed? THEN:
          change charge by 0.7
          IF charge > 18 THEN:
            set charge to 18
        ELSE:
          IF charge > 2 THEN:
            set flying to 1
            set ballVX to charge * 0.55
            set ballVY to charge
            set charge to 0
      ELSE:
        IF key left arrow pressed? THEN:
          change ballVX by -0.08
        IF key right arrow pressed? THEN:
          change ballVX by 0.08
        change ballVY by -0.55
        change ballX by ballVX
        change ballY by ballVY
        go to x: ballX y: ballY
        turn right 12 degrees
        IF touching Rim THEN:
          IF ballVY < 0 and ballY > 35 THEN:
            change score by 2 * streak
            change streak by 1
            play sound "swish"
            set flying to 0
            set ballX to -150
            set ballY to -125
            go to x: ballX y: ballY
          ELSE:
            set streak to 1
            set ballVX to 0 - ballVX
            set ballVY to abs of ballVY * 0.65
            play sound "clang"
        IF ballY < -170 or ballX > 245 THEN:
          set streak to 1
          set flying to 0
          set ballX to -150
          set ballY to -125
          go to x: ballX y: ballY
      wait 0.02 seconds

SPRITE Rim:
  SHAPE rect 68 12 #ff476f
  WHEN flag clicked:
    set hoopX to 110
    go to x: hoopX y: 55
    show
    FOREVER:
      change hoopX by 3 + score / 8
      IF hoopX > 190 THEN:
        set hoopX to 40
      go to x: hoopX y: 55
      wait 0.03 seconds

SPRITE ChargeMeter:
  SHAPE rect 12 100 #55e6a5
  WHEN flag clicked:
    go to x: -220 y: -80
    show
    FOREVER:
      set size to 20 + charge * 4 %
      wait 0.03 seconds`,

    comet_cup: `# Comet Cup — tiny tactical football with momentum instead of glued-to-foot dribbling.
# Arrows move your striker. Tap Space near the ball to shoot; your movement bends the shot.
# Beat the roaming keeper before the match clock ends. Fast goals grow the crowd multiplier.
GLOBAL goals
GLOBAL matchTime
GLOBAL strikerX
GLOBAL strikerY
GLOBAL runX
GLOBAL runY
GLOBAL ballSpeed
GLOBAL crowd
GLOBAL keeperY

SPRITE Striker:
  SHAPE circle 36 #43c7ff
  WHEN flag clicked:
    show variable goals
    show variable matchTime
    show variable crowd
    set goals to 0
    set matchTime to 50
    set crowd to 1
    set strikerX to -150
    set strikerY to 0
    set runX to 0
    set runY to 0
    go to x: strikerX y: strikerY
    show
  WHEN flag clicked:
    FOREVER:
      set runX to 0
      set runY to 0
      IF key left arrow pressed? THEN:
        set runX to -4
      IF key right arrow pressed? THEN:
        set runX to 4
      IF key up arrow pressed? THEN:
        set runY to 4
      IF key down arrow pressed? THEN:
        set runY to -4
      change strikerX by runX
      change strikerY by runY
      IF strikerX < -220 THEN:
        set strikerX to -220
      IF strikerX > 175 THEN:
        set strikerX to 175
      IF strikerY < -155 THEN:
        set strikerY to -155
      IF strikerY > 155 THEN:
        set strikerY to 155
      go to x: strikerX y: strikerY
      IF matchTime < 1 THEN:
        say ("Comet Cup goals: " join goals) for 3 seconds
        stop all
      wait 0.02 seconds
  WHEN flag clicked:
    FOREVER:
      wait 1 seconds
      change matchTime by -1

SPRITE Ball:
  SHAPE circle 19 #fff4d6
  SOUND kick 520
  SOUND goal 920
  WHEN flag clicked:
    set ballSpeed to 0
    go to x: -50 y: 0
    point in direction 90
    show
  WHEN flag clicked:
    FOREVER:
      IF touching Striker and key space pressed? and ballSpeed < 2 THEN:
        point towards CometGoal
        turn right runY * -3 degrees
        set ballSpeed to 14
        play sound "kick"
      IF ballSpeed > 0.2 THEN:
        move ballSpeed steps
        set ballSpeed to ballSpeed * 0.97
      ELSE:
        set ballSpeed to 0
      IF y position > 165 or y position < -165 THEN:
        if on edge bounce
      IF touching Keeper THEN:
        point in direction 180 - direction
        set ballSpeed to 9
        set crowd to 1
      IF touching CometGoal THEN:
        change goals by crowd
        change crowd by 1
        change matchTime by 5
        play sound "goal"
        set ballSpeed to 0
        go to x: -50 y: pick random -80 to 80
      IF x position < -235 THEN:
        set ballSpeed to 0
        set crowd to 1
        go to x: -50 y: 0
      wait 0.02 seconds

SPRITE Keeper:
  SHAPE rect 18 74 #ff4f72
  WHEN flag clicked:
    set keeperY to 0
    go to x: 182 y: keeperY
    show
    FOREVER:
      IF Ball y position > keeperY THEN:
        change keeperY by 3 + goals / 3
      ELSE:
        change keeperY by 0 - 3 - goals / 3
      IF keeperY > 118 THEN:
        set keeperY to 118
      IF keeperY < -118 THEN:
        set keeperY to -118
      go to x: 182 y: keeperY
      wait 0.03 seconds

SPRITE CometGoal:
  SHAPE rect 12 126 #7dffb2
  WHEN flag clicked:
    go to x: 220 y: 0
    show`,

    trench_signal: `# Trench Signal — pilot a research submarine through a living deep-sea trench.
# Up adds buoyancy, Down dives, Left/Right steers. Recover three signal pearls, but sonar
# pulses also wake the hunter mine. Space fires a short pulse that shoves the mine away.
GLOBAL pearls
GLOBAL hull
GLOBAL oxygen
GLOBAL subX
GLOBAL subY
GLOBAL rise
GLOBAL current
GLOBAL mineSpeed
GLOBAL pulseOn

SPRITE Sub:
  SHAPE rect 62 28 #ffd34e
  COSTUME dive rect 62 28 #ff8b3d
  SOUND sonar 680
  WHEN flag clicked:
    show variable pearls
    show variable hull
    show variable oxygen
    set pearls to 0
    set hull to 3
    set oxygen to 40
    set subX to -150
    set subY to 60
    set rise to 0
    set current to 0
    set mineSpeed to 2
    set pulseOn to 0
    go to x: subX y: subY
    show
  WHEN flag clicked:
    FOREVER:
      change rise by 0.08
      IF key up arrow pressed? THEN:
        change rise by 0.35
      IF key down arrow pressed? THEN:
        change rise by -0.48
        switch costume to dive
      ELSE:
        switch costume to costume1
      set rise to rise * 0.94
      IF key left arrow pressed? THEN:
        change subX by -4
      IF key right arrow pressed? THEN:
        change subX by 4
      set current to sin of oxygen * 1.2
      change subX by current
      change subY by rise
      IF subX < -220 THEN:
        set subX to -220
      IF subX > 220 THEN:
        set subX to 220
      IF subY > 155 THEN:
        set subY to 155
        set rise to -1
      IF subY < -155 THEN:
        set subY to -155
        set rise to 2
        change hull by -1
      go to x: subX y: subY
      IF pearls > 2 THEN:
        say "Signal restored — ascent complete!" for 3 seconds
        stop all
      IF hull < 1 or oxygen < 1 THEN:
        say "The trench keeps its secret." for 3 seconds
        stop all
      wait 0.02 seconds
  WHEN flag clicked:
    FOREVER:
      wait 1 seconds
      change oxygen by -1
  WHEN space key pressed:
    set pulseOn to 1
    play sound "sonar"
    broadcast "sonar pulse"
    wait 0.35 seconds
    set pulseOn to 0

SPRITE SignalPearl:
  SHAPE circle 24 #64f5ff
  SOUND found 980
  WHEN flag clicked:
    go to x: pick random -170 to 190 y: pick random -125 to 125
    show
    FOREVER:
      change y by sin of oxygen * 0.4
      IF touching Sub THEN:
        change pearls by 1
        change oxygen by 7
        change mineSpeed by 0.7
        play sound "found"
        go to x: pick random -190 to 190 y: pick random -130 to 130
      wait 0.03 seconds

SPRITE HunterMine:
  SHAPE circle 34 #f34f65
  WHEN flag clicked:
    go to x: 190 y: -110
    show
    FOREVER:
      point towards Sub
      move mineSpeed steps
      IF touching Sub THEN:
        change hull by -1
        go to x: pick random 130 to 210 y: pick random -130 to 130
        wait 0.8 seconds
      IF touching SonarRing THEN:
        point in direction 180 - direction
        move 35 steps
      wait 0.03 seconds

SPRITE SonarRing:
  SHAPE circle 28 #9c8cff
  WHEN flag clicked:
    hide
  WHEN I receive "sonar pulse":
    go to Sub
    set size to 20 %
    show
    REPEAT 8:
      change size by 22
      change ghost effect by 10
      wait 0.03 seconds
    clear graphic effects
    hide`,

    whisker_switch: `# Whisker Switch — a stealthy cat-and-mice chase across a moonlit pantry.
# Arrows guide Pip the mouse. Cheese raises score and scent; Space spends one cheese on
# a silent dash. Duck into either mouse hole to break the cat's lock before it pounces.
GLOBAL cheese
GLOBAL lives
GLOBAL scent
GLOBAL mouseX
GLOBAL mouseY
GLOBAL catSpeed
GLOBAL hidden

SPRITE Pip:
  SHAPE circle 30 #d7d9e8
  COSTUME dash circle 26 #fff3a6
  SOUND squeak 760
  WHEN flag clicked:
    show variable cheese
    show variable lives
    show variable scent
    set cheese to 0
    set lives to 3
    set scent to 0
    set catSpeed to 2
    set hidden to 0
    set mouseX to -160
    set mouseY to -100
    go to x: mouseX y: mouseY
    show
  WHEN flag clicked:
    FOREVER:
      IF key left arrow pressed? THEN:
        change mouseX by -4
        change scent by 0.12
      IF key right arrow pressed? THEN:
        change mouseX by 4
        change scent by 0.12
      IF key up arrow pressed? THEN:
        change mouseY by 4
        change scent by 0.12
      IF key down arrow pressed? THEN:
        change mouseY by -4
        change scent by 0.12
      IF key space pressed? and cheese > 0 THEN:
        switch costume to dash
        change mouseX by 8
        change cheese by -1
        set scent to 0
      ELSE:
        switch costume to costume1
      IF mouseX < -220 THEN:
        set mouseX to -220
      IF mouseX > 220 THEN:
        set mouseX to 220
      IF mouseY < -155 THEN:
        set mouseY to -155
      IF mouseY > 155 THEN:
        set mouseY to 155
      go to x: mouseX y: mouseY
      set hidden to 0
      IF touching LeftHole or touching RightHole THEN:
        set hidden to 1
        set scent to 0
      IF scent > 0 THEN:
        change scent by -0.03
      IF lives < 1 THEN:
        say ("Pantry score: " join cheese) for 3 seconds
        stop all
      wait 0.02 seconds

SPRITE CheeseMoon:
  SHAPE triangle 32 #ffd85a
  SOUND crumb 1040
  WHEN flag clicked:
    go to x: pick random -180 to 180 y: pick random -130 to 130
    show
    FOREVER:
      turn right 4 degrees
      IF touching Pip THEN:
        change cheese by 2
        change scent by 3
        change catSpeed by 0.18
        play sound "crumb"
        go to x: pick random -190 to 190 y: pick random -135 to 135
      wait 0.03 seconds

SPRITE Marmalade:
  SHAPE triangle 52 #ff854f
  SOUND pounce 180
  WHEN flag clicked:
    go to x: 170 y: 110
    show
    FOREVER:
      IF hidden = 0 and scent > 0.8 THEN:
        point towards Pip
        move catSpeed + scent / 5 steps
      ELSE:
        turn right pick random -20 to 20 degrees
        move 1.5 steps
        if on edge bounce
      IF touching Pip and hidden = 0 THEN:
        change lives by -1
        set scent to 0
        set mouseX to -160
        set mouseY to -100
        go to x: 170 y: 110
        play sound "pounce"
        wait 1 seconds
      wait 0.03 seconds

SPRITE LeftHole:
  SHAPE circle 48 #403651
  WHEN flag clicked:
    go to x: -205 y: 125
    show

SPRITE RightHole:
  SHAPE circle 48 #403651
  WHEN flag clicked:
    go to x: 205 y: -125
    show`,

    spiral_circuit: `# Spiral Circuit — race down the inside of a five-lane energy tube.
# Left/Right rotates the tube under you. Catch yellow cells to charge boost, then tap
# Space to phase through hazards. Hit a magenta launch gate while boosting for a jackpot.
GLOBAL score
GLOBAL lives
GLOBAL lane
GLOBAL speed
GLOBAL charge
GLOBAL boosting
GLOBAL obstacleLane
GLOBAL obstacleY
GLOBAL obstacleKind

SPRITE Runner:
  SHAPE triangle 38 #74f7ff
  COSTUME phase triangle 46 #fff06a
  SOUND boost 760
  WHEN flag clicked:
    show variable score
    show variable lives
    show variable charge
    set score to 0
    set lives to 3
    set lane to 0
    set speed to 5
    set charge to 0
    set boosting to 0
    go to x: 0 y: -125
    show
  WHEN flag clicked:
    FOREVER:
      IF key left arrow pressed? THEN:
        change lane by -1
        wait 0.1 seconds
      IF key right arrow pressed? THEN:
        change lane by 1
        wait 0.1 seconds
      IF lane < -2 THEN:
        set lane to 2
      IF lane > 2 THEN:
        set lane to -2
      glide 0.07 secs to x: lane * 82 y: -125
      IF boosting = 1 THEN:
        switch costume to phase
        set speed to 9
        change charge by -0.22
        change score by 0.2
        IF charge < 1 THEN:
          set boosting to 0
      ELSE:
        switch costume to costume1
        set speed to 5
      IF lives < 1 THEN:
        say ("Spiral score: " join score) for 3 seconds
        stop all
      wait 0.02 seconds
  WHEN space key pressed:
    IF charge > 4 and boosting = 0 THEN:
      set boosting to 1
      play sound "boost"

SPRITE TubeHazard:
  SHAPE rect 58 28 #ff4d6d
  COSTUME cell circle 26 #ffe85c
  COSTUME gate rect 66 16 #ed63ff
  SOUND hit 170
  SOUND jackpot 1020
  WHEN flag clicked:
    hide
    FOREVER:
      set obstacleLane to pick random -2 to 2
      set obstacleY to 190
      set obstacleKind to pick random 1 to 7
      IF obstacleKind < 5 THEN:
        switch costume to costume1
      ELSE:
        IF obstacleKind < 7 THEN:
          switch costume to cell
        ELSE:
          switch costume to gate
      go to x: obstacleLane * 82 y: obstacleY
      show
      REPEAT UNTIL y position < -190:
        change y by 0 - speed
        turn right 5 degrees
        IF touching Runner THEN:
          IF obstacleKind < 5 THEN:
            IF boosting = 0 THEN:
              change lives by -1
              play sound "hit"
            ELSE:
              change score by 3
          ELSE:
            IF obstacleKind < 7 THEN:
              change charge by 4
              change score by 2
            ELSE:
              IF boosting = 1 THEN:
                change score by 25
                change charge by 3
                play sound "jackpot"
              ELSE:
                change score by 5
          hide
          set y to -220
        wait 0.02 seconds
      hide
      change score by 1
      wait 0.15 seconds

SPRITE TubeCore:
  SHAPE circle 90 #342a66
  WHEN flag clicked:
    go to x: 0 y: 0
    set ghost effect to 70
    show
    FOREVER:
      turn right speed degrees
      wait 0.03 seconds`,

    lilyway_rescue: `# Lilyway Rescue — cross traffic, then ride drifting lily pads across the river.
# Arrow keys hop one square at a time. Cars cost a heart; water is safe only while a
# lily is beneath you. Reach the moon bank repeatedly as traffic accelerates.
GLOBAL crossings
GLOBAL hearts
GLOBAL frogX
GLOBAL frogY
GLOBAL traffic
GLOBAL riding

SPRITE Juniper:
  SHAPE circle 34 #67e35f
  SOUND hop 620
  SOUND splash 190
  WHEN flag clicked:
    show variable crossings
    show variable hearts
    set crossings to 0
    set hearts to 3
    set traffic to 4
    set frogX to 0
    set frogY to -150
    set riding to 0
    go to x: frogX y: frogY
    show
  WHEN left arrow key pressed:
    change frogX by -45
    play sound "hop"
  WHEN right arrow key pressed:
    change frogX by 45
    play sound "hop"
  WHEN up arrow key pressed:
    change frogY by 45
    play sound "hop"
  WHEN down arrow key pressed:
    change frogY by -45
    play sound "hop"
  WHEN flag clicked:
    FOREVER:
      IF frogX < -215 THEN:
        set frogX to -215
      IF frogX > 215 THEN:
        set frogX to 215
      IF frogY < -150 THEN:
        set frogY to -150
      go to x: frogX y: frogY
      IF frogY > -70 and frogY < 45 THEN:
        IF touching CarA or touching CarB THEN:
          change hearts by -1
          broadcast "frog reset"
      IF frogY > 45 and frogY < 140 THEN:
        set riding to 0
        IF touching LilyA or touching LilyB THEN:
          set riding to 1
        IF riding = 0 THEN:
          change hearts by -1
          play sound "splash"
          broadcast "frog reset"
      IF frogY > 145 THEN:
        change crossings by 1
        change traffic by 0.7
        broadcast "frog reset"
      IF hearts < 1 THEN:
        say ("Moon-bank crossings: " join crossings) for 3 seconds
        stop all
      wait 0.03 seconds
  WHEN I receive "frog reset":
    set frogX to 0
    set frogY to -150
    go to x: frogX y: frogY
    wait 0.45 seconds

SPRITE CarA:
  SHAPE rect 62 28 #ff556f
  WHEN flag clicked:
    go to x: -230 y: -25
    show
    FOREVER:
      change x by traffic
      IF x position > 240 THEN:
        set x to -240
      wait 0.02 seconds

SPRITE CarB:
  SHAPE rect 72 30 #ffc34d
  WHEN flag clicked:
    go to x: 230 y: -65
    show
    FOREVER:
      change x by 0 - traffic - 1
      IF x position < -240 THEN:
        set x to 240
      wait 0.02 seconds

SPRITE LilyA:
  SHAPE circle 58 #43b86a
  WHEN flag clicked:
    go to x: -180 y: 75
    show
    FOREVER:
      change x by 2.4
      IF touching Juniper THEN:
        change frogX by 2.4
      IF x position > 240 THEN:
        set x to -240
      wait 0.02 seconds

SPRITE LilyB:
  SHAPE circle 64 #328f62
  WHEN flag clicked:
    go to x: 180 y: 120
    show
    FOREVER:
      change x by -2
      IF touching Juniper THEN:
        change frogX by -2
      IF x position < -240 THEN:
        set x to 240
      wait 0.02 seconds`,

    rotor_rogue: `# Rotor Rogue — balance a gyro-bike along a road suspended over the clouds.
# Up accelerates, Down brakes, Left/Right counter-steer against the changing crosswind.
# Space jumps barriers. Land with the bike level to bank airtime and refill boost fuel.
GLOBAL score
GLOBAL lives
GLOBAL speed
GLOBAL tilt
GLOBAL wind
GLOBAL bikeY
GLOBAL lift
GLOBAL airborne
GLOBAL fuel

SPRITE GyroBike:
  SHAPE rect 58 24 #43e6c7
  COSTUME jump rect 58 24 #ffe56b
  SOUND rev 440
  SOUND crash 150
  WHEN flag clicked:
    show variable score
    show variable lives
    show variable speed
    show variable fuel
    set score to 0
    set lives to 3
    set speed to 4
    set tilt to 0
    set wind to 0
    set bikeY to -120
    set lift to 0
    set airborne to 0
    set fuel to 12
    go to x: 0 y: bikeY
    show
  WHEN flag clicked:
    FOREVER:
      IF key up arrow pressed? and fuel > 0 THEN:
        change speed by 0.08
        change fuel by -0.025
      IF key down arrow pressed? THEN:
        change speed by -0.12
      IF speed < 3 THEN:
        set speed to 3
      IF speed > 11 THEN:
        set speed to 11
      set wind to sin of score * speed / 8
      change tilt by wind
      IF key left arrow pressed? THEN:
        change tilt by -1.8
      IF key right arrow pressed? THEN:
        change tilt by 1.8
      set tilt to tilt * 0.96
      point in direction 90 + tilt
      IF airborne = 1 THEN:
        switch costume to jump
        change lift by -0.7
        change bikeY by lift
        change score by 0.12
        IF bikeY < -120 THEN:
          set bikeY to -120
          set airborne to 0
          set lift to 0
          IF abs of tilt < 14 THEN:
            change score by 8
            change fuel by 3
          ELSE:
            change lives by -1
            set tilt to 0
      ELSE:
        switch costume to costume1
      go to x: 0 y: bikeY
      IF abs of tilt > 48 THEN:
        change lives by -1
        set tilt to 0
        set speed to 4
        play sound "crash"
        wait 0.7 seconds
      change score by speed / 180
      IF lives < 1 THEN:
        say ("Rotor distance: " join score) for 3 seconds
        stop all
      wait 0.02 seconds
  WHEN space key pressed:
    IF airborne = 0 THEN:
      set airborne to 1
      set lift to 11
      play sound "rev"

SPRITE Barrier:
  SHAPE rect 52 42 #fb4968
  WHEN flag clicked:
    hide
    FOREVER:
      go to x: 220 y: -120
      show
      REPEAT UNTIL x position < -240:
        change x by 0 - speed
        IF touching GyroBike and airborne = 0 THEN:
          change lives by -1
          set tilt to 24
          hide
          set x to -250
        wait 0.02 seconds
      hide
      wait pick random 1 to 3 seconds

SPRITE SkyRoad:
  SHAPE rect 420 16 #6d70a8
  WHEN flag clicked:
    go to x: 0 y: -145
    show
    FOREVER:
      change color effect by speed
      wait 0.04 seconds`
};

export default gameExamples;
