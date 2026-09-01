export type BusinessCardName = { language: "th" | "en" | "ja"; value: string };

export type BusinessCardExtraction = {
  companyName: string;
  contactName: string;
  companyNames?: BusinessCardName[];
  contactNames?: BusinessCardName[];
  email: string;
  phone: string;
  website: string;
  position: string;
  department: string;
  address: string;
  rawText: string;
  confidence: number;
};

const COMPANY_WORDS = /(?:บริษัท|บจก\.?|หจก\.?|จำกัด|มหาชน|株式会社|有限会社|合同会社|合資会社|合名会社|㈱|㈲|\(株\)|（株）|\b(?:company|co\.?\s*,?\s*ltd\.?|corporation|corp\.?|limited|inc\.?|llc|group|enterprise|technology|solutions?)\b)/i;
const POSITION_WORDS = /(?:\b(?:manager|engineer|director|president|officer|executive|specialist|supervisor|coordinator|consultant|sales|marketing|purchasing|procurement|owner|founder|ceo|cto|cfo)\b|กรรมการ|ผู้จัดการ|วิศวกร|เจ้าหน้าที่|หัวหน้า|ฝ่ายขาย|ฝ่ายการตลาด|ฝ่ายจัดซื้อ|代表取締役|取締役|社長|部長|課長|係長|主任|担当|エンジニア|マネージャー|役職)/i;
const DEPARTMENT_WORDS = /(?:\b(?:department|division|section)\b|ฝ่าย|แผนก|หน่วยงาน|部署|所属|営業部|技術部|開発部|製造部|品質保証部|管理部|総務部|事業部|営業課|技術課)/i;
// English abbreviations need word boundaries: “NORD” and “CERT” are not roads.
const ADDRESS_WORDS = /(?:\b(?:address|office|factory|road|rd|street|st|soi|moo|bangkok|thailand)\b|ที่อยู่|สำนักงานใหญ่|สำนักงาน|แขวง|เขต|ตำบล|อำเภอ|จังหวัด|ถนน|ซอย|หมู่|กรุงเทพ|ประเทศไทย|住所|所在地|〒\s*\d{3}[-ー]?\d{4}|東京都|北海道|(?:京都|大阪)府|[\p{Script=Han}]{2,3}県|\b\d{5}\b)/iu;
const CERTIFICATION_WORDS = /\b(?:TUV\s*NORD|TÜV|IATF|ISO|CERT|CERTIFIED|CERTIFICATION)\b|認証|認定/i;
const CONTACT_LINE = /(?:\be-?mail\b|โทร|มือถือ|\b(?:mobile|phone|tel|fax|website|web)\b|電話|携帯|メール|www\.|https?:\/\/|@)/i;
const HONORIFIC = /^(?:(?:mr|mrs|ms|miss|dr|khun)\.?\s+|(?:คุณ|นาย|นางสาว|นาง|ดร\.)\s*)/i;
const COMPANY_LABEL = /^(?:(?:company(?: name)?|会社名|社名)\s*[:：-]?\s*|บริษัท\s*)/i;
const NAME_LABEL = /^(?:name|contact(?: name)?|ชื่อ(?:ผู้ติดต่อ)?|氏名|お名前)\s*[:：-]?\s*/i;

const cleanLine = (value: string) => value.normalize("NFC").replace(/\u0e4d\u0e32/g, "\u0e33").replace(/[|¦]/g, " ").replace(/\s+/g, " ").trim();
const stripLabel = (value: string, label: RegExp) => cleanLine(value.replace(label, "").replace(/^\s*[:：-]\s*/, ""));
const digits = (value: string) => value.replace(/\D/g, "");
const isLikelyContactLine = (line: string) => CONTACT_LINE.test(line);

function bestScoredLine(lines: string[], score: (line: string, index: number) => number) {
  return lines.map((line, index) => ({ line, score: score(line, index) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.line ?? "";
}

function printedLanguage(value: string): BusinessCardName["language"] | null {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value)) return "ja";
  if (/\p{Script=Thai}/u.test(value)) return "th";
  return /[A-Za-z]/.test(value) ? "en" : null;
}

function namesByLanguage(lines: string[], score: (line: string, index: number) => number, clean: (line: string) => string): BusinessCardName[] {
  const strongest = new Map<BusinessCardName["language"], { value: string; score: number }>();
  lines.forEach((line, index) => {
    const value = clean(line);
    const language = printedLanguage(value);
    const candidateScore = score(line, index);
    if (language && value && candidateScore > 0 && candidateScore > (strongest.get(language)?.score ?? 0)) {
      strongest.set(language, { value, score: candidateScore });
    }
  });
  return [...strongest].map(([language, candidate]) => ({ language, value: candidate.value }));
}

function extractPhone(lines: string[]) {
  const candidates = lines.flatMap((line) => {
    const matches = line.match(/(?:\+?\d[\d ().-]{6,}\d)/g) ?? [];
    return matches.map((value) => ({ value: cleanLine(value), line }));
  }).filter(({ value }) => {
    const count = digits(value).length;
    return count >= 9 && count <= 13;
  });
  const preferred = candidates.find(({ line }) => /(?:โทร|มือถือ|mobile|phone|tel\.?)/i.test(line)) ?? candidates[0];
  return preferred?.value.replace(/^[^+\d]+/, "").trim() ?? "";
}

function extractAddress(lines: string[]) {
  const addressCandidate = (line: string) => ADDRESS_WORDS.test(line) && !isLikelyContactLine(line) && !CERTIFICATION_WORDS.test(line) && !COMPANY_WORDS.test(line);
  const explicit = lines.findIndex((line) => /^(?:address|ที่อยู่|住所|所在地)\s*[:：-]?/i.test(line) && !CERTIFICATION_WORDS.test(line));
  if (explicit >= 0) {
    const first = stripLabel(lines[explicit], /^(?:address|ที่อยู่|住所|所在地)/i);
    const continuation = lines.slice(explicit + 1, explicit + 3).filter(addressCandidate);
    return [first, ...continuation].filter(Boolean).join(", ");
  }
  const addressLines = lines.filter((line) => addressCandidate(line) && /\p{L}{2}/u.test(line));
  return addressLines.slice(0, 3).join(", ");
}

export function parseBusinessCard(rawText: string, ocrConfidence = 0): BusinessCardExtraction {
  const rawLines = rawText.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const lines = rawLines.filter((line, index) => rawLines.findIndex((candidate) => candidate.toLocaleLowerCase() === line.toLocaleLowerCase()) === index);
  const compactContactText = rawText.normalize("NFC").replace(/\s*([@.])\s*/g, "$1");
  const email = compactContactText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLocaleLowerCase() ?? "";
  const website = compactContactText.match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9.-]+\.(?:com|co\.th|net|org|io|asia|biz|tech)(?:\/[^\s]*)?/i)?.[0] ?? "";
  const phone = extractPhone(lines);

  const companyScore = (line: string, index: number) => {
    if (isLikelyContactLine(line) || CERTIFICATION_WORDS.test(line) || NAME_LABEL.test(line) || (ADDRESS_WORDS.test(line) && !COMPANY_WORDS.test(line)) || POSITION_WORDS.test(line) || DEPARTMENT_WORDS.test(line)) return -10;
    // A logo can be the first line; uppercase personal names further down are not
    // evidence of another company when the card already has a legal company name.
    if (index > 0 && !COMPANY_WORDS.test(line) && !COMPANY_LABEL.test(line)) return 0;
    let score = COMPANY_WORDS.test(line) ? 12 : 0;
    if (COMPANY_LABEL.test(line)) score += 8;
    if (HONORIFIC.test(line)) score -= 8;
    const letters = line.replace(/[^A-Za-zก-๙]/g, "");
    const uppercase = line.replace(/[^A-Z]/g, "");
    if (letters.length >= 4 && uppercase.length / letters.length > 0.65) score += 3;
    if (index < 3) score += 2;
    if (/\d{4,}/.test(line)) score -= 4;
    return score >= 4 ? score : 0;
  };
  const companyLine = bestScoredLine(lines, companyScore);
  const cleanCompanyName = (line: string) => stripLabel(line, COMPANY_LABEL);
  const companyName = cleanCompanyName(companyLine);
  const companyNames = namesByLanguage(lines, companyScore, cleanCompanyName);

  const departmentLine = lines.find((line) => DEPARTMENT_WORDS.test(line) && (!POSITION_WORDS.test(line) || /^(?:ฝ่าย|แผนก|หน่วยงาน|部署|所属)/.test(line)) && !COMPANY_WORDS.test(line)) ?? "";
  const department = stripLabel(departmentLine, /^(?:department|division|section|ฝ่าย|แผนก|หน่วยงาน|部署|所属)\s*/i);
  const positionLine = bestScoredLine(lines, (line) => {
    if (line === departmentLine || COMPANY_WORDS.test(line) || isLikelyContactLine(line) || ADDRESS_WORDS.test(line)) return -10;
    return POSITION_WORDS.test(line) ? 10 : 0;
  });
  const position = stripLabel(positionLine, /^(?:position|title|ตำแหน่ง|役職)\s*/i);

  const cleanContactName = (line: string) => stripLabel(line, NAME_LABEL).replace(HONORIFIC, "").replace(/\s*(?:様|さん)$/, "").trim();
  const contactScore = (line: string, index: number) => {
    if (line === companyLine || line === positionLine || line === departmentLine || isLikelyContactLine(line) || COMPANY_WORDS.test(line) || ADDRESS_WORDS.test(line) || POSITION_WORDS.test(line) || DEPARTMENT_WORDS.test(line) || CERTIFICATION_WORDS.test(line) || /\d/.test(line)) return -10;
    let score = 0;
    if (NAME_LABEL.test(line)) score += 12;
    if (HONORIFIC.test(line)) score += 8;
    const name = cleanContactName(line);
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 5 && /^[\p{L}\p{M} .'-]+$/u.test(name)) score += 5;
    // Kanji names may be printed without a space. Only accept those with a name label;
    // an unlabeled short Japanese line might instead be a brand or a department.
    if (NAME_LABEL.test(line) && printedLanguage(name) === "ja" && /^[\p{L}\p{M} ・ー]+$/u.test(name)) score += 5;
    if (index < 4) score += 2;
    if (name.length > 80 || name.length < 2) score -= 10;
    return score >= 5 ? score : 0;
  };
  const contactLine = bestScoredLine(lines, contactScore);
  const contactName = cleanContactName(contactLine);
  const contactNames = namesByLanguage(lines, contactScore, cleanContactName);

  return {
    companyName,
    contactName,
    companyNames,
    contactNames,
    email,
    phone,
    website,
    position,
    department,
    address: extractAddress(lines),
    rawText: lines.join("\n"),
    confidence: Math.max(0, Math.min(100, Math.round(ocrConfidence))),
  };
}

export function countBusinessCardFields(result: BusinessCardExtraction) {
  return [result.companyName, result.contactName, result.email, result.phone, result.position, result.department, result.address].filter(Boolean).length;
}
