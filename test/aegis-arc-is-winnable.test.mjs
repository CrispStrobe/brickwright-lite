// Aegis Arc's shield must be able to get in front of the spark.
//
// THE DEFECT. The owner reported the game unplayable: the paddle moves far
// slower than the object it must intercept, so it cannot be won.
//
// WHICH OF TWO THINGS IT WAS, because the fixes are opposite. Either the
// speeds were badly balanced as authored, or the two sprites were advanced on
// different clocks so one got more updates per second. It is the FIRST: both
// FOREVER loops end in `wait 0.02 seconds`, so nothing is running faster than
// anything else and retuning a constant papers over nothing. The first
// assertion below pins that, so the day someone puts these sprites on
// different cadences this test says so instead of the balance quietly drifting.
//
// WHY IT WAS UNWINNABLE, and it is geometry rather than a typo. In LINEAR
// terms the shield was already faster than the spark — 4 degrees per tick on
// radius 145 is 10.1 px/tick against the spark's 7.2. But the shield travels
// an ARC and the spark travels a RADIUS: covering half the orbit is pi * 145 =
// 455 px against the spark's 145. The shield needed 45 ticks to reach the far
// side and the spark arrived in 20, at the STARTING speed. It then got worse
// with every success, because each rebound resets the speed to `7 + score/3`
// while the shield's rate was a constant: the difficulty curve moved one side
// of the game only.
//
// WHAT THIS TEST FIXES IN PLACE is the rule, not the number: the shield must
// cover the worst case — half the orbit — in comfortably less time than the
// spark needs to cross from the centre to the rim AT THE HARDEST POINT THE
// GAME REACHES. Retuning the spark's curve is then free, as long as the shield
// keeps up.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import games from '../overlay/scratch-gui/src/lib/sb3-creator-game-examples.js';

/** One SPRITE block out of a pseudocode game script. */
function sprite (src, name) {
    const at = src.indexOf(`SPRITE ${name}:`);
    assert.ok(at >= 0, `no SPRITE ${name} in the script`);
    const rest = src.slice(at + 1);
    const end = rest.indexOf('\nSPRITE ');
    return end < 0 ? rest : rest.slice(0, end);
}
const one = (re, s, what) => {
    const m = re.exec(s);
    assert.ok(m, `could not read ${what} — the script's shape changed, so this test is now measuring nothing`);
    return Number(m[1]);
};
/**
 * The LOOP's delay, which is the LAST `wait` in the block and not the first.
 * The Spark has a deliberate `wait 0.08` inside its rebound branch, and
 * reading that as the loop cadence made this file's own first run report a
 * clock mismatch that does not exist — the test measuring the wrong thing
 * about the very defect it was written to characterise.
 */
const loopWait = (s, what) => {
    const all = [...s.matchAll(/wait ([\d.]+) seconds/g)];
    assert.ok(all.length, `could not read ${what}`);
    return Number(all[all.length - 1][1]);
};

const src = games.orbit_ward;
const shield = sprite(src, 'Shield');
const spark = sprite(src, 'Spark');

test('Aegis Arc: both sprites run on the same clock, so this is balance and not timing', () => {
    const shieldWait = loopWait(shield, "the Shield's loop delay");
    const sparkWait = loopWait(spark, "the Spark's loop delay");
    assert.equal(shieldWait, sparkWait,
        'the Shield and the Spark are no longer advanced at the same rate. Retuning speeds '
        + 'will not fix that: one sprite is getting more updates per second than the other, '
        + 'which is a timing defect and would affect every other game in this file.');
});

test('Aegis Arc: the shield can reach the far side before the spark crosses the arena', () => {
    const step = one(/change angle by (\d+)/, shield, "the Shield's turn rate");
    const radius = one(/\(\(sin of angle\) \* (\d+)\)/, shield, "the Shield's orbit radius");
    const vx = one(/set vx to (\d+)\b/, spark, "the Spark's initial vx");
    const vy = one(/set vy to (\d+)\b/, spark, "the Spark's initial vy");
    const base = one(/\((\d+) \+ \(score \/ \d+\)\)/, spark, "the Spark's rebound speed");
    const divisor = one(/\(\d+ \+ \(score \/ (\d+)\)\)/, spark, "the Spark's difficulty divisor");
    const lastScore = one(/IF score > (\d+) THEN:/, spark, 'the winning score');

    // The hardest moment the game actually reaches, not the opening one.
    const maxSpeed = Math.max(Math.hypot(vx, vy), base + (lastScore + 1) / divisor);
    const ticksToCross = radius / maxSpeed;          // spark, centre to rim
    const ticksToHalfOrbit = 180 / step;             // shield, worst case

    assert.ok(ticksToHalfOrbit <= ticksToCross * 0.9,
        `unwinnable: the shield needs ${ticksToHalfOrbit.toFixed(1)} ticks to reach the far `
        + `side and the spark crosses in ${ticksToCross.toFixed(1)} at its top speed of `
        + `${maxSpeed.toFixed(2)} px/tick. A player on the wrong side cannot arrive at any `
        + `skill level. The shield turns ${step} deg/tick; it needs at least `
        + `${Math.ceil(180 / (ticksToCross * 0.9))}.`);
});

test('Aegis Arc: the shield is not so fast that a single tick overshoots the spark', () => {
    // The opposite failure, asserted so a future "make it winnable" cannot be
    // answered by making the shield spin uncontrollably. One tick must not
    // sweep further than the spark's own diameter of travel in that tick.
    const step = one(/change angle by (\d+)/, shield, "the Shield's turn rate");
    const radius = one(/\(\(sin of angle\) \* (\d+)\)/, shield, "the Shield's orbit radius");
    const arcPerTick = radius * step * Math.PI / 180;
    assert.ok(arcPerTick < radius,
        `the shield sweeps ${arcPerTick.toFixed(0)} px per tick on a ${radius} px orbit, `
        + 'which is not a control, it is a teleport');
});
