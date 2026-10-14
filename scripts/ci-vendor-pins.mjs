// Read the single adoption authority before Actions checks out any sibling.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export function vendorPinOutputs(pins) {
    const names = ['bw-circuit-ui', 'bw-board', 'sb3-creator'];
    return names.map(name => {
        const sha = pins[name];
        if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) {
            throw new Error(`${name}: missing or invalid full vendor SHA`);
        }
        return `${name}=${sha}`;
    }).join('\n') + '\n';
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.stdout.write(vendorPinOutputs(JSON.parse(readFileSync(new URL('../vendor-pins.json', import.meta.url), 'utf8'))));
}
