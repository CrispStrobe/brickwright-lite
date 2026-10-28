// Generated from PXT Arcade 4.2.1, pxt-common-packages (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// renderText.ts: ef8fee54ed6dc02be0a239092f24a5ca07e53a1d7a3b70385ee226196638eb2c
// spritesay.ts: d9e16972ecc8185d14dde89ae3fe14cebb1996789803eb0334355273d3665bf9
// Regenerate: node scripts/generate-arcade-speech.mjs
module.exports = function initializePxtSpeech(image, control, game, screen, SpriteFlag, Fx, inspect) {
const console = {inspect};
const Flag = {Destroyed: 1};
const Math = Object.create(globalThis.Math);
Math.idiv = (a, b) => (a / b) | 0;
var sprites;
(function (sprites) {
    class RenderText {
        constructor(text, maxWidth) {
            this.text = text;
            this.font = image.getFontForText(text);
            this.setMaxWidth(maxWidth);
        }
        draw(canvas, left, top, color, lineStart, lineEnd) {
            if (lineStart === undefined)
                lineStart = 0;
            if (lineEnd === undefined)
                lineEnd = this.linebreaks.length + 1;
            for (let i = lineStart; i < lineEnd; i++) {
                this.drawLine(canvas, left, top, i, color);
                top += this.font.charHeight;
            }
        }
        drawLine(canvas, left, top, lineIndex, color) {
            const start = this.lineStart(lineIndex);
            const end = this.lineEnd(lineIndex);
            for (let i = start; i < end; i++) {
                canvas.print(this.text.charAt(i), left, top, color, this.font);
                left += this.font.charWidth;
            }
        }
        drawPartial(canvas, left, top, color, lengthToDraw, lineStart, lineEnd) {
            if (lineStart === undefined)
                lineStart = 0;
            if (lineEnd === undefined)
                lineEnd = this.linebreaks.length + 1;
            let currentTextIndex = 0;
            for (let i = lineStart; i < lineEnd; i++) {
                currentTextIndex = this.drawPartialLine(canvas, left, top, i, color, currentTextIndex, lengthToDraw);
                top += this.font.charHeight;
                if (currentTextIndex >= lengthToDraw)
                    return false;
            }
            return true;
        }
        drawPartialLine(canvas, left, top, lineIndex, color, currentTextIndex, lengthToDraw) {
            const start = this.lineStart(lineIndex);
            const end = this.lineEnd(lineIndex);
            for (let i = start; i < end; i++) {
                canvas.print(this.text.charAt(i), left, top, color, this.font);
                left += this.font.charWidth;
                if (currentTextIndex + (i - start) >= lengthToDraw) {
                    return lengthToDraw;
                }
            }
            return currentTextIndex + end - start;
        }
        calculatePartialHeight(startLine, lengthToDraw) {
            if (this.linebreaks.length === 0)
                return this.font.charHeight;
            let current = 0;
            for (let i = startLine; i < this.linebreaks.length + 1; i++) {
                current += this.lineEnd(i) - this.lineStart(i);
                if (current > lengthToDraw)
                    return (i - startLine + 1) * this.font.charHeight;
            }
            return this.height;
        }
        lineHeight() {
            return this.font.charHeight;
        }
        setMaxWidth(maxWidth) {
            this.linebreaks = getLineBreaks(this.text, [Math.idiv(maxWidth, this.font.charWidth)]);
            this.height = (this.linebreaks.length + 1) * this.font.charHeight;
            this.width = 0;
            for (let i = 0; i < this.linebreaks.length + 1; i++) {
                this.width = Math.max(this.lineEnd(i) - this.lineStart(i), this.width);
            }
            this.width *= this.font.charWidth;
        }
        printableCharacters() {
            let total = 0;
            for (let i = 0; i < this.linebreaks.length + 1; i++) {
                total += this.lineEnd(i) - this.lineStart(i);
            }
            return total;
        }
        lineEnd(lineIndex) {
            const prevEnd = lineIndex > 0 ? this.linebreaks[lineIndex - 1] : 0;
            let end = lineIndex < this.linebreaks.length ? this.linebreaks[lineIndex] : this.text.length;
            let didMove = false;
            // Trim trailing whitespace
            while (end > prevEnd) {
                if (this.text.charCodeAt(end) <= 32) {
                    end--;
                    didMove = true;
                }
                else if (this.text.charAt(end) === "n" && this.text.charAt(end - 1) === "\\" && end - 1 > prevEnd) {
                    end -= 2;
                    didMove = true;
                }
                else {
                    break;
                }
            }
            return didMove ? end + 1 : end;
        }
        lineStart(lineIndex) {
            let start = lineIndex > 0 ? this.linebreaks[lineIndex - 1] : 0;
            // Trim leading whitespace
            while (start < this.text.length) {
                if (this.text.charCodeAt(start) <= 32) {
                    start++;
                }
                else if (this.text.charAt(start) === "\\" && this.text.charAt(start + 1) === "n" && start + 1 < this.text.length) {
                    start += 2;
                }
                else {
                    break;
                }
            }
            return start;
        }
        widthOfLine(lineIndex, fullTextOffset) {
            if (fullTextOffset != undefined) {
                return (Math.min(this.lineEnd(lineIndex), fullTextOffset + 1) - this.lineStart(lineIndex)) * this.font.charWidth;
            }
            return (this.lineEnd(lineIndex) - this.lineStart(lineIndex)) * this.font.charWidth;
        }
        widthOfLines(lineStartIndex, lineEndIndex, offset) {
            if (this.linebreaks.length === 0)
                return this.widthOfLine(0, offset);
            let width = 0;
            let fullTextOffset;
            for (let i = lineStartIndex; i < Math.min(lineEndIndex, this.linebreaks.length + 1); i++) {
                if (offset != undefined) {
                    fullTextOffset = this.lineStart(i) + offset;
                    offset -= this.lineEnd(i) - this.lineStart(i);
                }
                if (fullTextOffset !== undefined && this.lineStart(i) > fullTextOffset)
                    break;
                width = Math.max(width, this.widthOfLine(i, fullTextOffset));
            }
            return width;
        }
    }
    sprites.RenderText = RenderText;
    function isBreakCharacter(charCode) {
        return charCode <= 32 ||
            (charCode >= 58 && charCode <= 64) ||
            (charCode >= 91 && charCode <= 96) ||
            (charCode >= 123 && charCode <= 126);
    }
    function getLineBreaks(text, lineLengths) {
        const result = [];
        let lastBreakLocation = 0;
        let lastBreak = 0;
        let line = 0;
        let lineLength = lineLengths[line];
        function nextLine() {
            line++;
            lineLength = lineLengths[line % lineLengths.length];
        }
        for (let index = 0; index < text.length; index++) {
            if (text.charAt(index) === "\n") {
                result.push(index);
                index++;
                lastBreak = index;
                nextLine();
            }
            // Handle \\n in addition to \n because that's how it gets converted from blocks
            else if (text.charAt(index) === "\\" && text.charAt(index + 1) === "n") {
                result.push(index);
                lastBreak = index;
                index += 2;
                nextLine();
            }
            else if (isBreakCharacter(text.charCodeAt(index))) {
                lastBreakLocation = index;
            }
            if (index - lastBreak === lineLength) {
                if (lastBreakLocation === index || lastBreakLocation <= lastBreak) {
                    result.push(index);
                    lastBreak = index;
                    nextLine();
                }
                else {
                    result.push(lastBreakLocation);
                    lastBreak = lastBreakLocation;
                    nextLine();
                }
            }
        }
        return result;
    }
    let RenderTextAnimationState;
    (function (RenderTextAnimationState) {
        RenderTextAnimationState[RenderTextAnimationState["Idle"] = 0] = "Idle";
        RenderTextAnimationState[RenderTextAnimationState["Printing"] = 1] = "Printing";
        RenderTextAnimationState[RenderTextAnimationState["Pausing"] = 2] = "Pausing";
    })(RenderTextAnimationState || (RenderTextAnimationState = {}));
    class RenderTextAnimation {
        constructor(text, height) {
            this.text = text;
            this.height = height;
            this.state = RenderTextAnimationState.Idle;
            this.timer = -1;
            this.pageLine = 0;
            this.setPauseLength(1000);
            this.setTextSpeed(30);
        }
        start() {
            this.state = RenderTextAnimationState.Printing;
            this.timer = control.millis();
        }
        numPages() {
            const maxLinesPerPage = Math.idiv(this.height, this.text.lineHeight()) + 1;
            return Math.floor((this.text.linebreaks.length + 1) / maxLinesPerPage);
        }
        setPauseLength(millis) {
            this.pauseMillis = millis;
        }
        setTextSpeed(charactersPerSecond) {
            this.tickPeriod = 1000 / charactersPerSecond;
        }
        currentHeight() {
            const minHeight = this.text.lineHeight();
            const maxHeight = Math.max(Math.min(Math.idiv(this.height, this.text.lineHeight()) + 1, this.text.linebreaks.length + 1 - this.pageLine) * this.text.lineHeight(), minHeight);
            if (this.state === RenderTextAnimationState.Printing) {
                return Math.max(Math.min(this.text.calculatePartialHeight(this.pageLine, this.currentOffset()), maxHeight), minHeight);
            }
            else if (this.state === RenderTextAnimationState.Pausing) {
                return maxHeight;
            }
            else {
                return 0;
            }
        }
        currentWidth() {
            return this.text.widthOfLines(this.pageLine, this.pageLine + Math.idiv(this.currentHeight(), this.text.lineHeight()) + 1, this.state === RenderTextAnimationState.Printing ? this.currentOffset() : undefined);
        }
        currentOffset() {
            return Math.idiv(control.millis() - this.timer, this.tickPeriod);
        }
        isDone() {
            return this.state === RenderTextAnimationState.Idle;
        }
        cancel() {
            this.state = RenderTextAnimationState.Idle;
        }
        onCharacterPrinted(cb) {
            this.onTickCB = cb;
        }
        onAnimationEnd(cb) {
            this.onEndCB = cb;
        }
        draw(canvas, left, top, color) {
            if (this.state === RenderTextAnimationState.Idle)
                return;
            else if (this.state === RenderTextAnimationState.Printing) {
                const pageFinished = this.text.drawPartial(canvas, left, top, color, this.currentOffset(), this.pageLine, this.pageLine + Math.idiv(this.height, this.text.lineHeight()) + 1);
                if (this.onTickCB && this.prevOffset !== this.currentOffset()) {
                    this.onTickCB();
                }
                if (pageFinished) {
                    this.state = RenderTextAnimationState.Pausing;
                    this.timer = this.pauseMillis;
                }
            }
            else {
                this.text.draw(canvas, left, top, color, this.pageLine, this.pageLine + Math.idiv(this.height, this.text.lineHeight()) + 1);
                this.timer -= game.currentScene().eventContext.deltaTimeMillis;
                if (this.timer < 0) {
                    this.pageLine += Math.idiv(this.height, this.text.lineHeight()) + 1;
                    if (this.pageLine > this.text.linebreaks.length) {
                        this.state = RenderTextAnimationState.Idle;
                        if (this.onEndCB)
                            this.onEndCB();
                    }
                    else {
                        this.state = RenderTextAnimationState.Printing;
                        this.timer = control.millis();
                    }
                }
            }
            this.prevOffset = this.currentOffset();
        }
    }
    sprites.RenderTextAnimation = RenderTextAnimation;
})(sprites || (sprites = {}));
(function (sprites) {
    class BaseSpriteSayRenderer {
        constructor(text, fgColor, bgColor) {
            this.text = text;
            this.fgColor = fgColor;
            this.bgColor = bgColor;
        }
        draw(screen, camera, owner) {
        }
        update(dt, camera, owner) {
        }
        destroy() {
        }
    }
    sprites.BaseSpriteSayRenderer = BaseSpriteSayRenderer;
    class SpriteSayRenderer extends BaseSpriteSayRenderer {
        static drawSayFrame(textLeft, textTop, textWidth, textHeight, speakerX, speakerY, color, canvas) {
            if (textLeft + textWidth < 0 || textTop + textHeight < 0 || textLeft > canvas.width || textTop > canvas.height)
                return;
            if (textHeight) {
                // Draw main rectangle
                canvas.fillRect(textLeft, textTop, textWidth, textHeight, color);
                // Draw lines around the rectangle to give it a bubble shape
                canvas.fillRect(textLeft - 1, textTop + 1, 1, textHeight - 2, color);
                canvas.fillRect(textLeft + textWidth, textTop + 1, 1, textHeight - 2, color);
                canvas.fillRect(textLeft + 1, textTop - 1, textWidth - 2, 1, color);
                canvas.fillRect(textLeft + 1, textTop + textHeight, textWidth - 2, 1, color);
                // If the speaker location is within the bubble, don't draw an arrow
                if (speakerX > textLeft && speakerX < textLeft + textWidth && speakerY > textTop && speakerY < textTop + textHeight)
                    return;
                const xDiff = Math.max(Math.abs(speakerX - textLeft), Math.abs(speakerX - (textLeft + textWidth)));
                const yDiff = Math.max(Math.abs(speakerY - textHeight), Math.abs(speakerY - (textHeight + textHeight)));
                // Draw the arrow
                if (xDiff > yDiff) {
                    if (speakerX > textLeft + textWidth) {
                        const anchorY = Math.max(Math.min(speakerY, textTop + textHeight - 4), textTop + 5);
                        canvas.fillRect(textLeft + textWidth + 1, anchorY - 2, 1, 3, color);
                        canvas.fillRect(textLeft + textWidth + 2, anchorY - 1, 1, 1, color);
                    }
                    else if (speakerX < textLeft) {
                        const anchorY = Math.max(Math.min(speakerY, textTop + textHeight - 4), textTop + 5);
                        canvas.fillRect(textLeft - 2, anchorY - 2, 1, 3, color);
                        canvas.fillRect(textLeft - 3, anchorY - 1, 1, 1, color);
                    }
                    else if (speakerY > textTop + textHeight) {
                        const anchorX = Math.max(Math.min(speakerX, textLeft + textWidth - 4), textLeft + 5);
                        canvas.fillRect(anchorX - 2, textTop + textHeight + 1, 3, 1, color);
                        canvas.fillRect(anchorX - 1, textTop + textHeight + 2, 1, 1, color);
                    }
                    else if (speakerY < textTop) {
                        const anchorX = Math.max(Math.min(speakerX, textLeft + textWidth - 4), textLeft + 5);
                        canvas.fillRect(anchorX - 2, textTop - 2, 3, 1, color);
                        canvas.fillRect(anchorX - 1, textTop - 3, 1, 1, color);
                    }
                }
                else {
                    if (speakerY > textTop + textHeight) {
                        const anchorX = Math.max(Math.min(speakerX, textLeft + textWidth - 4), textLeft + 5);
                        canvas.fillRect(anchorX - 2, textTop + textHeight + 1, 3, 1, color);
                        canvas.fillRect(anchorX - 1, textTop + textHeight + 2, 1, 1, color);
                    }
                    else if (speakerY < textTop) {
                        const anchorX = Math.max(Math.min(speakerX, textLeft + textWidth - 4), textLeft + 5);
                        canvas.fillRect(anchorX - 2, textTop - 2, 3, 1, color);
                        canvas.fillRect(anchorX - 1, textTop - 3, 1, 1, color);
                    }
                    else if (speakerX > textLeft + textWidth) {
                        const anchorY = Math.max(Math.min(speakerY, textTop + textHeight - 4), textTop + 5);
                        canvas.fillRect(textLeft + textWidth + 1, anchorY - 2, 1, 3, color);
                        canvas.fillRect(textLeft + textWidth + 2, anchorY - 1, 1, 1, color);
                    }
                    else if (speakerX < textLeft) {
                        const anchorY = Math.max(Math.min(speakerY, textTop + textHeight - 4), textTop + 5);
                        canvas.fillRect(textLeft - 2, anchorY - 2, 1, 3, color);
                        canvas.fillRect(textLeft - 3, anchorY - 1, 1, 1, color);
                    }
                }
            }
        }
        constructor(text, fg, bg, animated, timeOnScreen) {
            super(text, fg, bg);
            this.renderText = new sprites.RenderText(text, 100);
            if (animated) {
                this.animation = new sprites.RenderTextAnimation(this.renderText, 40);
                if (timeOnScreen >= 0) {
                    const numberOfPauses = this.animation.numPages() + 1;
                    const pauseTime = Math.min((timeOnScreen / (2 * numberOfPauses)) | 0, 1000);
                    this.animation.setPauseLength(pauseTime);
                    this.animation.setTextSpeed(this.renderText.printableCharacters() * 1000 / (timeOnScreen - pauseTime * numberOfPauses));
                }
                this.animation.start();
            }
        }
        draw(screen, camera, owner) {
            const ox = (owner.flags & sprites.Flag.RelativeToCamera) ? 0 : camera.drawOffsetX;
            const oy = (owner.flags & sprites.Flag.RelativeToCamera) ? 0 : camera.drawOffsetY;
            const l = Math.floor(owner.left - ox);
            const t = Math.floor(owner.top - oy);
            const height = this.animation ? this.animation.currentHeight() : this.renderText.height;
            const width = this.animation ? this.animation.currentWidth() : this.renderText.width;
            const sayLeft = l + (owner.width >> 1) - (width >> 1);
            const sayTop = t - height - 4;
            if (sayLeft + width < 0 || sayTop + height < 0 || sayLeft > screen.width || sayTop > screen.height)
                return;
            SpriteSayRenderer.drawSayFrame(sayLeft, sayTop, width, height, owner.x - ox, owner.y - oy, this.bgColor, screen);
            if (height) {
                if (this.animation) {
                    this.animation.draw(screen, sayLeft, sayTop, this.fgColor);
                }
                else {
                    this.renderText.draw(screen, sayLeft, sayTop, this.fgColor);
                }
            }
        }
    }
    sprites.SpriteSayRenderer = SpriteSayRenderer;
    class LegacySpriteSayRenderer extends BaseSpriteSayRenderer {
        constructor(text, timeOnScreen, owner, fg, bg) {
            super(text, fg, bg);
            const textToDisplay = console.inspect(text).split("\n").join(" ");
            let pixelsOffset = 0;
            let holdTextSeconds = 1.5;
            let bubblePadding = 4;
            let maxTextWidth = 100;
            let font = image.getFontForText(textToDisplay);
            let startX = 2;
            let startY = 2;
            let bubbleWidth = textToDisplay.length * font.charWidth + bubblePadding;
            let maxOffset = textToDisplay.length * font.charWidth - maxTextWidth;
            let bubbleOffset = Fx.toInt(owner._hitbox.oy);
            let needsRedraw = true;
            // sets the default scroll speed in pixels per second
            let speed = 45;
            // Calculates the speed of the scroll if scrolling is needed and a time is specified
            if (timeOnScreen && maxOffset > 0) {
                speed = (maxOffset + (2 * maxTextWidth)) / (timeOnScreen / 1000);
                speed = Math.max(speed, 45);
                holdTextSeconds = maxTextWidth / speed;
                holdTextSeconds = Math.min(holdTextSeconds, 1.5);
            }
            if (timeOnScreen) {
                timeOnScreen = timeOnScreen + game.runtime();
            }
            if (bubbleWidth > maxTextWidth + bubblePadding) {
                bubbleWidth = maxTextWidth + bubblePadding;
            }
            else {
                maxOffset = -1;
            }
            // reuse previous sprite if possible
            const imgh = font.charHeight + bubblePadding;
            if (!this.sayBubbleSprite
                || this.sayBubbleSprite.width != bubbleWidth
                || this.sayBubbleSprite.height != imgh) {
                const sayImg = image.create(bubbleWidth, imgh);
                if (this.sayBubbleSprite) // sprite with same image size, we can reuse it
                    this.sayBubbleSprite.setImage(sayImg);
                else { // needs a new sprite
                    this.sayBubbleSprite = sprites.create(sayImg, -1);
                    this.sayBubbleSprite.setFlag(SpriteFlag.Ghost, true);
                    this.sayBubbleSprite.setFlag(SpriteFlag.RelativeToCamera, !!(owner.flags & sprites.Flag.RelativeToCamera));
                }
            }
            this.updateSay = (dt, camera) => {
                // The minus 2 is how much transparent padding there is under the sayBubbleSprite
                this.sayBubbleSprite.y = owner.top + bubbleOffset - ((font.charHeight + bubblePadding) >> 1) - 2;
                this.sayBubbleSprite.x = owner.x;
                this.sayBubbleSprite.z = owner.z + 1;
                // Update box stuff as long as timeOnScreen doesn't exist or it can still be on the screen
                if (!timeOnScreen || timeOnScreen > game.runtime()) {
                    // move bubble
                    if (!owner.isOutOfScreen(camera)) {
                        const ox = camera.offsetX;
                        const oy = camera.offsetY;
                        if (this.sayBubbleSprite.left - ox < 0) {
                            this.sayBubbleSprite.left = 0;
                        }
                        if (this.sayBubbleSprite.right - ox > screen.width) {
                            this.sayBubbleSprite.right = screen.width;
                        }
                        // If sprite bubble above the sprite gets cut off on top, place the bubble below the sprite
                        if (this.sayBubbleSprite.top - oy < 0) {
                            this.sayBubbleSprite.y = (this.sayBubbleSprite.y - 2 * owner.y) * -1;
                        }
                    }
                    // Pauses at beginning of text for holdTextSeconds length
                    if (holdTextSeconds > 0) {
                        holdTextSeconds -= game.eventContext().deltaTime;
                        // If scrolling has reached the end, start back at the beginning
                        if (holdTextSeconds <= 0 && pixelsOffset > 0) {
                            pixelsOffset = 0;
                            holdTextSeconds = maxTextWidth / speed;
                            needsRedraw = true;
                        }
                    }
                    else {
                        pixelsOffset += dt * speed;
                        needsRedraw = true;
                        // Pause at end of text for holdTextSeconds length
                        if (pixelsOffset >= maxOffset) {
                            pixelsOffset = maxOffset;
                            holdTextSeconds = maxTextWidth / speed;
                        }
                    }
                    if (needsRedraw) {
                        needsRedraw = false;
                        this.sayBubbleSprite.image.fill(this.bgColor);
                        // If maxOffset is negative it won't scroll
                        if (maxOffset < 0) {
                            this.sayBubbleSprite.image.print(textToDisplay, startX, startY, this.fgColor, font);
                        }
                        else {
                            this.sayBubbleSprite.image.print(textToDisplay, startX - pixelsOffset, startY, this.fgColor, font);
                        }
                        // Left side padding
                        this.sayBubbleSprite.image.fillRect(0, 0, bubblePadding >> 1, font.charHeight + bubblePadding, this.bgColor);
                        // Right side padding
                        this.sayBubbleSprite.image.fillRect(bubbleWidth - (bubblePadding >> 1), 0, bubblePadding >> 1, font.charHeight + bubblePadding, this.bgColor);
                        // Corners removed
                        this.sayBubbleSprite.image.setPixel(0, 0, 0);
                        this.sayBubbleSprite.image.setPixel(bubbleWidth - 1, 0, 0);
                        this.sayBubbleSprite.image.setPixel(0, font.charHeight + bubblePadding - 1, 0);
                        this.sayBubbleSprite.image.setPixel(bubbleWidth - 1, font.charHeight + bubblePadding - 1, 0);
                    }
                }
                else {
                    // If can't update because of timeOnScreen then destroy the sayBubbleSprite and reset updateSay
                    this.updateSay = undefined;
                    this.sayBubbleSprite.destroy();
                    this.sayBubbleSprite = undefined;
                }
            };
            this.updateSay(0, game.currentScene().camera);
        }
        update(dt, camera, owner) {
            if (!this.sayBubbleSprite)
                return;
            this.updateSay(dt, camera);
            if (!this.sayBubbleSprite)
                return;
            this.sayBubbleSprite.setFlag(SpriteFlag.RelativeToCamera, !!(owner.flags & SpriteFlag.RelativeToCamera));
            if (owner.flags & Flag.Destroyed)
                this.destroy();
        }
        destroy() {
            if (this.sayBubbleSprite)
                this.sayBubbleSprite.destroy();
            this.sayBubbleSprite = undefined;
        }
    }
    sprites.LegacySpriteSayRenderer = LegacySpriteSayRenderer;
})(sprites || (sprites = {}));
return sprites;
};
