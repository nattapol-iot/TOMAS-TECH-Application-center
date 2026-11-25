"use client";

import { DraftsDemo } from "./DraftsDemo";
import { FieldControlDemo } from "./FieldControlDemo";
import { FormDialogDemo } from "./FormDialogDemo";
import { FormFieldsDemo } from "./FormFieldsDemo";
import { PickersDemo } from "./PickersDemo";
import { SearchSignatureDemo } from "./SearchSignatureDemo";
import { SplitFormDialogDemo } from "./SplitFormDialogDemo";
import { ValidationDemo } from "./ValidationDemo";

export function FormsSection() {
  return (
    <>
      <FieldControlDemo />
      <PickersDemo />
      <SearchSignatureDemo />
      <FormFieldsDemo />
      <FormDialogDemo />
      <ValidationDemo />
      <DraftsDemo />
      <SplitFormDialogDemo />
    </>
  );
}
