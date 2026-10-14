/* eslint-env browser */
/**
 * Brickwright's fork of scratch-render-fonts' font table.
 *
 * WHY A FORK. Two of the seven faces upstream ships cannot be redistributed on
 * this bundle's terms, and both were found by reading each face's own `name`
 * table rather than the package's notice (THIRD-PARTY-NOTICES.md records the
 * measurement):
 *
 *   - `Grand9K-Pixel.ttf`, behind the menu key "Pixel", is CC BY-SA 3.0 — a
 *     share-alike licence, declared by a URL in name ID 14 with no licence
 *     description at all.
 *   - `Scratch.ttf`, behind the key "Scratch", carries NO licence identifier
 *     and no licence URL. Its entire grant is a phrase inside its copyright
 *     record, "By Jakob Fischer aka PizzaDude *Distribute freely*".
 *
 * The package itself has no `license` field in its package.json, so the
 * container is as undocumented as the worst face in it. The other five are
 * SIL OFL 1.1, which permits bundling, and they are required straight from the
 * package: replacing them would re-render every saved project that uses them
 * for no licensing gain.
 *
 * THE KEYS ARE THE CONTRACT. A saved project stores the font-family NAME, not
 * the file, so every key here must survive any swap or existing work loses its
 * text style. Only the file behind a key changes.
 *
 * Webpack resolves `scratch-render-fonts-base64` to this module (see
 * webpack.config.js); `lazy-render-fonts.js` imports it as the lazy chunk and
 * keeps the synchronous `getFonts()` contract that scratch-svg-renderer's
 * font-inliner requires. CommonJS for that reason.
 */
let FONTS;

const getFonts = function () {
    if (FONTS) return FONTS;
    /* eslint-disable global-require */
    FONTS = {
        // Five faces upstream ships under SIL OFL 1.1, unchanged.
        'Sans Serif': require('base64-loader!scratch-render-fonts/src/NotoSans-Medium.ttf'),
        'Serif': require('base64-loader!scratch-render-fonts/src/SourceSerifPro-Regular.otf'),
        'Handwriting': require('base64-loader!scratch-render-fonts/src/handlee-regular.ttf'),
        'Marker': require('base64-loader!scratch-render-fonts/src/Knewave.ttf'),
        'Curly': require('base64-loader!scratch-render-fonts/src/Griffy-Regular.ttf'),
        // Ours. Pixelify Sans (SIL OFL 1.1, Copyright 2021 The Pixelify Sans
        // Project Authors) replaces Grand9K Pixel. Chosen for true lowercase
        // with descenders and for width: at 44px "Hello! Score 1234" measures
        // 343px against Grand9K's 390, where Silkscreen draws lowercase as
        // small capitals (495px, and it recases saved work) and Press Start 2P
        // measures 748px, which would overflow layouts that fit today.
        'Pixel': require('base64-loader!./PixelifySans-Regular.ttf'),
        // STILL UPSTREAM, STILL UNLICENSED. The replacement for this key is a
        // brand look rather than a typographic slot and is the owner's choice;
        // until it is made, the key keeps the face it has always had. Removing
        // the key instead would strip the style from every project that uses it.
        'Scratch': require('base64-loader!scratch-render-fonts/src/Scratch.ttf')
    };
    /* eslint-enable global-require */

    for (const fontName in FONTS) {
        const fontData = FONTS[fontName];
        FONTS[fontName] = '@font-face {' +
            `font-family: "${fontName}";src: url("data:application/x-font-ttf;charset=utf-8;base64,${fontData}");}`;
    }

    if (!document.getElementById('scratch-font-styles')) {
        const documentStyleTag = document.createElement('style');
        documentStyleTag.id = 'scratch-font-styles';
        documentStyleTag.textContent = Object.values(FONTS).join('\n');
        document.body.appendChild(documentStyleTag);
    }

    return FONTS;
};

module.exports = getFonts;
