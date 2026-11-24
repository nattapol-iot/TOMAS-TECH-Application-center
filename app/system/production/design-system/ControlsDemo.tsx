"use client";

import { useState } from "react";
import { useT } from "../../i18n";
import { Field, Pagination, Panel, SearchInput, Select, Tabs, Toolbar } from "../../ui";
import { DESIGN_SYSTEM_TABS, PAGE_SAMPLE, SELECT_SAMPLE } from "./config/design-system.constants";
import type { DesignSystemTab } from "./types/design-system.types";

export function ControlsDemo() {
  const t = useT();
  const [search, setSearch] = useState("");
  const [option, setOption] = useState(SELECT_SAMPLE[0]);
  const [tab, setTab] = useState<DesignSystemTab>("tokens");
  const [page, setPage] = useState(1);
  const from = (page - 1) * PAGE_SAMPLE.pageSize + 1;

  return (
    <>
      <Panel title="DS.forms">
        <div className="form-grid two">
          <Field label="DS.textField" hint="DS.hint">
            <input placeholder={t("DS.placeholder")} />
          </Field>
          <Field label="DS.numberField">
            <input type="number" defaultValue={1250} />
          </Field>
          <Field label="DS.dateField">
            <input type="date" />
          </Field>
          <Field label="DS.selectField">
            <select defaultValue={SELECT_SAMPLE[1]}>
              {SELECT_SAMPLE.map((key) => (
                <option key={key} value={key}>
                  {t(key)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="DS.noteField" span={2}>
            <textarea rows={3} />
          </Field>
        </div>
      </Panel>
      <Panel title="DS.navigation">
        <div className="ds-stack">
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} placeholder="DS.placeholder" />
            <Select label="DS.selectField" value={option} options={SELECT_SAMPLE} onChange={setOption} width={180} />
          </Toolbar>
          <Tabs tabs={DESIGN_SYSTEM_TABS} active={tab} onChange={setTab} link={null} />
          <Pagination page={page} pageCount={PAGE_SAMPLE.pageCount} from={from} to={Math.min(page * PAGE_SAMPLE.pageSize, PAGE_SAMPLE.total)} total={PAGE_SAMPLE.total} onPage={setPage} />
        </div>
      </Panel>
    </>
  );
}
