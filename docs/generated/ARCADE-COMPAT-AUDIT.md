# Conversion compatibility audit

Generated 2026-10-06T21:23:18.345Z; 184 files. A parsed project has not necessarily run correctly.

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
| 5 | arcade: powerUp.data — unsupported Arcade handle property |
| 5 | arcade: sprite.data = … — unsupported Arcade handle property |
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
| makecode/arcade/arcade-0a35827ae40a2a51.ts | main.ts:2: Cannot redeclare block-scoped variable 'mySprite'. |
| makecode/arcade/arcade-0f16f8a134442a82.ts | main.ts:4: Cannot find name 'sevenseg'. |
| makecode/arcade/arcade-102e28d473a52b31.ts | main.ts:1: Property 'NPC' does not exist on type 'typeof SpriteKind'. |
| makecode/arcade/arcade-12904c83e83fe45a.ts | MakeCode TS: expected ) but found "" on line 6 |
| makecode/arcade/arcade-16a06b0bb3c92b12.ts | main.ts:5: Cannot find name 'Dart'. |
| makecode/arcade/arcade-1d1dbf82684cc0a9.ts | main.ts:1: Cannot find name 'Corgio'. |
| makecode/arcade/arcade-1ddbbd17c358a155.ts | main.ts:66: Property 'onOverlap' does not exist on type 'Sprite'. |
| makecode/arcade/arcade-22b371b8b8fa6957.ts | main.ts:2: Cannot find name 'valentine'. |
| makecode/arcade/arcade-2581dc1efca91497.ts | no-green-flag-thread |
| makecode/arcade/arcade-2721ae65eef96a3d.ts | main.ts:1: Cannot find name 'lab2imgs'. |
| makecode/arcade/arcade-28379fc078a029bc.ts | block-error: Array reference is null or expired |
| makecode/arcade/arcade-28db91a73d9dc1e6.ts | main.ts:58: Property 'onOverlap' does not exist on type 'Sprite'. |
| makecode/arcade/arcade-2cdb086eac46d6df.ts | main.ts:1: Cannot find name 'throw_imgs'. |
| makecode/arcade/arcade-2dfc9d75b91259dc.ts | main.ts:63: Property 'onOverlap' does not exist on type 'Sprite'. |
| makecode/arcade/arcade-318e958c14146483.ts | main.ts:50: Property 'onOverlap' does not exist on type 'Sprite'. |
| makecode/arcade/arcade-383f2359d4446bef.ts | main.ts:6: Cannot find name 'lab2imgs'. |
| makecode/arcade/arcade-38daed1ab8038d15.ts | pxt_modules/game/spritesay.ts:323: Cannot read properties of undefined (reading 'flags') |
| makecode/arcade/arcade-3b15c6d00145e022.ts | pxt_modules/game/prompt.ts:179: Cannot read properties of undefined (reading 'flags') |
| makecode/arcade/arcade-3e97847322a94308.ts | pxt_modules/game/effects.ts:48: Cannot read properties of undefined (reading 'flags') |
| makecode/arcade/arcade-3f37b5346df56738.ts | pxt_modules/game/info.ts:720: Assertion failed |
| makecode/arcade/arcade-4095fa24eaeda2df.ts | main.ts:1: Cannot find name 'letplayerAge'. |
| makecode/arcade/arcade-4d0c6ce8a57b5f8d.ts | no-green-flag-thread |
| makecode/arcade/arcade-51a084f79eaa7eab.ts | main.ts:22: Cannot find name 'characterAnimations'. |
| makecode/arcade/arcade-56f2735dfec807de.ts | main.ts:1: Cannot find name 'Corgio'. |
| makecode/arcade/arcade-5840453b73b41d29.ts | main.ts:1: Cannot find name 'freethrow'. |
| makecode/arcade/arcade-5d0c02f598d4eda3.ts | main.ts:2: Cannot find name 'bundles'. |
| makecode/arcade/arcade-60fd3a6d3fcf68de.ts | pxt_modules/game/textDialogs.ts:711: Assertion failed |
| makecode/arcade/arcade-67958b6a5a875e41.ts | main.ts:2: Cannot find name 'newpizzaassets'. |
| makecode/arcade/arcade-7b258f528af901d5.ts | main.ts:1: Property 'sendFlying' does not exist on type 'typeof sprites'. |
| makecode/arcade/arcade-7c596cc3ff723b32.ts | pxt_modules/game/animation.ts:510: Cannot read properties of undefined (reading 'flags') |
| makecode/arcade/arcade-7cf6f6fa5b8ff423.ts | main.ts:2: Cannot find name 'football'. |
| makecode/arcade/arcade-90a0e61d3299702c.ts | main.ts:14: Property 'Finish' does not exist on type 'typeof SpriteKind'. |
| makecode/arcade/arcade-999ed460b9bd1d1e.ts | main.ts:3: Cannot find name 'bundles'. |
| makecode/arcade/arcade-9c4a169d9d7f1171.ts | main.ts:1: Cannot find name 'smurfy'. |
| makecode/arcade/arcade-a03d93d1b0b9d753.ts | main.ts:3: Cannot find name 'lab2imgs'. |
| makecode/arcade/arcade-a63932786084c167.ts | main.ts:3: Cannot find name 'scroller'. |
| makecode/arcade/arcade-a9ed71b600b487a3.ts | pxt_modules/mixer/melody.ts:200: Assertion failed |
| makecode/arcade/arcade-add5f5393ec4c76d.ts | main.ts:7: Cannot find name 'playerName'. |
| makecode/arcade/arcade-ae03d358339ddbe0.ts | no-green-flag-thread |
| makecode/arcade/arcade-b1c05d93bd099fec.ts | main.ts:2: Cannot find name 'scroller'. |
| makecode/arcade/arcade-b8a65f49c9f42730.ts | main.ts:1: Cannot find name 'turkey'. |
| makecode/arcade/arcade-c06098817e66322b.ts | main.ts:7: Cannot find name 'lab2imgs'. |
| makecode/arcade/arcade-c2576ea38bf22bfe.ts | main.ts:3: Cannot find name 'bundles'. |
| makecode/arcade/arcade-c88488d3d16301b4.ts | main.ts:13: Cannot find name 'blockSettings'. |
| makecode/arcade/arcade-d8509d60f9807d87.ts | main.ts:2: Property 'step_right' does not exist on type 'typeof sprites'. |
| makecode/arcade/arcade-d90dfaf541db52b1.ts | main.ts:2: Cannot find name 'sparksjr'. |
| makecode/arcade/arcade-d9e8eb7569f760a9.ts | pxt_modules/game/ask.ts:25: Assertion failed |
| makecode/arcade/arcade-db4713b4f6e9dd9c.ts | main.ts:5: Cannot find name 'corgio'. |
| makecode/arcade/arcade-db8b30332dc1be2c.ts | main.ts:5: Cannot find name 'heroSprite'. |
| makecode/arcade/arcade-ddc8f1cacad743df.ts | main.ts:2: Cannot find name 'simplified'. |
| makecode/arcade/arcade-e0e62faf01b3a6c3.ts | pxt_modules/game/sprite.ts:1084: Cannot read properties of undefined (reading 'flags') |
| makecode/arcade/arcade-e4b668bd7d79aed0.ts | main.ts:2: Cannot find name 'pizzaassets'. |
| makecode/arcade/arcade-e7ab5324f14c41d8.ts | main.ts:16: Cannot find name 'lab2imgs'. |
| makecode/arcade/arcade-f1f82cba5cb33a44.ts | main.ts:4: Cannot find name 'lab2imgs'. |
| makecode/arcade/arcade-f583b7911b0931fd.ts | main.ts:4: Cannot find name 'lab2imgs'. |
| makecode/arcade/arcade-f65a6b2d8bfcc716.ts | main.ts:3: Cannot find name 'flies_imgs'. |
| makecode/arcade/arcade-f7486e7e2dc7d78a.ts | main.ts:4: Cannot find name 'scroller'. |
| makecode/arcade/arcade-faf260517b2744d5.ts | main.ts:2: Cannot find name 'bubble'. |
