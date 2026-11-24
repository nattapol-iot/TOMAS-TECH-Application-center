"use client";

import { useState } from "react";
import { useT } from "../../i18n";
import { Panel } from "../../ui";
import { TokenSample } from "./TokenSample";
import type { NotifyProps } from "./types/design-system.types";
import { readTokenFamilies } from "./utils/root-tokens";

export function TokenCatalog({ notify }: NotifyProps) {
  const t = useT();
  const [families] = useState(readTokenFamilies);
  const copy = (name: string) =>
    navigator.clipboard.writeText(`var(${name})`).then(
      () => notify(`${t("DS.copied")} var(${name})`),
      () => notify(t("DS.copyFailed")),
    );

  return (
    <div className="ds-stack">
      {families.map((family) => (
        <Panel key={family.key} title={family.title} subtitle={`${family.tokens.length}`}>
          <div className={`ds-tokens ${family.kind}`}>
            {family.tokens.map((token) => (
              <button key={token.name} type="button" className="ds-token" title={t("DS.copyHint")} onClick={() => copy(token.name)}>
                <TokenSample token={token} />
                <code>{token.name}</code>
                <small>{token.declared === token.resolved ? token.resolved : `${token.declared} = ${token.resolved}`}</small>
              </button>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
