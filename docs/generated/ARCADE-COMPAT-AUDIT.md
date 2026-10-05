# Conversion compatibility audit

Generated 2026-10-01T04:41:15.264Z; 184 files. A parsed project has not necessarily run correctly.

| count | stage |
|---:|---|
| 100 | partial |
| 83 | translated |
| 1 | parse-failed |

## Unsupported MakeCode elements

| occurrences | element |
|---:|---|
| 11 | arcade: sprites.create() as a value |
| 10 | arcade: scene.setBackgroundImage() with art we could not read |
| 7 | arcade: sprite.x — a sprite held in a variable, which the stage cannot follow |
| 6 | arcade: asteroid.vx — a sprite held in a variable, which the stage cannot follow |
| 6 | arcade: asteroid.vy — a sprite held in a variable, which the stage cannot follow |
| 6 | arcade: controller.moveSprite() |
| 6 | arcade: enemy.vy — a sprite held in a variable, which the stage cannot follow |
| 6 | arcade: game.onUpdateInterval() |
| 6 | arcade: scene.setTileMap() — tilemaps have no stage equivalent |
| 6 | arcade: sprite.y — a sprite held in a variable, which the stage cannot follow |
| 6 | arcade: sprites.destroy() effect and duration — not rendered |
| 6 | arcade: sprites.onCreated() needs a supported callback |
| 5 | arcade: controller.A.onEvent() |
| 5 | arcade: music.play() — Arcade's music has no stage equivalent |
| 5 | arcade: powerUp.vy — a sprite held in a variable, which the stage cannot follow |
| 5 | arcade: scene.cameraFollowSprite() |
| 5 | arcade: scene.setTile() — tilemaps have no stage equivalent |
| 5 | arcade: sprites.createProjectileFromSide() as a value |
| 5 | arcade: sprites.onOverlap() |
| 4 | arcade: effects.starField.startScreenEffect() |
| 4 | arcade: info.onLifeZero() |
| 4 | arcade: initialize() as a value |
| 4 | arcade: music.playSound() |
| 4 | arcade: sprite.onOverlap() |
| 4 | arcade: sprite.z = … |
| 3 | arcade: bundles.wrap1() |
| 3 | arcade: bundles.wrap2() |
| 3 | arcade: call() |
| 3 | arcade: corgio.create() as a value |
| 3 | arcade: game.onPaint() |
| 3 | arcade: scene.onOverlapTile() |
| 3 | arcade: screen.fillRect() |
| 3 | arcade: scroller.scrollBackgroundWithSpeed() |
| 3 | arcade: sprite.setStayInScreen() |
| 3 | arcade: sprite.setStayInScreen() — no stage equivalent |
| 3 | arcade: sprite.setVelocity() — no stage equivalent |
| 3 | arcade: sprites.createProjectile() |
| 3 | arcade: tiles.placeOnRandomTile() — tilemaps have no stage equivalent |
| 3 | arcade: tiles.setTilemap(…) — no such tilemap in this project |
| 2 | arcade: a value.x — a sprite held in a variable, which the stage cannot follow |
| 2 | arcade: break inside a loop |
| 2 | arcade: carnival.startCountdownGame() |
| 2 | arcade: Code to Blocks: References unknown sprite "Projectile" (not a defined sprite) |
| 2 | arcade: control.millis() as a value |
| 2 | arcade: enemy.x — a sprite held in a variable, which the stage cannot follow |
| 2 | arcade: enemy.y — a sprite held in a variable, which the stage cannot follow |
| 2 | arcade: flamethrower: lab2imgs.flamethrower — sprite artwork is unavailable in this project |
| 2 | arcade: game.onUpdate() |
| 2 | arcade: indexing something that is not an array |
| 2 | arcade: Math.clamp() as a value |
| 2 | arcade: myCorg.horizontalMovement() |
| 2 | arcade: myCorg.updateSprite() |
| 2 | arcade: myCorg.verticalMovement() |
| 2 | arcade: pizza.setPlayersWith() |
| 2 | arcade: player.x — a sprite held in a variable, which the stage cannot follow |
| 2 | arcade: player.y — a sprite held in a variable, which the stage cannot follow |
| 2 | arcade: scene.onHitTile() |
| 2 | arcade: scene.setTileMap() |
| 2 | arcade: screen.fill() |
| 2 | arcade: screen.print() |
| 2 | arcade: sprite.ay = … |
| 2 | arcade: sprite.setFlag() — no stage equivalent |
| 2 | arcade: sprites.createProjectile() as a value |
| 2 | arcade: sprites.createProjectileFromSprite() as a value |
| 2 | arcade: sprites.destroyAllSpritesOfKind() |
| 2 | arcade: tiles.setTilemap(level_1) — no such tilemap in this project |
| 1 | arcade: animatedSprite.setImage() |
| 1 | arcade: athlete: throw_imgs.dunk — sprite artwork is unavailable in this project |
| 1 | arcade: ball.ay — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: ball.image.replace() |
| 1 | arcade: ball.left — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: ball.overlapsWith() as a value |
| 1 | arcade: ball.overlapsWith(botPlayer) — only this sprite's own overlaps can be tested |
| 1 | arcade: ball.overlapsWith(player) — only this sprite's own overlaps can be tested |
| 1 | arcade: ball.right — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: ball.vx — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: ball.vy — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: ball.x = … — a script can only change its own sprite |
| 1 | arcade: ball.y — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: ball.y = … — a script can only change its own sprite |
| 1 | arcade: blockSettings.writeNumberArray() |
| 1 | arcade: blockSettings.writeStringArray() |
| 1 | arcade: boardImage.drawTransparentImage() needs an image source and x/y offsets |
| 1 | arcade: boardSprite: boardImage — sprite artwork is unavailable in this project |
| 1 | arcade: boardSprite.image.fill() |
| 1 | arcade: botPlayer.x = … — a script can only change its own sprite |
| 1 | arcade: botPlayer.y = … — a script can only change its own sprite |
| 1 | arcade: bubble.load_bubble() |
| 1 | arcade: bubble.tossBubble() |
| 1 | arcade: bundles.wrap3() |
| 1 | arcade: bundles.wrap4() |
| 1 | arcade: call() as a value |
| 1 | arcade: car: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: characterAnimations.loopFrames() |
| 1 | arcade: cherry.destroy() — Scratch scripts can only move their own sprite |
| 1 | arcade: cloud.setKind() |
| 1 | arcade: cloud.y — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: Code to Blocks: Line 1: Procedure repeatIt %s %s was called with 1 missing argument(s); they default to 0 |
| 1 | arcade: Code to Blocks: Line 12: Empty body: "FOREVER:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | arcade: Code to Blocks: Line 13: Empty body: "IF not (0 = 0) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | arcade: Code to Blocks: Line 33: Empty body: "REPEAT UNTIL not (not (of = 0)):" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | arcade: Code to Blocks: Line 46: Empty body: "IF not (celsius = 0) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | arcade: Code to Blocks: Line 52: Empty body: "IF temp > 0 THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | arcade: Code to Blocks: Line 58: Empty body: "REPEAT UNTIL not ((arcade call function "inSnake %s %s" arguments (arcade function argument (foodX) rest (arcade function argument (foodY) rest ("[]"))))):" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | arcade: Code to Blocks: Line 76: Empty body: "IF (arcade local x = foodX) and (arcade local y = foodY) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | arcade: Code to Blocks: References unknown sprite "ExtraLife" (not a defined sprite) |
| 1 | arcade: Code to Blocks: References unknown sprite "Food" (not a defined sprite) |
| 1 | arcade: Code to Blocks: References unknown sprite "NPC" (not a defined sprite) |
| 1 | arcade: Code to Blocks: References unknown sprite "RightPaddles" (not a defined sprite) |
| 1 | arcade: collisionPaddle.width — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: collisionPaddle.x — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: conditional expression (?:) as a value |
| 1 | arcade: controller.player2.moveSprite() |
| 1 | arcade: createEnemy() |
| 1 | arcade: createEnemy() as a value |
| 1 | arcade: currHouse.right — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: currHouse.y — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: darts.create() as a value |
| 1 | arcade: degree.setDigitAlpha() |
| 1 | arcade: degree.setDigitColor() |
| 1 | arcade: degree.setRadix() |
| 1 | arcade: degree.setScale() |
| 1 | arcade: degree.x — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: degree.y — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: effects.confetti.startScreenEffect() |
| 1 | arcade: EndGame2.x = … — a script can only change its own sprite |
| 1 | arcade: EndGame2.y = … — a script can only change its own sprite |
| 1 | arcade: enemySprite.follow() — unsupported Arcade handle method |
| 1 | arcade: finish: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: fireSprite.setFlag() |
| 1 | arcade: fireSprite.setPosition() |
| 1 | arcade: fireSprite.setVelocity() |
| 1 | arcade: flameSprite: lab2imgs.flame — sprite artwork is unavailable in this project |
| 1 | arcade: flamethrower.x — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: flamethrower.y — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: flower.setFlag() |
| 1 | arcade: fly: flies_imgs.fly — sprite artwork is unavailable in this project |
| 1 | arcade: fly.setBounceOnWall() — Scratch scripts can only move their own sprite |
| 1 | arcade: fly.setVelocity() — Scratch scripts can only move their own sprite |
| 1 | arcade: football.createGame() |
| 1 | arcade: fortuneTellerSprite: lab2imgs.crystal_ball — sprite artwork is unavailable in this project |
| 1 | arcade: frames.map() |
| 1 | arcade: freethrow.addHoop() |
| 1 | arcade: freethrow.addPlayer() |
| 1 | arcade: freethrow.gameCountdown() |
| 1 | arcade: freethrow.onA() |
| 1 | arcade: freethrow.onOverlapHoop() |
| 1 | arcade: freethrow.setCourt() |
| 1 | arcade: frog: flies_imgs.frog — sprite artwork is unavailable in this project |
| 1 | arcade: game.ask() as a value |
| 1 | arcade: game.gameCountdown() |
| 1 | arcade: game.setGameOverEffect() |
| 1 | arcade: game.wrap() |
| 1 | arcade: globetrotters.askQuestion2() |
| 1 | arcade: globetrotters.checkScore() as a value |
| 1 | arcade: globetrotters.setLevel2() |
| 1 | arcade: globetrotters.tossBall() |
| 1 | arcade: golfBall.controlWithArrowKeys() |
| 1 | arcade: golfBall.setTrace() |
| 1 | arcade: hoop: throw_imgs.hoop — sprite artwork is unavailable in this project |
| 1 | arcade: hoop.setPosition() — Scratch scripts can only move their own sprite |
| 1 | arcade: iceSprite: lab2imgs.icecube — sprite artwork is unavailable in this project |
| 1 | arcade: Identifier statement |
| 1 | arcade: jumper: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: lander.setImage() |
| 1 | arcade: left.ay — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: left.image — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: left.vy — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: left.x — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: left.y — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: Math.percentChance() as a value |
| 1 | arcade: Math.sign() as a value |
| 1 | arcade: Math.trunc() as a value |
| 1 | arcade: middle.ay — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: middle.image — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: middle.vy — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: middle.x — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: middle.y — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: minus.setDigitAlpha() |
| 1 | arcade: minus.setDigitColor() |
| 1 | arcade: minus.setRadix() |
| 1 | arcade: minus.x — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: music.baDing.play() |
| 1 | arcade: music.pewPew.play() |
| 1 | arcade: music.playSoundUntilDone() |
| 1 | arcade: music.playTone() — Arcade's music has no stage equivalent |
| 1 | arcade: music.ringTone() |
| 1 | arcade: music.setVolume() |
| 1 | arcade: myCorg.addToScript() |
| 1 | arcade: myCorg.bark() |
| 1 | arcade: myCorg.cameraFollow() |
| 1 | arcade: mySprite.isHittingTile() as a value |
| 1 | arcade: mySprite.startEffect() |
| 1 | arcade: Namor: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: Namor.follow() — Scratch scripts can only move their own sprite |
| 1 | arcade: Namor.setPosition() — Scratch scripts can only move their own sprite |
| 1 | arcade: neighbours2.push() |
| 1 | arcade: Okoye: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: parseInt() as a value |
| 1 | arcade: pizza.startEffect() — unsupported Arcade handle method |
| 1 | arcade: potion.bottom — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: potion.left — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: potion.setFlag() |
| 1 | arcade: potion.x — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: potion.y — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: projectile.setFlag() — unsupported Arcade handle method |
| 1 | arcade: projectile.y — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: queen.destroy() — Scratch scripts can only move their own sprite |
| 1 | arcade: r.onOverlap() — unsupported Arcade handle method |
| 1 | arcade: raindrop.x — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: raindrop.y — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: right.ay — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: right.image — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: right.vy — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: right.x — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: right.y — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: Riri: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: road: roadImg — sprite artwork is unavailable in this project |
| 1 | arcade: roadImg.fillRect() |
| 1 | arcade: roadImg.scroll() |
| 1 | arcade: rockscout: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: scene.cameraShake() |
| 1 | arcade: scene.getTilesByType() |
| 1 | arcade: scene.onHitWall() |
| 1 | arcade: scene.setBG() — tilemaps have no stage equivalent |
| 1 | arcade: screen.clone() as a value |
| 1 | arcade: sevenseg.createCounter() as a value |
| 1 | arcade: sevenseg.createDigit() as a value |
| 1 | arcade: Shuri: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: skeleton.x — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: skeleton.y — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: smurfy.add_floating_smurf() |
| 1 | arcade: smurfy.set_first_smurf() |
| 1 | arcade: spaceship: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: sparksjr.onScore2() |
| 1 | arcade: sprite.left = … |
| 1 | arcade: sprite.setBounceOnWall() |
| 1 | arcade: sprite.top = … |
| 1 | arcade: sprites.assignPlayerImgs() |
| 1 | arcade: sprites.create() |
| 1 | arcade: sprites.createProjectile() in game.onUpdate callback — projectile artwork is unavailable |
| 1 | arcade: sprites.createProjectile() in newHouse() — projectile artwork is unavailable |
| 1 | arcade: sprites.createProjectileFromSide() in forever callback — projectile artwork is unavailable |
| 1 | arcade: sprites.createProjectileFromSide() in game.onUpdateInterval callback — projectile artwork is unavailable |
| 1 | arcade: sprites.createProjectileFromSprite() source must be a sprite handle or null |
| 1 | arcade: sprites.destroy() |
| 1 | arcade: sprites.sendFlying() |
| 1 | arcade: sprites.step_right() |
| 1 | arcade: tempurature.setDigitColor() |
| 1 | arcade: tiles.placeOnTile() |
| 1 | arcade: tiles.setTilemap() |
| 1 | arcade: tiles.setTilemap(level) — no such tilemap in this project |
| 1 | arcade: turkey.onA() |
| 1 | arcade: turkey.onCages() |
| 1 | arcade: turkey.onStartSimple() |
| 1 | arcade: turkey.turkeyOverlapCage() |
| 1 | arcade: unit.setDigitAlpha() |
| 1 | arcade: unit.setDigitColor() |
| 1 | arcade: unit.setRadix() |
| 1 | arcade: unit.setScale() |
| 1 | arcade: unit.x — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: unit.y — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: Unknown statement |
| 1 | arcade: valentine.set_win_lose_size() |
| 1 | arcade: value.place() |
| 1 | arcade: wizard.destroy() — Scratch scripts can only move their own sprite |
| 1 | arcade: wizard.say() — Scratch scripts can only move their own sprite |
| 1 | arcade: wizard.x = … — a script can only change its own sprite |
| 1 | arcade: wizard.y = … — a script can only change its own sprite |

## Missing Scratch/TurboWarp opcodes

| occurrences | opcode |
|---:|---|
| 0 | none |

## Unsupported block modes

| occurrences | mode |
|---:|---|
| 0 | none |

## External extensions requiring runtime validation or an offline implementation

| projects | extension and URL |
|---:|---|
| 0 | none |

### Their unverified opcodes

| projects | opcode |
|---:|---|
| 0 | none |

## Failures and execution limits

| file | result |
|---|---|
| /mnt/storage/brickwright-corpora/collected/arcade/arcade-12904c83e83fe45a.ts | MakeCode TS: expected ) but found "" on line 6 |
