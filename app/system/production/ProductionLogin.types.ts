import type { Lang } from "../i18n";
import type { SignInMode } from "../sign-in-mode.types";
import type { TmtIdUser } from "../tmt-id.types";

export type ProductionLoginCopy = {
  identityBadge: string;
  identityPoint: string;
  heading: string;
  intro: string;
  submitLabel: string;
  lockedTitle: string;
  accessTitle: string;
  accessBody: string;
};

export type ProductionLoginProps = {
  busy: boolean;
  error: string;
  mode: SignInMode;
  entraConfigured: boolean;
  apiConfigured: boolean;
  language: Lang;
  onLanguageChange: (language: Lang) => void;
  onSignIn: (teamTestEmail?: string, teamTestAccessCode?: string) => Promise<void>;
  /** Signed in to TMT ID but not registered here: who they are and the email Employee Master needs. */
  unregistered?: TmtIdUser | null;
};