# Embedded Google Fonts

The employee manual uses **Noto Sans Thai** for Thai and English, and
**Noto Sans JP** for Japanese. Both families come from Google Fonts and are
licensed under the SIL Open Font License 1.1.

The two `*-manual-*.woff2` files are text-optimized subsets containing the
characters used by the multilingual handbook. Each family stays in one file
so Thai base characters and combining marks always use the same font face.
`embedded-fonts.css` records
their Unicode ranges, and the handbook builder converts their local URLs to
embedded `data:` URLs. The delivered HTML therefore needs no network request.

Run `scripts/fetch-manual-google-fonts.ps1` after adding new characters that
are missing from the current subsets, then rebuild the handbook. The source
URLs and exact generated files are recorded in `font-manifest.json`.

Sources:

- https://fonts.google.com/noto/specimen/Noto+Sans+Thai
- https://fonts.google.com/noto/specimen/Noto+Sans+JP
- https://developers.google.com/fonts/docs/css2

License copies: `OFL-NotoSansThai.txt` and `OFL-NotoSansJP.txt`.
