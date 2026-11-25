import { WORK_ORDER_ROWS } from "./tomas-ui.rows";

export const SLIP_CSS = `
.so-page { width: 210mm; height: 297mm; padding: 14mm 14mm 10mm; box-sizing: border-box; display: flex; flex-direction: column; font: 11pt/1.4 "Noto Sans", "Sarabun", sans-serif; color: #111827; }
.so-page-body { flex: 1; overflow: hidden; }
.so-page-footer { text-align: right; font-size: 9pt; color: #6b7280; }
.slip-head { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 4mm; margin-bottom: 4mm; }
.slip-head h1 { margin: 0; font-size: 18pt; color: #2563eb; }
.slip-lines { width: 100%; border-collapse: collapse; }
.slip-lines th, .slip-lines td { border-bottom: 1px solid #e5e7eb; padding: 1.6mm 2mm; text-align: left; }
.slip-lines td.num, .slip-lines th.num { text-align: right; }
.slip-totals { margin-top: 4mm; text-align: right; font-weight: 600; }
.q-signatures { display: flex; gap: 12mm; padding-top: 14mm; }
.q-sig-line { flex: 1; margin-top: 10mm; border-top: 1px solid #111827; padding-top: 1mm; font-size: 9pt; text-align: center; }
.hide-prices .price { visibility: hidden; }
`;

const PARTS = ["24 V power supply", "Fuse 2 A", "LTE antenna", "8-channel relay board", "Humidity probe", "Cable gland M20", "DIN rail 35 mm"];

const line = (index: number) => {
  const quantity = (index % 4) + 1;
  const price = 180 + ((index * 137) % 900);
  return `<tr><td>${index + 1}</td><td>${PARTS[index % PARTS.length]}</td><td class="num">${quantity}</td><td class="num price">${(quantity * price).toLocaleString("en-US")}</td></tr>`;
};

const total = (count: number) => Array.from({ length: count }, (_, index) => ((index % 4) + 1) * (180 + ((index * 137) % 900))).reduce((sum, amount) => sum + amount, 0);

export function workOrderSlip(code: string, lineCount: number) {
  const order = WORK_ORDER_ROWS.find((row) => row.code === code);
  return `<div data-block="top" data-repeat><div class="slip-head"><div><h1>${code}</h1><div>${String(order?.title ?? "")}</div></div><div>Due ${String(order?.due ?? "")}</div></div></div>
<table class="slip-lines" data-lines><thead><tr><th>#</th><th>Part</th><th class="num">Qty</th><th class="num">THB</th></tr></thead><tbody>${Array.from({ length: lineCount }, (_, index) => line(index)).join("")}</tbody></table>
<div data-block="totals" class="slip-totals price">Total THB ${total(lineCount).toLocaleString("en-US")}</div>
<div data-block="closing"><div class="q-signatures"><div class="q-sig-line">Technician</div><div class="q-sig-line">Site manager</div></div></div>`;
}

export const ZIP_ORDERS = ["WO-0103", "WO-0104"];
