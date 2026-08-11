# Document engine policy

| Engine | State in v2.6.8 | Policy |
| --- | --- | --- |
| PDF.js | AVAILABLE | Built-in offline text extraction for explicitly managed PDFs. |
| Docling | NOT INSTALLED | Optional future local pack; not bundled and never replaced with a cloud request. |
| GROBID | NOT INSTALLED | Requires a separately managed local service/runtime; Aegis does not probe localhost or start it. |
| OCR | NOT INSTALLED | Image-only PDFs remain `OCR_REQUIRED`; Aegis does not call an external OCR service. |

Docling is a viable optional local pack because its project documents macOS
ARM64 support and MIT licensing, but its Python/model dependency surface is too
large for this base offline release. GROBID is intentionally not a base engine:
its documented local deployment commonly uses a Docker service and model stack.
Neither decision changes the safe PDF.js path.

No engine may receive renderer-selected executable paths, shell arguments,
environment secrets or arbitrary files.
