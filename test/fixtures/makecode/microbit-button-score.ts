input.onButtonPressed(Button.A, () => {
    game.addScore(1);
    basic.showNumber(game.score())
});

input.onButtonPressed(Button.B, () => {
    game.addScore(-1);
    basic.showNumber(game.score())
});
