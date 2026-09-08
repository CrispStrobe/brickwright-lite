import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {deviceCandidateNames} from '../scripts/lib/i8086-device-candidates.mjs';
for(const variant of deviceCandidateNames.filter(x=>x!=='none')) {
    test(`${variant} remains default-off and matches original device observations`,()=>{
        execFileSync(process.execPath,['--experimental-default-type=module',
            fileURLToPath(new URL('./fixtures/i8086-device-candidate-oracle.mjs',import.meta.url)),variant],
        {stdio:'pipe',timeout:60000});
    });
}
