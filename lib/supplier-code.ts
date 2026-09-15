/**
 * A supplier code is typed by hand, but a business card only carries a company name.
 * This turns that name into a readable suggestion in the same shape as the codes
 * already in the master (KYCL, KPT1993, MEIJIDENKI): letters and digits from the
 * meaningful words, joined with hyphens, never a random string.
 *
 * The result only ever pre-fills an empty field; the person still confirms it.
 */

// Legal-form and generic words carry no identity, so they never reach the code.
const NOISE_WORDS = new Set([
  "CO", "COMPANY", "LTD", "LIMITED", "CORPORATION", "CORP", "INC", "INCORPORATED",
  "PLC", "PCL", "PUBLIC", "PVT", "PRIVATE", "LLC", "LP", "OFFICE", "GROUP",
  "HEAD", "BRANCH", "THAILAND",
]);

/** dbo.suppliers.code is nvarchar(30) and the form enforces the same limit. */
export const SUPPLIER_CODE_MAX_LENGTH = 30;

export function supplierCodeFromName(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !NOISE_WORDS.has(word));
  if (!words.length) return "";
  const slug = words.join("-").slice(0, SUPPLIER_CODE_MAX_LENGTH).replace(/-+$/, "");
  // The column's own pattern requires the code to start with a letter or digit.
  return /^[A-Z0-9]/.test(slug) ? slug : "";
}
