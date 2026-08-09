# OSINT Media Evidence Model

Visual-media results use the existing Case/Evidence promotion path. The
normalized `data.media` record is schema-validated, redaction-reviewed and
included in the deterministic Evidence integrity hash.

Sensitive redaction options include the display label, timestamps, camera and
lens identifiers, GPS metadata, software tag and analyst observation. The
original-media SHA-256 remains distinct from the normalized Evidence-record
SHA-256.

`acquisitionMethod` is `LOCAL_MEDIA_INSPECTION`, making clear that no provider
query was made. Original media persistence is **deferred**: only normalized
metadata can be stored after an explicit Add to Case action.
