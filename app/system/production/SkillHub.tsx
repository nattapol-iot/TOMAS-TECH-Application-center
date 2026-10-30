"use client";

import { useEffect, useState } from "react";
import { downloadSkillInstaller, getSkillHub, getSkillHubSkill, type SkillHubSkill } from "../api-client";
import { LocalizedText } from "../LocalizedText";
import { EmptyState, Panel, SearchInput, Toolbar } from "../ui";

type Notify = (message: string) => void;

function SkillCard({ skill, notify }: { skill: SkillHubSkill; notify: Notify }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const view = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (content !== null) return;
    setLoading(true);
    setError(null);
    try { setContent((await getSkillHubSkill(skill.slug)).skillMd); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  };
  const install = async (target: "claude" | "codex") => {
    setDownloading(target);
    try { await downloadSkillInstaller(skill.slug, target); }
    catch (reason) { notify(reason instanceof Error ? reason.message : String(reason)); }
    finally { setDownloading(null); }
  };
  // An opened SKILL.md takes the whole row so it stays readable.
  return <div className="panel skill-hub-card" style={open ? { gridColumn: "1 / -1" } : undefined}>
    <div className="panel-body stack" style={{ height: "100%" }}>
      <div style={{ flex: 1 }}><strong>{skill.title}</strong><p className="muted" style={{ marginTop: 4 }}>{skill.description}</p></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {skill.targets.map((target) => <button key={target} className="btn primary sm" type="button" disabled={downloading !== null} onClick={() => void install(target)}>
          <LocalizedText text={downloading === target ? "Skills.downloading" : target === "claude" ? "Skills.installClaude" : "Skills.installCodex"} />
        </button>)}
        <button className="btn default sm" type="button" aria-expanded={open} disabled={loading} onClick={() => void view()}><LocalizedText text={open ? "Skills.hide" : "Skills.view"} /></button>
      </div>
      {open ? loading ? <p role="status"><LocalizedText text="Skills.loading" /></p>
        : error ? <div role="alert"><p>{error}</p><button className="btn default" type="button" onClick={() => { setOpen(false); }}><LocalizedText text="Skills.close" /></button></div>
        : <pre style={{ maxHeight: 360, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "var(--fs-xs)" }}>{content}</pre> : null}
    </div>
  </div>;
}

export function SkillHub({ notify }: { notify: Notify }) {
  const [skills, setSkills] = useState<SkillHubSkill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  useEffect(() => {
    let active = true;
    getSkillHub().then((result) => { if (active) { setSkills(result.skills); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [revision]);
  const needle = query.trim().toLocaleLowerCase();
  const groups = new Map<string, SkillHubSkill[]>();
  for (const skill of skills ?? []) {
    if (!`${skill.title} ${skill.description} ${skill.category} ${skill.slug} ${skill.targets.join(" ")}`.toLocaleLowerCase().includes(needle)) continue;
    const group = groups.get(skill.category) ?? [];
    group.push(skill);
    groups.set(skill.category, group);
  }
  return <div className="stack">
    <div className="download-center-note" role="note"><span><LocalizedText text="Skills.intro" /> <code>%USERPROFILE%\.claude\skills</code> / <code>%USERPROFILE%\.codex\skills</code></span></div>
    <Toolbar><SearchInput link="sq" value={query} onChange={setQuery} placeholder="Skills.search" /></Toolbar>
    {error ? <Panel><EmptyState icon="alertTriangle" title="Skills.error" message={error} action={<button className="btn default" type="button" onClick={() => { setSkills(null); setError(null); setRevision((value) => value + 1); }}><LocalizedText text="Skills.retry" /></button>} /></Panel>
      : skills === null ? <Panel><EmptyState icon="clock" title="Skills.loading" message="Skills.loadingMessage" /></Panel>
      : groups.size === 0 ? <Panel><EmptyState icon="book" title={skills.length ? "Skills.noMatch" : "Skills.empty"} message={skills.length ? "Skills.noMatchMessage" : "Skills.emptyMessage"} /></Panel>
      : Array.from(groups, ([category, entries]) => <section className="stack" key={category}><h2>{category}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", gap: 12, alignItems: "stretch" }}>
          {entries.map((skill) => <SkillCard key={skill.slug} skill={skill} notify={notify} />)}
        </div></section>)}
  </div>;
}
