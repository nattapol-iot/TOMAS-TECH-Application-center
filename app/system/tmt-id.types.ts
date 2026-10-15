export type TmtIdUser = {
  authenticationMode: "TmtId";
  sub: string;
  preferredUsername: string;
  email: string | null;
  /** The email this sign-in is matched to an Engineering Center account on; Employee Master must hold exactly this one. */
  signInEmail?: string;
  name: string | null;
  role: string | null;
  department: string | null;
  employeeNo: number | null;
};

export type TmtIdSessionState =
  | { status: "signed-in"; user: TmtIdUser }
  | { status: "signed-out" }
  | { status: "unavailable" };