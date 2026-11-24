"use client";

import { SPECIMEN } from "./config/design-system.constants";
import type { TokenSampleProps } from "./types/design-system.types";

export function TokenSample({ token }: TokenSampleProps) {
  const value = `var(${token.name})`;
  switch (token.kind) {
    case "color":
      return <span className="ds-swatch" style={{ background: value }} />;
    case "font":
      return (
        <span className="ds-specimen" style={{ fontFamily: value }}>
          {SPECIMEN}
        </span>
      );
    case "type":
      return (
        <span className="ds-specimen" style={{ fontSize: value }}>
          {SPECIMEN}
        </span>
      );
    case "radius":
      return <span className="ds-shape" style={{ borderRadius: value }} />;
    case "shadow":
      return <span className="ds-shape" style={{ boxShadow: value }} />;
    case "size":
      return null;
  }
}
