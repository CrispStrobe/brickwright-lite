// ---------------------------------------------------------------------------------------------
// Run a SYNCHRONOUS program whose input arrives asynchronously (task E8).
//
// The Code tab's JavaScript console runs the user's program with `new Function`, and the
// program reads input with a plain `prompt(...)` call whose value it uses at once. In the
// desktop/iOS app no dialog can block a script (lib/native-dialog.js), so the answer has to be
// awaited — but the program cannot await: its `prompt(...)` sits inside ordinary functions.
//
// So the program is REPLAYED. Each run hands it the answers collected so far; at the first
// question it has no answer for, the run stops (a private value is thrown out of the `prompt`
// call), the question is asked and awaited, and the program runs again from the start with one
// more answer. A program is deterministic given its inputs, except for `Math.random`, which is
// replayed too: every value one run drew is drawn again, in order, by the next. Each run starts
// from scratch, so the caller resets its output before each (`runOnce` is told which run it is).
// The program's own state lives in the `new Function` body and is rebuilt by every run; a
// program that throws the private value away (catch-all `try`) still has its question asked.
// ---------------------------------------------------------------------------------------------

/**
 * @param {function(object): void} runOnce runs the program once with
 *     `{prompt, random, run}`: `prompt(question)` answers from the replayed answers (and stops
 *     the run at a new question), `random()` is the replayed Math.random, `run` counts from 0
 * @param {function(string): Promise<string>} ask asks one question and resolves with its answer
 * @param {{maxQuestions: (number|undefined)}} [options] stop after this many questions
 * @returns {Promise<{runs: number, answers: string[]}>} after the run that asked nothing new
 */
export const runWithReplayedInput = async (runOnce, ask, {maxQuestions = 1000} = {}) => {
    const answers = [];
    const randoms = [];
    for (let run = 0; ; run++) {
        let next = 0;
        let drawn = 0;
        let pending = null;
        const prompt = question => {
            if (next < answers.length) return answers[next++];
            if (!pending) pending = {question: question === null || typeof question === 'undefined' ? '' : String(question)};
            throw pending;
        };
        const random = () => {
            if (drawn === randoms.length) randoms.push(Math.random());
            return randoms[drawn++];
        };
        try {
            runOnce({prompt, random, run});
        } catch (error) {
            if (!pending || error !== pending) throw error;
        }
        if (!pending) return {runs: run + 1, answers};
        if (answers.length >= maxQuestions) {
            throw new Error(`the program asked more than ${maxQuestions} questions`);
        }
        const answer = await ask(pending.question);
        answers.push(typeof answer === 'string' ? answer : String(answer === null || typeof answer === 'undefined' ? '' : answer));
    }
};

/**
 * The `Math` a replayed program sees: the real one with `random` replaced.
 * @param {function(): number} random the replayed random
 * @returns {object} a Math whose every other member is the real one's
 */
export const mathWithRandom = random => Object.create(Math, {random: {value: random, enumerable: false}});
