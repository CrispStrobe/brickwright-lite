import assert from 'node:assert/strict';

// The model and cycle workflow changes remain held in a separate lane. Bind
// their exact current policy without claiming pending manual-run isolation.
export const heldLegacyPolicy = "concurrency:\n" +
    "  group: ${{ github.workflow }}-${{ github.ref }}\n" +
    "  cancel-in-progress: ${{ github.ref_type != 'tag' && (github.event_name == 'push' || github.event_name == 'pull_request') }}\n";

export const assertHeldLegacyConcurrency = source => {
    assert.equal((source.match(/^[\t ]*concurrency:/gm) || []).length, 1,
        'one exact held concurrency mapping at the workflow root');
    const heading = /^concurrency:\n/m.exec(source);
    assert.ok(heading, 'held concurrency mapping is at the workflow root');
    const rest = source.slice(heading.index + heading[0].length);
    const end = /^[A-Za-z_][A-Za-z0-9_-]*:/m.exec(rest)?.index ?? rest.length;
    const block = heading[0] + rest.slice(0, end).replace(/\n+$/, '\n');
    assert.equal(block, heldLegacyPolicy, 'exact held workflow/ref policy with a closed mapping');
};

export const modelWorkflowBeforeHeldLegacyConcurrency = source => {
    assertHeldLegacyConcurrency(source);
    const boundary = '  actions: read\n' + heldLegacyPolicy + '\njobs:\n';
    assert.equal(source.split(boundary).length, 2, 'one exact held model policy at its original boundary');
    return source.replace(boundary, '  actions: read\njobs:\n');
};
