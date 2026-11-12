// Deterministic input scripts and the shared sample grid. Both sides observe at
// t_k = round(k * 1000 / fps) simulated ms and change inputs only on that grid.
export const BUTTONS = ['left', 'up', 'right', 'down', 'A', 'B'];
// pxsim ControllerButton ids (Left 1, Up 2, Right 3, Down 4, A 5, B 6).
export const PXT_BUTTON = {left: 1, up: 2, right: 3, down: 4, A: 5, B: 6};
// DOM key names, as the Scratch keyboard device receives them; the Arcade extension maps them to controller buttons.
export const BW_KEY = {left: 'ArrowLeft', up: 'ArrowUp', right: 'ArrowRight', down: 'ArrowDown', A: ' ', B: 'z'};

/** Sample k (0-based) is observed after t_k ms of simulated time; sample 0 is t=0 plus one frame. */
export function sampleTimes(seconds, fps = 30) {
    const n = Math.round(seconds * fps), times = [];
    for (let k = 1; k <= n; k++) times.push(Math.round(k * 1000 / fps));
    return times;
}

function build(name, events) {
    const byK = new Map();
    for (const e of events) { if (!byK.has(e.k)) byK.set(e.k, []); byK.get(e.k).push({button: e.button, down: e.down}); }
    return {name, events, edgesAt: k => byK.get(k) || []};
}

/** Named scripts. `fps` is samples per second; each lasts `seconds`. */
export function makeSchedule(name, seconds, fps = 30) {
    const total = Math.round(seconds * fps), events = [];
    if (name === 'idle') return build(name, events);
    if (name === 'arrows') {
        // Each arrow is held for 0.5 s then released for 0.25 s, in turn, repeating.
        const hold = Math.round(fps / 2), gap = Math.round(fps / 4), arrows = ['right', 'up', 'left', 'down'];
        for (let k = 1, i = 0; k < total; i++) {
            events.push({k, button: arrows[i % 4], down: true});
            events.push({k: Math.min(k + hold, total - 1), button: arrows[i % 4], down: false});
            k += hold + gap;
        }
        return build(name, events);
    }
    if (name === 'ab') {
        // A is tapped for 3 samples every second, B for 3 samples every 1.5 s (offset).
        for (let k = Math.round(fps / 3); k < total; k += fps) { events.push({k, button: 'A', down: true}); events.push({k: Math.min(k + 3, total - 1), button: 'A', down: false}); }
        for (let k = Math.round(fps * 0.7); k < total; k += Math.round(fps * 1.5)) { events.push({k, button: 'B', down: true}); events.push({k: Math.min(k + 3, total - 1), button: 'B', down: false}); }
        return build(name, events.sort((a, b) => a.k - b.k));
    }
    throw new Error('Unknown input script: ' + name);
}
export const SCRIPT_NAMES = ['idle', 'arrows', 'ab'];
