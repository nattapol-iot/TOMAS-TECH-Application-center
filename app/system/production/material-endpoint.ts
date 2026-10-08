"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api-client";

const toError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

/** One GET at a time per path; an answer that arrives after the path changed is dropped. */
export function useEndpoint<T>(path: string | null, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const initialRef = useRef(initial);
  const pathRef = useRef(path);
  const requestRef = useRef(0);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const requestId = ++requestRef.current;
    const pathChanged = pathRef.current !== path;
    pathRef.current = path;
    const load = async () => {
      await Promise.resolve();
      if (requestRef.current !== requestId) return;
      if (pathChanged) setData(initialRef.current);
      if (!path) {
        setLoading(false);
        setError("");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const result = await apiRequest<T>(path);
        if (requestRef.current === requestId) setData(result);
      }
      catch (requestError) {
        if (requestRef.current === requestId) setError(toError(requestError));
      }
      finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    };
    void load();
    return () => {
      if (requestRef.current === requestId) requestRef.current += 1;
    };
  }, [path, revision]);

  return { data, loading, error, reload };
}
