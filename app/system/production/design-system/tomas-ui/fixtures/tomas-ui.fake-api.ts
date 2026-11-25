import type { FieldOption, ResponseLike } from "@tomas-tc/ui";
import { FAKE_LATENCY_MS, FAKE_PAGE_SIZE, FULL_SITE } from "../config/tomas-ui.constants";
import type { DeviceRegistration, FakeFailure, FakePage } from "../types/tomas-ui.types";
import { DEVICE_ROWS } from "./tomas-ui.rows";

const wait = () => new Promise((resolve) => setTimeout(resolve, FAKE_LATENCY_MS));

const SENSOR_OPTIONS: FieldOption[] = Array.from({ length: 120 }, (_, index) => {
  const code = `SN-${String(index + 1).padStart(3, "0")}`;
  return { value: code, label: `${code} Line sensor ${index + 1}`, description: index % 2 ? "Riverside Plant" : "Harbour Warehouse" };
});

export async function searchSensors(term: string, offset: number): Promise<FakePage> {
  await wait();
  const needle = term.toLowerCase();
  const matches = SENSOR_OPTIONS.filter((option) => option.label.toLowerCase().includes(needle));
  return { options: matches.slice(offset, offset + FAKE_PAGE_SIZE), total: matches.length };
}

export const FAKE_FAILURES: Record<FakeFailure, ResponseLike> = {
  validation: { status: 422, data: { message: "The given data was invalid.", errors: { code: ["The code GW-A01 is already used."], due: ["The due date must be after today."] } } },
  server: {
    status: 500,
    data: {
      message: "Could not save the work order.",
      status: 500,
      reference: "req-7f3a2c",
      occurred_at: "2026-11-25T10:42:00+07:00",
      request: { method: "POST", url: "/sample-api/work-orders" },
      exception: "WorkOrderLockedError",
      file: "work-orders/save.ts",
      line: 88,
      trace: ["saveWorkOrder (work-orders/save.ts:88)", "handle (routes/work-orders.ts:41)"],
    },
  },
  gateway: { status: 502, statusText: "Bad Gateway", headers: { "x-request-id": "req-91c2" }, data: "<html><body>502 Bad Gateway</body></html>" },
};

export async function callFailingApi(failure: FakeFailure): Promise<ResponseLike> {
  await wait();
  return FAKE_FAILURES[failure];
}

export async function registerDevice({ code, email, site }: DeviceRegistration): Promise<Record<string, string>> {
  await wait();
  return {
    ...(DEVICE_ROWS.some((row) => row.code === code) ? { code: `${code} is already registered.` } : {}),
    ...(email.endsWith("@example.com") ? {} : { email: "Use a company address (@example.com)." }),
    ...(site === FULL_SITE
      ? {
          site: "Riverside Plant has no free gateway slot.",
          installer: "The installer is booked on that day.",
          schedule: "Installs at Riverside Plant are closed until 1 December.",
        }
      : {}),
  };
}

export async function submitReason(reason: string): Promise<Record<string, string>> {
  await wait();
  return reason.length < 10 ? { reason: "Write at least 10 characters so the technician knows why." } : {};
}

export async function savePreference(): Promise<void> {
  await wait();
}

// Stands in for the PDF service: it gets the print HTML a real one would render and answers with the sample PDF.
export async function renderPdfOnServer(html: string, samplePdf: string): Promise<Blob | null> {
  await wait();
  return html ? (await fetch(samplePdf)).blob() : null;
}
