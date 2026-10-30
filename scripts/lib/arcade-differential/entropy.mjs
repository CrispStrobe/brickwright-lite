// Evaluates to (seed, constant, skip) => draw. draw.count is the number of PROGRAM draws so far.
// Callers whose stack matches `skip` (platform bookkeeping that the other side does not do the same
// way: Scratch id generation, the simulator's board and library start-up) are served from a second
// stream and are not counted, so program draw k is the same value on both sides.
export const PRNG_SOURCE = `((seed, constant, skip) => {
    const stream = start => { let s = start >>> 0; return () => { if (constant) return 0.5; s = (s + 0x6D2B79F5) >>> 0; let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    const program = stream(seed), other = stream(seed ^ 0x9e3779b9), pattern = skip ? new RegExp(skip) : null;
    const draw = () => { if (pattern && pattern.test(new Error().stack)) return other(); draw.count++; return program(); };
    draw.count = 0; return draw; })`;
