"use client";
/*
 * The Projects screens' frame. They wear the Pegasus ERP look (owner 2026-11-22) and, since 2026-11-25, only that look: the
 * V1 / V2 switch is gone ("ไม่ต้องมี V1,V2 แล้ว ใช้ V2 เป็น Main หลักได้เลย").
 * - pegasus-skin.css and pegasus-screens.css give them the look the Team & Knowledge, System and Sales screens wear;
 * - project-v2.css adds what the Overview, Plan and Cost tabs need on top.
 * Every rule of the three sheets is scoped under the frame, so nothing reaches another screen.
 */
import type { ReactNode } from "react";
import { useLanguage } from "../i18n";
import "./pegasus-skin.css";
import "./pegasus-screens.css";
import "./project-v2.css";

/** Text in the reader's language for the few words the Projects parts show. */
export function useProjectCopy(): (th: string, en: string, jp: string) => string {
  const { lang } = useLanguage();
  return (th, en, jp) => (lang === "TH" ? th : lang === "JP" ? jp : en);
}

export function ProjectScope({ children }: { children: ReactNode }) {
  return <div className="pg-skin pg-screen project-v2">{children}</div>;
}
