/**
 * Copy for the Pegasus validation bubbles and the error dialog (form-bubbles.ts); merged into DICTIONARY (i18n.ts).
 * Namespaced keys, so no shared label changes. A "{n}" in a value is filled in with the field's limit.
 */
export const FORM_COPY: Record<string, { en: string; th: string; jp: string }> = Object.fromEntries([
  ["Form.required", "Fill in this field.", "กรอกช่องนี้", "この項目を入力してください。"],
  ["Form.choose", "Choose an option.", "เลือกรายการ", "選択してください。"],
  ["Form.chooseOne", "Choose at least one.", "เลือกอย่างน้อยหนึ่งรายการ", "1つ以上選択してください。"],
  ["Form.email", "Enter a valid email address.", "กรอกอีเมลให้ถูกต้อง", "正しいメールアドレスを入力してください。"],
  ["Form.tooLong", "Use at most {n} characters.", "ไม่เกิน {n} ตัวอักษร", "{n}文字以内で入力してください。"],
  ["Form.tooShort", "Use at least {n} characters.", "อย่างน้อย {n} ตัวอักษร", "{n}文字以上で入力してください。"],
  ["Form.min", "The lowest allowed value is {n}.", "ค่าต่ำสุดที่ใช้ได้คือ {n}", "{n}以上の値を入力してください。"],
  ["Form.max", "The highest allowed value is {n}.", "ค่าสูงสุดที่ใช้ได้คือ {n}", "{n}以下の値を入力してください。"],
  ["Form.pattern", "Use the format shown.", "กรอกตามรูปแบบที่แสดง", "表示されている形式で入力してください。"],
  ["Form.invalid", "Check this value.", "ตรวจสอบค่านี้", "この値を確認してください。"],
  ["Form.errorTitle", "Could not complete", "ทำรายการไม่สำเร็จ", "処理できませんでした"],
].map(([key, en, th, jp]) => [key, { en, th, jp }]));
