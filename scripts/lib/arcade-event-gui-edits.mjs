// The stopped game's saved trace and the handler can both contain this literal.
// Edit both occurrences so the actual handler changes as well as its saved value.
export function editEventMessageCode(code) {
    if(typeof code!=='string' || !code.includes('"H"'))throw new Error('Event fixture message is missing from Code');
    return code.replaceAll('"H"','"PLAY"');
}
