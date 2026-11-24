"use client";

import { FieldControlDemo } from "./FieldControlDemo";
import { FormDialogDemo } from "./FormDialogDemo";
import { FormFieldsDemo } from "./FormFieldsDemo";
import { PickersDemo } from "./PickersDemo";
import { SearchSignatureDemo } from "./SearchSignatureDemo";

export function FormsSection() {
  return (
    <>
      <FieldControlDemo />
      <PickersDemo />
      <SearchSignatureDemo />
      <FormFieldsDemo />
      <FormDialogDemo />
    </>
  );
}
