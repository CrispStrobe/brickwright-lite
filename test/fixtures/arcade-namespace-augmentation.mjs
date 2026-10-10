export const NAMESPACE_AUGMENTATION_SOURCE = `
namespace sprites {
    let creations = 0
    export function makePlayer(): Sprite {
        creations += 1
        let actor = create(img\`1\`, SpriteKind.Player)
        actor.setPosition(30 + creations, 45)
        return actor
    }
    export function count(): number { return creations }
}
namespace sprites {
    export function other(): Sprite {
        let actor = sprites.create(img\`2\`, SpriteKind.Enemy)
        actor.x = 70
        return actor
    }
}
namespace game {
    export function award(value: number) { info.changeScoreBy(value) }
}
let player = sprites.makePlayer()
let enemy = sprites.other()
let builtIn = sprites.create(img\`3\`, SpriteKind.Food)
builtIn.x = 90
let observed = player.x + enemy.x + builtIn.x + sprites.count()
game.award(7)
let observedScore = info.score()
let width = sprites.food.smallApple.width
controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
    game.award(2)
    player.x += 5
    observed = player.x + enemy.x + builtIn.x + sprites.count()
    observedScore = info.score()
})
`;
