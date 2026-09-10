# Multilingual customer and contact names

Customer creation and editing supports separate Thai, English and Japanese names for both the company and its primary contact. The contact also stores Position and Department. These fields are available from Customer Master and from the inline customer flow in New Inquiry.

At least one company name is required. A contact name in at least one language is required whenever contact details, Position or Department are supplied. English is used as the compatibility name when present, followed by Thai and Japanese. This preserves existing inquiry, report and external API behavior that expects one `name` or `contact` value while keeping every entered spelling independently.

Migration 030 adds `name_th`, `name_en` and `name_ja` to `customers` and `customer_site_contacts`. Existing rows receive empty localized values and retain their original canonical names. There is deliberately no automatic historical backfill, translation or transliteration.

Business-card OCR keeps printed Thai, English and Japanese candidates separate and fills only blank language fields. The image remains local to the browser, the user reviews all values, and nothing is persisted until the normal Save action. Position and Department suggestions follow the same review flow.

Validation covers creation, duplicate prevention, directory reads, bootstrap reads, Customer Master edits, stale-row protection, Inquiry reuse, contact-role preservation and a restricted application role against a disposable schema 28 plus migration 030 database. The test deletes its temporary database and creates no Team Test customer fixture.

The Team Test database migration is independent of the pending Sales KPI migration 029. The live API release replaces only the compiled customer routes from the prior schema 28 baseline, leaving health checks, permissions and unrelated KPI modules unchanged.

## Team Test release

Migration 030 was applied after a verified `COPY_ONLY, CHECKSUM` backup. Team Test contains schema markers 28 and 30 while 29 remains unapplied. The exact selective API stage passed 40 SQL/API checks on a disposable database and all 300 staged artifact hashes matched the installed release before the temporary stage was removed. API readiness reports schema 30.

The integrated frontend was rebuilt and verified over the LAN. Browser checks confirmed all six name inputs, Position, Department, local image import and mobile camera capture in both New Inquiry and Customer Master. No customer fixture or other business record was created in Team Test.
