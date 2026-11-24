/** Copy for My Work > Outsourced work (VendorWork.tsx, task doc 3.6); merged into DICTIONARY (i18n.ts). */
export const VENDOR_WORK_COPY: Record<string, { en: string; th: string; jp: string }> = Object.fromEntries(
  [
    ["Vendor.tab", "Outsourced work", "งานจ้างภายนอก", "外注作業"],
    [
      "Vendor.intro",
      "People an outside supplier put on the rows you look after, day by day. Type the number of people; hours count as people × 8. No money here.",
      "จำนวนคนของผู้รับเหมาที่ทำงานในแถวที่คุณดูแล รายวัน พิมพ์จำนวนคน ชั่วโมงคิดเป็นคน × 8 ไม่มีจำนวนเงิน",
      "担当する外注行に入った外注先の人数を日ごとに入力します。時間は人数 × 8 で数えます。金額は扱いません。",
    ],
    ["Vendor.empty", "No outsourced work for you to record", "ไม่มีงานจ้างภายนอกที่คุณดูแล", "記録する外注作業はありません"],
    ["Vendor.prev", "Previous week", "สัปดาห์ก่อน", "前の週"],
    ["Vendor.next", "Next week", "สัปดาห์ถัดไป", "次の週"],
    ["Vendor.thisWeek", "This week", "สัปดาห์นี้", "今週"],
    ["Vendor.colWork", "Work", "งาน", "作業"],
    ["Vendor.colSupplier", "Supplier", "ผู้รับเหมา", "外注先"],
    ["Vendor.colHours", "Hours to date / plan", "ชม.สะสม / แผน", "累計 / 計画 h"],
    ["Vendor.colWeek", "This week h", "ชม.สัปดาห์นี้", "今週 h"],
    ["Vendor.people", "people", "คน", "人"],
    ["Vendor.saved", "Saved", "บันทึกแล้ว", "保存しました"],
    ["Vendor.bad", "Type people from 0.1 to 200, or clear the box", "พิมพ์จำนวนคน 0.1 ถึง 200 หรือลบให้ว่าง", "人数は 0.1〜200 で入力するか、空にします"],
    ["Vendor.closed", "This day can no longer be changed", "วันนี้แก้ไม่ได้แล้ว", "この日は変更できません"],
    ["Vendor.hoursTitle", "{people} people · {hours} h", "{people} คน · {hours} ชม.", "{people} 人・{hours} h"],
  ].map(([key, en, th, jp]) => [key!, { en: en!, th: th!, jp: jp! }]),
);
