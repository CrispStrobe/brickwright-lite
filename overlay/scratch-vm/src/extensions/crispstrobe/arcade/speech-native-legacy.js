// Adapted from Microsoft PXT Arcade 4.2.1 game/spritesay.ts (MIT).
// Copyright (c) Microsoft Corporation. See THIRD-PARTY-NOTICES.md.
// Preserve the PXT algorithm while letting native creation handlers yield.
// The retained speech-pxt.js remains unchanged as the comparison source.
module.exports = function initializeNativeLegacy(pxt, image, game, screen, inspect, toInt, allocate) {
    const SpriteFlag = {Ghost: 4, RelativeToCamera: 2};
    const Flag = {Destroyed: 1};
    return function create(text, timeOnScreen, owner, fg, bg) {
        const renderer = new pxt.BaseSpriteSayRenderer(text, fg, bg);
        renderer.update = (dt, camera, owner) => {
            if (!renderer.sayBubbleSprite)
                return;
            renderer.updateSay(dt, camera);
            if (!renderer.sayBubbleSprite)
                return;
            renderer.sayBubbleSprite.setFlag(SpriteFlag.RelativeToCamera, !!(owner.flags & SpriteFlag.RelativeToCamera));
            if (owner.flags & Flag.Destroyed)
                renderer.destroy();
        };
        renderer.destroy = () => {
            const bubble = renderer.sayBubbleSprite;
            if (bubble) {
                const work = bubble.destroy();
                renderer.sayBubbleSprite = undefined;
                return work;
            }
            return renderer.destroyWork;
        };
        const textToDisplay = inspect(text).split("\n").join(" ");
        let pixelsOffset = 0;
        let holdTextSeconds = 1.5;
        let bubblePadding = 4;
        let maxTextWidth = 100;
        let font = image.getFontForText(textToDisplay);
        let startX = 2;
        let startY = 2;
        let bubbleWidth = textToDisplay.length * font.charWidth + bubblePadding;
        let maxOffset = textToDisplay.length * font.charWidth - maxTextWidth;
        let bubbleOffset = toInt(owner._hitbox.oy);
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
        const created = allocate(image.create(bubbleWidth, font.charHeight + bubblePadding), -1);
        const finish = bubble => {
            if (!bubble) return;
            renderer.sayBubbleSprite = bubble;
            bubble.setFlag(SpriteFlag.Ghost, true);
            bubble.setFlag(SpriteFlag.RelativeToCamera, !!(owner.flags & Flag.RelativeToCamera));
            renderer.updateSay = (dt, camera) => {
                // The minus 2 is how much transparent padding there is under the sayBubbleSprite
                renderer.sayBubbleSprite.y = owner.top + bubbleOffset - ((font.charHeight + bubblePadding) >> 1) - 2;
                renderer.sayBubbleSprite.x = owner.x;
                renderer.sayBubbleSprite.z = owner.z + 1;
                // Update box stuff as long as timeOnScreen doesn't exist or it can still be on the screen
                if (!timeOnScreen || timeOnScreen > game.runtime()) {
                    // move bubble
                    if (!owner.isOutOfScreen(camera)) {
                        const ox = camera.offsetX;
                        const oy = camera.offsetY;
                        if (renderer.sayBubbleSprite.left - ox < 0) {
                            renderer.sayBubbleSprite.left = 0;
                        }
                        if (renderer.sayBubbleSprite.right - ox > screen.width) {
                            renderer.sayBubbleSprite.right = screen.width;
                        }
                        // If sprite bubble above the sprite gets cut off on top, place the bubble below the sprite
                        if (renderer.sayBubbleSprite.top - oy < 0) {
                            renderer.sayBubbleSprite.y = (renderer.sayBubbleSprite.y - 2 * owner.y) * -1;
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
                        renderer.sayBubbleSprite.image.fill(renderer.bgColor);
                        // If maxOffset is negative it won't scroll
                        if (maxOffset < 0) {
                            renderer.sayBubbleSprite.image.print(textToDisplay, startX, startY, renderer.fgColor, font);
                        }
                        else {
                            renderer.sayBubbleSprite.image.print(textToDisplay, startX - pixelsOffset, startY, renderer.fgColor, font);
                        }
                        // Left side padding
                        renderer.sayBubbleSprite.image.fillRect(0, 0, bubblePadding >> 1, font.charHeight + bubblePadding, renderer.bgColor);
                        // Right side padding
                        renderer.sayBubbleSprite.image.fillRect(bubbleWidth - (bubblePadding >> 1), 0, bubblePadding >> 1, font.charHeight + bubblePadding, renderer.bgColor);
                        // Corners removed
                        renderer.sayBubbleSprite.image.setPixel(0, 0, 0);
                        renderer.sayBubbleSprite.image.setPixel(bubbleWidth - 1, 0, 0);
                        renderer.sayBubbleSprite.image.setPixel(0, font.charHeight + bubblePadding - 1, 0);
                        renderer.sayBubbleSprite.image.setPixel(bubbleWidth - 1, font.charHeight + bubblePadding - 1, 0);
                    }
                }
                else {
                    // If can't update because of timeOnScreen then destroy the sayBubbleSprite and reset updateSay
                    renderer.updateSay = undefined;
                    renderer.destroyWork = renderer.sayBubbleSprite.destroy();
                    renderer.sayBubbleSprite = undefined;
                }
            };
            renderer.updateSay(0, game.currentScene().camera);
            const work = renderer.destroyWork;
            return work && typeof work.then === 'function' ? work.then(() => renderer) : renderer;
        };
        return created && typeof created.then === 'function' ? created.then(finish) : finish(created);
    };
};
