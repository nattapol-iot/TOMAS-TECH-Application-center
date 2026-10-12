"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createCredential, deleteCredential, getCredentialAccess, listCredentials, revealCredential, updateCredential,
  type CredentialKind, type InstalledAsset, type SiteCredential, type SiteCredentialInput,
} from "../api-client";
import { localeFor, useLanguage, useT } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { Badge, EmptyState, Field, Icon, Modal } from "../ui";

type Notify = (message: string) => void;
type Scope = "asset" | "site" | "customer";

const KINDS: CredentialKind[] = ["Login", "WiFi", "VPN", "Database", "API", "License", "Other"];
const SHOW_SECONDS = 30;

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/**
 * The credentials for one installed asset, with those for its customer site and the whole customer.
 * A secret is fetched only when someone asks, shown for 30 seconds, and never kept in the page.
 */
export function AssetCredentials({ asset, notify }: { asset: InstalledAsset; notify: Notify }) {
  const t = useT();
  const { lang } = useLanguage();
  const dateTime = useMemo(() => new Intl.DateTimeFormat(localeFor(lang), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), [lang]);
  const [result, setResult] = useState<Awaited<ReturnType<typeof listCredentials>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [shown, setShown] = useState<{ id: number; secret: string } | null>(null);
  const [editing, setEditing] = useState<SiteCredential | "new" | null>(null);
  const [auditing, setAuditing] = useState<SiteCredential | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    listCredentials({ customerId: asset.customer.id, customerSiteId: asset.customerSite?.id, assetId: asset.id, includeSiteWide: true })
      .then((value) => { if (active) { setResult(value); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, [asset.id, asset.customer.id, asset.customerSite?.id, revision]);

  // Forget a shown secret when the drawer closes.
  useEffect(() => () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); }, []);

  const reveal = async (credential: SiteCredential) => {
    setBusy(credential.id);
    try {
      const { secret } = await revealCredential(credential.id);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      setShown({ id: credential.id, secret });
      hideTimer.current = window.setTimeout(() => setShown(null), SHOW_SECONDS * 1000);
      setRevision((value) => value + 1);
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setBusy(null);
    }
  };
  const copy = (secret: string) => {
    void navigator.clipboard?.writeText(secret).then(() => notify(t("Vault.copied")), () => notify(t("Vault.copyFailed")));
  };
  const remove = async (credential: SiteCredential) => {
    if (!window.confirm(t("Vault.deleteConfirm").replace("{label}", credential.label))) return;
    setBusy(credential.id);
    try {
      await deleteCredential(credential.id);
      if (shown?.id === credential.id) setShown(null);
      setRevision((value) => value + 1);
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setBusy(null);
    }
  };

  const scopeOf = (credential: SiteCredential): Scope => (credential.asset ? "asset" : credential.customerSite ? "site" : "customer");

  return (
    <section className="asset-credentials">
      <div className="asset-credentials-head">
        <h3 className="asset-section-title"><Icon name="lock" /> <LocalizedText text={"Vault.title"} /></h3>
        {result?.canManage && result.vaultReady ? (
          <button className="btn default sm" type="button" onClick={() => setEditing("new")}><Icon name="plus" /><LocalizedText text={"Vault.add"} /></button>
        ) : null}
      </div>
      {result && !result.vaultReady ? <p className="asset-credentials-warning"><LocalizedText text={"Vault.notReady"} /></p> : null}
      {error ? <EmptyState icon="alertTriangle" title="Could not load" message={error} />
        : !result ? <p className="muted"><LocalizedText text={"Vault.loading"} /></p>
        : result.items.length === 0 ? <p className="muted"><LocalizedText text={"Vault.empty"} /></p>
        : (
          <ul className="asset-credential-list">
            {result.items.map((credential) => {
              const visible = shown?.id === credential.id ? shown.secret : null;
              return (
                <li key={credential.id}>
                  <div className="asset-credential-main">
                    <div className="asset-credential-title">
                      <Badge tone="violet"><LocalizedText text={`Vault.kind.${credential.kind}`} /></Badge>
                      <strong>{credential.label}</strong>
                      <span className="muted"><LocalizedText text={`Vault.scope.${scopeOf(credential)}`} /></span>
                    </div>
                    <div className="asset-credential-fields">
                      {credential.host ? <span><LocalizedText text={"Vault.host"} /> <code>{credential.host}</code></span> : null}
                      {credential.username ? <span><LocalizedText text={"Vault.username"} /> <code>{credential.username}</code></span> : null}
                    </div>
                    <div className="asset-credential-secret" aria-live="polite">
                      <code className={visible === null ? "masked" : ""}>{visible ?? "••••••••••"}</code>
                      {visible !== null ? (
                        <>
                          <button className="icon-btn" type="button" aria-label={t("Vault.copy")} title={t("Vault.copy")} onClick={() => copy(visible)}><Icon name="copy" /></button>
                          <button className="icon-btn" type="button" aria-label={t("Vault.hide")} title={t("Vault.hide")} onClick={() => setShown(null)}><Icon name="eye" /></button>
                          <span className="muted"><LocalizedText text={"Vault.hidesSoon"} /></span>
                        </>
                      ) : credential.canReveal && result.vaultReady ? (
                        <button className="btn default sm" type="button" disabled={busy === credential.id} onClick={() => void reveal(credential)}>
                          <Icon name="eye" /><LocalizedText text={"Vault.reveal"} />
                        </button>
                      ) : null}
                    </div>
                    {credential.notes ? <span className="asset-credential-notes">{credential.notes}</span> : null}
                    <span className="muted">
                      {credential.lastRevealedAt
                        ? <><LocalizedText text={"Vault.lastRevealed"} /> {credential.lastRevealedBy} · {dateTime.format(new Date(credential.lastRevealedAt))}</>
                        : <LocalizedText text={"Vault.neverRevealed"} />}
                    </span>
                  </div>
                  {result.canManage ? (
                    <div className="asset-credential-actions">
                      <button className="icon-btn" type="button" aria-label={t("Vault.accessLog")} title={t("Vault.accessLog")} onClick={() => setAuditing(credential)}><Icon name="clock" /></button>
                      {result.vaultReady ? (
                        <button className="icon-btn" type="button" aria-label={t("Edit")} title={t("Edit")} onClick={() => setEditing(credential)}><Icon name="edit" /></button>
                      ) : null}
                      <button className="icon-btn" type="button" disabled={busy === credential.id} aria-label={t("Vault.delete")} title={t("Vault.delete")} onClick={() => void remove(credential)}><Icon name="trash" /></button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      {editing ? (
        <CredentialEditor asset={asset} credential={editing === "new" ? null : editing} notify={notify}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setRevision((value) => value + 1); }} />
      ) : null}
      {auditing ? <AccessLogModal credential={auditing} onClose={() => setAuditing(null)} /> : null}
    </section>
  );
}

function CredentialEditor({ asset, credential, notify, onClose, onSaved }: {
  asset: InstalledAsset; credential: SiteCredential | null; notify: Notify; onClose: () => void; onSaved: () => void;
}) {
  const t = useT();
  const [kind, setKind] = useState<CredentialKind>(credential?.kind ?? "Login");
  const [label, setLabel] = useState(credential?.label ?? "");
  const [username, setUsername] = useState(credential?.username ?? "");
  const [host, setHost] = useState(credential?.host ?? asset.ipAddress);
  const [notes, setNotes] = useState(credential?.notes ?? "");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const initialScope: Scope = credential ? (credential.asset ? "asset" : credential.customerSite ? "site" : "customer") : "asset";
  const [scope, setScope] = useState<Scope>(initialScope);
  const [busy, setBusy] = useState(false);
  const valid = label.trim().length > 0 && (credential !== null || secret.length > 0);

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const input: SiteCredentialInput = {
        customerId: asset.customer.id,
        customerSiteId: scope === "customer" ? null : asset.customerSite?.id ?? null,
        assetId: scope === "asset" ? asset.id : null,
        projectId: asset.project?.id ?? null,
        kind, label: label.trim(), username: username.trim(), host: host.trim(), notes: notes.trim(),
        ...(secret ? { secret } : {}),
      };
      if (credential) await updateCredential(credential.id, { ...input, rowVersion: credential.rowVersion });
      else await createCredential(input);
      setSecret("");
      notify(t(credential ? "Vault.saved" : "Vault.created"));
      onSaved();
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={credential ? "Vault.edit" : "Vault.add"} subtitle={`${asset.assetNo} · ${asset.name}`} size="md" onClose={onClose}
      footer={<>
        <button className="btn default" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button>
        <button className="btn primary" type="button" disabled={!valid || busy} onClick={() => void save()}><Icon name="lock" /><LocalizedText text={"Save"} /></button>
      </>}>
      <div className="form-grid two">
        <Field label="Vault.kindLabel">
          <select value={kind} onChange={(event) => setKind(event.target.value as CredentialKind)}>
            {KINDS.map((item) => <option key={item} value={item}>{t(`Vault.kind.${item}`)}</option>)}
          </select>
        </Field>
        <Field label="Vault.scopeLabel">
          <select value={scope} onChange={(event) => setScope(event.target.value as Scope)}>
            <option value="asset">{t("Vault.scope.asset")}</option>
            {asset.customerSite ? <option value="site">{t("Vault.scope.site")}</option> : null}
            <option value="customer">{t("Vault.scope.customer")}</option>
          </select>
        </Field>
        <Field label="Vault.label" span={2}>
          <input value={label} maxLength={200} onChange={(event) => setLabel(event.target.value)} placeholder={t("Vault.labelPlaceholder")} />
        </Field>
        <Field label="Vault.host"><input value={host} maxLength={300} onChange={(event) => setHost(event.target.value)} placeholder="192.168.1.10 / https://… / SSID" /></Field>
        <Field label="Vault.username"><input value={username} maxLength={300} autoComplete="off" onChange={(event) => setUsername(event.target.value)} /></Field>
        <Field label={credential ? "Vault.newSecret" : "Vault.secret"} hint={credential ? "Vault.newSecretHint" : "Vault.secretHint"} span={2}>
          <div className="asset-credential-secret-input">
            <input type={showSecret ? "text" : "password"} value={secret} maxLength={4000} autoComplete="new-password" spellCheck={false}
              onChange={(event) => setSecret(event.target.value)} />
            <button className="icon-btn" type="button" aria-label={t(showSecret ? "Vault.hide" : "Vault.reveal")} onClick={() => setShowSecret((value) => !value)}><Icon name="eye" /></button>
          </div>
        </Field>
        <Field label="Vault.notes" span={2}>
          <textarea rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function AccessLogModal({ credential, onClose }: { credential: SiteCredential; onClose: () => void }) {
  const { lang } = useLanguage();
  const dateTime = useMemo(() => new Intl.DateTimeFormat(localeFor(lang), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }), [lang]);
  const [items, setItems] = useState<Array<{ action: string; at: string; user: string; ip: string | null }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    getCredentialAccess(credential.id)
      .then((value) => { if (active) setItems(value.items); })
      .catch((reason: unknown) => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, [credential.id]);
  return (
    <Modal title="Vault.accessLog" subtitle={credential.label} size="md" onClose={onClose}>
      {error ? <EmptyState icon="alertTriangle" title="Could not load" message={error} />
        : !items ? <EmptyState icon="clock" title="Loading…" message="Vault.loading" />
        : (
          <ul className="asset-timeline">
            {items.map((item, index) => (
              <li key={`${item.at}-${index}`}>
                <Badge tone={item.action === "Revealed" ? "amber" : item.action === "Deleted" ? "red" : "slate"}><LocalizedText text={`Vault.action.${item.action}`} /></Badge>
                <div>
                  <strong>{item.user}</strong>
                  <span>{dateTime.format(new Date(item.at))}{item.ip ? ` · ${item.ip}` : ""}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
    </Modal>
  );
}
