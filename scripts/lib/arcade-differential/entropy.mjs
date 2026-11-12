// Evaluates to (seed, constant, skip) => draw. draw.count is the number of PROGRAM draws so far.
// Callers whose stack matches `skip` (platform bookkeeping that the other side does not do the same
// way: Scratch id generation, the simulator's board and library start-up) are served from a second
// stream and are not counted, so program draw k is the same value on both sides.
// Library PRNG seeds (`seeds`: Math.FastRandom constructors) all receive one fixed value derived from
// the seed. They must not share the platform stream, whose position depends on each side's unrelated
// bookkeeping (the simulator board vs hundreds of Scratch id draws), and the libraries construct their
// generators in a different order (PXT at start-up in file order, Brickwright lazily). A single value
// is order-independent, so each effect's generator starts from the same state on both sides.
export const PRNG_SOURCE = `((seed, constant, skip, seeds) => {
    const stream = start => { let s = start >>> 0; return () => { if (constant) return 0.5; s = (s + 0x6D2B79F5) >>> 0; let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    const program = stream(seed), other = stream(seed ^ 0x9e3779b9), pattern = skip ? new RegExp(skip) : null;
    const seedValue = stream(seed ^ 0x85ebca6b)(), seeded = () => seedValue, seedPattern = seeds ? new RegExp(seeds) : null;
    const draw = () => { const stack = (pattern || seedPattern) && new Error().stack;
        if (seedPattern && seedPattern.test(stack)) return seeded();
        if (pattern && pattern.test(stack)) return other(); draw.count++; return program(); };
    draw.count = 0; return draw; })`;
