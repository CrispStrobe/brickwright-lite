# Current Array export: overwritten local initializers

## Scope

Extend the existing current Array receiver authority for one bounded case: an
actual lexical local receives Null or Undefined, then a definite Array overwrite
before any use of that earlier value. The current exporter must prove this from
the current connected graph and its actual local binding. A generated variable
name, declaration annotation, allocation label or retained source cannot establish
that the initializer is dead.

The implementation extends the current receiver analysis at
`overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js`.
Implementation must start from a reviewed source composition that contains this
receiver-authority foundation; public adoption must include and qualify that
foundation together with this extension. Preserve physical input checks,
initialization checks and complete writer obligations.
This lane does not introduce another Array producer or remove a Null writer merely
because a later writer supplies an Array.

## Ownership

After this documentation claim merges, own narrow changes to
`overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js`,
focused authored controls in `test/makecode-array-local-reset-proof.test.mjs`,
necessary additions to the existing Array authority controls, and this contract
and its compatibility notes. Coordinate shared helper hunks with other owners.
The current exporter continues to use the same receiver validation entry point.

No source lowering, canonical supplier, dependency pin, Arrays extension, runtime,
managed invocation ABI, Array element domain, graphics editor or workflow change
is authorized. Any need for those changes requires a separate coordinated scope.
Do not implement before the claim has normally merged.

## Actual local identity and the overwritten value

Prove all of the following before excluding one initializer from the writer set:

- The actual current target, unique procedure definition/prototype, ordered
  formal identity and connected body identify the lexical local and its managed
  invocation frame. The producer and every relevant read/write belong to that
  same local identity. Matching names across procedures or targets do not join
  their facts. Static export proof does not mint a native frame or owner token.
- The initial writer really supplies canonical Null or Undefined. Preserve the
  distinction between that value, missing inputs, text, tags and malformed nodes.
- A definite subsequent write to the same local dominates every admitted use of
  the initial value. Analyze the current linear control chain, parents, input
  ownership and all operand subgraphs. Reject cycles, duplicate ownership,
  disconnected or foreign blocks and malformed schemas.
- No earlier read, alias publication, capture or reachable callback can observe
  the value. Inspect actual capture/caller relationships and closure operands;
  an absence of a direct local reporter in the top-level chain is insufficient.
- Calls, branches, loops, reentry, yields and lifecycle changes cannot cross this
  proof as unexamined effects. If their read or callback reachability is unknown,
  retain the initializer as an incompatible writer.

The proof is per initializer and current local. It does not establish that every
writer to that local is an Array. After excluding a proved dead initializer, the
existing actual allocation, compatible-all-writers, alias, element-presence and
initialization requirements still apply independently.

## Intervening commands and preserved effects

A palette command, unrelated variable assignment or another Array's construction
can appear before the overwrite. Their presence is not permission to ignore them.
A bounded effect proof must inspect the actual qualified primitive implementation
and the exact current command and operands. Establish the command's reads, writes,
callback reachability and suspension/reentry behavior. An opcode-name whitelist,
namespace spelling, claimed purity or cached annotation is not that proof.

Every operand subtree must exclude a read or escape of the candidate local.
An unrelated Array mutation needs its own actual receiver and alias proof; a
fresh-constructor site alone does not prove that its body is independent. Preserve
all earlier mutations, published global values, exceptions and callback effects.
If those effects could expose the candidate local before the overwrite, refuse.

Do not delete, reorder, fold or replace commands, reporter bodies or initializer
nodes. Only the export analysis may discount the one proved unobservable writer.
Unknown effects retain an explicit receiver refusal and the full current graph.
Do not repair a failure by removing diagnostics, substituting an empty Array,
restoring original source or broadening a type domain.

## Acceptance

Use independent authored controls and a retained private current-project case.
The seven observed local construction sequences must each have a separate actual
binding and overwrite witness. Do not turn their names, hashes or source text
into admission criteria.

Required negative controls include an interleaved read; managed call or callback;
local capture or alias escape; a foreign target/procedure/formal identity; a
conditional overwrite; loop/reentry or lifecycle boundary; cyclic or disconnected
blocks; malformed sockets; and a mutation whose receiver may alias the candidate.
Include a harmless unrelated command with an operand that secretly reads the
local. Keep unknown effects refused and exercise all remaining incompatible
writers after a valid dead initializer has been excluded.

Preserve full actual source/conversion returns, diagnostic channel presence,
Creator warnings/errors/unparsed values and partial graphs before assertions.
Validate current Code feedback, same and fresh saved projects with actual assets,
current export and reimport from the actual current files. Do not reuse dependency
preparation for a different exported project. Retain the original two receiver
refusals and compare the complete current graph and bodies, not just error counts.

Source controls establish export-analysis behavior only. Qualify the affected
current application route separately; if generated program inputs change, admit
its required fresh compiler or guest qualification before claiming that route.
Existing native results are not promoted by a source proof. Visible Blocks/Code
editing and GUI acceptance remain separate gates. No whole-project compatibility
count changes without the complete required pipeline evidence.
