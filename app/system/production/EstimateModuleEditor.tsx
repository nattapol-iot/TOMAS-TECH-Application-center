"use client";

import { useEffect, useState } from "react";
import { loadEstimateModuleDetails, updateEstimateModuleDetails, type EstimateCostWorkspace } from "../api-client";
import { Field, Modal } from "../ui";

export function EstimateModuleEditor({ workspace, moduleKey, initialTitle, onClose, onSaved }: {
  workspace: EstimateCostWorkspace; moduleKey: string; initialTitle: string;
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void loadEstimateModuleDetails(workspace.header.id).then(rows => {
      if (!active) return;
      const saved = rows.find(row => row.moduleKey === moduleKey);
      if (saved) { setTitle(saved.title); setRemark(saved.remark ?? ""); }
      setLoaded(true);
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Could not load module details"); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [workspace.header.id, moduleKey]);
  const save = async () => {
    setBusy(true); setError("");
    try {
      await updateEstimateModuleDetails(workspace.header.id, workspace.header.rowVersion, { moduleKey, title: title.trim(), remark: remark.trim() || null });
      await onSaved(); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save module details"); }
    finally { setBusy(false); }
  };
  return <Modal title="แก้ไข Main Module / Edit Main Module" onClose={onClose} footer={<>
    <button className="btn default" disabled={busy} onClick={onClose}>Cancel</button>
    <button className="btn primary" disabled={busy || !loaded || !title.trim()} onClick={() => void save()}>Save</button>
  </>}>
    {error ? <div role="alert" className="callout danger">{error}</div> : null}
    <Field label="Main Module"><input value={title} maxLength={200} disabled={busy} onChange={event => setTitle(event.target.value)} /></Field>
    <Field label="Remark"><textarea value={remark} maxLength={2000} rows={4} disabled={busy} onChange={event => setRemark(event.target.value)} /></Field>
  </Modal>;
}
