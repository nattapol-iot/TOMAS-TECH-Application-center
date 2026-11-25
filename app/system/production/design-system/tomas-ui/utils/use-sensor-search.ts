"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { searchSensors } from "../fixtures/tomas-ui.fake-api";
import type { SensorSearch } from "../types/tomas-ui.types";

const FIRST_SEARCH: SensorSearch = { term: "", options: [], total: 0, loading: true };

// An answer for a term the person has already typed past is dropped.
const fetchPage = (setFound: Dispatch<SetStateAction<SensorSearch>>, term: string, offset: number) =>
  searchSensors(term, offset).then((page) =>
    setFound((current) => (current.term === term ? { term, options: offset ? [...current.options, ...page.options] : page.options, total: page.total, loading: false } : current)),
  );

export function useSensorSearch() {
  const [found, setFound] = useState(FIRST_SEARCH);
  useEffect(() => {
    void fetchPage(setFound, FIRST_SEARCH.term, 0);
  }, []);
  return {
    ...found,
    search: (term: string) => {
      setFound({ ...FIRST_SEARCH, term });
      void fetchPage(setFound, term, 0);
    },
    loadMore: (term: string) => (found.options.length < found.total ? fetchPage(setFound, term, found.options.length) : undefined),
  };
}
