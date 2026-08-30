"use client";

/* ==========================================================================
   Session

   Who is signed in. The login screen's role picker maps to a demonstration
   user, so the schedule module can tell a project manager from a task owner.
   In production this comes from the auth provider, not from a picker.
   ========================================================================== */

import { createContext, useContext } from "react";
import { CURRENT_USER, USERS, type Role, type User } from "./data";

export type Session = { user: User; role: Role };

/** The demonstration account each login role opens. */
export function sessionForRole(role: string): Session {
  const byRole: Record<string, string> = {
    "Engineer": "u1",
    "Engineering Manager": "u6",
    "Project Manager": "u7",
    "Sales Engineer": "u8",
    "Admin": "u9",
    "Viewer": "u8",
  };
  const user = USERS.find((entry) => entry.id === byRole[role]) ?? CURRENT_USER;
  return { user, role: (role === "Viewer" ? "Viewer" : user.role) as Role };
}

export const SessionContext = createContext<Session>({ user: CURRENT_USER, role: CURRENT_USER.role });

export const useSession = () => useContext(SessionContext);
