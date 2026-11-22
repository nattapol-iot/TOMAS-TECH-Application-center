"use client";
/*
 * The V1 / V2 switch of the Projects screens (owner 2026-11-22, lib/project-look.ts). V1 renders the screens exactly as
 * before. V2 wraps the same screens in "pg-skin pg-screen project-v2":
 * - pegasus-skin.css and pegasus-screens.css give them the Pegasus ERP look the Team & Knowledge, System and Sales screens
 *   already wear;
 * - project-v2.css adds what the Overview, Plan and Cost tabs need on top.
 * A screen learns its look from useProjectLook() to lay its list out the Pegasus way and to keep plan editing on the Plan
 * tab. Every rule of the three sheets is scoped, so nothing reaches a screen opened in V1 or any other screen.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useLanguage } from "../i18n";
import { PROJECT_LOOK_DEFAULT, parseProjectLook, projectLookKey, type ProjectLook } from "../../../lib/project-look";
import "./pegasus-skin.css";
import "./pegasus-screens.css";
import "./project-v2.css";

const ProjectLookContext = createContext<ProjectLook>(PROJECT_LOOK_DEFAULT);

/** "v2" inside a Projects screen opened in the new look, "v1" everywhere else. */
export const useProjectLook = (): ProjectLook => useContext(ProjectLookContext);

function readLook(userId: number): ProjectLook {
  try {
    return parseProjectLook(window.localStorage.getItem(projectLookKey(userId)));
  } catch {
    return PROJECT_LOOK_DEFAULT;
  }
}

function storeLook(userId: number, look: ProjectLook): void {
  try {
    window.localStorage.setItem(projectLookKey(userId), look);
  } catch {
    // Blocked storage only means the choice is not remembered; the screen still switches.
  }
}

/** Text in the reader's language for the few words the Projects V2 parts show. */
export function useProjectCopy(): (th: string, en: string, jp: string) => string {
  const { lang } = useLanguage();
  return (th, en, jp) => (lang === "TH" ? th : lang === "JP" ? jp : en);
}

export function ProjectLookScope({ userId, children }: { userId: number; children: ReactNode }) {
  const [look, setLook] = useState<ProjectLook>(() => readLook(userId));
  const copy = useProjectCopy();
  const choose = useCallback(
    (next: ProjectLook) => {
      setLook(next);
      storeLook(userId, next);
    },
    [userId],
  );
  const label = copy("หน้าตาหน้าจอ", "Screen look", "画面の表示");
  const bar = (
    <div className="project-look-bar">
      <span className="project-look-label">{label}</span>
      <div className="project-look-switch" role="radiogroup" aria-label={label} data-guide="project.look">
        <button type="button" role="radio" aria-checked={look === "v1"} onClick={() => choose("v1")} title={copy("หน้าตาเดิม", "The look you know", "従来の表示")}>
          V1
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={look === "v2"}
          data-guide="project.lookV2"
          onClick={() => choose("v2")}
          title={copy("หน้าตาแบบ Pegasus ERP", "The Pegasus ERP look", "Pegasus ERP の表示")}
        >
          V2
        </button>
      </div>
    </div>
  );
  // The same element in both looks, so switching keeps the screen (the open tab, a plan's place) mounted. In V1 it is
  // display: contents and the page lays the screen out exactly as before.
  return (
    <ProjectLookContext.Provider value={look}>
      <div className={look === "v2" ? "pg-skin pg-screen project-v2" : "project-look-v1"} data-project-look={look}>
        {bar}
        {children}
      </div>
    </ProjectLookContext.Provider>
  );
}
