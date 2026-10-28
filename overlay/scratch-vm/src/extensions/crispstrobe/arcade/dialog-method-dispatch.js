// Sequence intrinsic virtual method slots without pretending a Promise-returning
// source override is a synchronous JavaScript method. The actual SDK operations
// and managed procedure dispatcher supply the work; this owns continuation only.
module.exports = function runDialogMethodSequence(operations, active, finish) {
    let index = 0;
    function advance() {
        while (index < operations.length) {
            if (!active()) return;
            const result = operations[index++]();
            if (result && typeof result.then === 'function') return result.then(advance);
        }
        if (active()) return finish();
    }
    return advance();
};
