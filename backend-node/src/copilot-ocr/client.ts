import type { TokenSource } from "../tmt-id/token-vault.js";
import { SCAN_DEADLINE_MS, SCAN_SETTLED_STATES, SCAN_WAIT_SECONDS } from "./constants.js";
import type { CopilotOcr, OcrDocument } from "./types.js";

export class CopilotOcrError extends Error {
  constructor(
    public readonly reason: "signed_out" | "rejected" | "unavailable" | "unreadable" | "timeout",
    message: string,
  ) {
    super(message);
    this.name = "CopilotOcrError";
  }
}

type ScanReply = { job_id?: string; state?: string; error?: string | null; document?: Record<string, unknown> | null };

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const text = (value: unknown) => (typeof value === "string" ? value : null);

function documentOf(raw: Record<string, unknown>): OcrDocument {
  return {
    kind: text(raw.kind) ?? "",
    data: record(raw.data),
    custom: raw.custom == null ? null : record(raw.custom),
    customError: text(raw.custom_error),
    webUrl: text(raw.web_url),
  };
}

/**
 * Copilot's OCR API, called as the signed-in person (copilot "user" mode): their own TMT ID access token from the vault, so the scan
 * is theirs in copilot's Document Scanner. A 401 means the cached token went stale; one fresh token is tried before giving up.
 */
export function createCopilotOcr(baseUrl: string, tokens: TokenSource, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): CopilotOcr {
  const call = async (subject: string, send: (token: string) => Promise<Response>): Promise<ScanReply> => {
    let token = await tokens.accessToken(subject);
    if (!token) throw new CopilotOcrError("signed_out", "Sign in again with TMT ID to read documents.");
    let response = await send(token).catch(() => null);
    if (response?.status === 401) {
      tokens.dropAccess(subject);
      token = await tokens.accessToken(subject);
      if (!token) throw new CopilotOcrError("signed_out", "Sign in again with TMT ID to read documents.");
      response = await send(token).catch(() => null);
    }
    if (!response) throw new CopilotOcrError("unavailable", "Copilot could not be reached.");
    if (response.status === 401) throw new CopilotOcrError("signed_out", "Sign in again with TMT ID to read documents.");
    if (response.status === 403 || response.status === 422) {
      throw new CopilotOcrError("rejected", `Copilot refused the document: ${await response.text().catch(() => "")}`.slice(0, 300));
    }
    if (!response.ok) throw new CopilotOcrError("unavailable", `Copilot answered ${response.status}.`);
    return (await response.json()) as ScanReply;
  };

  return {
    async scan(subject, request) {
      const deadline = now() + SCAN_DEADLINE_MS;
      let reply = await call(subject, (token) => {
        // A fresh form per attempt: a retried request must not reuse a body already sent.
        const form = new FormData();
        for (const file of request.files) form.append("files", new Blob([file.bytes], { type: file.type }), file.name);
        form.append("kind", request.kind);
        form.append("wait", String(SCAN_WAIT_SECONDS));
        if (request.schema) form.append("schema", JSON.stringify(request.schema));
        return fetchImpl(`${baseUrl}/scans`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      });
      const jobId = reply.job_id;
      while (!SCAN_SETTLED_STATES.includes(reply.state ?? "")) {
        if (!jobId) throw new CopilotOcrError("unavailable", "Copilot did not return a scan id.");
        if (now() >= deadline) throw new CopilotOcrError("timeout", "Copilot is still reading; try again in a few minutes.");
        reply = await call(subject, (token) => fetchImpl(`${baseUrl}/scans/${encodeURIComponent(jobId)}?wait=${SCAN_WAIT_SECONDS}`, { headers: { Authorization: `Bearer ${token}` } }));
      }
      if (reply.state !== "done" || !reply.document) throw new CopilotOcrError("unreadable", reply.error || "Copilot could not read the document.");
      return documentOf(reply.document);
    },
  };
}
