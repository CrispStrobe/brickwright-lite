// Generated from microsoft/arcade-carnival v0.0.7, commit 915caca4a2d83a7071df59407a9987992c083750.
// MIT, Copyright (c) Microsoft Corporation. Exact source and notice: carnival-source/.
// Source sha256 6530f15cbddbc41419a59a41e8c13276eb6ac65645c04d02e899826c08e3f765. Regenerate: node scripts/generate-arcade-carnival.mjs
// Host blocking operations return Promises; one factory instance owns one program's initialization.
module.exports = function initializePxtCarnival(host) {
const {game, info, effects, settings, control, scene, music, screen, image, img, pause} = host;
var carnival;
(function (carnival) {
    //let fanfare: effects.BackgroundEffect = undefined; // <-- I don't think this is needed anymore
    //let winStyle="WinTypes.Score"  // <-- Pretty sure this isn't needed anymore
    // Get array of player info
    // let players: info.PlayerInfo[]; // <-- I don't think I use this
    let WinTypes;
    (function (WinTypes) {
        //% block="win game"
        WinTypes[WinTypes["Win"] = 0] = "Win";
        //% block="lose game"
        WinTypes[WinTypes["Lose"] = 1] = "Lose";
        //% block="best score"
        WinTypes[WinTypes["Score"] = 2] = "Score";
        //% block="best time"
        WinTypes[WinTypes["Timed"] = 3] = "Timed";
        //% block="multiplayer"
        WinTypes[WinTypes["Multi"] = 4] = "Multi";
        //% block="custom" blockHidden
        WinTypes[WinTypes["Custom"] = 5] = "Custom";
    })(WinTypes = carnival.WinTypes || (carnival.WinTypes = {}));
    let ScoreTypes;
    (function (ScoreTypes) {
        //% block="high score"
        ScoreTypes[ScoreTypes["HScore"] = 0] = "HScore";
        //% block="low score"
        ScoreTypes[ScoreTypes["LScore"] = 1] = "LScore";
        //% block="high time"
        ScoreTypes[ScoreTypes["HTime"] = 2] = "HTime";
        //% block="low time"
        ScoreTypes[ScoreTypes["LTime"] = 3] = "LTime";
        //% block="none"
        ScoreTypes[ScoreTypes["None"] = 4] = "None";
    })(ScoreTypes = carnival.ScoreTypes || (carnival.ScoreTypes = {}));
    // Formerly of the Info Category -----
    let countdownInitialized = false;
    /**
     * Adds game end style to countdown
     */
    //% color="#b70082"
    //% group="Countdown"
    //% blockId=start_countdown_game
    //% block="start countdown $myTime (s) and game over $winType || effect $winEffect"
    //% myTime.defl=15
    //% winType.defl=WinTypes.Score
    //% winEffect.defl=effects.confetti
    //% inlineInputMode=inline
    //% help=github:docs/start_countdown_game
    function startCountdownGame(myTime, winType, winEffect) {
        if (!winType)
            winType = WinTypes.Win;
        if (!winEffect && winType != WinTypes.Lose) {
            winEffect = effects.confetti;
        }
        else {
            winEffect = effects.melt;
        }
        init(winType, winEffect);
        info.startCountdown(myTime);
    }
    carnival.startCountdownGame = startCountdownGame;
    function saveLowScore(newLow) {
        const curr = settings.readNumber("low-score");
        if (curr == undefined || newLow < curr) {
            settings.writeNumber("low-score", newLow);
        }
    }
    async function newGameOver(winStyle, fanfare, winSound, scoreType, message, customScore) {
        // Prep default variables for different win types
        let winnerNumber = [1]; // Which players have the high scores?
        let thisBest = info.score(); // Who has the best score this round?
        let newBest = false; // Is thisBest the newBest for all games?
        let bestScore = info.highScore(); // What is the bestScore of all time?
        // Save number of seconds passed during game
        const thisScene = game.currentScene();
        //let timeElapsed = roundOff(thisScene.millis() / 1000, 2); //Can't get points to match timer perfectly
        let timeElapsed = Math.floor(thisScene.millis() / 1000);
        if (control.timer1.millis() >= 0) {
            timeElapsed = Math.floor(control.timer1.millis() / 1000);
            // timeElapsed = roundOff(control.timer1.millis() / 1000, 2);  //Can't get points to match timer perfectly
        }
        /*
        // Save all scores as relevant to the game.
            info.saveAllScores(); // This is throwing an error for some reason
        */
        // Initialize thisBest if customScore wasn't included
        if (customScore === undefined) {
            thisBest = info.player1.getState().score;
        }
        // Initialize the messaging / fanfare based on winStyle
        if (winStyle == WinTypes.Custom) {
            if (!scoreType) {
                scoreType = ScoreTypes.HScore;
            }
            if (!message) {
                message = "Game Over!";
            }
            if (!fanfare) {
                fanfare = effects.confetti;
            }
        }
        else if (winStyle == WinTypes.Win) {
            scoreType = ScoreTypes.HScore;
            message = "You Win!";
            if (!fanfare) {
                fanfare = effects.confetti;
            }
        }
        else if (winStyle == WinTypes.Score) {
            scoreType = ScoreTypes.HScore;
            message = "Great Score!";
            if (!fanfare) {
                fanfare = effects.confetti;
            }
        }
        else if (winStyle == WinTypes.Timed) {
            scoreType = ScoreTypes.LTime;
            message = "Great Time!";
            if (!fanfare) {
                fanfare = effects.confetti;
            }
        }
        else if (winStyle == WinTypes.Multi) {
            scoreType = ScoreTypes.HScore;
            if (!fanfare) {
                fanfare = effects.confetti;
            }
            // Find winner of multiplayer
            const scoreInfo1 = info.player1.getState();
            const scoreInfo2 = info.player2.getState();
            const scoreInfo3 = info.player3.getState();
            const scoreInfo4 = info.player4.getState();
            const allScores = [scoreInfo1.score, scoreInfo2.score, scoreInfo3.score, scoreInfo4.score];
            // Find player with highest score in Multi
            thisBest = -Infinity; // Make sure there's no false tie
            for (let i = 0; i < 4; i++) {
                if (allScores[i] != undefined && allScores[i] > thisBest) {
                    thisBest = allScores[i];
                    winnerNumber = [i + 1];
                }
                else if (allScores[i] != undefined && allScores[i] == thisBest) {
                    winnerNumber.push(i + 1);
                }
            }
            // Construct string for one winner
            if (!message && winnerNumber.length <= 1) {
                message = "Player " + winnerNumber[0] + " Wins!";
            }
            else {
                //Construct string for ties
                message = "Players ";
                for (let i = 0; i < winnerNumber.length - 1; i++) {
                    message += winnerNumber[i] + " & ";
                }
                // remove the last ampersand and the trailing space
                message += winnerNumber[(winnerNumber.length) - 1] + " Tied!";
            }
        }
        else {
            if (!scoreType) {
                scoreType = ScoreTypes.None;
            }
            if (!message) {
                message = "Game Over!";
            }
            if (!fanfare) {
                fanfare = effects.melt;
            }
        }
        // Overwrite current game score if something was passed in
        if (customScore != undefined) {
            thisBest = customScore;
        }
        // Set bestScore and newBest based on score and scoreType
        if (scoreType == ScoreTypes.HScore) {
            if (thisBest > bestScore) {
                newBest = true;
                bestScore = thisBest;
                info.setScore(thisBest);
                info.saveHighScore();
            }
        }
        else if (scoreType == ScoreTypes.LScore) {
            bestScore = settings.readNumber("low-score");
            if (bestScore == undefined) {
                bestScore = Infinity;
            }
            if (thisBest < bestScore) {
                newBest = true;
                bestScore = thisBest;
                info.setScore(thisBest);
                saveLowScore(thisBest);
            }
        }
        else if (scoreType == ScoreTypes.HTime) {
            // Set thisBest to timeElapsed if no customScore
            if (!customScore) {
                thisBest = timeElapsed;
            }
            if (thisBest > bestScore) {
                newBest = true;
                bestScore = thisBest;
                info.setScore(thisBest);
                info.saveHighScore();
            }
        }
        else if (scoreType == ScoreTypes.LTime) {
            bestScore = settings.readNumber("low-score");
            if (bestScore == undefined) {
                bestScore = Infinity;
            }
            // Set thisBest to timeElapsed if no customScore
            if (!customScore) {
                thisBest = timeElapsed;
            }
            if (thisBest < bestScore) {
                newBest = true;
                bestScore = thisBest;
                info.setScore(thisBest);
                saveLowScore(thisBest);
            }
        }
        else {
            // Score judging type must be "None"
            thisBest = undefined;
            bestScore = undefined;
            newBest = false;
        }
        // Make sure there's a sound to playe
        if (!winSound) {
            winSound = music.powerUp;
        }
        // releasing memory and clear fibers. Do not add anything that releases the fiber until background is set below,
        // or screen will be cleared on the new frame and will not appear as background in the game over screen.
        await game.popScene();
        await game.pushScene();
        scene.setBackgroundImage(screen.clone());
        await winSound.play();
        fanfare.startScreenEffect();
        await pause(400);
        const overDialog = new GameOverDialog(true, message, thisBest, bestScore, newBest);
        scene.createRenderable(scene.HUD_Z, target => {
            overDialog.update();
            target.drawTransparentImage(overDialog.image, 0, (screen.height - overDialog.image.height) >> 1);
        });
        await pause(500); // wait for users to stop pressing keys
        overDialog.displayCursor();
        await game.waitAnyButton();
        control.reset();
    }
    function init(winStyle, fanfare) {
        if (countdownInitialized)
            return;
        countdownInitialized = true;
        info.onCountdownEnd(async function () {
            //Handling manually to include number of seconds passed
            /*
            if (winStyle == WinTypes.Win) {
                game.over(true, fanfare)
            } else */ if (winStyle == WinTypes.Lose) {
                await game.over(false, fanfare);
            }
            else {
                await newGameOver(winStyle, fanfare);
            }
        });
    }
    class GameOverDialog extends game.BaseDialog {
        constructor(win, messageText, score, best, newBest) {
            super(screen.width, 46, img `
        1 1 1
        f f f
        1 1 1
        `);
            this.win = win;
            this.messageText = messageText;
            this.score = score;
            this.best = best;
            this.newBest = newBest;
            this.cursorOn = false;
            /* Since best time is lower, need to do this elsewhere
            this.isNewbestScore = this.score > this.bestScore;
            */
        }
        displayCursor() {
            this.cursorOn = true;
        }
        update() {
            this.clearInterior();
            this.drawTextCore();
            if (this.cursorOn) {
                this.drawCursorRow();
            }
        }
        drawTextCore() {
            const titleHeight = 8;
            this.image.printCenter(this.messageText, titleHeight, screen.isMono ? 1 : 5, image.font8);
            if (this.score != undefined) {
                const scoreHeight = 23;
                const bestScoreHeight = 34;
                const scoreColor = screen.isMono ? 1 : 2;
                this.image.printCenter("Score:" + this.score, scoreHeight, scoreColor, image.font8);
                if (this.newBest == true) {
                    this.image.printCenter("New Best Score!", bestScoreHeight, scoreColor, image.font5);
                }
                else {
                    this.image.printCenter("Best:" + this.best, bestScoreHeight, scoreColor, image.font8);
                }
            }
        }
    }
    carnival.GameOverDialog = GameOverDialog;
    // End Info
    // Formerly namespace Game
    /**
     * Adds additional end game styles
     */
    //% color="#b70082"
    //% group="Game"
    //% blockId=on_game_over_expanded
    //% block="game over $winStyle || with effect $winEffect"
    //% winType.defl=WinTypes.Win
    //% winEffect.defl=effects.confetti
    //% inlineInputMode=inline
    //% help=github:docs/on_game_over_expanded
    async function onGameOverExpanded(winStyle, winEffect) {
        if (winEffect == undefined) {
            if (winStyle == WinTypes.Lose) {
                winEffect = effects.melt;
            }
            else {
                winEffect = effects.confetti;
            }
        }
        if (winStyle == WinTypes.Lose) {
            await game.over(false, winEffect);
        }
        else {
            await newGameOver(winStyle, winEffect);
        }
    }
    carnival.onGameOverExpanded = onGameOverExpanded;
    /**
     * Adds custom end game styles
     */
    //% color="#b70082"
    //% group="Game"
    //% blockId=on_game_over_custom_expanded
    //% block="game over $message || with $winEffect and $gameSound judged as $scoring using score $score"
    //% message.defl="Great Job!"
    //% scoring.defl=ScoreTypes.None
    //% winEffect.defl=effects.confetti
    //% gameSound.defl=music.powerUp
    //% inlineInputMode=inline
    //% help=github:docs/on_game_over_custom_expanded
    async function customGameOverExpanded(message, winEffect, gameSound, scoring, score) {
        if (!winEffect) {
            winEffect = effects.confetti;
        }
        if (!scoring) {
            scoring = ScoreTypes.HScore;
        }
        if (score == undefined) {
            info.score();
        }
        if (!gameSound) {
            gameSound = music.powerUp;
        }
        game.setGameOverSound(true, gameSound);
        await newGameOver(WinTypes.Custom, winEffect, gameSound, scoring, message, score);
    }
    carnival.customGameOverExpanded = customGameOverExpanded;
})(carnival || (carnival = {}));

return {carnival};
};
