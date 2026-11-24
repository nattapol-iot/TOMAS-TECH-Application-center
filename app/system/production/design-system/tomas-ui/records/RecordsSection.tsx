"use client";

import { RecordDetailDemo } from "./RecordDetailDemo";
import { RecordPaneDemo } from "./RecordPaneDemo";
import { RecordSheetDemo } from "./RecordSheetDemo";
import { RecordViewDemo } from "./RecordViewDemo";

export function RecordsSection() {
  return (
    <>
      <RecordSheetDemo />
      <RecordDetailDemo />
      <RecordPaneDemo />
      <RecordViewDemo />
    </>
  );
}
