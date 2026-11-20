type Cell = string | number | null;

/**
 * The sheet an approved request's requester uploads to the project's Request List in the Pegasus ERP, while the ERP team's
 * tools are not there (docs/PEGASUS_ERP_REQUEST_LIST_TH.md).
 *
 * The ERP team has not sent that page's own sheet yet (question 3 of the request). Until they do, these are the columns, named
 * after the fields of project_request_list_add. To match their sheet: rename a header, reorder or drop a column here. Nothing
 * else reads the layout. `line_ref` stays whatever the layout: it is how the ERP's answer finds the line again.
 */
export type RequestListSheetKey = "lineRef" | "projectNumber" | "partNumber" | "description" | "brand" | "quantity" | "unit" | "unitPrice" | "neededBy" | "remark" | "requestNumber" | "requester";
export const REQUEST_LIST_SHEET: { sheetName: string; columns: readonly { key: RequestListSheetKey; header: string }[] } = {
  sheetName: "Request List",
  columns: [
    { key: "lineRef", header: "line_ref" }, { key: "projectNumber", header: "project_no" }, { key: "partNumber", header: "part_number" },
    { key: "description", header: "item_description" }, { key: "brand", header: "brand" }, { key: "quantity", header: "quantity" }, { key: "unit", header: "unit" },
    { key: "unitPrice", header: "est_unit_price" }, { key: "neededBy", header: "needed_by_date" }, { key: "remark", header: "remark" },
    { key: "requestNumber", header: "request_no" }, { key: "requester", header: "requester" },
  ],
};

export type RequestListSheetRequest = { number: string; projectNumber: string; neededBy: string; requester: string };
export type RequestListSheetLine = { lineRef: string | null; lineType: string; itemCode: string; partNumber: string; description: string; brand: string; quantity: number; unit: string;
  unitPrice: number; module: string; remark: string | null; outsource: boolean; originalCode: string | null };

/** The same remark the API sends the ERP for the line: outsource, what it replaces, its module, its item code, then the requester's note. */
export const requestListSheetRemark = (line: RequestListSheetLine): string => [line.outsource ? "Outsource" : "",
  line.lineType === "Substitute" && line.originalCode ? `Substitute for ${line.originalCode}` : line.lineType === "Unplanned" ? "Not in the estimate" : "",
  `Module ${line.module}`, line.itemCode && line.itemCode !== line.partNumber ? `Item ${line.itemCode}` : "", line.remark ?? ""].filter(Boolean).join(" · ");

/** The header row, then one row per line that has its ERP key. A line without one (the request is not approved yet) is left out. */
export function requestListSheetRows(request: RequestListSheetRequest, lines: RequestListSheetLine[], columns = REQUEST_LIST_SHEET.columns): Cell[][] {
  const value = (line: RequestListSheetLine, key: RequestListSheetKey): Cell => {
    switch (key) {
      case "lineRef": return line.lineRef;
      case "projectNumber": return request.projectNumber;
      case "partNumber": return line.partNumber || line.itemCode;
      case "description": return line.description;
      case "brand": return line.brand;
      case "quantity": return line.quantity;
      case "unit": return line.unit || "PCS";
      case "unitPrice": return line.unitPrice;
      case "neededBy": return request.neededBy;
      case "remark": return requestListSheetRemark(line);
      case "requestNumber": return request.number;
      case "requester": return request.requester;
    }
  };
  return [columns.map((column) => column.header), ...lines.filter((line) => line.lineRef).map((line) => columns.map((column) => value(line, column.key)))];
}
