// Port of PXT Arcade 4.2.1 game.Prompt and game.NumberPrompt (the text-entry
// screen behind game.askForString / game.askForNumber).
// Behaviour reference: microsoft/pxt-common-packages libs/game/prompt.ts and
// numberprompt.ts (MIT, Copyright (c) Microsoft Corporation; see
// static/licenses/pxt-common-packages.MIT.txt).
//
// The original `show` blocks a fiber in pauseUntil and registers controller and
// keyboard-event handlers. This port keeps the state, layout, colours and
// drawing of the original and replaces the blocking with explicit input
// methods that the host calls: keyboardChange / keyboardEnter /
// keyboardCancel for the system keyboard, and moveVertical / moveHorizontal /
// confirm / delete for the on-screen keyboard (arrows, A, B).
//
// host: {font8, RenderText, screenWidth, screenHeight}; every drawing target
// passed to draw() needs fillRect(x,y,w,h,color) and print(text,x,y,color,font).
module.exports = function initializePxtPrompt(host) {
    const {font8: font, RenderText} = host;
    const screenWidth = host.screenWidth || 160, screenHeight = host.screenHeight || 120;
    const idiv = (a, b) => (a / b) | 0;
    const PADDING = 4;
    const NUM_LETTERS = 26;
    const ALPHABET_ROW_LENGTH = 12;
    const NUM_ROWS = Math.ceil(NUM_LETTERS / ALPHABET_ROW_LENGTH);
    const INPUT_ROWS = 2;
    const CONTENT_WIDTH = screenWidth - PADDING * 2;
    const CONTENT_HEIGHT = screenHeight - PADDING * 2;
    const CONTENT_TOP = PADDING;
    // Dimensions of a "cell" that contains a letter
    const CELL_WIDTH = Math.floor(CONTENT_WIDTH / ALPHABET_ROW_LENGTH);
    const CELL_HEIGHT = CELL_WIDTH;
    const LETTER_OFFSET_X = Math.floor((CELL_WIDTH - font.charWidth) / 2);
    const LETTER_OFFSET_Y = Math.floor((CELL_HEIGHT - font.charHeight) / 2);
    const BLANK_PADDING = 1;
    const ROW_LEFT = PADDING + Math.floor((CONTENT_WIDTH - (CELL_WIDTH * ALPHABET_ROW_LENGTH)) / 2);
    // Dimensions of the bottom bar
    const BOTTOM_BAR_ALPHABET_MARGIN = 4;
    const BOTTOM_BAR_HEIGHT = PADDING + BOTTOM_BAR_ALPHABET_MARGIN + CELL_HEIGHT;
    const BOTTOM_BAR_BUTTON_WIDTH = PADDING * 2 + font.charWidth * 3;
    const BOTTOM_BAR_TEXT_Y = (BOTTOM_BAR_HEIGHT - font.charHeight) / 2;
    const BOTTOM_BAR_SHIFT_X = (BOTTOM_BAR_BUTTON_WIDTH - font.charWidth * 3) / 2;
    const BOTTOM_BAR_CONFIRM_X = (BOTTOM_BAR_BUTTON_WIDTH - font.charWidth * 2) / 2;
    const CONFIRM_BUTTON_LEFT = screenWidth - BOTTOM_BAR_BUTTON_WIDTH;
    // Dimensions of the alphabet area
    const ALPHABET_HEIGHT = NUM_ROWS * CELL_HEIGHT;
    const ALPHABET_TOP = CONTENT_TOP + CONTENT_HEIGHT - ALPHABET_HEIGHT - BOTTOM_BAR_HEIGHT;
    const ALPHABET_INPUT_MARGIN = 10;
    // Dimensions of area where text is input
    const INPUT_HEIGHT = INPUT_ROWS * CELL_HEIGHT;
    const INPUT_TOP = ALPHABET_TOP - INPUT_HEIGHT - ALPHABET_INPUT_MARGIN;
    const lowerShiftText = 'ABC';
    const upperShiftText = 'abc';
    const digitsUpper = [' ', ',', '.', '?', '!', ':', ';', '"', '(', ')'];
    const confirmText = 'OK';
    // The simulator's text-prompt instructions (pxsim Keyboard.getLocalizedInstructions).
    const SYSTEM_KEYBOARD_INSTRUCTIONS = 'Type your response using your keyboard and hit ENTER';

    function getCharForIndex(index, upper) {
        if (index < 26) return String.fromCharCode(index + (upper ? 65 : 97));
        return upper ? digitsUpper[index - 26] : '' + (index - 26);
    }

    const defaultTheme = () => ({
        colorPrompt: 1, colorInput: 3, colorInputHighlighted: 5, colorInputText: 1, colorAlphabet: 1,
        colorCursor: 7, colorBackground: 15, colorBottomBackground: 3, colorBottomText: 1
    });

    class Prompt {
        /** clock: () => the scene's millisecond clock (game.runtime()). */
        constructor(clock, theme) {
            this.clock = clock || (() => 0);
            this.theme = theme || defaultTheme();
            this.cursorRow = 0;
            this.cursorColumn = 0;
            this.upper = false;
            this.result = '';
            this.keyboardColumns = ALPHABET_ROW_LENGTH;
            this.keyboardRows = NUM_ROWS;
            this.selectionStart = 0;
            this.selectionEnd = 0;
            this.changeTime = 0;
            this.confirmPressed = false;
            this.useSystemKeyboard = false;
            this.finished = false;
        }

        /** Prompt.show up to the point where the original waits. */
        begin(message, answerLength, useSystemKeyboard) {
            this.message = message;
            this.answerLength = answerLength;
            this.confirmPressed = false;
            this.finished = false;
            this.useSystemKeyboard = !!useSystemKeyboard;
            this.selectionEnd = 0;
            this.selectionStart = 0;
            this.promptText = new RenderText(this.message, CONTENT_WIDTH);
            this.systemKeyboardText = undefined;
        }

        numbersOnly() { return false; }

        // pauseUntil(() => cancelled || finished) in system mode, then pauseUntil(confirmPressed).
        get done() { return this.finished || this.confirmPressed; }

        // --- system keyboard events (KEYBOARD_CHANGE / ENTER / CANCEL) ---
        keyboardChange(value, selectionStart, selectionEnd) {
            if (!this.useSystemKeyboard) return;
            this.result = String(value).substr(0, this.answerLength);
            this.changeTime = this.clock();
            this.selectionStart = selectionStart;
            this.selectionEnd = selectionEnd;
        }
        keyboardEnter() { if (this.useSystemKeyboard) this.finished = true; }
        keyboardCancel() {
            if (!this.useSystemKeyboard) return;
            this.useSystemKeyboard = false;
            this.selectionStart = this.result.length;
            this.selectionEnd = this.selectionStart;
        }

        draw(screen) {
            this.promptText.draw(screen, (screenWidth >> 1) - (this.promptText.width >> 1), CONTENT_TOP, this.theme.colorPrompt, 0, 2);
            this.drawInputArea(screen);
            if (!this.useSystemKeyboard) {
                this.drawKeyboard(screen);
                this.drawBottomBar(screen);
                return;
            }
            if (!this.systemKeyboardText) this.systemKeyboardText = new RenderText(SYSTEM_KEYBOARD_INSTRUCTIONS, CONTENT_WIDTH);
            const text = this.systemKeyboardText;
            screen.fillRect(0, screenHeight - (PADDING << 1) - text.height, screenWidth, screenHeight, this.theme.colorBottomBackground);
            text.draw(screen, PADDING, screenHeight - PADDING - text.height, this.theme.colorBottomText);
        }

        drawInputArea(screen) {
            const answerLeft = ROW_LEFT + Math.floor(((CELL_WIDTH * ALPHABET_ROW_LENGTH) -
                CELL_WIDTH * Math.min(this.answerLength, ALPHABET_ROW_LENGTH)) / 2);
            for (let i = 0; i < this.answerLength; i++) {
                const col = i % ALPHABET_ROW_LENGTH;
                const row = Math.floor(i / ALPHABET_ROW_LENGTH);
                if (this.selectionStart !== this.selectionEnd && i >= this.selectionStart && i < this.selectionEnd) {
                    screen.fillRect(answerLeft + col * CELL_WIDTH, INPUT_TOP + row * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT, this.theme.colorCursor);
                }
                screen.fillRect(answerLeft + col * CELL_WIDTH + BLANK_PADDING, INPUT_TOP + row * CELL_HEIGHT + CELL_HEIGHT - 1,
                    CELL_WIDTH - BLANK_PADDING * 2, 1,
                    !this.useSystemKeyboard && !this.blink() && i === this.selectionStart ? this.theme.colorInputHighlighted : this.theme.colorInput);
                if (i < this.result.length) {
                    screen.print(this.result.charAt(i), answerLeft + col * CELL_WIDTH + LETTER_OFFSET_X,
                        INPUT_TOP + row * CELL_HEIGHT + LETTER_OFFSET_Y, this.theme.colorInputText, font);
                }
            }
            // the blinking text cursor
            if (this.useSystemKeyboard && this.selectionStart === this.selectionEnd && this.selectionStart < this.answerLength) {
                const col = this.selectionStart % ALPHABET_ROW_LENGTH;
                const row = Math.floor(this.selectionStart / ALPHABET_ROW_LENGTH);
                if (!this.blink()) screen.fillRect(answerLeft + col * CELL_WIDTH, INPUT_TOP + row * CELL_HEIGHT, 1, CELL_HEIGHT, this.theme.colorCursor);
            }
        }

        drawKeyboard(screen) {
            const top = screenHeight - BOTTOM_BAR_HEIGHT - this.keyboardRows * CELL_HEIGHT - PADDING;
            const left = (screenWidth >> 1) - ((CELL_WIDTH * this.keyboardColumns) >> 1);
            for (let j = 0; j < this.keyboardRows * this.keyboardColumns; j++) {
                const col = j % this.keyboardColumns;
                const row = idiv(j, this.keyboardColumns);
                if (col === this.cursorColumn && row === this.cursorRow) {
                    screen.fillRect(left + col * CELL_WIDTH, top + row * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT, this.theme.colorCursor);
                }
                screen.print(this.getSymbolForIndex(j), left + col * CELL_WIDTH + LETTER_OFFSET_X,
                    top + row * CELL_HEIGHT + LETTER_OFFSET_Y, this.theme.colorAlphabet);
            }
        }

        drawBottomBar(screen) {
            this.drawBottomBarBackground(screen);
            this.drawShift(screen, this.cursorRow === 3 && !(this.cursorColumn & 1));
            this.drawConfirm(screen, this.cursorRow === 3 && !!(this.cursorColumn & 1));
        }
        drawBottomBarBackground(screen) {
            screen.fillRect(0, screenHeight - BOTTOM_BAR_HEIGHT, screenWidth, BOTTOM_BAR_HEIGHT, this.theme.colorBottomBackground);
        }
        drawShift(screen, highlighted) {
            if (highlighted) screen.fillRect(0, screenHeight - BOTTOM_BAR_HEIGHT, BOTTOM_BAR_BUTTON_WIDTH, BOTTOM_BAR_HEIGHT, this.theme.colorCursor);
            screen.print(this.upper ? upperShiftText : lowerShiftText, BOTTOM_BAR_SHIFT_X,
                screenHeight - BOTTOM_BAR_HEIGHT + BOTTOM_BAR_TEXT_Y, this.theme.colorBottomText);
        }
        drawConfirm(screen, highlighted) {
            if (highlighted) screen.fillRect(CONFIRM_BUTTON_LEFT, screenHeight - BOTTOM_BAR_HEIGHT, BOTTOM_BAR_BUTTON_WIDTH, BOTTOM_BAR_HEIGHT, this.theme.colorCursor);
            screen.print(confirmText, CONFIRM_BUTTON_LEFT + BOTTOM_BAR_CONFIRM_X,
                screenHeight - BOTTOM_BAR_HEIGHT + BOTTOM_BAR_TEXT_Y, this.theme.colorBottomText);
        }

        getSymbolForIndex(index) { return getCharForIndex(index, this.upper); }

        // --- on-screen keyboard controls (up/down/left/right/A/B system key-down handlers) ---
        onButton(button) {
            if (this.useSystemKeyboard) return false;
            switch (button) {
            case 'up': this.moveVertical(true); return true;
            case 'down': this.moveVertical(false); return true;
            case 'right': this.moveHorizontal(true); return true;
            case 'left': this.moveHorizontal(false); return true;
            case 'a': this.confirmSelection(); return true;
            case 'b': this.delete(); return true;
            default: return false;
            }
        }

        moveVertical(up) {
            if (up) {
                if (this.cursorRow === this.keyboardRows) {
                    this.cursorRow = this.keyboardRows - 1;
                    this.cursorColumn = this.cursorColumn % 2 ? this.keyboardColumns - 1 : 0;
                } else this.cursorRow = Math.max(0, this.cursorRow - 1);
            } else {
                this.cursorRow = Math.min(this.keyboardRows, this.cursorRow + 1);
                // Go to closest button
                if (this.cursorRow === this.keyboardRows) this.cursorColumn = this.cursorColumn > 5 ? 1 : 0;
            }
        }
        moveHorizontal(right) {
            if (right) this.cursorColumn = (this.cursorColumn + 1) % this.keyboardColumns;
            else this.cursorColumn = (this.cursorColumn + (this.keyboardColumns - 1)) % this.keyboardColumns;
        }
        confirmSelection() {
            if (this.cursorRow === 3) {
                if (this.cursorColumn % 2) this.confirmPressed = true;
                else this.upper = !this.upper;
            } else {
                if (this.selectionStart >= this.answerLength) return;
                const index = this.cursorColumn + this.cursorRow * this.keyboardColumns;
                const letter = getCharForIndex(index, this.upper);
                this.result = !this.result ? letter : this.result + letter;
                this.changeTime = this.clock();
                this.changeInputIndex(1);
            }
        }
        delete() {
            if (this.selectionStart <= 0) return;
            this.result = this.result.substr(0, this.result.length - 1);
            this.changeInputIndex(-1);
        }
        changeInputIndex(delta) {
            this.selectionStart += delta;
            this.selectionEnd = this.selectionStart;
        }
        blink() { return idiv(this.clock() - this.changeTime, 500) & 1; }
    }

    class NumberPrompt extends Prompt {
        constructor(clock, theme) {
            super(clock, theme);
            this.keyboardColumns = 3;
            this.keyboardRows = 4;
        }
        numbersOnly() { return true; }
        drawBottomBar(screen) {
            this.drawBottomBarBackground(screen);
            this.drawConfirm(screen, this.cursorRow === 4);
        }
        confirmSelection() {
            if (this.cursorRow === 4) {
                this.confirmPressed = true;
            } else {
                if (this.selectionStart >= this.answerLength) return;
                const index = this.cursorColumn + this.cursorRow * this.keyboardColumns;
                const letter = this.getSymbolForIndex(index);
                if (letter === '.' && this.result.indexOf('.') !== -1) return;
                if (letter === '-' && this.result && this.result.length > 0) return;
                this.result = !this.result ? letter : this.result + letter;
                this.changeInputIndex(1);
            }
        }
        moveVertical(up) {
            super.moveVertical(up);
            if (up && this.cursorRow === this.keyboardRows - 1) this.cursorColumn = this.keyboardColumns - 1;
        }
        getSymbolForIndex(index) {
            if (index < 9) {
                // Calculator Layout
                return '' + (3 * idiv(9 - index - 1, 3) + index % 3 + 1);
            } else if (index === 9) return '-';
            else if (index === 10) return '0';
            else if (index === 11) return '.';
            return '';
        }
    }

    /** The simulator's text-field filter for number prompts (pxsim validateNumberInput). */
    function cleanNumberInput(value) {
        let cleaned = '';
        for (const current of String(value)) {
            if (current === '-') {
                if (cleaned.length !== 0) continue;
            } else if (current === '.') {
                if (cleaned.indexOf('.') !== -1) continue;
            } else if (!/[0-9]/.test(current)) continue;
            cleaned += current;
        }
        return cleaned;
    }

    return {Prompt, NumberPrompt, cleanNumberInput, constants: {CELL_WIDTH, INPUT_TOP, ALPHABET_TOP, BOTTOM_BAR_HEIGHT}};
};
