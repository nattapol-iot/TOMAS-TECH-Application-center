"use client";

import { Button, toast } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { TOMAS_TOAST_DELAY_MS } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function ToastDemo() {
  const t = useT();
  const later = () => new Promise<void>((resolve) => window.setTimeout(resolve, TOMAS_TOAST_DELAY_MS));
  return (
    <TomasUiDemo id="toast">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => toast(t("DS.sampleToast"))}>
          {t("TUI.toastPlain")}
        </Button>
        <Button variant="outline" onClick={() => toast.success(t("TUI.saved"), { description: "WO-0103" })}>
          {t("TUI.toastSuccess")}
        </Button>
        <Button variant="outline" onClick={() => toast.error(t("TUI.saveFailed"))}>
          {t("TUI.toastError")}
        </Button>
        <Button variant="outline" onClick={() => toast.warning(t("TUI.lowBattery"))}>
          {t("TUI.toastWarning")}
        </Button>
        <Button variant="outline" onClick={() => toast.info(t("DS.sampleToast"), { action: { label: t("TUI.undo"), onClick: () => toast(t("TUI.undone")) } })}>
          {t("TUI.toastAction")}
        </Button>
        <Button variant="outline" onClick={() => void toast.promise(later(), { loading: t("TUI.saving"), success: t("TUI.saved"), error: t("TUI.saveFailed") })}>
          {t("TUI.toastPromise")}
        </Button>
      </div>
    </TomasUiDemo>
  );
}
