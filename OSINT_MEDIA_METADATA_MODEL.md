# OSINT Media Metadata Model

`osintVisualMediaVerification.class.js` emits a bounded normalized result:

```text
capability, status, confidence,
file, image, exif, geo, software, integrity, observations, warnings
```

No parser-native/raw metadata blob is exposed to the renderer or Evidence.

| Area | Normalized fields |
| --- | --- |
| File | safe display label, media type, byte size |
| Image | width, height, aspect ratio, orientation, colour profile, alpha |
| EXIF | capture time, timezone status, make/model, lens, focal length, exposure, aperture, ISO, flash |
| Geo | latitude, longitude, altitude, direction only when present |
| Software | explicit software tag only |
| Integrity | SHA-256 of original supplied bytes |

Capture dates without explicit timezone remain local camera text with
`TIMEZONE UNKNOWN`. A software tag is a neutral observation; its absence is not
evidence of originality.
