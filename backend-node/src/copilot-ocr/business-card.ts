import { NAME_SCRIPTS, PHONE_PREFERENCE } from "./constants.js";
import type { BusinessCardExtraction, BusinessCardName, OcrDocument, ScriptText } from "./types.js";

const clean = (value: unknown) => (typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim() : "");
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const scripts = (value: unknown): ScriptText => (value && typeof value === "object" ? value as ScriptText : null);

/** Each script the card prints, as printed: copilot fills a script only from that script on the card, never by translating. */
function names(value: unknown): BusinessCardName[] {
  const printed = scripts(value);
  const seen = new Set<string>();
  return NAME_SCRIPTS.flatMap((language) => {
    const name = clean(printed?.[language]);
    if (!name || seen.has(name)) return [];
    seen.add(name);
    return [{ language, value: name }];
  });
}

const first = (value: unknown) => names(value)[0]?.value ?? "";

function phone(value: unknown): string {
  const phones = list(value).map((item) => item && typeof item === "object" ? item as { kind?: unknown; number?: unknown } : {});
  for (const kind of PHONE_PREFERENCE) {
    const match = phones.find((item) => item.kind === kind && clean(item.number));
    if (match) return clean(match.number);
  }
  return clean(phones[0]?.number);
}

/** Copilot's name card fields (document.data for kind namecard) in the shape the scanner fills the forms from. */
export function businessCardFromScan(document: OcrDocument): BusinessCardExtraction {
  const data = document.data;
  const address = list(data.addresses).map((item) => item && typeof item === "object" ? (item as { raw?: unknown }).raw : null).find((raw) => first(raw));
  const companyNames = names(data.company), contactNames = names(data.name);
  return {
    companyName: companyNames[0]?.value ?? "",
    contactName: contactNames[0]?.value ?? "",
    companyNames,
    contactNames,
    email: clean(list(data.emails)[0]),
    phone: phone(data.phones),
    website: clean(list(data.urls)[0]),
    position: first(data.title),
    department: first(data.department),
    address: first(address),
    documentUrl: document.webUrl ?? "",
  };
}
