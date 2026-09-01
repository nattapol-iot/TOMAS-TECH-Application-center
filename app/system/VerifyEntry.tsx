"use client";

import { useState } from "react";
import ProductionApp from "./ProductionApp";

/**
 * The target of the verification code and QR printed on every signature
 * certificate.
 *
 * It renders the production workspace, so a visitor signs in first and then
 * lands on the verification with the code already filled in. That is deliberate:
 * v1 of signing is internal-only (RDL-008), and whether this page should be
 * reachable from outside the network at all is still RDL-036. Until that is
 * answered, an unauthenticated verification page would be a promise the platform
 * has not decided to keep.
 *
 * Loaded with `ssr: false`, so reading the query string in the initialiser only
 * ever runs in the browser.
 */
export default function VerifyEntry() {
  const [code] = useState(() =>
    new URLSearchParams(window.location.search).get("code")?.trim().toUpperCase() ?? "");
  return <ProductionApp initialVerifyCode={code} />;
}
