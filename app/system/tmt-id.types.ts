export type TmtIdUser = {
  authenticationMode: "TmtId";
  sub: string;
  preferredUsername: string;
  email: string | null;
  name: string | null;
  role: string | null;
  department: string | null;
  employeeNo: number | null;
};

export type TmtIdSessionState =
  | { status: "signed-in"; user: TmtIdUser }
  | { status: "signed-out" }
  | { status: "unavailable" };