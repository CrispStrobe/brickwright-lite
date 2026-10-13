// Factory names follow the pinned original PXT emitProjectImages /
// emitTilemapsFromJRes emitters. Runtime ordering/null behavior follows the
// retained game/assetTemplates.ts helpers in the pinned Arcade target bundle.
import {parseImageAssetEntries} from './arcade-assets.js';
import {parseTileAssetEntries} from './tile-assets.js';

const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
// PXT's project emitter removes only its own namespace prefix when the
// remainder is a single identifier. Factory names are not member aliases.
const factoryId=(kind,id)=>{
    const prefix=(kind==='image'?'myImages.':'myTiles.');
    return id.startsWith(prefix) && !id.slice(prefix.length).includes('.') ? id.slice(prefix.length) : id;
};

/** Separate gallery/member aliases from the kind-scoped tagged-template
 * factories. Preserve file order (or an explicit original registration order).
 * PXT _getFactoryInstance returns the first matching nonnull factory result;
 * image and tile names never fall back into one another.
 */
export function createAssetKindLookup(files,{fileOrder=Object.keys(files || {})}={}) {
    const images=Object.create(null),tiles=Object.create(null);
    const factories={image:Object.create(null),tile:Object.create(null)};
    const ordered=[...new Set([...fileOrder,...Object.keys(files || {})])];
    const addAliases=(target,asset,aliases,identity)=>{
        for(const name of aliases) {
            if(!own(target,name))target[name]=asset;
            else if(target[name]?.[identity]!==asset[identity])target[name]=null;
        }
    };
    for(const filename of ordered) {
        if(!/\.jres$/.test(filename) || typeof files?.[filename]!=='string')continue;
        for(const kind of ['image','tile']) {
            const entries=kind==='image'?parseImageAssetEntries(files[filename]):parseTileAssetEntries(files[filename]);
            for(const entry of entries) {
                const asset=entry[kind];
                addAliases(kind==='image'?images:tiles,asset,entry.aliases,kind==='image'?'imageId':'tileId');
                // Read factory candidates directly, so ambiguous member aliases
                // cannot discard an earlier factory result or select a later one.
                for(const name of new Set([factoryId(kind,entry.key),entry.factoryDisplayName].filter(name=>typeof name==='string' && name))) {
                    if(!own(factories[kind],name))factories[kind][name]=asset;
                }
            }
        }
    }
    return {
        images,tiles,
        lookup(kind,name) {
            if(!own(factories,kind))return null;
            const map=factories[kind];
            if(!map || typeof name!=='string')return null;
            return map[name.trim()] || null;
        }
    };
}

/** Integration hook for assets.image/assets.tile only. Undefined means this
 * tag belongs to another resolver; null is an actual missing-kind result.
 */
export function lookupAssetTemplate(lookup,tag,name) {
    const kind=tag==='assets.image'?'image':tag==='assets.tile'?'tile':null;
    return kind?lookup.lookup(kind,name):undefined;
}
