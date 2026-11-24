"use client";

import type { ListSort, Row } from "@tomas-tc/blueprint";
import { Button, DataTable, NamedIcon, Pagination, SelectionBar, toast } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { TOMAS_PER_PAGE_OPTIONS, TOMAS_STATE_LABELS, TOMAS_TABLE_STATES } from "../config/tomas-ui.constants";
import { WORK_ORDER_ROWS } from "../fixtures/tomas-ui.rows";
import { WORK_ORDER_COLUMNS } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";
import { TomasUiStates } from "../TomasUiStates";
import type { TomasUiState } from "../types/tomas-ui.types";
import { answerList } from "../utils/memory-adapter";

export function DataTableDemo() {
  const t = useT();
  const [state, setState] = useState<TomasUiState>("loaded");
  const [sort, setSort] = useState<ListSort | null>({ key: "due", dir: "asc" });
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const answer = answerList(WORK_ORDER_ROWS, {
    query: { search: "", filters, sort, page, perPage },
    defaultSort: null,
    searchFields: [],
    columns: [],
    filterKinds: {},
  });
  const rows: Row[] | undefined = state === "loading" ? undefined : state === "empty" ? [] : answer.rows;
  return (
    <TomasUiDemo id="data-table">
      <TomasUiStates options={TOMAS_TABLE_STATES} labels={TOMAS_STATE_LABELS} value={state} onChange={setState} />
      <SelectionBar count={selected.length} onClear={() => setSelected([])}>
        <Button size="sm" variant="destructive" onClick={() => toast(`${selected.length} ${t("TUI.selected")}`)}>
          <NamedIcon name="trash-2" />
          {t("DS.tuiDelete")}
        </Button>
      </SelectionBar>
      <DataTable
        columns={WORK_ORDER_COLUMNS}
        rows={rows}
        selection={{ selected, onChange: setSelected }}
        sort={sort}
        filters={filters}
        ariaLabel={t("TUI.workOrders")}
        emptyMessage={t("DS.emptyTitle")}
        onSortChange={setSort}
        onFilterChange={(key, value) => {
          setFilters((current) => ({ ...current, [key]: value }));
          setPage(1);
        }}
        onRowOpen={(row) => toast(String(row.code))}
        renderActions={(row) => (
          <Button size="icon-xs" variant="ghost" aria-label={`${t("TUI.open")} ${String(row.code)}`} onClick={() => toast(String(row.title))}>
            <NamedIcon name="external-link" />
          </Button>
        )}
      />
      <Pagination
        page={page}
        perPage={perPage}
        total={state === "loaded" ? answer.total : 0}
        perPageOptions={TOMAS_PER_PAGE_OPTIONS}
        onPageChange={setPage}
        onPerPageChange={(next) => {
          setPerPage(next);
          setPage(1);
        }}
      />
    </TomasUiDemo>
  );
}
