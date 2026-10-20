// Generated from PXT Arcade 4.2.1, pxt-common-packages (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// info.ts: bc5c1cec455e51cf2216d6f71ef9be6fa66ece3ce4770bdee5d1c7f3a8100644
// Regenerate: node scripts/generate-arcade-hud.mjs
module.exports = function initializePxtHud(host) {
const {image, img, screen} = host;
const Math = Object.create(globalThis.Math);
Math.idiv = (a, b) => (a / b) | 0;
var info;
(function (info) {
    let infoState = undefined;
    let players;
    // Host glue (ours): the native extension creates the HUD renderable itself.
    function initHUD() { }
    function _setInfoState(state) { infoState = state; }
    info._setInfoState = _setInfoState;
    function _newInfoState() { return new InfoState(); }
    info._newInfoState = _newInfoState;
    function _initMultiHUD() { initMultiHUD(); }
    info._initMultiHUD = _initMultiHUD;
    function _drawTimer(millis) { drawTimer(millis); }
    info._drawTimer = _drawTimer;
    let Visibility;
    (function (Visibility) {
        Visibility[Visibility["None"] = 0] = "None";
        Visibility[Visibility["Countdown"] = 1] = "Countdown";
        Visibility[Visibility["Score"] = 2] = "Score";
        Visibility[Visibility["Life"] = 4] = "Life";
        Visibility[Visibility["Hud"] = 8] = "Hud";
        Visibility[Visibility["Multi"] = 16] = "Multi";
        Visibility[Visibility["UserHeartImage"] = 32] = "UserHeartImage";
        Visibility[Visibility["_ExplicitlySetScore"] = 64] = "_ExplicitlySetScore";
        Visibility[Visibility["_ExplicitlySetLife"] = 128] = "_ExplicitlySetLife";
    })(Visibility = info.Visibility || (info.Visibility = {}));
    class ScoreReachedHandler {
        constructor(score, handler) {
            this.score = score;
            this.handler = handler;
            this.isTriggered = false;
        }
    }
    class PlayerState {
        constructor() {
            this.visibility = Visibility.None;
            this.showScore = undefined;
            this.showLife = undefined;
            this.showPlayer = undefined;
            this.scoreReachedHandlers = [];
        }
    }
    info.PlayerState = PlayerState;
    class InfoState {
        constructor() {
            this.visibilityFlag = Visibility.Hud;
            this.playerStates = [];
            this.heartImage = defaultHeartImage();
            this.multiplierImage = img `
                1 . . . 1
                . 1 . 1 .
                . . 1 . .
                . 1 . 1 .
                1 . . . 1
            `;
            this.bgColor = screen.isMono ? 0 : 1;
            this.borderColor = screen.isMono ? 1 : 3;
            this.fontColor = screen.isMono ? 1 : 3;
            this.countdownExpired = undefined;
            this.countdownEndHandler = undefined;
            this.gameEnd = undefined;
            this.playerStates = [];
        }
    }
    function initMultiHUD() {
        if (infoState.visibilityFlag & Visibility.Multi)
            return;
        infoState.visibilityFlag |= Visibility.Multi;
        if (!(infoState.visibilityFlag & Visibility.UserHeartImage))
            infoState.heartImage = defaultMultiplayerHeartImage();
        infoState.multiplierImage = img `
            1 . 1
            . 1 .
            1 . 1
        `;
    }
    function defaultHeartImage() {
        return screen.isMono ?
            img `
                . 1 1 . 1 1 . .
                1 . . 1 . . 1 .
                1 . . . . . 1 .
                1 . . . . . 1 .
                . 1 . . . 1 . .
                . . 1 . 1 . . .
                . . . 1 . . . .
            `
            :
                img `
                . c 2 2 . 2 2 .
                c 2 2 2 2 2 4 2
                c 2 2 2 2 4 2 2
                c 2 2 2 2 2 2 2
                . c 2 2 2 2 2 .
                . . c 2 2 2 . .
                . . . c 2 . . .
            `;
    }
    function defaultMultiplayerHeartImage() {
        return screen.isMono ?
            img `
                    . . 1 . 1 . .
                    . 1 . 1 . 1 .
                    . 1 . . . 1 .
                    . . 1 . 1 . .
                    . . . 1 . . .
                `
            :
                img `
                    . . 1 . 1 . .
                    . 1 2 1 4 1 .
                    . 1 2 4 2 1 .
                    . . 1 2 1 . .
                    . . . 1 . . .
                `;
    }
    function drawTimer(millis) {
        if (millis < 0)
            millis = 0;
        millis |= 0;
        const font = image.font8;
        const smallFont = image.font5;
        const seconds = Math.idiv(millis, 1000);
        const width = font.charWidth * 5 - 2;
        let left = (screen.width >> 1) - (width >> 1) + 1;
        let color1 = infoState.fontColor;
        let color2 = infoState.bgColor;
        if (seconds < 10 && (seconds & 1) && !screen.isMono) {
            const temp = color1;
            color1 = color2;
            color2 = temp;
        }
        screen.fillRect(left - 3, 0, width + 6, font.charHeight + 3, infoState.borderColor);
        screen.fillRect(left - 2, 0, width + 4, font.charHeight + 2, color2);
        if (seconds < 60) {
            const top = 1;
            const remainder = Math.idiv(millis % 1000, 10);
            screen.print(formatDecimal(seconds) + ".", left, top, color1, font);
            const decimalLeft = left + 3 * font.charWidth;
            screen.print(formatDecimal(remainder), decimalLeft, top + 2, color1, smallFont);
        }
        else {
            const minutes = Math.idiv(seconds, 60);
            const remainder = seconds % 60;
            screen.print(formatDecimal(minutes) + ":" + formatDecimal(remainder), left, 1, color1, font);
        }
    }
    class PlayerInfoImpl {
        constructor(player) {
            this._player = player;
            this.border = 1;
            this.fc = 1;
            this.left = undefined;
            this.up = undefined;
            if (this._player === 1) {
                // Top left, and banner is white on red
                this.bg = screen.isMono ? 0 : 2;
                this.x = 0;
                this.y = 0;
            }
            else if (player === 2) {
                // Top right, and banner is white on blue
                this.bg = screen.isMono ? 0 : 8;
                this.x = screen.width;
                this.y = 0;
                this.left = true;
            }
            else if (player === 3) {
                this.bg = screen.isMono ? 0 : 4;
                this.x = 0;
                this.y = screen.height;
                this.up = true;
            }
            else {
                // bottom left, banner is white on green
                this.bg = screen.isMono ? 0 : 7;
                this.x = screen.width;
                this.y = screen.height;
                this.left = true;
                this.up = true;
            }
        }
        init() {
            initHUD();
            if (this._player > 1)
                initMultiHUD();
            if (!infoState.playerStates[this._player - 1]) {
                infoState.playerStates[this._player - 1] = new PlayerState();
            }
        }
        getState() {
            this.init();
            return infoState.playerStates[this._player - 1];
        }
        // the id numbera of the player
        id() {
            return this._player;
        }
        score() {
            const state = this.getState();
            if (state.showScore === undefined)
                state.showScore = true;
            if (state.showPlayer === undefined)
                state.showPlayer = true;
            if (state.score == null)
                state.score = 0;
            return state.score;
        }
        setScore(value) {
            const state = this.getState();
            if (!(infoState.visibilityFlag & Visibility._ExplicitlySetScore)) {
                updateFlag(Visibility.Score, true);
            }
            this.score(); // invoked for side effects
            const oldScore = state.score || 0;
            state.score = (value | 0);
            state.scoreReachedHandlers.forEach(srh => {
                if ((oldScore < srh.score && state.score >= srh.score) ||
                    (oldScore > srh.score && state.score <= srh.score)) {
                    srh.handler();
                }
            });
        }
        changeScoreBy(value) {
            this.setScore(this.score() + value);
        }
        hasScore() {
            const state = this.getState();
            return state.score !== undefined;
        }
        life() {
            const state = this.getState();
            if (state.showLife === undefined)
                state.showLife = true;
            if (state.showPlayer === undefined)
                state.showPlayer = true;
            if (state.life === undefined) {
                state.life = 3;
            }
            return state.life || 0;
        }
        setLife(value) {
            const state = this.getState();
            if (!(infoState.visibilityFlag & Visibility._ExplicitlySetLife)) {
                updateFlag(Visibility.Life, true);
            }
            this.life(); // invoked for side effects
            state.life = (value | 0);
        }
        changeLifeBy(value) {
            this.setLife(this.life() + value);
        }
        hasLife() {
            const state = this.getState();
            return state.life !== undefined && state.life !== null;
        }
        onLifeZero(handler) {
            const state = this.getState();
            state.lifeZeroHandler = handler;
        }
        onScore(score, handler) {
            const state = this.getState();
            for (const element of state.scoreReachedHandlers) {
                if (element.score === score) {
                    // Score handlers are implemented as "last one wins."
                    element.handler = handler;
                    return;
                }
            }
            state.scoreReachedHandlers.push(new ScoreReachedHandler(score, handler));
        }
        raiseLifeZero(gameOver) {
            const state = this.getState();
            if (state.life !== null && state.life <= 0) {
                state.life = null;
                if (state.lifeZeroHandler) {
                    state.lifeZeroHandler();
                }
                else if (gameOver) {
                    // Clear effect and sound, unless set by user
                    const goc = game.gameOverConfig();
                    goc.setEffect(false, null, false);
                    goc.setSound(false, null, false, false);
                    game.gameOver(false);
                }
            }
        }
    }
    info.PlayerInfoImpl = PlayerInfoImpl;
    class PlayerInfo {
        constructor(player) {
            this._player = player;
            this.impl = new PlayerInfoImpl(player);
            if (!players)
                players = [];
            players[this._player - 1] = this;
        }
        init() {
            initHUD();
            if (this._player > 1)
                initMultiHUD();
            if (!infoState.playerStates[this._player - 1]) {
                infoState.playerStates[this._player - 1] = new PlayerState();
            }
        }
        /**
         * Returns the one-based number of the player
         */
        get number() {
            return this._player;
        }
        get bg() {
            return this.impl.bg;
        }
        set bg(value) {
            this.impl.bg = value;
        }
        get border() {
            return this.impl.border;
        }
        set border(value) {
            this.impl.border = value;
        }
        get fc() {
            return this.impl.fc;
        }
        set fc(value) {
            this.impl.fc = value;
        }
        get showScore() {
            return this.impl.getState().showScore;
        }
        set showScore(value) {
            this.impl.getState().showScore = value;
        }
        get showLife() {
            return this.impl.getState().showLife;
        }
        set showLife(value) {
            this.impl.getState().showLife = value;
        }
        get visibility() {
            return this.impl.getState().visibility;
        }
        set visibility(value) {
            this.impl.getState().visibility = value;
        }
        get showPlayer() {
            return this.impl.getState().showPlayer;
        }
        set showPlayer(value) {
            this.impl.getState().showPlayer = value;
        }
        get x() {
            return this.impl.x;
        }
        set x(value) {
            this.impl.x = value;
        }
        get y() {
            return this.impl.y;
        }
        set y(value) {
            this.impl.y = value;
        }
        get left() {
            return this.impl.left;
        }
        set left(value) {
            this.impl.left = value;
        }
        get up() {
            return this.impl.up;
        }
        set up(value) {
            this.impl.up = value;
        }
        getState() {
            this.init();
            return infoState.playerStates[this._player - 1];
        }
        // the id numbera of the player
        id() {
            return this.impl.id();
        }
        /**
         * Get the player score
         */
        //% group="Multiplayer"
        //% blockId=piscore block="%player score"
        //% help=info/score
        //% parts="multiplayer"
        score() {
            return this.impl.score();
        }
        /**
         * Set the player score
         */
        //% group="Multiplayer"
        //% blockId=pisetscore block="set %player score to %value"
        //% value.defl=0
        //% help=info/set-score
        //% parts="multiplayer"
        setScore(value) {
            this.impl.setScore(value);
        }
        /**
         * Change the score of a player
         * @param value
         */
        //% group="Multiplayer"
        //% blockId=pichangescore block="change %player score by %value"
        //% value.defl=1
        //% help=info/change-score-by
        //% parts="multiplayer"
        changeScoreBy(value) {
            this.impl.changeScoreBy(value);
        }
        hasScore() {
            return this.impl.hasScore();
        }
        /**
         * Get the player life
         */
        //% group="Multiplayer"
        //% blockid=piflife block="%player life"
        //% help=info/life
        //% parts="multiplayer"
        life() {
            return this.impl.life();
        }
        /**
         * Set the player life
         */
        //% group="Multiplayer"
        //% blockId=pisetlife block="set %player life to %value"
        //% value.defl=3
        //% help=info/set-life
        //% parts="multiplayer"
        setLife(value) {
            this.impl.setLife(value);
        }
        /**
         * Change the life of a player
         * @param value
         */
        //% group="Multiplayer"
        //% blockId=pichangelife block="change %player life by %value"
        //% value.defl=-1
        //% help=info/change-life-by
        //% parts="multiplayer"
        changeLifeBy(value) {
            this.impl.changeLifeBy(value);
        }
        /**
         * Return true if the given player currently has a value set for health,
         * and false otherwise.
         * @param player player to check life of
         */
        //% group="Multiplayer"
        //% blockId=pihaslife block="%player has life"
        //% help=info/has-life
        //% parts="multiplayer"
        hasLife() {
            return this.impl.hasLife();
        }
        /**
         * Runs code when life reaches zero
         * @param handler
         */
        //% group="Multiplayer"
        //% blockId=playerinfoonlifezero block="on %player life zero"
        //% help=info/on-life-zero
        //% parts="multiplayer"
        onLifeZero(handler) {
            this.impl.onLifeZero(handler);
        }
        /**
         * Runs code once each time the score reaches a given value. This will also
         * run if the score "passes" the given value in either direction without ever
         * having the exact value (e.g. if score is changed by more than 1)
         *
         * @param score the score to fire the event on
         * @param handler code to run when the score reaches the given value
         */
        //% blockId=playerinfoonscore
        //% block="on $this score $score"
        //% score.defl=100
        //% help=info/on-score
        //% group="Multiplayer"
        //% parts="multiplayer"
        onScore(score, handler) {
            this.impl.onScore(score, handler);
        }
        drawPlayer() {
            const state = this.getState();
            const font = image.font5;
            let score;
            let life;
            let height = 4;
            let scoreWidth = 0;
            let lifeWidth = 0;
            const offsetX = 1;
            let offsetY = 2;
            let showScore = state.showScore && state.score !== undefined;
            let showLife = state.showLife && state.life !== undefined;
            if (showScore) {
                score = "" + state.score;
                scoreWidth = score.length * font.charWidth + 3;
                height += font.charHeight;
                offsetY += font.charHeight + 1;
            }
            if (showLife) {
                life = "" + (state.life || 0);
                lifeWidth = infoState.heartImage.width + infoState.multiplierImage.width + life.length * font.charWidth + 3;
                height += infoState.heartImage.height;
            }
            const width = Math.max(scoreWidth, lifeWidth);
            // bump size for space between lines
            if (showScore && showLife)
                height++;
            const x = this.impl.x - (this.impl.left ? width : 0);
            const y = this.impl.y - (this.impl.up ? height : 0);
            // Bordered Box
            if (showScore || showLife) {
                screen.fillRect(x, y, width, height, this.impl.border);
                screen.fillRect(x + 1, y + 1, width - 2, height - 2, this.impl.bg);
            }
            // print score
            if (showScore) {
                const bump = this.impl.left ? width - scoreWidth : 0;
                screen.print(score, x + offsetX + bump + 1, y + 2, this.impl.fc, font);
            }
            // print life
            if (showLife) {
                const xLoc = x + offsetX + (this.impl.left ? width - lifeWidth : 0);
                let mult = infoState.multiplierImage.clone();
                mult.replace(1, this.impl.fc);
                screen.drawTransparentImage(infoState.heartImage, xLoc, y + offsetY);
                screen.drawTransparentImage(mult, xLoc + infoState.heartImage.width, y + offsetY + font.charHeight - infoState.multiplierImage.height - 1);
                screen.print(life, xLoc + infoState.heartImage.width + infoState.multiplierImage.width + 1, y + offsetY, this.impl.fc, font);
            }
            // print player icon
            if (state.showPlayer) {
                const pNum = "" + this._player;
                let iconWidth = pNum.length * font.charWidth + 1;
                const iconHeight = Math.max(height, font.charHeight + 2);
                let iconX = this.impl.left ? (x - iconWidth + 1) : (x + width - 1);
                let iconY = y;
                // adjustments when only player icon shown
                if (!showScore && !showLife) {
                    iconX += this.impl.left ? -1 : 1;
                    if (this.impl.up)
                        iconY -= 3;
                }
                screen.fillRect(iconX, iconY, iconWidth, iconHeight, this.impl.border);
                screen.print(pNum, iconX + 1, iconY + (iconHeight >> 1) - (font.charHeight >> 1), this.impl.bg, font);
            }
        }
        drawScore() {
            const s = this.impl.score() | 0;
            let font;
            let offsetY;
            if (s >= 1000000) {
                offsetY = 2;
                font = image.font5;
            }
            else {
                offsetY = 1;
                font = image.font8;
            }
            const num = s.toString();
            const width = num.length * font.charWidth;
            screen.fillRect(screen.width - width - 2, 0, screen.width, image.font8.charHeight + 3, infoState.borderColor);
            screen.fillRect(screen.width - width - 1, 0, screen.width, image.font8.charHeight + 2, infoState.bgColor);
            screen.print(num, screen.width - width, offsetY, infoState.fontColor, font);
        }
        drawLives() {
            const state = this.getState();
            if (state.life < 0)
                return;
            const font = image.font8;
            if (state.life <= 4) {
                screen.fillRect(0, 0, state.life * (infoState.heartImage.width + 1) + 3, infoState.heartImage.height + 4, infoState.borderColor);
                screen.fillRect(0, 0, state.life * (infoState.heartImage.width + 1) + 2, infoState.heartImage.height + 3, infoState.bgColor);
                for (let i = 0; i < state.life; i++) {
                    screen.drawTransparentImage(infoState.heartImage, 1 + i * (infoState.heartImage.width + 1), 1);
                }
            }
            else {
                const num = state.life + "";
                const textWidth = num.length * font.charWidth - 1;
                screen.fillRect(0, 0, infoState.heartImage.width + infoState.multiplierImage.width + textWidth + 5, infoState.heartImage.height + 4, infoState.borderColor);
                screen.fillRect(0, 0, infoState.heartImage.width + infoState.multiplierImage.width + textWidth + 4, infoState.heartImage.height + 3, infoState.bgColor);
                screen.drawTransparentImage(infoState.heartImage, 1, 1);
                let mult = infoState.multiplierImage.clone();
                mult.replace(1, infoState.fontColor);
                screen.drawTransparentImage(mult, infoState.heartImage.width + 2, font.charHeight - infoState.multiplierImage.height - 1);
                screen.print(num, infoState.heartImage.width + 3 + infoState.multiplierImage.width, 1, infoState.fontColor, font);
            }
        }
    }
    info.PlayerInfo = PlayerInfo;
    function formatDecimal(val) {
        val |= 0;
        if (val < 10) {
            return "0" + val;
        }
        return val.toString();
    }
    function showScore(on) {
        updateFlag(Visibility.Score, on);
        updateFlag(Visibility._ExplicitlySetScore, true);
    }
    info.showScore = showScore;
    function showLife(on) {
        updateFlag(Visibility.Life, on);
        updateFlag(Visibility._ExplicitlySetLife, true);
    }
    info.showLife = showLife;
    function showCountdown(on) {
        updateFlag(Visibility.Countdown, on);
    }
    info.showCountdown = showCountdown;
    function updateFlag(flag, on) {
        initHUD();
        if (on)
            infoState.visibilityFlag |= flag;
        else
            infoState.visibilityFlag = ~(~infoState.visibilityFlag | flag);
    }
})(info || (info = {}));

return {info};
};
