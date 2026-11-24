"use client";

import type { NavLinkProps } from "@tomas-tc/ui";
import { SAMPLE_HREF } from "../config/tomas-ui.constants";
import { stayOnPage } from "../utils/stay-on-page";

export function SampleLink({ node, children, ...rest }: NavLinkProps) {
  return (
    <a {...rest} href={node.href ?? SAMPLE_HREF} onClick={stayOnPage} aria-current={node.active ? "page" : undefined}>
      {children}
    </a>
  );
}
