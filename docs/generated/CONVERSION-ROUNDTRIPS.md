# Conversion round trips

Generated 2026-10-07T06:35:35.127Z; 399 inputs. “Preserved” means the measured structure and Arcade image pixels match and no converter reported an unsupported element. It does not prove program behavior. “Source invalid” is a re-export MakeCode rejects whose original MakeCode itself rejects too (a documentation snippet with an undeclared name or a missing package).

Source commit: bfecedb74ef5221c6516b58aa2906de6011e7ce9; dirty: false. Corpus declared commit: 19a52f6d65ab9e8adc90bb19a6e3ea04544a1339 (not independently verified).

Scratch-format SB3 checks do not establish TurboWarp-specific compatibility. No runtime or behavioral equivalence is measured here.

## Gap ranking by affected projects

| projects | occurrences | family |
|---:|---:|---|
| 398 | 398 | binary assets absent from plain text |
| 15 | 15 | lost opcode: operator_lt |
| 12 | 12 | lost opcode: operator_gt |
| 10 | 10 | import: scene.setBackgroundImage() with art we could not read |
| 10 | 10 | lost opcode: data_setvariableto |
| 10 | 10 | lost opcode: operator_equals |
| 10 | 10 | lost opcode: operator_subtract |
| 7 | 7 | import: scene.setTileMap() |
| 7 | 7 | import: tiles.setTilemap() requires a readable literal tile map with wall layer and tile scale |
| 7 | 7 | lost opcode: looks_show |
| 6 | 6 | import: sprites.destroy() effect and duration — not rendered |
| 6 | 6 | lost opcode: motion_changexby |
| 5 | 5 | import: music.play() — Arcade's music has no stage equivalent |
| 5 | 5 | import: sprites.createProjectile() |
| 5 | 5 | lost opcode: arrays_createEmpty |
| 5 | 5 | lost opcode: motion_gotoxy |
| 5 | 5 | lost opcode: operator_multiply |
| 4 | 4 | import: effects.starField.startScreenEffect() |
| 4 | 4 | import: game.ask() as a value |
| 4 | 4 | import: music.playSound() |
| 4 | 4 | import: scene.setTile() |
| 4 | 4 | lost opcode: arcade_getLocal |
| 4 | 4 | lost opcode: arrays_create1D |
| 4 | 4 | lost opcode: data_changevariableby |
| 4 | 4 | lost opcode: motion_sety |
| 4 | 4 | lost opcode: operator_divide |
| 4 | 4 | lost opcode: operator_not |
| 4 | 4 | lost opcode: operator_random |
| 3 | 3 | import: bundles.wrap1() |
| 3 | 3 | import: bundles.wrap2() |
| 3 | 3 | import: call() |
| 3 | 3 | import: corgio.create() as a value |
| 3 | 3 | import: game.onPaint() |
| 3 | 3 | import: screen.fillRect() |
| 3 | 3 | import: scroller.scrollBackgroundWithSpeed() |
| 3 | 3 | import: sprite.onOverlap() |
| 3 | 3 | import: sprite.setStayInScreen() — no stage equivalent |
| 3 | 3 | import: sprite.setVelocity() — no stage equivalent |
| 3 | 3 | import: sprite.z = … |
| 3 | 3 | import: sprites.createProjectileFromSide() as a value |
| 3 | 3 | import: turtle.forward() |
| 3 | 3 | import: turtle.turnRight() |
| 3 | 3 | lost opcode: arcade_destroySprite |
| 3 | 3 | lost opcode: arcade_eventSprite |
| 3 | 3 | lost opcode: arcade_whenSpritesOverlap |
| 3 | 3 | lost opcode: control_if_else |
| 3 | 3 | lost opcode: sensing_touchingobject |
| 3 | 3 | lost opcode: sensing_touchingobjectmenu |
| 3 | 3 | reimport: _dead() as a value |
| 3 | 3 | reimport: control.runInParallel() |
| 3 | 3 | reimport: otherSprite.destroy() |
| 2 | 2 | export: bitops_or as a value |
| 2 | 2 | import: carnival.startCountdownGame() |
| 2 | 2 | import: flamethrower: lab2imgs.flamethrower — sprite artwork is unavailable in this project |
| 2 | 2 | import: game.setGameOverEffect() |
| 2 | 2 | import: img`…` — image or asset literal not translated here |
| 2 | 2 | import: myCorg.horizontalMovement() |
| 2 | 2 | import: myCorg.updateSprite() |
| 2 | 2 | import: myCorg.verticalMovement() |
| 2 | 2 | import: pizza.setPlayersWith() |
| 2 | 2 | import: scene.getTilesByType() as a value |
| 2 | 2 | import: scene.onHitTile() |
| 2 | 2 | import: screen.fill() |
| 2 | 2 | import: screen.print() |
| 2 | 2 | import: sprite.setFlag() — no stage equivalent |
| 2 | 2 | import: sprites.create() as a value |
| 2 | 2 | import: sprites.createProjectile() as a value |
| 2 | 2 | import: sprites.destroyAllSpritesOfKind() |
| 2 | 2 | import: turtle.setPosition() |
| 2 | 2 | import: turtle.turnLeft() |
| 2 | 2 | lost opcode: arcade_setSpriteProperty |
| 2 | 2 | lost opcode: arrays_length |
| 2 | 2 | lost opcode: bitops_or |
| 2 | 2 | lost opcode: control_create_clone_of |
| 2 | 2 | lost opcode: control_create_clone_of_menu |
| 2 | 2 | lost opcode: event_whenflagclicked |
| 2 | 2 | lost opcode: motion_changeyby |
| 2 | 2 | lost opcode: motion_setx |
| 2 | 2 | lost opcode: motion_yposition |
| 2 | 2 | lost opcode: operator_or |
| 2 | 2 | reimport: _Wait() as a value |
| 2 | 2 | reimport: Array as a value |
| 2 | 2 | reimport: c.data — a sprite held in a variable, which the stage cannot follow |
| 2 | 2 | reimport: c.setFlag() |
| 2 | 2 | reimport: c.setPosition() |
| 2 | 2 | reimport: c.z = … — a sprite held in a variable, which the stage cannot follow |
| 2 | 2 | reimport: call() as a value |
| 2 | 2 | reimport: class _Wait |
| 2 | 2 | reimport: indexing something that is not an array |
| 2 | 2 | reimport: self.setPosition() |
| 2 | 2 | reimport: sprites.allOfKind() as a value |
| 2 | 2 | reimport: sprites.create() as a value |
| 2 | 2 | reimport: src.data — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | export: bitops_shr as a value |
| 1 | 1 | export: call drive %s |
| 1 | 1 | export: sensing_answer as a value |
| 1 | 1 | export: touching ExtraLife |
| 1 | 1 | export: touching Food |
| 1 | 1 | export: touching NPC |
| 1 | 1 | export: touching RightPaddles |
| 1 | 1 | import: __bwValue1.x — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: __bwValue1.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: __bwValue11.x — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: __bwValue11.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: __bwValue2.ay — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: __bwValue2.ay = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: __bwValue4.fillRect() |
| 1 | 1 | import: __bwValue4.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: animatedSprite.setImage() |
| 1 | 1 | import: Array as a value |
| 1 | 1 | import: assets.animation`…` — image or asset literal not translated here |
| 1 | 1 | import: assets.image`…` — image or asset literal not translated here |
| 1 | 1 | import: athlete: throw_imgs.dunk — sprite artwork is unavailable in this project |
| 1 | 1 | import: ball.ay — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: ball.ay = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: ball.image.replace() |
| 1 | 1 | import: ball.left — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: ball.overlapsWith() as a value |
| 1 | 1 | import: ball.right — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: ball.vx = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: ball.vy = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: ball.y — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: blockchain.addBlock() |
| 1 | 1 | import: blockchain.length() as a value |
| 1 | 1 | import: blockchain.valuesFrom() as a value |
| 1 | 1 | import: blockSettings.writeNumberArray() |
| 1 | 1 | import: blockSettings.writeStringArray() |
| 1 | 1 | import: bluetooth.advertiseUrl() |
| 1 | 1 | import: bubble.load_bubble() |
| 1 | 1 | import: bubble.tossBubble() |
| 1 | 1 | import: bundles.wrap3() |
| 1 | 1 | import: bundles.wrap4() |
| 1 | 1 | import: call() as a value |
| 1 | 1 | import: car: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | import: characterAnimations.loopFrames() |
| 1 | 1 | import: class Message (a get accessor (kind), a set accessor (kind), a get accessor (fromSerialNumber), a set accessor (fromSerialNumber), a get accessor (value), a set accessor (value), a get accessor (toSerialNumber), a set accessor (toSerialNumber)) — not translated; it calls control.createBuffer(), this._data.getNumber(), this._data.setNumber(), radio.sendBuffer(), basic.pause() |
| 1 | 1 | import: controller.player2.moveSprite() |
| 1 | 1 | import: currHouse.right — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: currHouse.y — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: darts.create() as a value |
| 1 | 1 | import: degree.setDigitAlpha() |
| 1 | 1 | import: degree.setDigitColor() |
| 1 | 1 | import: degree.setRadix() |
| 1 | 1 | import: degree.setScale() |
| 1 | 1 | import: degree.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: degree.y = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: effects.confetti.startScreenEffect() |
| 1 | 1 | import: enemySprite.follow() — unsupported Arcade handle method |
| 1 | 1 | import: finish: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | import: fireSprite.setFlag() |
| 1 | 1 | import: fireSprite.setPosition() |
| 1 | 1 | import: fireSprite.setVelocity() |
| 1 | 1 | import: flameSprite: lab2imgs.flame — sprite artwork is unavailable in this project |
| 1 | 1 | import: flamethrower.x — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: flamethrower.y — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: fly: flies_imgs.fly — sprite artwork is unavailable in this project |
| 1 | 1 | import: fly.setBounceOnWall() — Scratch scripts can only move their own sprite |
| 1 | 1 | import: fly.setVelocity() — Scratch scripts can only move their own sprite |
| 1 | 1 | import: football.createGame() |
| 1 | 1 | import: fortuneTellerSprite: lab2imgs.crystal_ball — sprite artwork is unavailable in this project |
| 1 | 1 | import: frames.map() |
| 1 | 1 | import: freethrow.addHoop() |
| 1 | 1 | import: freethrow.addPlayer() |
| 1 | 1 | import: freethrow.gameCountdown() |
| 1 | 1 | import: freethrow.onA() |
| 1 | 1 | import: freethrow.onOverlapHoop() |
| 1 | 1 | import: freethrow.setCourt() |
| 1 | 1 | import: frog: flies_imgs.frog — sprite artwork is unavailable in this project |
| 1 | 1 | import: game.gameCountdown() |
| 1 | 1 | import: game.showScore() |
| 1 | 1 | import: game.wrap() |
| 1 | 1 | import: globetrotters.askQuestion2() |
| 1 | 1 | import: globetrotters.checkScore() as a value |
| 1 | 1 | import: globetrotters.setLevel2() |
| 1 | 1 | import: globetrotters.tossBall() |
| 1 | 1 | import: golfBall.controlWithArrowKeys() |
| 1 | 1 | import: golfBall.setTrace() |
| 1 | 1 | import: hoop: throw_imgs.hoop — sprite artwork is unavailable in this project |
| 1 | 1 | import: hoop.setPosition() — Scratch scripts can only move their own sprite |
| 1 | 1 | import: iceSprite: lab2imgs.icecube — sprite artwork is unavailable in this project |
| 1 | 1 | import: jumper: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | import: lander.setImage() |
| 1 | 1 | import: led.enable() |
| 1 | 1 | import: loops.everyInterval() |
| 1 | 1 | import: Math.sign() as a value |
| 1 | 1 | import: Math.trunc() as a value |
| 1 | 1 | import: message.send() |
| 1 | 1 | import: Message() as a value |
| 1 | 1 | import: minus.setDigitAlpha() |
| 1 | 1 | import: minus.setDigitColor() |
| 1 | 1 | import: minus.setRadix() |
| 1 | 1 | import: minus.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: music.baDing.play() |
| 1 | 1 | import: music.pewPew.play() |
| 1 | 1 | import: music.playSoundUntilDone() |
| 1 | 1 | import: music.playTone() — Arcade's music has no stage equivalent |
| 1 | 1 | import: music.ringTone() |
| 1 | 1 | import: music.setVolume() |
| 1 | 1 | import: myCorg.addToScript() |
| 1 | 1 | import: myCorg.bark() |
| 1 | 1 | import: myCorg.cameraFollow() |
| 1 | 1 | import: mySprite.startEffect() |
| 1 | 1 | import: Namor: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | import: Namor.follow() — Scratch scripts can only move their own sprite |
| 1 | 1 | import: Namor.setPosition() — Scratch scripts can only move their own sprite |
| 1 | 1 | import: Okoye: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | import: parseInt() as a value |
| 1 | 1 | import: pizza.startEffect() — unsupported Arcade handle method |
| 1 | 1 | import: player.onOverlap() — unsupported Arcade handle method |
| 1 | 1 | import: projectile.y = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: r.onOverlap() — unsupported Arcade handle method |
| 1 | 1 | import: radio.onReceivedBuffer() |
| 1 | 1 | import: radio.onReceivedValue() |
| 1 | 1 | import: radio.sendValue() — the name is not sent; the radio block sends the number alone |
| 1 | 1 | import: radio.writeReceivedPacketToSerial() — the dump prints each packet's send time, and a MicroPython radio packet carries none |
| 1 | 1 | import: Riri: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | import: road: roadImg — sprite artwork is unavailable in this project |
| 1 | 1 | import: roadImg.fillRect() |
| 1 | 1 | import: roadImg.scroll() |
| 1 | 1 | import: rockscout: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | import: scene.cameraFollowSprite() |
| 1 | 1 | import: scene.cameraShake() |
| 1 | 1 | import: scene.setBG() — tilemaps have no stage equivalent |
| 1 | 1 | import: scene.setTile() — tilemaps have no stage equivalent |
| 1 | 1 | import: scene.setTileMap() — tilemaps have no stage equivalent |
| 1 | 1 | import: screen.clone() as a value |
| 1 | 1 | import: sevenseg.createCounter() as a value |
| 1 | 1 | import: sevenseg.createDigit() as a value |
| 1 | 1 | import: Shuri: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | import: smurfy.add_floating_smurf() |
| 1 | 1 | import: smurfy.set_first_smurf() |
| 1 | 1 | import: spaceship: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | import: sparksjr.onScore2() |
| 1 | 1 | import: sprite.ay = … |
| 1 | 1 | import: sprite.setBounceOnWall() |
| 1 | 1 | import: sprite.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: sprites.assignPlayerImgs() |
| 1 | 1 | import: sprites.createProjectile() in game.onUpdate callback — projectile artwork is unavailable |
| 1 | 1 | import: sprites.createProjectile() in newHouse() — projectile artwork is unavailable |
| 1 | 1 | import: sprites.createProjectileFromSide() in forever callback — projectile artwork is unavailable |
| 1 | 1 | import: sprites.createProjectileFromSide() in game.onUpdateInterval callback — projectile artwork is unavailable |
| 1 | 1 | import: sprites.createProjectileFromSprite() as a value |
| 1 | 1 | import: sprites.createProjectileFromSprite() source must be a sprite handle or null |
| 1 | 1 | import: sprites.destroy() |
| 1 | 1 | import: sprites.sendFlying() |
| 1 | 1 | import: sprites.step_right() |
| 1 | 1 | import: tempurature.setDigitColor() |
| 1 | 1 | import: tiles.placeOnRandomTile() — tilemaps have no stage equivalent |
| 1 | 1 | import: turkey.onA() |
| 1 | 1 | import: turkey.onCages() |
| 1 | 1 | import: turkey.onStartSimple() |
| 1 | 1 | import: turkey.turkeyOverlapCage() |
| 1 | 1 | import: turtle.back() |
| 1 | 1 | import: turtle.pen() |
| 1 | 1 | import: turtle.setSpeed() |
| 1 | 1 | import: unit.setDigitAlpha() |
| 1 | 1 | import: unit.setDigitColor() |
| 1 | 1 | import: unit.setRadix() |
| 1 | 1 | import: unit.setScale() |
| 1 | 1 | import: unit.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: unit.y = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | import: valentine.set_win_lose_size() |
| 1 | 1 | import: value.place() |
| 1 | 1 | lost opcode: arcade_setscore |
| 1 | 1 | lost opcode: arrays_get |
| 1 | 1 | lost opcode: arrays_push |
| 1 | 1 | lost opcode: bitops_shl |
| 1 | 1 | lost opcode: bitops_shr |
| 1 | 1 | lost opcode: control_forever |
| 1 | 1 | lost opcode: control_stop |
| 1 | 1 | lost opcode: control_wait_until |
| 1 | 1 | lost opcode: motion_xposition |
| 1 | 1 | lost opcode: operator_mod |
| 1 | 1 | lost opcode: planetemaths_max |
| 1 | 1 | lost opcode: procedures_call |
| 1 | 1 | lost opcode: sensing_answer |
| 1 | 1 | parse error |
| 1 | 1 | reimport: flameSpriteSprite.data — no stage equivalent |
| 1 | 1 | reimport: projectile.y = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | reimport: r.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | reimport: r.y = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | reimport: s.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | reimport: s.y = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | reimport: snowflake.y = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | reimport: sprites.createProjectileFromSprite() source must be a sprite handle or null |

## Paths

| corpus | permutation | preserved | partial | loss | compile fail | source invalid | error |
|---|---|---:|---:|---:|---:|---:|---:|
| Arcade TypeScript | project -> bw -> project | 89 | 92 | 2 | 0 | 0 | 0 |
| Arcade TypeScript | makecode -> bw -> sb3 -> bw -> project | 0 | 0 | 183 | 0 | 0 | 0 |
| Arcade TypeScript | makecode -> bw -> makecode -> bw | 82 | 49 | 50 | 0 | 2 | 0 |
| micro:bit TypeScript | project -> bw -> project | 206 | 9 | 0 | 0 | 0 | 0 |
| micro:bit TypeScript | makecode -> bw -> sb3 -> bw -> project | 0 | 0 | 215 | 0 | 0 | 0 |
| micro:bit TypeScript | makecode -> bw -> makecode -> bw | 197 | 7 | 11 | 0 | 0 | 0 |

## Most often lost block opcodes on reverse MakeCode conversion

| projects | opcode |
|---:|---|
| 15 | operator_lt |
| 12 | operator_gt |
| 10 | data_setvariableto |
| 10 | operator_equals |
| 10 | operator_subtract |
| 7 | looks_show |
| 6 | motion_changexby |
| 5 | arrays_createEmpty |
| 5 | motion_gotoxy |
| 5 | operator_multiply |
| 4 | arcade_getLocal |
| 4 | arrays_create1D |
| 4 | data_changevariableby |
| 4 | motion_sety |
| 4 | operator_divide |
| 4 | operator_not |
| 4 | operator_random |
| 3 | arcade_destroySprite |
| 3 | arcade_eventSprite |
| 3 | arcade_whenSpritesOverlap |
| 3 | control_if_else |
| 3 | sensing_touchingobject |
| 3 | sensing_touchingobjectmenu |
| 2 | arcade_setSpriteProperty |
| 2 | arrays_length |
| 2 | bitops_or |
| 2 | control_create_clone_of |
| 2 | control_create_clone_of_menu |
| 2 | event_whenflagclicked |
| 2 | motion_changeyby |
| 2 | motion_setx |
| 2 | motion_yposition |
| 2 | operator_or |
| 1 | arcade_setscore |
| 1 | arrays_get |
| 1 | arrays_push |
| 1 | bitops_shl |
| 1 | bitops_shr |
| 1 | control_forever |
| 1 | control_stop |

## Most often named unsupported on reverse MakeCode conversion

| projects | element |
|---:|---|
| 2 | bitops_or as a value |
| 1 | bitops_shr as a value |
| 1 | call drive %s |
| 1 | sensing_answer as a value |
| 1 | touching ExtraLife |
| 1 | touching Food |
| 1 | touching NPC |
| 1 | touching RightPaddles |

## Failed source parses or MakeCode recompiles

| file | reason |
|---|---|
| input 20 | conversion failed; full diagnostic in private JSON |
