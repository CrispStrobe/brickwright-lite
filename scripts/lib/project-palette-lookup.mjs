/** Preserve saved artwork indices after a target-only asset-library projection. */
export function createProjectedCostumePaletteLookup(source,project,palettes){
    const indices=project.targets.map(target=>source.targets.indexOf(target));
    if(indices.some(index=>index<0)||new Set(indices).size!==indices.length)throw new Error('Projected artwork target identity differs');
    return (target,costume,position)=>{
        const targetIndex=position?indices[position.targetIndex]:source.targets.indexOf(target);
        const costumeIndex=position?position.costumeIndex:target.costumes.indexOf(costume);
        return palettes.get(`${targetIndex}:${costumeIndex}`)||null;
    };
}
