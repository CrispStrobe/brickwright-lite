// Analyze an authentic project's resolved inputs without changing its raw audit.
import {createHash} from 'node:crypto';
import {resolveProjectInputs} from './pxt-node.mjs';
import {prepareArcadeDependencyInputs} from '../../overlay/scratch-gui/src/lib/bw-makecode/dependency-project.js';
import {importProjectFiles} from '../../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import SB3Creator from '../../overlay/scratch-gui/src/lib/sb3-creator.js';
const hashes = files => Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b))
    .map(([name,text])=>[name,createHash('sha256').update(text).digest('hex')]));
export async function auditPreparedArcade (files, {fetchExtensions = false, fetch} = {}) {
    const originalHashes = hashes(files);
    const resolved = await resolveProjectInputs('arcade', files, {fetchExtensions, ...(fetch ? {fetch} : {})});
    const prepared = prepareArcadeDependencyInputs(files, resolved);
    if (JSON.stringify(hashes(files)) !== JSON.stringify(originalHashes)) throw new Error('Resolver changed original project files');
    for (const [name,text] of Object.entries(files)) {
        if (name !== 'pxt.json' && prepared.files[name] !== text) throw new Error('Preparation changed an original project file');
    }
    const imported = importProjectFiles(prepared.files, {target:'arcade'});
    const unsupported = [...(imported.unsupported || [])];
    let stage = unsupported.length ? 'partial' : 'translated', blockCount = 0, reason;
    try {
        const creator = new SB3Creator();creator.parse(imported.code);
        blockCount = creator.project.targets.reduce((total,target)=>total+Object.keys(target.blocks || {}).length,0);
        unsupported.push(...creator.warnings.map(warning=>'Code to Blocks: '+warning));
        stage = unsupported.length ? 'partial' : 'translated';
    } catch (error) {stage='parse-failed';reason=String(error.message);}
    return {imported, report:{stage, unsupported, blockCount, ...(reason ? {reason} : {}),
        originalFileHashes:originalHashes, preparedFileHashes:hashes(prepared.files),
        originalFilesUnchanged:true, provenance:prepared.provenance, skippedPackages:prepared.skippedPackages,
        fetchedExtensions:prepared.fetchedExtensions,
        boundary:'Authentic dependency inputs and static native translation only; compilation, gameplay, GUI and roundtrips are separate gates.'}};
}
