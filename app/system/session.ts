"use client";

/* ==========================================================================
   Session

   Who is signed in. The login screen's role picker maps to a demonstration
   user, so the schedule module can tell a project manager from a task owner.
   In production this comes from the auth provider, not from a picker.
   ========================================================================== */

import { createContext, useContext } from "react";
import { CURRENT_USER, USERS, type Role, type User } from "./data";
import type { ApiUser } from "./api-client";

export type Session = { user: User; role: Role };

/** The demonstration account each login role opens. */
export function sessionForRole(role: string): Session {
  const byRole: Record<string, string> = {
    "Engineer": "u1",
    "Engineering Manager": "u6",
    "Project Manager": "u7",
    "Sales Engineer": "u8",
    "Purchasing": "u12",
    "Warehouse": "u13",
    "Inventory Controller": "u14",
    "Admin": "u9",
    "Viewer": "u8",
  };
  const user = USERS.find((entry) => entry.id === byRole[role]) ?? CURRENT_USER;
  return { user, role: (role === "Viewer" ? "Viewer" : user.role) as Role };
}

export const SessionContext = createContext<Session>({ user: CURRENT_USER, role: CURRENT_USER.role });

export const useSession = () => useContext(SessionContext);

const ROLES: Role[] = ["Admin", "Engineering Manager", "Project Manager", "Engineer", "Sales Engineer", "Purchasing", "Warehouse", "Inventory Controller", "Viewer"];

export function sessionFromApiUser(apiUser: ApiUser): Session {
  const role = ROLES.includes(apiUser.role as Role) ? apiUser.role as Role : "Viewer";
  const words = apiUser.name.trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "U";
  const user: User = {
    id: `db:${apiUser.id}`,
    name: apiUser.name,
    initials,
    email: apiUser.email,
    role,
    department: apiUser.department,
    level: "",
  };
  return { user, role };
}
