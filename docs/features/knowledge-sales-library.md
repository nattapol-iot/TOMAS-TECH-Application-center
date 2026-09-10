# Knowledge Hub sales materials

The Knowledge Hub now opens **Solutions & Sales Materials** in both the production
and demo screens. The existing document register, uploaded presentation library,
and knowledge workflows remain available in their existing tabs.

The source is the user-supplied SharePoint workbook
`Sales material_Tomas Tech_20260314_R1.xlsx`, downloaded on 2026-09-05.
Its 19 categories contain 183 source rows: 112 PDF, 68 PPTX and 3 video links.
All 183 hyperlinks are imported directly from worksheet relationships. Relative
SharePoint paths are resolved against the source index URL. Source row numbers,
filenames, titles, languages, formats, and repeated entries are preserved; SP and
SPANISH are displayed as ES. This indexes the workbook, not the contents of each
presentation. It does not assert that any particular file is the latest revision.

Users can search solution/document/filename, filter language and format, open a
category, and open a file in SharePoint. SharePoint still enforces file access.
The interface supports TH/EN/JP and links back to the original workbook.

## Updating the index

Administrators now have an **Auto update** control. In Entra production mode it
requests the read-only Microsoft Graph `Files.Read` delegated scope when first
needed, downloads this exact shared workbook, validates and compares it, and
publishes the new catalog through the application API. In Team Test mode (which
does not hold a Microsoft 365 session), the same control asks the administrator
to select the latest downloaded XLSX file. Both paths publish one shared catalog
under the configured document-storage root; ordinary viewers only read it.

For command-line maintenance, download the updated workbook and run:

```powershell
python scripts/import-sales-materials.py 'path/to/downloaded-index.xlsx'
```

The importer reads the workbook's Sheet1 column layout (A category/number,
B language, C title, D format, E link). It writes
`app/system/data/sales-materials.json` only after parsing and validating all
entries. Missing links remain null and open the source index instead. Non-HTTPS
or non-company destinations fail for review. Workbook content is data, never
instructions. Rebuild/release the existing Team Test frontend to apply updates.

## Validation on 2026-09-05

- Imported JSON matches the source workbook, with 183 distinct source row IDs
  and 183 HTTPS links on the supplied company SharePoint host.
- TypeScript check and targeted ESLint pass.
- Team Test production build passes using its existing auth/API settings.
- Existing LAN app and new Solution Library bundle both return HTTP 200;
  the served bundle includes the company catalog.
- Deployed with the existing Team Test launcher at http://192.168.1.160:3000
  (frontend PID 11652). No cloud deployment or database changes.
- Individual linked files were not all opened or checked for access/revision.

## Tree view update — 2026-09-05
Replaced the category cards/drawer with nested disclosures: solution category, language, then direct file links. Expand/collapse-all controls apply to visible results; changing search or filters expands matching results automatically. Native buttons expose expanded state and child lists support keyboard navigation with Tab and Enter/Space. Typecheck, scoped ESLint and managed Team Test build passed.

## Preview and Auto update — 2026-09-05

- Every leaf has Preview. Entra production requests a short-lived embeddable URL
  from Microsoft Graph before opening the contained viewer. Team Test opens the
  Microsoft 365 web viewer in a new tab because that mode has no Entra token.
  Graph errors render an explicit Open file action instead of a broken iframe.
- Only users with `knowledge.manage_categories` see Auto update. The API checks
  the same permission again before writing the shared catalog.
- Incoming catalogs are bounded, reject duplicate source rows, accept only known
  formats, and reject every non-HTTPS/non-company SharePoint URL.
- The API stores update time and updater name. It logs actor ID and material count
  without logging private tokens or file contents.
- The current 19-category, 183-material catalog was published to the shared Team
  Test endpoint. Frontend and API endpoints returned HTTP 200 after release.
- Frontend typecheck, scoped ESLint, Node typecheck/build, and all 34 Node tests
  passed. Automatic Microsoft 365 retrieval cannot be exercised in Team Test;
  the XLSX-selection path is the supported Team Test behavior.
