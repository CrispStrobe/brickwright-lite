// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {spawnOwnedDriver} from '../scripts/lib/owned-driver.mjs';

const terminated = async pid => {
    try {
        const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
        return stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z');
    } catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') return true; throw error; }
};

test('stopping an owned driver terminates descendants that inherit its output pipes',
    {skip: process.platform !== 'linux' && 'process-tree assertion requires Linux /proc', timeout: 5000}, async () => {
        const script = `const {spawn}=require('node:child_process');
            const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore','inherit','inherit']});
            console.log(child.pid);setInterval(()=>{},1000);`;
        const driver = spawnOwnedDriver(process.execPath, ['-e', script], {stdio: ['ignore', 'pipe', 'pipe']});
        let descendant;
        try {
            const [bytes] = await once(driver.child.stdout, 'data');
            descendant = Number(String(bytes).trim());
            assert.ok(Number.isInteger(descendant) && descendant > 0);
            assert.equal(await terminated(descendant), false);
            const closed = once(driver.child, 'close');
            driver.stop(); driver.stop();
            await closed;
            const deadline = Date.now() + 1500;
            while (!(await terminated(descendant)) && Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            assert.equal(await terminated(descendant), true, 'the inherited-pipe child must also terminate');
        } finally {
            driver.stop();
            if (descendant && !(await terminated(descendant))) process.kill(descendant, 'SIGTERM');
        }
    });
