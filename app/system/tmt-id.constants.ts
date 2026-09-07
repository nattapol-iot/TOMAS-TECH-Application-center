export const IS_TMT_ID_MODE = process.env.NEXT_PUBLIC_AUTH_MODE === "tmt-id";

export const TMT_ID_LOGIN_PATH = "/api/auth/login";
export const TMT_ID_LOGOUT_PATH = "/api/auth/logout";
export const TMT_ID_ME_PATH = "/api/me";
export const TMT_ID_ME_TIMEOUT_MS = 15_000;