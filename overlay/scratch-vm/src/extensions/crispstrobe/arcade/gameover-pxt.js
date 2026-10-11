// Generated from PXT Arcade 4.2.1, pxt-common-packages (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// textDialogs.ts: d52d1c046debe4f889f2a82792882de2358f68233037cf4ca42cbfdf3d408caf
// game.ts GameOverConfig and ScoringType: 469b4878af4d18d6048e64fd76dbc632a62c4a69b06dda4d54e228c4256042bd
// Regenerate: node scripts/generate-arcade-gameover.mjs
module.exports = function initializePxtGameOver(host) {
const {image, img, screen, info, effects, music, control, controller, scene} = host;
const Math = Object.create(globalThis.Math);
Math.idiv = (a, b) => (a / b) | 0;
var DialogLayout;
(function (DialogLayout) {
    //% block=bottom
    DialogLayout[DialogLayout["Bottom"] = 0] = "Bottom";
    //% block=left
    DialogLayout[DialogLayout["Left"] = 1] = "Left";
    //% block=right
    DialogLayout[DialogLayout["Right"] = 2] = "Right";
    //% block=top
    DialogLayout[DialogLayout["Top"] = 3] = "Top";
    //% block=center
    DialogLayout[DialogLayout["Center"] = 4] = "Center";
    //% block="full screen"
    DialogLayout[DialogLayout["Full"] = 5] = "Full";
})(DialogLayout || (DialogLayout = {}));
var game;
(function (game) {
    function padStr(len) {
        let str = "";
        for (let i = 0; i < len; ++i) {
            str += " ";
        }
        return str;
    }
    function replaceRange(dst, src, start, len) {
        return dst.substr(0, start) + src.substr(0, len) + dst.substr(start + len);
    }
    function screenColor(c) {
        return screen.isMono ? 1 : c;
    }
    let dialogFrame;
    let dialogCursor;
    let dialogTextColor;
    const MAX_FRAME_UNIT = 12;
    class BaseDialog {
        constructor(width, height, frame, font, cursor) {
            this.cursorCount = 0;
            this.resize(width, height, frame, font, cursor);
        }
        resize(width, height, frame, font, cursor) {
            this.frame = frame || dialogFrame || (dialogFrame = defaultFrame());
            this.unit = Math.floor(this.frame.width / 3);
            this.columns = Math.floor(width / this.unit);
            this.rows = Math.floor(height / this.unit);
            this.innerLeft = (width - (this.columns * this.unit)) >> 1;
            this.innerTop = (height - (this.rows * this.unit)) >> 1;
            this.image = image.create(width, height);
            this.font = font || image.font8;
            this.cursor = cursor || dialogCursor || (dialogCursor = defaultCursorImage());
            this.textColor = dialogTextColor == undefined ? dialogTextColor = 15 : dialogTextColor;
            this.drawBorder();
            this.clearInterior();
        }
        update() {
            this.clearInterior();
            this.drawTextCore();
            this.drawCursorRow();
        }
        setText(rawString) {
            // implemented by subclass
        }
        drawTextCore() {
            // Implemented by subclass
        }
        drawCursorRow() {
            let offset = 0;
            if (this.cursorCount > 20) {
                offset = 1;
            }
            this.cursorCount = (this.cursorCount + 1) % 40;
            this.image.drawTransparentImage(this.cursor, this.innerLeft + this.textAreaWidth() + this.unit + offset - this.cursor.width, this.innerTop + this.unit + this.textAreaHeight() + 1 - this.cursorRowHeight());
        }
        drawBorder() {
            if (this.unit == 1) {
                this.fastFill(0, 0, 0, 1, 1);
                this.fastFill(1, 1, 0, this.columns - 2, 1);
                this.fastFill(2, this.columns - 1, 0, 1, 1);
                this.fastFill(3, 0, 1, 1, this.rows - 2);
                this.fastFill(5, this.columns - 1, 1, 1, this.rows - 2);
                const y = this.rows - 1;
                this.fastFill(6, 0, y, 1, 1);
                this.fastFill(7, 1, y, this.columns - 2, 1);
                this.fastFill(8, this.columns - 1, y, 1, 1);
                return;
            }
            for (let c = 0; c < this.columns; c++) {
                if (c == 0) {
                    this.drawPartial(0, 0, 0);
                    this.drawPartial(6, 0, this.rows - 1);
                }
                else if (c === this.columns - 1) {
                    this.drawPartial(2, c, 0);
                    this.drawPartial(8, c, this.rows - 1);
                }
                else {
                    this.drawPartial(1, c, 0);
                    this.drawPartial(7, c, this.rows - 1);
                }
            }
            for (let r = 1; r < this.rows - 1; r++) {
                this.drawPartial(3, 0, r);
                this.drawPartial(5, this.columns - 1, r);
            }
        }
        fastFill(index, x, y, w, h) {
            const color = this.frame.getPixel(index % 3, Math.idiv(index, 3));
            this.image.fillRect(this.innerLeft + x, this.innerTop + y, w, h, color);
        }
        clearInterior() {
            if (this.unit == 1)
                return this.fastFill(4, 1, 1, this.columns - 2, this.rows - 2);
            for (let d = 1; d < this.columns - 1; d++) {
                for (let s = 1; s < this.rows - 1; s++) {
                    this.drawPartial(4, d, s);
                }
            }
        }
        drawPartial(index, colTo, rowTo) {
            const x0 = this.innerLeft + colTo * this.unit;
            const y0 = this.innerTop + rowTo * this.unit;
            const xf = (index % 3) * this.unit;
            const yf = Math.idiv(index, 3) * this.unit;
            for (let e = 0; e < this.unit; e++) {
                for (let t = 0; t < this.unit; t++) {
                    this.image.setPixel(x0 + e, y0 + t, this.frame.getPixel(xf + e, yf + t));
                }
            }
        }
        cursorRowHeight() {
            return this.cursor.height + 1;
        }
        rowHeight() {
            return this.font.charHeight + 1;
        }
        textAreaWidth() {
            return this.image.width - ((this.innerLeft + Math.min(this.unit, MAX_FRAME_UNIT)) << 1) - 2;
        }
        textAreaHeight() {
            return this.image.height - ((this.innerTop + Math.min(this.unit, MAX_FRAME_UNIT)) << 1) - 1;
        }
        setFont(font) {
            this.font = font;
        }
    }
    game.BaseDialog = BaseDialog;
    class Dialog extends BaseDialog {
        constructor(width, height, frame, font, cursor) {
            super(width, height, frame, font, cursor);
            this.chunkIndex = 0;
        }
        hasNext() {
            if (!this.chunks || this.chunks.length === 0)
                return false;
            return this.chunkIndex < this.chunks.length - 1;
        }
        hasPrev() {
            if (!this.chunks || this.chunks.length === 0)
                return false;
            return this.chunkIndex > 0;
        }
        nextPage() {
            if (this.hasNext()) {
                this.chunkIndex++;
            }
        }
        prevPage() {
            if (this.hasPrev()) {
                this.chunkIndex--;
            }
        }
        chunkText(str) {
            const charactersPerRow = Math.floor(this.textAreaWidth() / this.font.charWidth);
            const charactersPerCursorRow = Math.floor(charactersPerRow - (this.cursor.width / this.font.charWidth));
            const rowsOfCharacters = Math.floor(this.textAreaHeight() / this.rowHeight());
            const rowsWithCursor = Math.ceil(this.cursor.height / this.rowHeight());
            let lineLengths = [];
            for (let i = 0; i < rowsOfCharacters - rowsWithCursor; i++)
                lineLengths.push(charactersPerRow);
            for (let i = 0; i < rowsWithCursor; i++)
                lineLengths.push(charactersPerCursorRow);
            return breakIntoPages(str, lineLengths);
        }
        setText(rawString) {
            this.setFont(image.getFontForText(rawString));
            this.chunks = this.chunkText(rawString);
            this.chunkIndex = 0;
        }
        drawTextCore() {
            if (!this.chunks || this.chunks.length === 0)
                return;
            const lines = this.chunks[this.chunkIndex];
            const availableWidth = this.textAreaWidth();
            const availableHeight = this.textAreaHeight();
            const charactersPerRow = Math.floor(availableWidth / this.font.charWidth);
            const rowsOfCharacters = Math.floor(availableHeight / this.rowHeight());
            if (this.unit > MAX_FRAME_UNIT)
                this.drawBorder();
            const textLeft = 1 + this.innerLeft + Math.min(this.unit, MAX_FRAME_UNIT) + ((availableWidth - charactersPerRow * this.font.charWidth) >> 1);
            const textTop = 1 + (this.image.height >> 1) - ((lines.length * this.rowHeight()) >> 1);
            for (let row = 0; row < lines.length; row++) {
                this.image.print(lines[row], textLeft, textTop + row * this.rowHeight(), this.textColor, this.font);
            }
        }
    }
    game.Dialog = Dialog;
    class SplashDialog extends game.BaseDialog {
        constructor(width, height) {
            super(width, height, defaultSplashFrame());
            this.maxOffset = -1;
            this.maxSubOffset = -1;
            this.textColor = 1;
        }
        updateFont() {
            this.setFont(image.getFontForText((this.text || "") + (this.subtext || "")));
        }
        setText(text) {
            this.text = text;
            this.updateFont();
            this.offset = 0;
            this.maxOffset = text.length * this.font.charWidth - screen.width + (this.unit << 1);
            this.timer = 2;
        }
        setSubtext(sub) {
            this.subtext = sub;
            this.updateFont();
            this.maxSubOffset = sub.length * (this.font.charWidth) - screen.width + (this.unit << 1);
        }
        drawTextCore() {
            const scrollMax = Math.max(this.maxOffset, this.maxSubOffset);
            if (this.timer > 0) {
                this.timer -= game.eventContext().deltaTime;
                if (this.timer <= 0) {
                    if (this.offset > 0) {
                        this.offset = 0;
                        this.timer = 2;
                    }
                }
            }
            else {
                this.offset++;
                if (this.offset >= scrollMax) {
                    this.offset = scrollMax;
                    this.timer = 2;
                }
            }
            const ytitle = 10;
            if (this.maxOffset < 0) {
                const left = (this.image.width >> 1) - (this.text.length * this.font.charWidth >> 1);
                this.image.print(this.text, left, ytitle, this.textColor, this.font);
            }
            else {
                this.image.print(this.text, this.unit - this.offset, ytitle, this.textColor, this.font);
            }
            if (this.subtext) {
                const ysub = ytitle + this.font.charHeight + 2;
                if (this.maxSubOffset < 0) {
                    const left = (this.image.width >> 1) - (this.subtext.length * this.font.charWidth >> 1);
                    this.image.print(this.subtext, left, ysub, this.textColor, this.font);
                }
                else {
                    this.image.print(this.subtext, this.unit - (Math.min(this.offset, this.maxSubOffset)), ysub, this.textColor, this.font);
                }
            }
            this.drawBorder();
        }
    }
    game.SplashDialog = SplashDialog;
    const img_trophy_sm = img `
    . . . . . . . 
    . 4 5 5 5 1 . 
    . 4 5 5 5 1 . 
    . 4 5 5 5 1 . 
    . . 4 5 1 . . 
    . . . 5 . . . 
    . . 4 5 1 . . 
    . . . . . . . 
    `;
    const img_trophy_lg = img `
    . . . . . . . . . . . . . . . . 
    . . . . . . . . . . . . . . . . 
    . . . . . 5 5 5 5 5 5 . . . . . 
    . . . . 5 4 4 4 4 4 4 5 . . . . 
    . . . . 5 5 5 5 5 5 5 5 . . . . 
    . . . . 4 5 5 5 5 5 5 1 . . . . 
    . . . 5 4 4 5 5 5 5 1 1 5 . . . 
    . . 5 . 4 4 5 5 5 5 1 1 . 5 . . 
    . . 5 . 4 4 5 5 5 5 1 1 . 5 . . 
    . . . 5 4 4 5 5 5 5 1 1 5 . . . 
    . . . . 4 4 5 5 5 5 1 1 . . . . 
    . . . . . 4 5 5 5 1 1 . . . . . 
    . . . . . . 4 5 1 1 . . . . . . 
    . . . . . . . 4 1 . . . . . . . 
    . . . . . 4 4 5 5 1 1 . . . . . 
    . . . . . . . . . . . . . . . . 
    `;
    const img_sleepy_sim = img `
    . . . . . . . . . . . . . . . . 
    . . . 6 6 6 6 6 6 6 6 6 6 . . . 
    . . 6 f f f f f f f f f f 6 . . 
    . . 6 f f f f f f f f f f 6 . . 
    . . 6 f f 1 1 f f 1 1 f f 6 . . 
    . . 6 f f f f f f f f f f 6 . . 
    . . 6 f f f f 1 1 f f f f 6 . . 
    . . 6 f f f f f f f f f f 6 . . 
    . . 6 6 6 6 6 6 6 6 6 6 6 6 . . 
    . . 6 6 f 6 6 6 6 6 6 6 f 6 . . 
    . . 6 f f f 6 6 6 6 6 6 6 6 . . 
    . . 6 6 f 6 6 6 6 6 f 6 6 6 . . 
    . . 6 6 6 6 6 6 6 6 6 6 6 6 . . 
    . . . 6 6 6 6 6 6 6 6 6 6 . . . 
    . . . . . . . . . . . . . . . . 
    . . . . . . . . . . . . . . . . 
    `;
    class GameOverPlayerScore {
        constructor(player, value, winner) {
            this.player = player;
            this.value = value;
            this.winner = winner;
        }
    }
    game.GameOverPlayerScore = GameOverPlayerScore;
    let GameOverDialogFlags;
    (function (GameOverDialogFlags) {
        GameOverDialogFlags[GameOverDialogFlags["WIN"] = 1] = "WIN";
        GameOverDialogFlags[GameOverDialogFlags["HAS_BEST"] = 2] = "HAS_BEST";
        GameOverDialogFlags[GameOverDialogFlags["NEW_BEST"] = 4] = "NEW_BEST";
        GameOverDialogFlags[GameOverDialogFlags["MULTIPLAYER"] = 8] = "MULTIPLAYER";
        GameOverDialogFlags[GameOverDialogFlags["HAS_SCORES"] = 16] = "HAS_SCORES";
    })(GameOverDialogFlags || (GameOverDialogFlags = {}));
    ;
    class GameOverDialog extends game.BaseDialog {
        get isWinCondition() { return !!(this.flags & GameOverDialogFlags.WIN); }
        get isJudgedGame() { return this.judged; }
        get hasScores() { return !!(this.flags & GameOverDialogFlags.HAS_SCORES); }
        get hasBestScore() { return !!(this.flags & GameOverDialogFlags.HAS_BEST); }
        get isNewBestScore() { return !!(this.flags & GameOverDialogFlags.NEW_BEST); }
        get isMultiplayerGame() { return !!(this.flags & GameOverDialogFlags.MULTIPLAYER); }
        constructor(win, message, judged, scores, bestScore, winnerOverride) {
            super(screen.width, 46, defaultSplashFrame());
            this.message = message;
            this.judged = judged;
            this.scores = scores;
            this.bestScore = bestScore;
            this.winnerOverride = winnerOverride;
            this.cursorOn = false;
            this.flags = 0;
            if (win) {
                this.flags |= GameOverDialogFlags.WIN;
            }
            // Fixup states in case of winner override
            if (winnerOverride) {
                win = true;
                this.flags |= GameOverDialogFlags.WIN;
                // For display purposes, treat this as a multiplayer game
                this.flags |= GameOverDialogFlags.MULTIPLAYER;
                const score = scores.find(score => score.player === winnerOverride);
                if (!score) {
                    scores.push(new GameOverPlayerScore(winnerOverride, null, true));
                    scores.sort((a, b) => a.player - b.player);
                }
                scores.forEach(score => score.winner = score.player === winnerOverride);
            }
            if (scores.length) {
                // If any score present is other than player 1, this is a multiplayer game
                scores.forEach(score => score.player > 1 && (this.flags |= GameOverDialogFlags.MULTIPLAYER));
                if (win) {
                    let winner = scores.find(score => score.winner);
                    if (!winner && scores.length === 1)
                        winner = scores[0];
                    if (winner) {
                        if (winner.value != null) {
                            if (bestScore == null) {
                                this.bestScore = winner.value;
                                this.flags |= GameOverDialogFlags.NEW_BEST;
                            }
                            else if (info.isBetterScore(winner.value, bestScore)) {
                                this.bestScore = winner.value;
                                this.flags |= GameOverDialogFlags.NEW_BEST;
                            }
                        }
                        // Replace string tokens with resolved values
                        this.message = this.message
                            .replaceAll("${WINNER}", "PLAYER " + winner.player)
                            .replaceAll("${Winner}", "Player " + winner.player)
                            .replaceAll("${winner}", "player " + winner.player)
                            .replaceAll("${winner_short}", "P" + winner.player);
                    }
                }
            }
            const scoresWithValues = scores.filter(score => score.value != null);
            if (scoresWithValues.length)
                this.flags |= GameOverDialogFlags.HAS_SCORES;
            if (this.isWinCondition && this.isJudgedGame && this.hasScores && (this.bestScore != null)) {
                this.flags |= GameOverDialogFlags.HAS_BEST;
            }
            // Two scores per row
            const scoreRows = Math.max(0, scoresWithValues.length - 1) >> 1;
            this.height = 47 + scoreRows * image.font5.charHeight;
            this.resize(screen.width, this.height, defaultSplashFrame());
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
        drawMessage() {
            const currY = 5;
            this.image.printCenter(this.message, currY, screenColor(5), image.font8);
        }
        drawScores() {
            if (this.hasScores) {
                const scores = this.scores.filter(score => score.value != null);
                let currY = image.font5.charHeight + 16;
                if (this.isMultiplayerGame) {
                    if (scores.length === 1) {
                        // Multiplayer special case: Only one player scored
                        const score = scores[0];
                        score.str = "P" + score.player + ":" + score.value;
                        this.image.printCenter(score.str, currY, screenColor(1), image.font5);
                        if (score.winner) {
                            // In multiplayer, the winning score gets a trophy
                            const x = (this.image.width >> 1) - ((score.str.length * image.font5.charWidth) >> 1);
                            this.image.drawTransparentImage(img_trophy_sm, x - img_trophy_sm.width - 3, currY - 2);
                        }
                    }
                    else {
                        // Multiplayer general case: Multiple players scored
                        // Compute max score width
                        const strlens = [0, 0];
                        for (let i = 0; i < scores.length; ++i) {
                            const col = i % 2;
                            const score = scores[i];
                            score.str = "P" + score.player + ":" + score.value;
                            strlens[col] = Math.max(strlens[col], score.str.length);
                        }
                        // Print scores in a grid, two per row
                        for (let i = 0; i < scores.length; ++i) {
                            const col = i % 2;
                            const score = scores[i];
                            let str = padStr(strlens[col]);
                            str = replaceRange(str, score.str, 0, score.str.length);
                            let x = 0;
                            if (col === 0) {
                                x = (this.image.width >> 1) - strlens[col] * image.font5.charWidth - 3;
                            }
                            else {
                                x = (this.image.width >> 1) + 3;
                            }
                            if (score.winner) {
                                // In multiplayer, the winning score gets a trophy
                                if (i % 2 === 0) {
                                    this.image.drawTransparentImage(img_trophy_sm, x - img_trophy_sm.width - 3, currY - 2);
                                }
                                else {
                                    this.image.drawTransparentImage(img_trophy_sm, x + score.str.length * image.font5.charWidth + 2, currY - 2);
                                }
                            }
                            this.image.print(str, x, currY, screenColor(1), image.font5);
                            if (i % 2 === 1) {
                                currY += image.font5.charHeight + 2;
                            }
                        }
                    }
                }
                else {
                    // Single player case
                    const score = scores[0];
                    score.str = "Score:" + score.value;
                    this.image.printCenter(score.str, currY - 1, screenColor(1), image.font8 // Single player score gets a bigger font
                    );
                }
            }
            else if (this.isWinCondition) {
                // No score, but there is a win condition. Show a trophy.
                let currY = image.font5.charHeight + 14;
                this.image.drawTransparentImage(img_trophy_lg, (this.image.width >> 1) - (img_trophy_lg.width >> 1), currY);
            }
            else {
                // No score, no win, show a generic game over icon (sleepy sim)
                let currY = image.font5.charHeight + 14;
                this.image.drawTransparentImage(img_sleepy_sim, (this.image.width >> 1) - (img_sleepy_sim.width >> 1), currY);
            }
        }
        drawBestScore() {
            if (this.hasBestScore) {
                const currY = this.height - image.font8.charHeight - 5;
                if (this.isNewBestScore) {
                    const label = "New Best Score!";
                    this.image.printCenter(label, currY, screenColor(9), image.font8);
                    // In single player draw trophy icons on either side of the label.
                    // In multiplayer a trophy icon is drawn next to the winning score instead.
                    if (!this.isMultiplayerGame) {
                        const halfWidth = (label.length * image.font8.charWidth) >> 1;
                        this.image.drawTransparentImage(img_trophy_sm, (this.image.width >> 1) - halfWidth - img_trophy_sm.width - 2, currY);
                        this.image.drawTransparentImage(img_trophy_sm, (this.image.width >> 1) + halfWidth, currY);
                    }
                }
                else {
                    this.image.printCenter("Best:" + this.bestScore, currY, screenColor(9), image.font8);
                }
            }
        }
        drawTextCore() {
            this.drawMessage();
            this.drawScores();
            this.drawBestScore();
        }
    }
    game.GameOverDialog = GameOverDialog;
    /**
     * Show a long text string in a dialog box that will scroll
     * using the "A" or "down" buttons. The previous section of the
     * text is shown using the "up" button. This function
     * halts execution until the last page of text is dismissed.
     *
     * @param str The text to display
     * @param layout The layout to use for the dialog box
     */
    //% blockId=game_show_long_text group="Dialogs"
    //% block="show long text %str %layout"
    //% str.shadow=text
    //% help=game/show-long-text
    function showLongText(str, layout) {
        str = console.inspect(str);
        controller._setUserEventsEnabled(false);
        game.pushScene();
        game.currentScene().flags |= scene.Flag.SeeThrough;
        let width;
        let height;
        let top;
        let left;
        switch (layout) {
            case DialogLayout.Bottom:
                width = screen.width - 4;
                height = Math.idiv(screen.height, 3) + 5;
                top = screen.height - height;
                left = screen.width - width >> 1;
                break;
            case DialogLayout.Top:
                width = screen.width - 4;
                height = Math.idiv(screen.height, 3) + 5;
                top = 0;
                left = screen.width - width >> 1;
                break;
            case DialogLayout.Left:
                width = Math.idiv(screen.width, 3) + 5;
                height = screen.height;
                top = 0;
                left = 0;
                break;
            case DialogLayout.Right:
                width = Math.idiv(screen.width, 3) + 5;
                height = screen.height;
                top = 0;
                left = screen.width - width;
                break;
            case DialogLayout.Center:
                width = Math.idiv(screen.width << 1, 3);
                height = Math.idiv(screen.width << 1, 3);
                top = (screen.height - height) >> 1;
                left = (screen.width - width) >> 1;
                break;
            case DialogLayout.Full:
                width = screen.width;
                height = screen.height;
                top = 0;
                left = 0;
                break;
        }
        const dialog = new Dialog(width, height);
        const s = sprites.create(dialog.image, -1);
        s.top = top;
        s.left = left;
        dialog.setText(str);
        let pressed = true;
        let done = false;
        let upPressed = true;
        game.onUpdate(() => {
            dialog.update();
            const currentState = controller.A.isPressed() || controller.down.isPressed();
            if (currentState && !pressed) {
                pressed = true;
                if (dialog.hasNext()) {
                    dialog.nextPage();
                }
                else {
                    scene.setBackgroundImage(null); // GC it
                    game.popScene();
                    done = true;
                }
            }
            else if (pressed && !currentState) {
                pressed = false;
            }
            const moveBack = controller.up.isPressed();
            if (moveBack && !upPressed) {
                upPressed = true;
                if (dialog.hasPrev()) {
                    dialog.prevPage();
                }
            }
            else if (upPressed && !moveBack) {
                upPressed = false;
            }
        });
        pauseUntil(() => done);
        controller._setUserEventsEnabled(true);
    }
    game.showLongText = showLongText;
    function defaultFrame() {
        return screen.isMono ?
            img `
        1 1 1
        1 . 1
        1 1 1
        `
            :
                img `
        . . . . . . . . . . . .
        . b b b b b b b b b b .
        . b b b b b b b b b b c
        . b b d 1 1 1 1 d b b c
        . b b 1 1 1 1 1 1 b b c
        . b b 1 1 1 1 1 1 b b c
        . b b 1 1 1 1 1 1 b b c
        . b b 1 1 1 1 1 1 b b c
        . b b d 1 1 1 1 d b b c
        . b b b b b b b b b b c
        . b b b b b b b b b b c
        . . c c c c c c c c c c
        `;
    }
    function defaultSplashFrame() {
        return screen.isMono ?
            img `
        1 1 1
        . . .
        1 1 1
        `
            :
                img `
        1 1 1
        f f f
        1 1 1
        `;
    }
    function defaultCursorImage() {
        return screen.isMono ?
            img `
        1 1 1 1 1 1 1 . . .
        1 . . 1 . . . 1 . .
        1 . 1 . 1 . . . 1 .
        1 . 1 1 1 . . . . 1
        1 . 1 . 1 . . . 1 .
        1 . . . . . . 1 . .
        1 1 1 1 1 1 1 . . .
        . . . . . . . . . .
        `
            :
                img `
        0 0 0 6 6 6 6 6 0 0 0
        0 6 6 7 7 7 7 7 6 6 0
        0 6 7 7 1 1 1 7 7 6 0
        6 7 7 1 7 7 7 1 7 7 6
        6 7 7 1 7 7 7 1 7 7 6
        6 7 7 1 1 1 1 1 7 7 6
        6 6 7 1 7 7 7 1 7 6 6
        8 6 6 1 7 7 7 1 6 6 8
        8 6 6 7 6 6 6 7 6 6 8
        0 8 6 6 6 6 6 6 6 8 0
        0 0 8 8 8 8 8 8 8 0 0
        `;
    }
    /**
     * Change the default dialog frame to a new image. Dialog frames
     * are divided into three rows and three columns and are used to define
     * the outer frame of the dialog box.
     *
     * @param frame A square image with a width and height divisible by three
     */
    //% blockId=game_dialog_set_frame group="Dialogs"
    //% block="set dialog frame to %frame=dialog_image_picker"
    //% help=game/set-dialog-frame
    function setDialogFrame(frame) {
        dialogFrame = frame;
    }
    game.setDialogFrame = setDialogFrame;
    /**
     * Change the default image used for the cursor that appears in the
     * bottom left of the dialog box.
     *
     * @param cursor The image to use for the cursor
     */
    //% blockId=game_dialog_set_cursor group="Dialogs"
    //% block="set dialog cursor to %frame=screen_image_picker"
    //% help=game/set-dialog-cursor
    function setDialogCursor(cursor) {
        dialogCursor = cursor;
    }
    game.setDialogCursor = setDialogCursor;
    /**
     * Change the color for the text in dialog boxes.
     *
     * @param color The index of the color 0-15
     */
    //% blockId=game_dialog_set_text_color group="Dialogs"
    //% block="set dialog text color to %color=colorindexpicker"
    //% help=game/set-dialog-text-color
    function setDialogTextColor(color) {
        dialogTextColor = Math.floor(Math.min(15, Math.max(0, color)));
    }
    game.setDialogTextColor = setDialogTextColor;
    // this function is deprecated
    //% deprecated blockHidden
    function setDialogFont(font) {
    }
    game.setDialogFont = setDialogFont;
    /**
     * Show a title and an optional subtitle menu
     * @param title
     * @param subtitle
     */
    //% weight=90 help=game/splash
    //% blockId=gameSplash block="splash %title||%subtitle"
    //% title.shadow=text
    //% subtitle.shadow=text
    //% group="Prompt"
    function splash(title, subtitle) {
        title = console.inspect(title);
        subtitle = subtitle ? console.inspect(subtitle) : subtitle;
        controller._setUserEventsEnabled(false);
        game.pushScene();
        game.currentScene().flags |= scene.Flag.SeeThrough;
        const dialog = new SplashDialog(screen.width, subtitle ? 42 : 35);
        dialog.setText(title);
        if (subtitle)
            dialog.setSubtext(subtitle);
        const s = sprites.create(dialog.image, -1);
        let pressed = true;
        let done = false;
        game.onUpdate(() => {
            dialog.update();
            const currentState = controller.A.isPressed();
            if (currentState && !pressed) {
                pressed = true;
                scene.setBackgroundImage(null); // GC it
                game.popScene();
                done = true;
            }
            else if (pressed && !currentState) {
                pressed = false;
            }
        });
        pauseUntil(() => done);
        controller._setUserEventsEnabled(true);
    }
    game.splash = splash;
    function isBreakCharacter(charCode) {
        return charCode <= 32 ||
            (charCode >= 58 && charCode <= 64) ||
            (charCode >= 91 && charCode <= 96) ||
            (charCode >= 123 && charCode <= 126) ||
            (charCode >= 19968 && charCode <= 40869) ||
            charCode == 12290 ||
            charCode == 65292;
    }
    function breakIntoPages(text, lineLengths) {
        const result = [];
        let currentPage = [];
        let lastBreakLocation = 0;
        let lastBreak = 0;
        let line = 0;
        let lineLength = lineLengths[line];
        function nextLine() {
            line++;
            lineLength = lineLengths[line];
        }
        for (let index = 0; index < text.length; index++) {
            if (text.charAt(index) === "\n") {
                currentPage.push(formatLine(text.substr(lastBreak, index - lastBreak)));
                index++;
                lastBreak = index;
                nextLine();
            }
            // Handle \\n in addition to \n because that's how it gets converted from blocks
            else if (text.charAt(index) === "\\" && text.charAt(index + 1) === "n") {
                currentPage.push(formatLine(text.substr(lastBreak, index - lastBreak)));
                index += 2;
                lastBreak = index;
                nextLine();
            }
            else if (isBreakCharacter(text.charCodeAt(index))) {
                lastBreakLocation = index;
            }
            if (index - lastBreak === lineLength) {
                if (lastBreakLocation === index || lastBreakLocation <= lastBreak) {
                    currentPage.push(formatLine(text.substr(lastBreak, lineLength)));
                    lastBreak = index;
                    nextLine();
                }
                else {
                    currentPage.push(formatLine(text.substr(lastBreak, lastBreakLocation - lastBreak)));
                    lastBreak = lastBreakLocation;
                    nextLine();
                }
            }
            if (line >= lineLengths.length) {
                line = 0;
                lineLength = lineLengths[line];
                result.push(currentPage);
                currentPage = [];
            }
        }
        currentPage.push(formatLine(text.substr(lastBreak, text.length - lastBreak)));
        if (currentPage.length > 1 || currentPage[0] !== "") {
            result.push(currentPage);
        }
        return result;
    }
    function formatLine(text) {
        let i = 0;
        while (text.charAt(i) === " ")
            i++;
        return text.substr(i, text.length);
    }
})(game || (game = {}));
(function (game) {
    let ScoringType;
    (function (ScoringType) {
        //% block="high score"
        ScoringType[ScoringType["HighScore"] = 0] = "HighScore";
        //% block="low score"
        ScoringType[ScoringType["LowScore"] = 1] = "LowScore";
        //% block="none"
        ScoringType[ScoringType["None"] = 2] = "None";
    })(ScoringType = game.ScoringType || (game.ScoringType = {}));
    class GameOverConfig {
        constructor() {
            this.init();
        }
        init() {
            this.scoringType = ScoringType.HighScore;
            this.winEffect = effects.confetti;
            this.loseEffect = effects.melt;
            this.winSound = music.melodyPlayable(music.powerUp);
            this.loseSound = music.melodyPlayable(music.wawawawaa);
            this.winSoundLooping = false;
            this.loseSoundLooping = false;
            this.winMessage = "YOU WIN!";
            this.winMessageMultiplayer = "${WINNER} WINS!";
            this.loseMessage = "GAME OVER";
            this.effectSetByUser = false;
            this.soundSetByUser = false;
            this.messageSetByUser = false;
            this.scoringTypeSetByUser = false;
        }
        setScoringType(type, explicit) {
            if (!explicit && this.scoringTypeSetByUser)
                return;
            this.scoringType = type;
            if (explicit)
                this.scoringTypeSetByUser = true;
        }
        setEffect(win, effect, explicit) {
            if (!explicit && this.effectSetByUser)
                return;
            if (win)
                this.winEffect = effect;
            else
                this.loseEffect = effect;
            if (explicit)
                this.effectSetByUser = true;
        }
        getEffect(win) {
            return win ? this.winEffect : this.loseEffect;
        }
        setSound(win, sound, looping, explicit) {
            if (!explicit && this.soundSetByUser)
                return;
            if (win) {
                this.winSound = sound;
                this.winSoundLooping = looping;
            }
            else {
                this.loseSound = sound;
                this.loseSoundLooping = looping;
            }
            if (explicit)
                this.soundSetByUser = true;
        }
        getSound(win) {
            return win ? this.winSound : this.loseSound;
        }
        getSoundLooping(win) {
            return win ? this.winSoundLooping : this.loseSoundLooping;
        }
        setMessage(win, message, explicit) {
            if (!explicit && this.messageSetByUser)
                return;
            if (win)
                this.winMessage = message;
            else
                this.loseMessage = message;
            if (explicit)
                this.messageSetByUser = true;
        }
        getMessage(win, preferMultiplayer) {
            if (this.messageSetByUser)
                return win ? this.winMessage : this.loseMessage;
            else if (preferMultiplayer)
                return win ? this.winMessageMultiplayer : this.loseMessage;
            else
                return win ? this.winMessage : this.loseMessage;
        }
    }
    game.GameOverConfig = GameOverConfig;
})(game || (game = {}));

return {game};
};
