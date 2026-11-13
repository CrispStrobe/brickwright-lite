# Current engine pins

Current observers and readers get the engine version, release URL and SHA512
from `scripts/integrate.mjs` and the GUI lockfile. Both lock entries must match
the producer, and the archive filename must match the installed version. When
archive bytes are supplied, the helper verifies their SHA512 against that pin
and reports their SHA256. Package installation also verifies archive integrity.
Changed release bytes use a new release URL with matching producer and lockfile
pins; existing release assets remain unchanged.

Engine selection has no separate admission record, approval status, canonical
source receipt or qualification-summary digest. Historical fixture files and
readers are independent of current engine lookup. Their existing manifests,
physical cases, numerical bounds and saved-output checks remain in place.
Current resting observers reuse the original observation functions, and current
readers reuse the original row/contact validation and recomputation functions.
Pin consistency and synthetic hash tests do not replace actual engine tests.
