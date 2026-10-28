/** The idempotent Arcade settings hooks applied to the pinned SB3 serializer. */
export function patchArcadeSettingsSB3 (sb3) {
const arcadeSettingsHooks = [
    ['require', "const bwSb3Values = require('./bw-sb3-values');",
        "const bwSb3Values = require('./bw-sb3-values');\nconst bwArcadeSettings = require('../extensions/crispstrobe/arcade/program-settings');",
        "const bwArcadeSettings = require('../extensions/crispstrobe/arcade/program-settings');"],
    ['save', 'const flattenedOriginalTargets = originalTargetsToSerialize.map(t => t.toJSON());',
        'const flattenedOriginalTargets = originalTargetsToSerialize.map(t => {\n        const object = t.toJSON();\n        bwArcadeSettings.save(t, object);\n        return object;\n    });',
        'bwArcadeSettings.save(t, object);'],
    ['serialize', 'bwSb3Values.save(target.variables, obj);',
        'bwSb3Values.save(target.variables, obj);\n    bwArcadeSettings.save(target, obj);',
        'bwArcadeSettings.save(target, obj);'],
    ['restore', 'bwSb3Values.restore(object, target.variables);',
        'bwSb3Values.restore(object, target.variables);\n    bwArcadeSettings.restore(object, target);',
        'bwArcadeSettings.restore(object, target);']
];
for (const [name, anchor, patch, marker] of arcadeSettingsHooks) {
    if (sb3.includes(marker)) continue;
    if (sb3.split(anchor).length !== 2) throw new Error('Arcade settings ' + name + ' hook anchor changed');
    sb3 = sb3.replace(anchor, patch);
}

return sb3;
}
