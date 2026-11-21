/**
 * Copy for the Pegasus validation bubbles and the error dialog (form-bubbles.ts); merged into DICTIONARY (i18n.ts).
 * Namespaced keys, so no shared label changes. A "{n}" in a value is filled in with the field's limit.
 */
export const FORM_COPY: Record<string, { en: string; th: string; jp: string }> = Object.fromEntries(
  [
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
    // Leaving a form with unsaved changes (Pegasus 0.6 and D.8 UnsavedChangesDialog): exactly these two answers.
    ["Form.unsavedTitle", "Unsaved changes", "ยังไม่ได้บันทึก", "未保存の変更"],
    [
      "Form.unsavedBody",
      "You have unsaved changes. Keep editing, or discard them?",
      "มีข้อมูลที่ยังไม่ได้บันทึก จะแก้ไขต่อ หรือทิ้งการแก้ไข?",
      "保存されていない変更があります。編集を続けますか、それとも破棄しますか？",
    ],
    ["Form.keepEditing", "Keep editing", "แก้ไขต่อ", "編集を続ける"],
    ["Form.discard", "Discard changes", "ทิ้งการแก้ไข", "変更を破棄"],
    // The Pegasus select's list (D.3, PegasusSelect.tsx).
    ["Form.select", "Select", "เลือก", "選択"],
    ["Form.search", "Search...", "ค้นหา...", "検索..."],
    ["Form.noResults", "No results.", "ไม่พบรายการ", "該当する項目がありません"],
  ].map(([key, en, th, jp]) => [key, { en, th, jp }]),
);
