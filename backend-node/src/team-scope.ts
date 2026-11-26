// A team is what a manager oversees. People belong to it through the department written on
// their employee record (synced to dbo.users.department). Most departments are a team of their
// own; dbo.department_teams (migration 067) maps the others onto a team, for example the
// Electrical Engineer Dept. onto the IoT Engineer Dept. team.
//
// The Application department is one team whatever its groups are called (owner 2026-11-26: 1G and 2G
// are one team in KPI and Team Activity), so any department naming Application reads as the
// Application Engineer Dept. team, as projects already read it (lib/project-portfolio.ts).

/** The team every department naming Application belongs to. */
export const APPLICATION_TEAM = "Application Engineer Dept.";

/** SQL for the team of a department expression: its dbo.department_teams row, else the Application team for an Application department, else itself. */
export function teamOfSql(department: string): string {
  return `COALESCE((SELECT TOP (1) team_map.team FROM dbo.department_teams team_map WHERE team_map.department=${department}),CASE WHEN ${department} LIKE N'%application%' THEN N'${APPLICATION_TEAM}' ELSE ${department} END)`;
}

// SQL Server compares these columns case-insensitively and ignores trailing spaces; this does the
// same in TypeScript. An empty team belongs to nobody.
export function normalizedTeam(team: string | null | undefined): string {
  return (team ?? "").trim().toLocaleLowerCase("en");
}

export function sameTeam(left: string | null | undefined, right: string | null | undefined): boolean {
  const team = normalizedTeam(left);
  return team !== "" && team === normalizedTeam(right);
}
