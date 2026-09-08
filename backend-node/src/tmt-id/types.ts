export type TmtIdSession = {
  sub: string;
  preferredUsername: string;
  email?: string;
  name?: string;
  idToken?: string;
  authTime?: number;
  issuedAt?: number;
};

export type TransientLogin = {
  state: string;
  nonce: string;
  codeVerifier: string;
  next: string;
};

export type CallbackAction =
  | { kind: "exchange"; login: TransientLogin }
  | { kind: "retry"; next: string }
  | { kind: "fail"; reason: string };

export type CookieAttributes = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax" | "none";
  path: string;
  maxAge: number;
};

export type MasterDataProfile = {
  employeeNo: number | null;
  name: string | null;
  department: string | null;
  role: string | null;
  email: string | null;
};

export type MeResponse = {
  authenticationMode: "TmtId";
  sub: string;
  preferredUsername: string;
  email: string | null;
  name: string | null;
  role: string | null;
  department: string | null;
  employeeNo: number | null;
};

export type ProvisionedUser = {
  objectId: string;
  email: string;
  name: string;
  initials: string;
};
