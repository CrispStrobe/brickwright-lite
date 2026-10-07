# Conversion compatibility audit

Generated 2026-10-07T06:18:00.789Z; 184 files. A parsed project has not necessarily run correctly.

Source commit: 3ef1213c0b4daacf82f4235a1e2c9f54dc124879; dirty: false. Corpus declared commit: 19a52f6d65ab9e8adc90bb19a6e3ea04544a1339 (not independently verified).

Runtime smoke only steps 24 frames. Behavioral equivalence is not measured.

## Gap ranking by affected projects

| projects | occurrences | family |
|---:|---:|---|
| 10 | 10 | arcade: scene.setBackgroundImage() with art we could not read |
| 7 | 7 | arcade: scene.setTileMap() |
| 7 | 7 | arcade: tiles.setTilemap() requires a readable literal tile map with wall layer and tile scale |
| 6 | 6 | arcade: sprites.destroy() effect and duration — not rendered |
| 5 | 5 | arcade: music.play() — Arcade's music has no stage equivalent |
| 5 | 5 | arcade: sprites.createProjectile() |
| 4 | 4 | arcade: effects.starField.startScreenEffect() |
| 4 | 4 | arcade: game.ask() as a value |
| 4 | 4 | arcade: music.playSound() |
| 4 | 4 | arcade: scene.setTile() |
| 3 | 3 | arcade: bundles.wrap1() |
| 3 | 3 | arcade: bundles.wrap2() |
| 3 | 3 | arcade: call() |
| 3 | 3 | arcade: corgio.create() as a value |
| 3 | 3 | arcade: game.onPaint() |
| 3 | 3 | arcade: screen.fillRect() |
| 3 | 3 | arcade: scroller.scrollBackgroundWithSpeed() |
| 3 | 3 | arcade: sprite.onOverlap() |
| 3 | 3 | arcade: sprite.setStayInScreen() — no stage equivalent |
| 3 | 3 | arcade: sprite.setVelocity() — no stage equivalent |
| 3 | 3 | arcade: sprite.z = … |
| 3 | 3 | arcade: sprites.createProjectileFromSide() as a value |
| 2 | 2 | arcade: carnival.startCountdownGame() |
| 2 | 2 | arcade: Code to Blocks: Line 54: Empty body: "IF compare value (pick random 0 to 99) op "<" with ((0 + (4))) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 2 | 2 | arcade: flamethrower: lab2imgs.flamethrower — sprite artwork is unavailable in this project |
| 2 | 2 | arcade: game.setGameOverEffect() |
| 2 | 2 | arcade: img`…` — image or asset literal not translated here |
| 2 | 2 | arcade: myCorg.horizontalMovement() |
| 2 | 2 | arcade: myCorg.updateSprite() |
| 2 | 2 | arcade: myCorg.verticalMovement() |
| 2 | 2 | arcade: pizza.setPlayersWith() |
| 2 | 2 | arcade: scene.getTilesByType() as a value |
| 2 | 2 | arcade: scene.onHitTile() |
| 2 | 2 | arcade: screen.fill() |
| 2 | 2 | arcade: screen.print() |
| 2 | 2 | arcade: sprite.setFlag() — no stage equivalent |
| 2 | 2 | arcade: sprites.create() as a value |
| 2 | 2 | arcade: sprites.createProjectile() as a value |
| 2 | 2 | arcade: sprites.destroyAllSpritesOfKind() |
| 1 | 1 | arcade: __bwValue1.x — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: __bwValue1.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: __bwValue2.ay — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: __bwValue2.ay = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: __bwValue2.fillRect() |
| 1 | 1 | arcade: __bwValue4.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: __bwValue7.x — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: __bwValue7.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: animatedSprite.setImage() |
| 1 | 1 | arcade: Array as a value |
| 1 | 1 | arcade: assets.animation`…` — image or asset literal not translated here |
| 1 | 1 | arcade: assets.image`…` — image or asset literal not translated here |
| 1 | 1 | arcade: athlete: throw_imgs.dunk — sprite artwork is unavailable in this project |
| 1 | 1 | arcade: ball.ay — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: ball.ay = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: ball.image.replace() |
| 1 | 1 | arcade: ball.left — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: ball.overlapsWith() as a value |
| 1 | 1 | arcade: ball.right — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: ball.vx = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: ball.vy = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: ball.y — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: blockSettings.writeNumberArray() |
| 1 | 1 | arcade: blockSettings.writeStringArray() |
| 1 | 1 | arcade: bubble.load_bubble() |
| 1 | 1 | arcade: bubble.tossBubble() |
| 1 | 1 | arcade: bundles.wrap3() |
| 1 | 1 | arcade: bundles.wrap4() |
| 1 | 1 | arcade: call() as a value |
| 1 | 1 | arcade: car: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | arcade: characterAnimations.loopFrames() |
| 1 | 1 | arcade: Code to Blocks: Line 12: Empty body: "FOREVER:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | 1 | arcade: Code to Blocks: Line 13: Empty body: "IF not (0 = 0) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | 1 | arcade: Code to Blocks: Line 39: Empty body: "IF compare value (pick random 0 to 99) op "<" with ((0 + (10))) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | 1 | arcade: Code to Blocks: Line 40: Empty body: "IF truthiness of value (celsius) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | 1 | arcade: Code to Blocks: Line 42: Empty body: "IF not (__bwValue1 = 0) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | 1 | arcade: Code to Blocks: Line 46: Empty body: "IF compare value (temp) op ">" with ((0 + (0))) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | 1 | arcade: Code to Blocks: Line 96: Empty body: "IF truthiness of value (arcade local __bwValue4) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | 1 | arcade: Code to Blocks: References unknown sprite "ExtraLife" (not a defined sprite) |
| 1 | 1 | arcade: Code to Blocks: References unknown sprite "Food" (not a defined sprite) |
| 1 | 1 | arcade: Code to Blocks: References unknown sprite "NPC" (not a defined sprite) |
| 1 | 1 | arcade: Code to Blocks: References unknown sprite "RightPaddles" (not a defined sprite) |
| 1 | 1 | arcade: controller.player2.moveSprite() |
| 1 | 1 | arcade: currHouse.right — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: currHouse.y — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: darts.create() as a value |
| 1 | 1 | arcade: degree.setDigitAlpha() |
| 1 | 1 | arcade: degree.setDigitColor() |
| 1 | 1 | arcade: degree.setRadix() |
| 1 | 1 | arcade: degree.setScale() |
| 1 | 1 | arcade: degree.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: degree.y = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: effects.confetti.startScreenEffect() |
| 1 | 1 | arcade: enemySprite.follow() — unsupported Arcade handle method |
| 1 | 1 | arcade: finish: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | arcade: fireSprite.setFlag() |
| 1 | 1 | arcade: fireSprite.setPosition() |
| 1 | 1 | arcade: fireSprite.setVelocity() |
| 1 | 1 | arcade: flameSprite: lab2imgs.flame — sprite artwork is unavailable in this project |
| 1 | 1 | arcade: flamethrower.x — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: flamethrower.y — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: fly: flies_imgs.fly — sprite artwork is unavailable in this project |
| 1 | 1 | arcade: fly.setBounceOnWall() — Scratch scripts can only move their own sprite |
| 1 | 1 | arcade: fly.setVelocity() — Scratch scripts can only move their own sprite |
| 1 | 1 | arcade: football.createGame() |
| 1 | 1 | arcade: fortuneTellerSprite: lab2imgs.crystal_ball — sprite artwork is unavailable in this project |
| 1 | 1 | arcade: frames.map() |
| 1 | 1 | arcade: freethrow.addHoop() |
| 1 | 1 | arcade: freethrow.addPlayer() |
| 1 | 1 | arcade: freethrow.gameCountdown() |
| 1 | 1 | arcade: freethrow.onA() |
| 1 | 1 | arcade: freethrow.onOverlapHoop() |
| 1 | 1 | arcade: freethrow.setCourt() |
| 1 | 1 | arcade: frog: flies_imgs.frog — sprite artwork is unavailable in this project |
| 1 | 1 | arcade: game.gameCountdown() |
| 1 | 1 | arcade: game.wrap() |
| 1 | 1 | arcade: globetrotters.askQuestion2() |
| 1 | 1 | arcade: globetrotters.checkScore() as a value |
| 1 | 1 | arcade: globetrotters.setLevel2() |
| 1 | 1 | arcade: globetrotters.tossBall() |
| 1 | 1 | arcade: golfBall.controlWithArrowKeys() |
| 1 | 1 | arcade: golfBall.setTrace() |
| 1 | 1 | arcade: hoop: throw_imgs.hoop — sprite artwork is unavailable in this project |
| 1 | 1 | arcade: hoop.setPosition() — Scratch scripts can only move their own sprite |
| 1 | 1 | arcade: iceSprite: lab2imgs.icecube — sprite artwork is unavailable in this project |
| 1 | 1 | arcade: jumper: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | arcade: lander.setImage() |
| 1 | 1 | arcade: Math.sign() as a value |
| 1 | 1 | arcade: Math.trunc() as a value |
| 1 | 1 | arcade: minus.setDigitAlpha() |
| 1 | 1 | arcade: minus.setDigitColor() |
| 1 | 1 | arcade: minus.setRadix() |
| 1 | 1 | arcade: minus.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: music.baDing.play() |
| 1 | 1 | arcade: music.pewPew.play() |
| 1 | 1 | arcade: music.playSoundUntilDone() |
| 1 | 1 | arcade: music.playTone() — Arcade's music has no stage equivalent |
| 1 | 1 | arcade: music.ringTone() |
| 1 | 1 | arcade: music.setVolume() |
| 1 | 1 | arcade: myCorg.addToScript() |
| 1 | 1 | arcade: myCorg.bark() |
| 1 | 1 | arcade: myCorg.cameraFollow() |
| 1 | 1 | arcade: mySprite.startEffect() |
| 1 | 1 | arcade: Namor: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | arcade: Namor.follow() — Scratch scripts can only move their own sprite |
| 1 | 1 | arcade: Namor.setPosition() — Scratch scripts can only move their own sprite |
| 1 | 1 | arcade: Okoye: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | arcade: parseInt() as a value |
| 1 | 1 | arcade: pizza.startEffect() — unsupported Arcade handle method |
| 1 | 1 | arcade: player.onOverlap() — unsupported Arcade handle method |
| 1 | 1 | arcade: projectile.y = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: r.onOverlap() — unsupported Arcade handle method |
| 1 | 1 | arcade: Riri: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | arcade: road: roadImg — sprite artwork is unavailable in this project |
| 1 | 1 | arcade: roadImg.fillRect() |
| 1 | 1 | arcade: roadImg.scroll() |
| 1 | 1 | arcade: rockscout: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | arcade: scene.cameraFollowSprite() |
| 1 | 1 | arcade: scene.cameraShake() |
| 1 | 1 | arcade: scene.setBG() — tilemaps have no stage equivalent |
| 1 | 1 | arcade: scene.setTile() — tilemaps have no stage equivalent |
| 1 | 1 | arcade: scene.setTileMap() — tilemaps have no stage equivalent |
| 1 | 1 | arcade: screen.clone() as a value |
| 1 | 1 | arcade: sevenseg.createCounter() as a value |
| 1 | 1 | arcade: sevenseg.createDigit() as a value |
| 1 | 1 | arcade: Shuri: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | arcade: smurfy.add_floating_smurf() |
| 1 | 1 | arcade: smurfy.set_first_smurf() |
| 1 | 1 | arcade: spaceship: sprite image — sprite artwork is unavailable in this project |
| 1 | 1 | arcade: sparksjr.onScore2() |
| 1 | 1 | arcade: sprite.ay = … |
| 1 | 1 | arcade: sprite.setBounceOnWall() |
| 1 | 1 | arcade: sprite.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: sprites.assignPlayerImgs() |
| 1 | 1 | arcade: sprites.createProjectile() in game.onUpdate callback — projectile artwork is unavailable |
| 1 | 1 | arcade: sprites.createProjectile() in newHouse() — projectile artwork is unavailable |
| 1 | 1 | arcade: sprites.createProjectileFromSide() in forever callback — projectile artwork is unavailable |
| 1 | 1 | arcade: sprites.createProjectileFromSide() in game.onUpdateInterval callback — projectile artwork is unavailable |
| 1 | 1 | arcade: sprites.createProjectileFromSprite() as a value |
| 1 | 1 | arcade: sprites.createProjectileFromSprite() source must be a sprite handle or null |
| 1 | 1 | arcade: sprites.destroy() |
| 1 | 1 | arcade: sprites.sendFlying() |
| 1 | 1 | arcade: sprites.step_right() |
| 1 | 1 | arcade: tempurature.setDigitColor() |
| 1 | 1 | arcade: tiles.placeOnRandomTile() — tilemaps have no stage equivalent |
| 1 | 1 | arcade: turkey.onA() |
| 1 | 1 | arcade: turkey.onCages() |
| 1 | 1 | arcade: turkey.onStartSimple() |
| 1 | 1 | arcade: turkey.turkeyOverlapCage() |
| 1 | 1 | arcade: unit.setDigitAlpha() |
| 1 | 1 | arcade: unit.setDigitColor() |
| 1 | 1 | arcade: unit.setRadix() |
| 1 | 1 | arcade: unit.setScale() |
| 1 | 1 | arcade: unit.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: unit.y = … — a sprite held in a variable, which the stage cannot follow |
| 1 | 1 | arcade: Update as a value |
| 1 | 1 | arcade: update expression used as a value |
| 1 | 1 | arcade: valentine.set_win_lose_size() |
| 1 | 1 | arcade: value.place() |
| 1 | 1 | parse-failed |

| count | stage |
|---:|---|
| 84 | translated |
| 53 | pxt-compile-failed |
| 46 | partial |
| 1 | parse-failed |

## Unsupported MakeCode elements

| occurrences | element |
|---:|---|
| 10 | arcade: scene.setBackgroundImage() with art we could not read |
| 7 | arcade: scene.setTileMap() |
| 7 | arcade: tiles.setTilemap() requires a readable literal tile map with wall layer and tile scale |
| 6 | arcade: sprites.destroy() effect and duration — not rendered |
| 5 | arcade: music.play() — Arcade's music has no stage equivalent |
| 5 | arcade: sprites.createProjectile() |
| 4 | arcade: effects.starField.startScreenEffect() |
| 4 | arcade: game.ask() as a value |
| 4 | arcade: music.playSound() |
| 4 | arcade: scene.setTile() |
| 3 | arcade: bundles.wrap1() |
| 3 | arcade: bundles.wrap2() |
| 3 | arcade: call() |
| 3 | arcade: corgio.create() as a value |
| 3 | arcade: game.onPaint() |
| 3 | arcade: screen.fillRect() |
| 3 | arcade: scroller.scrollBackgroundWithSpeed() |
| 3 | arcade: sprite.onOverlap() |
| 3 | arcade: sprite.setStayInScreen() — no stage equivalent |
| 3 | arcade: sprite.setVelocity() — no stage equivalent |
| 3 | arcade: sprite.z = … |
| 3 | arcade: sprites.createProjectileFromSide() as a value |
| 2 | arcade: carnival.startCountdownGame() |
| 2 | arcade: Code to Blocks: Line 54: Empty body: "IF compare value (pick random 0 to 99) op "<" with ((0 + (4))) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 2 | arcade: flamethrower: lab2imgs.flamethrower — sprite artwork is unavailable in this project |
| 2 | arcade: game.setGameOverEffect() |
| 2 | arcade: img`…` — image or asset literal not translated here |
| 2 | arcade: myCorg.horizontalMovement() |
| 2 | arcade: myCorg.updateSprite() |
| 2 | arcade: myCorg.verticalMovement() |
| 2 | arcade: pizza.setPlayersWith() |
| 2 | arcade: scene.getTilesByType() as a value |
| 2 | arcade: scene.onHitTile() |
| 2 | arcade: screen.fill() |
| 2 | arcade: screen.print() |
| 2 | arcade: sprite.setFlag() — no stage equivalent |
| 2 | arcade: sprites.create() as a value |
| 2 | arcade: sprites.createProjectile() as a value |
| 2 | arcade: sprites.destroyAllSpritesOfKind() |
| 1 | arcade: __bwValue1.x — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: __bwValue1.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: __bwValue2.ay — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: __bwValue2.ay = … — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: __bwValue2.fillRect() |
| 1 | arcade: __bwValue4.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: __bwValue7.x — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: __bwValue7.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: animatedSprite.setImage() |
| 1 | arcade: Array as a value |
| 1 | arcade: assets.animation`…` — image or asset literal not translated here |
| 1 | arcade: assets.image`…` — image or asset literal not translated here |
| 1 | arcade: athlete: throw_imgs.dunk — sprite artwork is unavailable in this project |
| 1 | arcade: ball.ay — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: ball.ay = … — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: ball.image.replace() |
| 1 | arcade: ball.left — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: ball.overlapsWith() as a value |
| 1 | arcade: ball.right — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: ball.vx = … — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: ball.vy = … — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: ball.y — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: blockSettings.writeNumberArray() |
| 1 | arcade: blockSettings.writeStringArray() |
| 1 | arcade: bubble.load_bubble() |
| 1 | arcade: bubble.tossBubble() |
| 1 | arcade: bundles.wrap3() |
| 1 | arcade: bundles.wrap4() |
| 1 | arcade: call() as a value |
| 1 | arcade: car: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: characterAnimations.loopFrames() |
| 1 | arcade: Code to Blocks: Line 12: Empty body: "FOREVER:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | arcade: Code to Blocks: Line 13: Empty body: "IF not (0 = 0) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | arcade: Code to Blocks: Line 39: Empty body: "IF compare value (pick random 0 to 99) op "<" with ((0 + (10))) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | arcade: Code to Blocks: Line 40: Empty body: "IF truthiness of value (celsius) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | arcade: Code to Blocks: Line 42: Empty body: "IF not (__bwValue1 = 0) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | arcade: Code to Blocks: Line 46: Empty body: "IF compare value (temp) op ">" with ((0 + (0))) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | arcade: Code to Blocks: Line 96: Empty body: "IF truthiness of value (arcade local __bwValue4) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| 1 | arcade: Code to Blocks: References unknown sprite "ExtraLife" (not a defined sprite) |
| 1 | arcade: Code to Blocks: References unknown sprite "Food" (not a defined sprite) |
| 1 | arcade: Code to Blocks: References unknown sprite "NPC" (not a defined sprite) |
| 1 | arcade: Code to Blocks: References unknown sprite "RightPaddles" (not a defined sprite) |
| 1 | arcade: controller.player2.moveSprite() |
| 1 | arcade: currHouse.right — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: currHouse.y — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: darts.create() as a value |
| 1 | arcade: degree.setDigitAlpha() |
| 1 | arcade: degree.setDigitColor() |
| 1 | arcade: degree.setRadix() |
| 1 | arcade: degree.setScale() |
| 1 | arcade: degree.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: degree.y = … — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: effects.confetti.startScreenEffect() |
| 1 | arcade: enemySprite.follow() — unsupported Arcade handle method |
| 1 | arcade: finish: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: fireSprite.setFlag() |
| 1 | arcade: fireSprite.setPosition() |
| 1 | arcade: fireSprite.setVelocity() |
| 1 | arcade: flameSprite: lab2imgs.flame — sprite artwork is unavailable in this project |
| 1 | arcade: flamethrower.x — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: flamethrower.y — a sprite held in a variable, which the stage cannot follow |
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
| 1 | arcade: game.gameCountdown() |
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
| 1 | arcade: jumper: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: lander.setImage() |
| 1 | arcade: Math.sign() as a value |
| 1 | arcade: Math.trunc() as a value |
| 1 | arcade: minus.setDigitAlpha() |
| 1 | arcade: minus.setDigitColor() |
| 1 | arcade: minus.setRadix() |
| 1 | arcade: minus.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: music.baDing.play() |
| 1 | arcade: music.pewPew.play() |
| 1 | arcade: music.playSoundUntilDone() |
| 1 | arcade: music.playTone() — Arcade's music has no stage equivalent |
| 1 | arcade: music.ringTone() |
| 1 | arcade: music.setVolume() |
| 1 | arcade: myCorg.addToScript() |
| 1 | arcade: myCorg.bark() |
| 1 | arcade: myCorg.cameraFollow() |
| 1 | arcade: mySprite.startEffect() |
| 1 | arcade: Namor: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: Namor.follow() — Scratch scripts can only move their own sprite |
| 1 | arcade: Namor.setPosition() — Scratch scripts can only move their own sprite |
| 1 | arcade: Okoye: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: parseInt() as a value |
| 1 | arcade: pizza.startEffect() — unsupported Arcade handle method |
| 1 | arcade: player.onOverlap() — unsupported Arcade handle method |
| 1 | arcade: projectile.y = … — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: r.onOverlap() — unsupported Arcade handle method |
| 1 | arcade: Riri: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: road: roadImg — sprite artwork is unavailable in this project |
| 1 | arcade: roadImg.fillRect() |
| 1 | arcade: roadImg.scroll() |
| 1 | arcade: rockscout: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: scene.cameraFollowSprite() |
| 1 | arcade: scene.cameraShake() |
| 1 | arcade: scene.setBG() — tilemaps have no stage equivalent |
| 1 | arcade: scene.setTile() — tilemaps have no stage equivalent |
| 1 | arcade: scene.setTileMap() — tilemaps have no stage equivalent |
| 1 | arcade: screen.clone() as a value |
| 1 | arcade: sevenseg.createCounter() as a value |
| 1 | arcade: sevenseg.createDigit() as a value |
| 1 | arcade: Shuri: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: smurfy.add_floating_smurf() |
| 1 | arcade: smurfy.set_first_smurf() |
| 1 | arcade: spaceship: sprite image — sprite artwork is unavailable in this project |
| 1 | arcade: sparksjr.onScore2() |
| 1 | arcade: sprite.ay = … |
| 1 | arcade: sprite.setBounceOnWall() |
| 1 | arcade: sprite.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: sprites.assignPlayerImgs() |
| 1 | arcade: sprites.createProjectile() in game.onUpdate callback — projectile artwork is unavailable |
| 1 | arcade: sprites.createProjectile() in newHouse() — projectile artwork is unavailable |
| 1 | arcade: sprites.createProjectileFromSide() in forever callback — projectile artwork is unavailable |
| 1 | arcade: sprites.createProjectileFromSide() in game.onUpdateInterval callback — projectile artwork is unavailable |
| 1 | arcade: sprites.createProjectileFromSprite() as a value |
| 1 | arcade: sprites.createProjectileFromSprite() source must be a sprite handle or null |
| 1 | arcade: sprites.destroy() |
| 1 | arcade: sprites.sendFlying() |
| 1 | arcade: sprites.step_right() |
| 1 | arcade: tempurature.setDigitColor() |
| 1 | arcade: tiles.placeOnRandomTile() — tilemaps have no stage equivalent |
| 1 | arcade: turkey.onA() |
| 1 | arcade: turkey.onCages() |
| 1 | arcade: turkey.onStartSimple() |
| 1 | arcade: turkey.turkeyOverlapCage() |
| 1 | arcade: unit.setDigitAlpha() |
| 1 | arcade: unit.setDigitColor() |
| 1 | arcade: unit.setRadix() |
| 1 | arcade: unit.setScale() |
| 1 | arcade: unit.x = … — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: unit.y = … — a sprite held in a variable, which the stage cannot follow |
| 1 | arcade: Update as a value |
| 1 | arcade: update expression used as a value |
| 1 | arcade: valentine.set_win_lose_size() |
| 1 | arcade: value.place() |

## Missing Scratch opcodes

| occurrences | opcode |
|---:|---|
| 0 | none |

## External extensions requiring runtime validation or an offline implementation

| projects | extension |
|---:|---|
| 0 | none |

### Their unverified opcodes

| projects | opcode |
|---:|---|
| 0 | none |

## Failures and execution limits

| file | result |
|---|---|
| input 6 | fail |
| input 14 | fail |
| input 15 | fail |
| input 20 | parse-failed; full diagnostic in private JSON |
| input 24 | fail |
| input 25 | fail |
| input 26 | fail |
| input 27 | fail |
| input 29 | pass |
| input 32 | fail |
| input 33 | pass |
| input 35 | fail |
| input 37 | fail |
| input 38 | fail |
| input 41 | fail |
| input 49 | fail |
| input 50 | fail |
| input 52 | fail |
| input 53 | fail |
| input 54 | fail |
| input 56 | fail |
| input 63 | pass |
| input 68 | fail |
| input 71 | fail |
| input 72 | fail |
| input 74 | fail |
| input 78 | fail |
| input 82 | fail |
| input 101 | fail |
| input 102 | fail |
| input 104 | fail |
| input 113 | fail |
| input 117 | fail |
| input 119 | fail |
| input 124 | fail |
| input 129 | fail |
| input 132 | fail |
| input 133 | fail |
| input 134 | pass |
| input 137 | fail |
| input 139 | fail |
| input 147 | fail |
| input 148 | fail |
| input 150 | fail |
| input 158 | fail |
| input 160 | fail |
| input 162 | fail |
| input 163 | fail |
| input 164 | fail |
| input 165 | fail |
| input 167 | fail |
| input 170 | fail |
| input 171 | fail |
| input 176 | fail |
| input 178 | fail |
| input 179 | fail |
| input 181 | fail |
| input 182 | fail |
