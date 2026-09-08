import type { SignInMode } from "../sign-in-mode.types";
import type { ProductionLoginCopy } from "./ProductionLogin.types";

export const PRODUCTION_LOGIN_COPY: Record<SignInMode, ProductionLoginCopy> = {
  "tmt-id": {
    identityBadge: "TMT ID",
    identityPoint: "TMT ID company single sign-on",
    heading: "Sign in",
    intro: "Use your TMT ID company account to enter the Production workspace.",
    submitLabel: "Continue with TMT ID",
    lockedTitle: "Production is locked",
    accessTitle: "Production access",
    accessBody: "Roles and permissions are managed by the IoT Team Center administrator. This system does not receive or store your TMT ID password.",
  },
  "team-test": {
    identityBadge: "TEST",
    identityPoint: "Temporary team-test access",
    heading: "Team test sign in",
    intro: "Use your registered email and temporary test access code.",
    submitLabel: "Enter team test",
    lockedTitle: "Team Test is not ready",
    accessTitle: "Temporary test access",
    accessBody: "For temporary UAT use. The access code stays only in this browser session, and Production does not enable this mode.",
  },
  entra: {
    identityBadge: "Entra",
    identityPoint: "Microsoft company account",
    heading: "Sign in",
    intro: "Use your Microsoft company account to enter the Production workspace.",
    submitLabel: "Continue with Microsoft",
    lockedTitle: "Production is locked",
    accessTitle: "Production access",
    accessBody: "Roles and permissions are managed by the IoT Team Center administrator. This system does not receive or store your Microsoft password.",
  },
};