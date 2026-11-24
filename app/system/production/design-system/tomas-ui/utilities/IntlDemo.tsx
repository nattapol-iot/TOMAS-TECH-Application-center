"use client";

import { Pagination, UI_MESSAGES, UiIntlProvider, uiMessages, useUiIntl } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { TOMAS_UI_LOCALE_SAMPLES } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function IntlDemo() {
  const t = useT();
  const intl = useUiIntl();
  return (
    <TomasUiDemo id="intl">
      <p className="text-sm">
        useUiIntl: <code className="font-mono">{intl.locale}</code> {intl.formatNumber(1234567.89)} {intl.formatDate(new Date(2026, 10, 24), { dateStyle: "long" })}
      </p>
      <p className="text-muted-foreground text-sm">
        UI_MESSAGES:{" "}
        {Object.entries(UI_MESSAGES).map(([locale, catalog]) => (
          <code key={locale} className="bg-muted mr-2 rounded px-1.5 py-0.5 font-mono text-xs">
            {locale} {Object.keys(catalog).length}
          </code>
        ))}
        uiMessages(&quot;fr&quot;): <code className="font-mono text-xs">{String(uiMessages("fr"))}</code>
      </p>
      {TOMAS_UI_LOCALE_SAMPLES.map((locale) => (
        <div key={locale} className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">
            UiIntlProvider locale=&quot;{locale}&quot; ({t("TUI.sameComponent")})
          </span>
          <UiIntlProvider locale={locale}>
            <Pagination page={2} perPage={10} total={48} onPageChange={() => undefined} onPerPageChange={() => undefined} />
          </UiIntlProvider>
        </div>
      ))}
    </TomasUiDemo>
  );
}
