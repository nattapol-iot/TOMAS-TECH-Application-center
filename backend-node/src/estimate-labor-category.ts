/** Confirmed ERP rule. Alias is supplied only by source code, never request input. */
export function laborCategorySql(alias: "l" | "line") {
  return `CASE WHEN ${alias}.cost_type=N'Installation' THEN N'Installation'
    WHEN ${alias}.cost_type=N'Engineering' AND ${alias}.provider=N'Internal' THEN
      CASE LOWER(LTRIM(RTRIM(${alias}.department))) WHEN N'software' THEN N'Software'
        WHEN N'electrical' THEN N'Service' WHEN N'mechanical' THEN N'Service' END END`;
}
