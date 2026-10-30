// Child entry: one job (one side of one program, several input scripts).
// Appends one JSON line per finished script to job.out, so a kill keeps partial results.
import fs from 'node:fs';
import {makeSchedule} from './script.mjs';

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const emit = (script, result) => fs.appendFileSync(job.out, JSON.stringify({script, result}) + '\n');
const schedules = job.scripts.map(name => makeSchedule(name, job.seconds, job.fps));
const options = {seconds: job.seconds, fps: job.fps, seed: job.seed, entropy: job.entropy, globalsOf: job.globalsOf || []};

if (job.side === 'original') {
    const {recordOriginal} = await import('./pxt-side.mjs');
    await recordOriginal(job.source, schedules, options, emit);
} else if (job.side === 'brickwright') {
    const {recordBrickwright, translateForBrickwright} = await import('./bw-side.mjs');
    let translated = null, failure = null;
    try { translated = translateForBrickwright(job.source); } catch (e) { failure = String(e?.message || e).slice(0, 500); }
    for (const schedule of schedules) {
        emit(schedule.name, failure ? {status: 'import-error', error: failure, samples: [], frames: []}
            : await recordBrickwright(job.source, {...options, schedule, translated}));
    }
} else if (job.side === 'selftest-hang') {
    for (;;) { /* a synchronous loop, as a wedged VM */ }
} else throw new Error('Unknown job side: ' + job.side);
process.exit(0);
