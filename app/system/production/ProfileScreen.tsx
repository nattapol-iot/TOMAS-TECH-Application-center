"use client";
import { LocalizedText } from "../LocalizedText";

import { useMemo } from "react";
import type { BootstrapData } from "../api-client";
import { LANGUAGES, type Lang, useT } from "../i18n";
import { Badge, Icon, Panel } from "../ui";

type ProfileScreenProps = {
  bootstrap: BootstrapData;
  language: Lang;
  onLanguageChange: (language: Lang) => void;
  onOpenMyWork: () => void;
  onOpenSignature: () => void;
};

const PERMISSION_GROUPS = [
  { key: "work", label: "Projects & estimating", prefixes: ["inquiry.", "estimate.", "project.", "schedule."] },
  { key: "field", label: "Field operations", prefixes: ["visit."] },
  { key: "supply", label: "Materials & purchasing", prefixes: ["procurement.", "inventory."] },
  { key: "docs", label: "Knowledge & documents", prefixes: ["knowledge.", "signing."] },
  { key: "admin", label: "Reports & administration", prefixes: ["report.", "master.", "audit."] },
] as const;

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}

function permissionVerb(permission: string) {
  const verb = permission.split(".").at(-1) ?? permission;
  return verb.charAt(0).toUpperCase() + verb.slice(1);
}

export function ProductionProfile({
  bootstrap,
  language,
  onLanguageChange,
  onOpenMyWork,
  onOpenSignature,
}: ProfileScreenProps) {
  const t = useT();
  const employee = bootstrap.team.find((member) => member.id === bootstrap.user.id)
    ?? bootstrap.team.find((member) => member.email.toLowerCase() === bootstrap.user.email.toLowerCase());

  const permissionGroups = useMemo(() => {
    const assigned = new Set<string>();
    const groups: { key: string; label: string; prefixes: readonly string[]; permissions: string[] }[] = PERMISSION_GROUPS.map((group) => {
      const permissions = bootstrap.permissions.filter((permission) => {
        const matches = group.prefixes.some((prefix) => permission.startsWith(prefix));
        if (matches) assigned.add(permission);
        return matches;
      });
      return { ...group, permissions };
    }).filter((group) => group.permissions.length > 0);

    const other = bootstrap.permissions.filter((permission) => !assigned.has(permission));
    if (other.length) groups.push({ key: "other", label: "Other access", prefixes: [], permissions: other });
    return groups;
  }, [bootstrap.permissions]);

  return (
    <div className="profile-page">
      <section className="profile-identity" aria-labelledby="profile-title">
        <div className="profile-avatar" aria-hidden="true">{initials(bootstrap.user.name)}</div>
        <div className="profile-heading">
          <p className="eyebrow">{t("MY PROFILE")}</p>
          <h1 id="profile-title">{bootstrap.user.name}</h1>
          <p>{employee?.level || bootstrap.user.role} <LocalizedText text={"·"} /> {bootstrap.user.department}</p>
          <div className="profile-status-row">
            <Badge tone="green" dot>{t("Active account")}</Badge>
            <span>{employee?.nickname ? `${t("Nickname")}: ${employee.nickname}` : t("Company account")}</span>
          </div>
        </div>
        <div className="profile-primary-actions">
          <button className="btn primary" type="button" onClick={onOpenMyWork}><Icon name="calendar" />{t("Open My Work")}</button>
          <button className="btn default" type="button" onClick={onOpenSignature}><Icon name="edit" />{t("Manage signature")}</button>
        </div>
      </section>

      <div className="profile-layout">
        <div className="profile-main stack">
          <Panel title="Work information" subtitle="Managed by your organisation">
            <dl className="profile-details">
              <div><dt>{t("Employee No.")}</dt><dd className="mono">{employee?.employeeNo || "—"}</dd></div>
              <div><dt>{t("Email")}</dt><dd><a href={`mailto:${bootstrap.user.email}`}>{bootstrap.user.email}</a></dd></div>
              <div><dt>{t("Department")}</dt><dd>{bootstrap.user.department || "—"}</dd></div>
              <div><dt>{t("Level / position")}</dt><dd>{employee?.level || "—"}</dd></div>
              <div><dt>{t("Role")}</dt><dd><Badge tone="blue">{bootstrap.user.role}</Badge></dd></div>
              <div><dt>{t("Sign-in access")}</dt><dd>{employee?.canSignIn === false ? t("Not provisioned") : t("Enabled")}</dd></div>
            </dl>
            <div className="profile-managed-note"><Icon name="lock" /><span><strong>{t("Organisation-managed information")}</strong>{t("Contact an administrator if these details need to change.")}</span></div>
          </Panel>

          <Panel title={`Permissions (${bootstrap.permissions.length})`} subtitle="Access granted to your current role">
            <div className="profile-permission-groups">
              {permissionGroups.map((group) => (
                <section className="profile-permission-group" key={group.key}>
                  <div><Icon name="shield" /><span><strong>{t(group.label)}</strong><small>{group.permissions.length} {t("permissions")}</small></span></div>
                  <div className="profile-permission-list">
                    {group.permissions.map((permission) => <span key={permission} title={permission}>{permissionVerb(permission)}</span>)}
                  </div>
                </section>
              ))}
            </div>
          </Panel>
        </div>

        <aside className="profile-aside stack" aria-label={t("Profile preferences")}>
          <Panel title="Language" subtitle="Choose the interface language">
            <div className="profile-language" role="radiogroup" aria-label={t("Language")}>
              {LANGUAGES.map((code) => (
                <button key={code} type="button" role="radio" aria-checked={language === code}
                  className={language === code ? "active" : ""} onClick={() => onLanguageChange(code)}>
                  <strong>{code}</strong><span>{code === "TH" ? "ไทย" : code === "JP" ? "日本語" : "English"}</span>
                  {language === code ? <Icon name="check" /> : null}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Account security" subtitle="Your company controls sign-in">
            <div className="profile-security">
              <span className="profile-security-icon"><Icon name="shield" /></span>
              <div><strong>{t("Company account")}</strong><p>{bootstrap.user.email}</p></div>
              <Badge tone="green">{t("Protected")}</Badge>
            </div>
            <p className="profile-security-copy">{t("Authentication and account recovery are managed by your organisation.")}</p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
