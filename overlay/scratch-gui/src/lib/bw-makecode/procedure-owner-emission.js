/** Source-emission bookkeeping, local to one translation.
 * These keys are the translator's actual owner and function records. Names,
 * source text and runtime callable/capture values are never compared here.
 */
export function createProcedureOwnerEmission () {
    const emitted = new WeakMap();
    return (owner, declaration) => {
        let declarations = emitted.get(owner);
        if (!declarations) emitted.set(owner, declarations = new WeakSet());
        if (declarations.has(declaration)) return false;
        declarations.add(declaration);
        return true;
    };
}
