"use client";

import {
  Button,
  ErrorDialog,
  clearServerError,
  formatServerErrorLog,
  serverErrorFromException,
  serverErrorFromResponse,
  serverErrorFromValidation,
  showServerError,
  useServerError,
  type ServerError,
} from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { AUTO_CLOSE_MS, FAKE_FAILURE_LABELS, FAKE_FAILURES_SHOWN } from "../config/tomas-ui.constants";
import { callFailingApi } from "../fixtures/tomas-ui.fake-api";
import { TomasUiDemo } from "../TomasUiDemo";
import type { FakeFailure } from "../types/tomas-ui.types";

export function ServerErrorsDemo() {
  const t = useT();
  const { error, show } = useServerError();
  const [calling, setCalling] = useState<FakeFailure | null>(null);
  const [last, setLast] = useState<ServerError | null>(null);
  const report = (next: ServerError) => {
    setLast(next);
    show(next);
  };
  const call = async (failure: FakeFailure) => {
    setCalling(failure);
    const response = await callFailingApi(failure);
    setCalling(null);
    report(serverErrorFromResponse(response));
  };
  return (
    <TomasUiDemo id="server-errors">
      <div className="flex flex-wrap gap-2">
        {FAKE_FAILURES_SHOWN.map((failure) => (
          <Button key={failure} size="sm" variant="outline" disabled={calling !== null} aria-busy={calling === failure} onClick={() => void call(failure)}>
            {t(FAKE_FAILURE_LABELS[failure])}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => report(serverErrorFromValidation({ due: ["The due date is required."], code: "The code is too short." }))}>
          serverErrorFromValidation
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            try {
              JSON.parse("{ gateway: A-01 }");
            } catch (exception) {
              if (exception instanceof Error) report(serverErrorFromException(exception));
            }
          }}
        >
          serverErrorFromException
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const next: ServerError = { kind: "warning", message: t("TUI.autoCloseNote"), status: 409 };
            setLast(next);
            showServerError(next);
            setTimeout(clearServerError, AUTO_CLOSE_MS);
          }}
        >
          showServerError + clearServerError
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">useServerError: {error ? `${error.status} ${error.kind ?? "error"}` : t("TUI.noErrorShown")}</p>
      <pre className="bg-muted/50 max-h-48 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap">{last ? formatServerErrorLog(last) : "formatServerErrorLog"}</pre>
      <ErrorDialog />
    </TomasUiDemo>
  );
}
