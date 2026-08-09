# OSINT Visual & Media Verification

Phase 6 adds `VISUAL_MEDIA_VERIFICATION`: a passive workspace for one image
explicitly selected by the analyst. It is not an editor, reverse-image search
client, facial-recognition feature or authenticity detector.

## Supported input

- JPEG
- PNG
- WebP

The current bounded inspector accepts one file up to 20 MB and rejects images
over 100 million pixels, unsupported formats and malformed dimensions. HEIC is
intentionally deferred rather than handled through an unreviewed dependency.

## Workflow

`explicit file → in-process metadata inspection → normalized context → analyst
observation → optional Evidence Preview/redaction → Case Evidence`

The image preview is bounded and aspect-ratio preserving. The original file is
not copied to AegisUi storage. Its local SHA-256 is calculated from the exact
supplied bytes before any normalized record is created.

## Semantics

Metadata is file-supplied context only. A capture time, GPS field or software
tag does not prove authenticity, location, timing, authorship or manipulation.
Absent metadata is displayed as `ABSENT` or `UNKNOWN`, never inferred from the
image appearance.

## Provider posture

`local-media-inspection` is an integrated `LOCAL_TOOL`, not an external
provider. It has no launch URL, no copy URL action and no network capability.
Reverse-image services remain catalog links only: Phase 6 does not upload media
or automate browser services.
