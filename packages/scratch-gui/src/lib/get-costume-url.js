import storage from './storage';
import inlineSvgFonts from 'scratch-svg-renderer/src/font-inliner';
import getFonts from './lazy-render-fonts.js';

// Contains 'font-family', but doesn't only contain 'font-family="none"'
const HAS_FONT_REGEXP = 'font-family(?!="none")';

const getCostumeUrl = (function () {
    let cachedAssetId;
    let cachedUrl;

    return function (asset) {

        if (cachedAssetId === asset.assetId) {
            return cachedUrl;
        }

        cachedAssetId = asset.assetId;

        // If the SVG refers to fonts, they must be inlined in order to display correctly in the img tag.
        // Avoid parsing the SVG when possible, since it's expensive.
        if (asset.assetType === storage.AssetType.ImageVector) {
            const svgString = asset.decodeText();
            if (svgString.match(HAS_FONT_REGEXP)) {
                // Brickwright: the faces are a lazy chunk. Until it lands, hand
                // back the plain SVG and DO NOT cache it, so the next render —
                // there is always one — inlines the real @font-face.
                if (!getFonts.isLoaded()) {
                    getFonts.loadFonts().catch(() => {});
                    cachedAssetId = null;
                    return asset.encodeDataURI();
                }
                const svgText = inlineSvgFonts(svgString);
                cachedUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgText)}`;
            } else {
                cachedUrl = asset.encodeDataURI();
            }
        } else {
            cachedUrl = asset.encodeDataURI();
        }

        return cachedUrl;
    };
}());

export {
    getCostumeUrl as default,
    HAS_FONT_REGEXP
};
