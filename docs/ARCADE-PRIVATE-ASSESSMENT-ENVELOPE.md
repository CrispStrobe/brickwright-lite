# Private assessment envelope

`sealEnvelope({recipientPem, contextJson, files})` from
`scripts/private-assessment/seal-envelope.mjs` returns an encrypted `Buffer`.
This is a sealing primitive. Hosted admission, credential removal, transport,
independent receiver admission and a complete assessment run remain separate
qualification work. No assessment count follows from its unit controls.

## Inputs and fixed bounds

- `recipientPem`: one SPKI `PUBLIC KEY` PEM containing an RSA public key with
  a modulus from 3072 through 8192 bits. Private keys and other PEM types are
  refused. The PEM input is limited to 16 KiB.
- `contextJson`: a primitive string containing valid JSON, at most 8 MiB of
  UTF-8. Its exact spelling, including whitespace, is retained privately.
- `files`: a dense array of at most 256 exact `{name, data}` records. `data`
  must be a non-shared `Buffer` or `Uint8Array`; each selected view is copied
  synchronously into a private byte snapshot. Original bytes are not modified.

Each raw file is limited to 8 MiB. Aggregate raw input and the complete decoded
private JSON are each limited to 64 MiB. The implementation computes the exact
serialized size, including base64, escaped context and record overhead, before
allocating file snapshots or base64 strings. The final envelope, including its
header and authentication tag, is limited to 8 MiB. Compression cannot guarantee
that otherwise admissible input fits this final bound; overflow is a failure,
never truncation. Callers cannot increase these limits through options.

Names are portable ASCII relative logical paths of at most 1024 characters.
Empty segments, traversal, absolute paths, backslashes, colons, trailing periods,
Windows device names and case-insensitive duplicates are refused. These names
are private metadata, not producer filesystem paths. The producer never opens
files and accepts no path, stream or symlink fields. A separate filesystem
collector must establish its own symlink and input ownership rules before
supplying bytes. Accessor records, sparse arrays and extra record fields fail.

## Version 1 wire format

All multibyte lengths are unsigned big endian. The returned byte sequence is:

1. Eight ASCII bytes `BWPAE001`.
2. Four bytes containing the public header's UTF-8 byte length (at most 4096).
3. The public header JSON, with exactly these fields in this order:
   `alg`, `keyFingerprint`, `iv`, `wrappedKey`.
4. AES-256-GCM ciphertext.
5. A 16-byte GCM authentication tag.

`alg` is `RSA-OAEP-SHA256+A256GCM+GZIP`. `keyFingerprint` is lowercase SHA-256
hex of the recipient's canonical SPKI DER. `iv` is canonical base64 of a fresh
12-byte IV. `wrappedKey` is canonical base64 of a fresh 32-byte AES key wrapped
with RSA-OAEP, SHA-256 and the default empty label. The complete magic, length
and header byte prefix is authenticated as GCM additional data.

The encrypted plaintext is gzip-compressed UTF-8 JSON, with this exact shape:

```json
{"version":1,"contextJson":"{}","files":[{"name":"input.json","bytes":2,"sha256":"...","base64":"e30="}]}
```

Each file record retains its exact byte length, SHA-256 hex and canonical base64
payload. The public header contains no input names, IDs, context or input hashes.
It intentionally reveals the format, recipient fingerprint and ciphertext length.
The AES key buffer is cleared in a `finally` block; this does not promise complete
plaintext or key erasure from a JavaScript process or its allocator.

## Execution and qualification boundary

The implementation uses Node's existing crypto and zlib APIs and assumes trusted
normal module initialization. It is not an attestation of a hostile Node realm.
It provides no private-key, decrypt, extraction, logging or network API. Original
provider and reflection exceptions propagate without replacing thrown identity.

The complete test module uses finite runtime-generated test keys and an
independent decryptor built directly from Node crypto and zlib. It checks byte
recovery, authenticated tampering, wrong keys, public metadata, fixed bounds,
invalid path and byte inputs, and exact thrown reasons. These are host crypto
controls, not firmware, browser, hosted transport or hardware evidence. The
independent operational receiver must validate header fields and bounds before
unwrapping, authenticate before decompression, bound decompression, then validate
private record schema, sizes, base64, hashes and names before any extraction.
