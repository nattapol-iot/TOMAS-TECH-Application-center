"use client";
import { currentLocale } from "../i18n";
import { estimateUxCopy } from "../../../lib/estimate-ux";
import type { SupplierQuotationRecord } from "../api-client";
import { Field } from "../ui";
import { useMasterThbRate } from "../use-master-thb-rate";

export function ThbRateField({ currency, date, value, onChange }: {
  currency: SupplierQuotationRecord["currency"]; date: string; value: string; onChange: (value: string) => void;
}) {
  const master = useMasterThbRate(currency, date);
  if (currency === "THB") return null;
  const copy = (th: string, en: string, ja: string) => estimateUxCopy(currentLocale(), th, en, ja);
  const offered = master && Number(value) !== master.rate ? master : null;
  return <Field guide="quotation.thbRate" label={copy(`1 ${currency} = กี่บาท *`, `THB per 1 ${currency} *`, `1 ${currency} = THB *`)}
    hint={copy("ใช้แปลงราคาเป็นบาทเมื่อนำรายการเข้า Estimate", "Converts the prices to baht when lines are added to an estimate", "見積へ明細を追加する際にバーツへ換算します")}>
    <input type="number" min="0.000001" max="100000" step="0.0001" inputMode="decimal" value={value}
      placeholder={currency === "JPY" ? "0.24" : "35.5"} onChange={(event) => onChange(event.target.value)} />
    {offered ? <button className="btn ghost sm" type="button" data-guide="quotation.masterRate" onClick={() => onChange(String(offered.rate))}>
      {copy(`ใช้อัตรากลาง ${offered.rate} (ตั้งแต่ ${offered.effectiveFrom})`, `Use the company rate ${offered.rate} (from ${offered.effectiveFrom})`, `会社レート ${offered.rate} を使う（${offered.effectiveFrom} から）`)}
    </button> : null}
  </Field>;
}
