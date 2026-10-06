# Permissive license, so PDF extraction uses pdf.js and not MuPDF

tracker-keeper will be released under a permissive license, which rules out MuPDF (mupdf.js / PyMuPDF): MuPDF is AGPL-3.0 unless you buy a commercial license from Artifex. PDF extraction therefore uses pdf.js (Apache-2.0), even though mupdf.js is faster and gives per-character positions directly. When we tested the sample charts, pdf.js exposed everything the vector parser needs (real font names, per-glyph character codes, paths), so we give up convenience and speed but no accuracy. A permissive license also keeps a hosted backend and closed or commercial use possible later, without AGPL network obligations.

## Considered Options

- **AGPL + mupdf.js**: simpler extraction and roughly 2–3× faster per page, but every hosted deployment and every fork inherits AGPL obligations.
- **PDFium (BSD/Apache, WASM)**: also permissive, but we haven't tested it. It stays a fallback if pdf.js falls short.
