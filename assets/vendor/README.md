# PDF dependencies

These files are served locally and cached with the app; exports send no records to a PDF service or CDN.

| File | Source | License |
| --- | --- | --- |
| pdf-lib.min.js | npm `pdf-lib@1.17.1`, `dist/pdf-lib.min.js` | MIT; see pdf-lib.LICENSE |
| fontkit.min.js | npm `@pdf-lib/fontkit@1.1.1`, `dist/fontkit.umd.min.js` | MIT; see fontkit.LICENSE |
| report-font.ttf | DejaVu Sans, Debian fonts-dejavu-core | See report-font.LICENSE |

The npm tarballs were verified against their registry SHA-512 integrity values before extraction. DejaVu Sans is embedded as a subset so clinical symbols such as ≤, ≥ and arrows remain searchable in the PDF. Unsupported font characters are rendered as `?`; the original text remains available in CSV.

The fontkit fork is published by Andrew Dillon and is based on Devon Govett's fontkit. Its npm package declares MIT but omits a license file; fontkit.LICENSE records the MIT terms and contributor notices.
