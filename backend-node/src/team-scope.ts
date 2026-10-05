// A team is what a manager oversees. People belong to it through the department written on
// their employee record (synced to dbo.users.department). Most departments are a team of their
// own; dbo.department_teams (migration 067) maps the others onto a team, for example the
// Electrical Engineer Dept. onto the IoT Engineer Dept. team.

/** SQL for the team of a department expression: its dbo.department_teams row, else itself. */
export function teamOfSql(department: string): string {
  return `COALESCE((SELECT TOP (1) team_map.team FROM dbo.department_teams team_map WHERE team_map.department=${department}),${department})`;
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
