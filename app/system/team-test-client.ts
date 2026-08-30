"use client";

export type TeamTestSession = {
  email: string;
  accessCode: string;
};

const SESSION_KEY = "iot-team-center:team-test-session:v1";

export const IS_TEAM_TEST_MODE = process.env.NEXT_PUBLIC_AUTH_MODE === "team-test";

export function saveTeamTestSession(email: string, accessCode: string): TeamTestSession {
  const session = { email: email.trim().toLowerCase(), accessCode };
  if (!session.email || !session.accessCode) throw new Error("กรุณากรอกอีเมลและรหัสทดสอบให้ครบ");
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getTeamTestSession(): TeamTestSession | null {
  if (typeof window === "undefined") return null;
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  try {
    const session = JSON.parse(stored) as Partial<TeamTestSession>;
    return typeof session.email === "string" && typeof session.accessCode === "string"
      && session.email.length > 0 && session.accessCode.length > 0
      ? { email: session.email, accessCode: session.accessCode }
      : null;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function clearTeamTestSession() {
  if (typeof window !== "undefined") sessionStorage.removeItem(SESSION_KEY);
}
