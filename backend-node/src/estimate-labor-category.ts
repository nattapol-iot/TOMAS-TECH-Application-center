/** Confirmed ERP rule. Alias is supplied only by source code, never request input.
 * The line's discipline (migration 070) decides; a line written before it falls back to the
 * department text the rule always matched, which is what migration 070 backfilled from. */
export function laborCategorySql(alias: "l" | "line") {
  return `CASE WHEN ${alias}.cost_type=N'Installation' THEN N'Installation'
    WHEN ${alias}.cost_type=N'Engineering' AND ${alias}.provider=N'Internal' THEN
      CASE COALESCE(${alias}.discipline, CASE LOWER(LTRIM(RTRIM(${alias}.department))) WHEN N'software' THEN N'Software'
          WHEN N'electrical' THEN N'Electrical' WHEN N'mechanical' THEN N'Mechanical' END)
        WHEN N'Software' THEN N'Software' WHEN N'Electrical' THEN N'Service' WHEN N'Mechanical' THEN N'Service' END END`;
}
