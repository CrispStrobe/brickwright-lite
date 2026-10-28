namespace SpriteKind {
    export const Firework = SpriteKind.create();
    export const Particle = SpriteKind.create();
}

controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    let firework: Sprite = sprites.create(img`
    1
    1
    `, SpriteKind.Firework);
    firework.vy = -15;
    firework.setPosition(randint(0, screen.width), screen.height);
    firework.setFlag(SpriteFlag.Ghost, true);
    firework.setFlag(SpriteFlag.AutoDestroy, true);
});

function randomizeParticleColor(particle: Sprite) {
    particle.image.fill(randint(1, 14))
}
