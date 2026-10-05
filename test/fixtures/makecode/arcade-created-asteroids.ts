namespace SpriteKind {
    export const Asteroid = SpriteKind.create();
}

let asteroids: Image[] = [
    sprites.space.spaceAsteroid0,
    sprites.space.spaceAsteroid1
];

game.onUpdateInterval(1000, function () {
    sprites.create(img`1`, SpriteKind.Asteroid);
});

sprites.onCreated(SpriteKind.Asteroid, function (sprite: Sprite) {
    sprite.setImage(Math.pickRandom(asteroids));
    sprite.y = randint(0, screen.height);
    sprite.x = randint(0, screen.width);
});
