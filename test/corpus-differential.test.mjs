/**
 * Corpus-differential CI sampling test.
 *
 * Env-gated: runs only when CORPUS_DIFFERENTIAL=1. Default off in CI because
 * it needs network access (the hosted compile service) and takes ~30–60 s per
 * sample pair.
 *
 * Runs oracle-differential.mjs in corpus mode with a small rotating sample:
 * 6 pairs per run, offset derived from the day-of-year so successive CI runs
 * cover different parts of the gallery without manual coordination.
 *
 * Enable in CI with:
 *   CORPUS_DIFFERENTIAL=1 node --test test/corpus-differential.test.mjs
 */
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'scripts', 'oracle-differential.mjs');

const enabled = process.env.CORPUS_DIFFERENTIAL === '1';

test('corpus differential: rotating sample agrees', {skip: !enabled && 'CORPUS_DIFFERENTIAL not set'}, () => {
    const SAMPLE_SIZE = 6;
    // Rotate offset by day-of-year so successive runs cover the gallery.
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    // No modulus here on purpose. This used to wrap at a hardcoded 200 "to stay
    // in range" while the gallery yields 224 eligible pairs, so the last 24 were
    // unreachable by the rotation — and a caller cannot know that bound, because
    // only the script counts the pairs. It now wraps against the real count, so
    // the honest thing to pass is the raw rotation.
    const offset = dayOfYear * SAMPLE_SIZE;

    const out = execFileSync(process.execPath, [SCRIPT, 'corpus', String(SAMPLE_SIZE), String(offset)], {
        cwd: join(here, '..'),
        encoding: 'utf8',
        timeout: 180_000, // 3 min ceiling
        env: {...process.env},
    });
    console.log(out);
    // oracle-differential.mjs exits non-zero on any diff; execFileSync throws on that.
    // If we reach here, every pair agreed.
});
