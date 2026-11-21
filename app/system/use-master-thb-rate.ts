"use client";
import { useEffect, useState } from "react";
import { fetchMasterThbRate, type MasterThbRate } from "./api-client";

/** Master data's baht rate for a currency on a date, or null while loading, when master has none, or when it is not connected. */
export function useMasterThbRate(currency: string, date: string): MasterThbRate | null {
  const [found, setFound] = useState<{ key: string; rate: MasterThbRate | null } | null>(null);
  const key = `${currency}|${date}`;
  const wanted = currency !== "THB" && /^\d{4}-\d{2}-\d{2}$/.test(date);

  useEffect(() => {
    if (!wanted) return;
    let live = true;
    // A missing rate only hides the offer; typing a rate by hand still works.
    fetchMasterThbRate(currency, date).then(
      (answer) => { if (live) setFound({ key, rate: answer.rate }); },
      () => { if (live) setFound({ key, rate: null }); },
    );
    return () => { live = false; };
  }, [currency, date, key, wanted]);

  return wanted && found?.key === key ? found.rate : null;
}
