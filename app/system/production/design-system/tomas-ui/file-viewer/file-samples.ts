import type { FileSample, FileSampleKind } from "../types/tomas-ui.types";
import SAMPLE_CSV from "./samples/meter-readings.csv?url";
import SAMPLE_DOCX from "./samples/handover-note.docx?url";
import SAMPLE_MD from "./samples/runbook.md?url";
import SAMPLE_PDF from "./samples/work-order.pdf?url";
import SAMPLE_PNG from "./samples/site-plan.png?url";
import SAMPLE_TXT from "./samples/gateway.log.txt?url";
import SAMPLE_XLSX from "./samples/spare-parts.xlsx?url";

export const FILE_SAMPLES: Record<FileSampleKind, FileSample> = {
  pdf: { name: "work-order.pdf", src: SAMPLE_PDF },
  docx: { name: "handover-note.docx", src: SAMPLE_DOCX },
  xlsx: { name: "spare-parts.xlsx", src: SAMPLE_XLSX },
  csv: { name: "meter-readings.csv", src: SAMPLE_CSV },
  md: { name: "runbook.md", src: SAMPLE_MD },
  image: { name: "site-plan.png", src: SAMPLE_PNG },
  text: { name: "gateway.log.txt", src: SAMPLE_TXT },
  blob: { name: "alarm-export.txt", src: new Blob(["08:02 CAM-D02 offline\n08:04 CAM-D02 offline\n08:10 ticket WO-0104 opened\n"], { type: "text/plain" }) },
};

export const UNSUPPORTED_SAMPLE = "plc-firmware.bin";
