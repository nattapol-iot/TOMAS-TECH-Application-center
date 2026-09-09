// Dedicated content shape for INSPECTION-type reports, stored inside the
// existing unified_reports body_json column (report.body). Not the generic
// Section[]-driven shape used by other report types -- this is a fixed model
// matching the real TOMAS TECH inspection document, usable by any department.
// Photos are stored as attachmentId[] referencing dbo.unified_report_evidence_files
// (uploaded via uploadReportEvidence / downloaded via downloadReportEvidence),
// supporting multiple photos per item like the original document.

export type Rank = "A" | "B" | "C" | "D" | "";
export type PassFail = "OK" | "NG" | "";
export type NormalAbnormal = "Normal" | "Abnormal" | "";

export type PowerMeasurement = {
  specRS: string; specRT: string; specST: string;
  actualRS: string; actualRT: string; actualST: string;
  judgement: PassFail; rank: Rank; remarks: string;
};

export type TransformerMeasurement = {
  model: string;
  primaryV: string; primaryA: string;
  primaryJudgement: PassFail; primaryRank: Rank; primaryRemarks: string;
  secondaryV: string; secondaryA: string;
  secondaryJudgement: PassFail; secondaryRank: Rank; secondaryRemarks: string;
};

export type PowerSection = { title: string } & TransformerMeasurement;

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
  controlPanelName: string; location: string;
  includePowerCheck: boolean;
  plcModel: string; hmiModel: string; communication: string;
  powerPhase: string; voltage: string;
  mainBreakerAmp: string; mainBreakerModel: string;
  utility: PowerMeasurement;
  plcStatus: PassFail; plcRank: Rank; plcRemarks: string;
  powerSections: PowerSection[];
  operationTests: OperationTest[];
  checklistItems: ChecklistItem[];
  summaryItems: string[];
};

// The shape stored in ReportRecord.body when reportType === "INSPECTION".
export type InspectionBody = {
  units: InspectionUnit[];
};

export function emptyPowerMeasurement(): PowerMeasurement {
  return { specRS: "", specRT: "", specST: "", actualRS: "", actualRT: "", actualST: "", judgement: "", rank: "", remarks: "" };
}

export function emptyTransformerMeasurement(): TransformerMeasurement {
  return { model: "", primaryV: "", primaryA: "", primaryJudgement: "", primaryRank: "", primaryRemarks: "", secondaryV: "", secondaryA: "", secondaryJudgement: "", secondaryRank: "", secondaryRemarks: "" };
}

export function emptyPowerSection(): PowerSection {
  return { title: "New Section", ...emptyTransformerMeasurement() };
}

export function newInspectionUnit(name = "Unit 1"): InspectionUnit {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name, controlPanelName: "", location: "",
    includePowerCheck: true,
    plcModel: "", hmiModel: "", communication: "", powerPhase: "", voltage: "",
    mainBreakerAmp: "", mainBreakerModel: "",
    utility: emptyPowerMeasurement(),
    plcStatus: "", plcRank: "", plcRemarks: "",
    powerSections: [
      { title: "Transformer", ...emptyTransformerMeasurement() },
      { title: "Switching Power Supply (SMPS)", ...emptyTransformerMeasurement() },
    ],
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
