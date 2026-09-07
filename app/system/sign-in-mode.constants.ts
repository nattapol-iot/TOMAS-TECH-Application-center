import { IS_TEAM_TEST_MODE } from "./team-test-client";
import { IS_TMT_ID_MODE } from "./tmt-id.constants";
import type { SignInMode } from "./sign-in-mode.types";

// The build ships exactly one identity path. Resolving it once here keeps every
// screen from re-deriving it out of the individual mode flags.
export const SIGN_IN_MODE: SignInMode = IS_TMT_ID_MODE
  ? "tmt-id"
  : IS_TEAM_TEST_MODE
    ? "team-test"
    : "entra";