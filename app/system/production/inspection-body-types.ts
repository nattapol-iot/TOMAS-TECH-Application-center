// Dedicated content shape for INSPECTION-type reports, stored inside the
// existing unified_reports body_json column (report.body). Not the generic
// Section[]-driven shape used by other report types -- this is a fixed model
// matching the real TOMAS TECH inspection document, but department-agnostic:
// every measurement/attribute is user-named and user-typed, not hardcoded to
// electrical panel fields (Mechanical, Software, etc. define their own).
// Photos are stored as attachmentId[] referencing dbo.unified_report_evidence_files
// (uploaded via uploadReportEvidence / downloaded via downloadReportEvidence),
// supporting multiple photos per item like the original document.

export type Rank = "A" | "B" | "C" | "D" | "";
export type PassFail = "OK" | "NG" | "";
export type NormalAbnormal = "Normal" | "Abnormal" | "";

// A single spec-vs-actual measurement row. "parameter"/"unit" are free text so
// any department can record what they measure: electrical ("R-S Voltage", "V"),
// mechanical ("Bearing Vibration", "mm/s"), software ("API Response Time", "ms").
export type MeasurementRow = {
  parameter: string; unit: string;
  specValue: string; actualValue: string;
  judgement: PassFail; rank: Rank; remarks: string;
};

// A named, user-defined group of measurement rows. Replaces the old fixed
// "Utility Power Supply" / "Transformer" / "SMPS" tables -- any department
// creates as many sections as they need, titled however makes sense to them.
export type MeasurementSection = {
  title: string;
  rows: MeasurementRow[];
};

// Free-form key/value attribute for a unit (e.g. electrical: "PLC Model" /
// "Q02UCPU"; mechanical: "Motor Rating" / "5.5 kW"; software: "Server IP" /
// "10.0.4.12"). Replaces the old hardcoded plcModel/hmiModel/voltage/etc fields.
export type UnitAttribute = { label: string; value: string };

export type OperationTest = {
  name: string; status: PassFail; rank: Rank; remarks: string;
  photoIds: number[];
};

export type ChecklistItem = {
  name: string; condition: NormalAbnormal; judgement: PassFail; rank: Rank; remarks: string;
  photoIds: number[];
};

export type InspectionUnit = {
  id: string; name: string;
  identifier: string; // panel name / serial / hostname / asset tag -- whatever identifies this unit
  location: string;
  attributes: UnitAttribute[];
  measurementSections: MeasurementSection[];
  operationTests: OperationTest[];
  checklistItems: ChecklistItem[];
  summaryItems: string[];
};

// The shape stored in ReportRecord.body when reportType === "INSPECTION".
export type InspectionBody = {
  units: InspectionUnit[];
};

export function emptyMeasurementRow(): MeasurementRow {
  return { parameter: "", unit: "", specValue: "", actualValue: "", judgement: "", rank: "", remarks: "" };
}

export function emptyMeasurementSection(): MeasurementSection {
  return { title: "New Section", rows: [emptyMeasurementRow()] };
}

export function newInspectionUnit(name = "Unit 1"): InspectionUnit {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name, identifier: "", location: "",
    attributes: [],
    measurementSections: [],
    operationTests: [{ name: "", status: "", rank: "", remarks: "", photoIds: [] }],
    checklistItems: [{ name: "", condition: "", judgement: "", rank: "", remarks: "", photoIds: [] }],
    summaryItems: [""],
  };
}

export function emptyInspectionBody(): InspectionBody {
  return { units: [newInspectionUnit("Unit 1")] };
}

export function isInspectionBody(body: unknown): body is InspectionBody {
  return !!body && typeof body === "object" && Array.isArray((body as InspectionBody).units);
}
