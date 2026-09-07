import type { BusinessCardName } from "../../../lib/business-card";

export type LocalizedNames = { nameTh: string; nameEn: string; nameJa: string };
export type ContactTitles = { titleTh?: string; titleEn?: string; titleJa?: string };

/** Titles are optional display metadata; never change the saved canonical name. */
export function contactNameLines(names: LocalizedNames & ContactTitles, fallback = ""): Array<{ language: "TH" | "EN" | "JA"; value: string }> {
  const lines = localizedNameLines(names);
  if (!lines.length && fallback.trim()) lines.push({ language: inferredLanguage(fallback).toUpperCase() as "TH" | "EN" | "JA", value: fallback.trim() });
  return lines.map((line) => {
    const title = (line.language === "TH" ? names.titleTh : line.language === "EN" ? names.titleEn : names.titleJa)?.trim();
    return { ...line, value: title ? line.language === "JA" ? `${line.value} ${title}` : `${title} ${line.value}` : line.value };
  });
}

export function canonicalLocalizedName(names: LocalizedNames, fallback = ""): string {
  return names.nameEn.trim() || names.nameTh.trim() || names.nameJa.trim() || fallback.trim();
}

function inferredLanguage(value: string): BusinessCardName["language"] {
  if (/\p{Script=Thai}/u.test(value)) return "th";
  if (/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value)) return "ja";
  return "en";
}

export function localizedNamesFromCard(candidates: BusinessCardName[] | undefined, fallback: string): LocalizedNames {
  const result: LocalizedNames = { nameTh: "", nameEn: "", nameJa: "" };
  for (const candidate of candidates ?? []) {
    const key = candidate.language === "th" ? "nameTh" : candidate.language === "ja" ? "nameJa" : "nameEn";
    if (!result[key]) result[key] = candidate.value.trim();
  }
  if (!result.nameTh && !result.nameEn && !result.nameJa && fallback.trim()) {
    const language = inferredLanguage(fallback);
    result[language === "th" ? "nameTh" : language === "ja" ? "nameJa" : "nameEn"] = fallback.trim();
  }
  return result;
}

export function localizedNameLines(names: LocalizedNames): Array<{ language: "TH" | "EN" | "JA"; value: string }> {
  return [
    { language: "TH" as const, value: names.nameTh.trim() },
    { language: "EN" as const, value: names.nameEn.trim() },
    { language: "JA" as const, value: names.nameJa.trim() },
  ].filter((entry) => entry.value);
}
