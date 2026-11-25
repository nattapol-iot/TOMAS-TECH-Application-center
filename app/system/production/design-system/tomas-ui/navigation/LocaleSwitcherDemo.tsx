"use client";

import { LocaleSwitcher, Pagination, TimePickerControl, UI_LOCALE_OPTIONS, UiIntlProvider, switchLocaleAndReload, toast } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { TOMAS_PER_PAGE_OPTIONS } from "../config/tomas-ui.constants";
import { savePreference } from "../fixtures/tomas-ui.fake-api";
import { TomasUiDemo } from "../TomasUiDemo";

export function LocaleSwitcherDemo() {
  const t = useT();
  const [saved, setSaved] = useState("th");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  // A real app persists the choice on the server and reloads the page; here only the preview below follows it.
  const switchLocale = switchLocaleAndReload({
    persist: async (locale) => {
      await savePreference();
      setSaved(locale);
    },
    reload: () => {
      toast(t("TUI.reloaded"));
    },
  });
  return (
    <TomasUiDemo id="locale-switcher">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("TUI.previewLanguage")}</span>
        <LocaleSwitcher value={saved} options={UI_LOCALE_OPTIONS} onChange={(locale) => void switchLocale(locale)} />
      </div>
      <UiIntlProvider locale={saved}>
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <TimePickerControl ariaLabel={t("TUI.previewLanguage")} value={null} onChange={() => undefined} />
          <Pagination page={page} perPage={perPage} total={42} perPageOptions={TOMAS_PER_PAGE_OPTIONS} onPageChange={setPage} onPerPageChange={setPerPage} />
        </div>
      </UiIntlProvider>
    </TomasUiDemo>
  );
}
