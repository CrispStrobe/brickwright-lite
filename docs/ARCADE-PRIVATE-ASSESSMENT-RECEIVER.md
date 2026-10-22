# Private assessment receiver

`openEnvelope({identityPem, envelope})` from
`scripts/private-assessment/open-envelope.mjs` authenticates and validates a
version 1 sealed assessment. It imports no code from the sealing producer.
It returns `{contextJson, files}`, where each file is a verified
`{name, bytes, sha256, data}` record and `data` is a fresh `Buffer`.
It does not extract files, log plaintext or keys, or contact a network service.

## Accepted format and validation order

The input is a non-shared `Buffer` or `Uint8Array` view. The receiver copies that
view before interpretation and limits it to 8 MiB. Identity input is a primitive
PEM string of at most 16 KiB containing an unencrypted PKCS8 `PRIVATE KEY` or
PKCS1 `RSA PRIVATE KEY`. Only RSA with a 3072 through 8192 bit modulus is accepted.
Options have exactly the two declared own data fields; a caller cannot raise caps.

The wire prefix is eight ASCII bytes `BWPAE001`, a four-byte big-endian header
length, and at most 4096 UTF-8 header bytes. Header JSON must be canonical and
contain exactly these fields in order:

- `alg`: `RSA-OAEP-SHA256+A256GCM+GZIP`.
- `keyFingerprint`: lowercase SHA-256 hex of the identity's public SPKI DER.
- `iv`: canonical base64 of twelve bytes.
- `wrappedKey`: canonical base64, with length matching the RSA modulus in bytes.

The header is validated before RSA-OAEP-SHA256 unwrapping. The unwrapped key must
be exactly 32 bytes. The entire prefix is AES-256-GCM additional authenticated
data. The last sixteen wire bytes are the authentication tag. Authentication
must finish successfully before any decrypted data is decompressed or parsed.

Gzip output is bounded to 64 MiB. Decoded bytes must be valid UTF-8 and canonical
JSON with exactly `{version, contextJson, files}` in that order; `version` must
be 1. Canonical means equality to `JSON.stringify(JSON.parse(text))`, so duplicate
fields, alternate numeric spellings and added whitespace are refused. The exact
private `contextJson` string is retained, limited to 8 MiB of UTF-8, and separately
validated as JSON. Its own internal whitespace is preserved.

At most 256 files are accepted. Each file must have exactly
`{name, bytes, sha256, base64}` in that order, with a nonnegative integer size of
at most 8 MiB, canonical base64 matching that size, and a matching lowercase
SHA-256 hex digest. Aggregate decoded file bytes are bounded to 64 MiB. Base64
length is checked before allocating its byte buffer. The complete private JSON
cap also includes base64 and all metadata overhead.

Names use the same portable ASCII relative logical path contract as the sealer:
1 through 1024 characters, no absolute path, traversal, empty segment, backslash,
colon, trailing period, Windows device name or case-insensitive duplicate.
Extra path, symlink, directory or extraction fields are refused. These checks do
not authorize extraction into a filesystem. A later consumer must establish its
own destination ownership and safe file creation rules.

## Qualification boundary

The receiver assumes trusted normal Node module initialization and uses only
Node crypto and zlib. It does not attest a hostile JavaScript realm. Its AES key
buffer is cleared in `finally`; this is not a guarantee that plaintext or key
material is erased from the JavaScript allocator. Provider and reflection
exceptions retain their original identity.

The complete test module constructs independent authenticated fixtures directly
with Node crypto and zlib, using one finite runtime-generated 3072-bit RSA pair.
It imports no producer sealing helper. Controls cover exact recovery, tampering,
recipient fingerprint, framing, gzip expansion bounds, private schemas, hashes,
canonical base64, paths, unsupported inputs and exact thrown reasons. These are
host crypto controls. Hosted artifact admission, credential custody, transport,
filesystem extraction and a complete compatibility assessment remain separate
work and require their own evidence.
