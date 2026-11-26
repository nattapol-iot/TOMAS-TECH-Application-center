import { hasRole, type RoleBearer } from "./user-roles.js";

/*
 * What a Leader leads (owner 2026-11-26): the work of their own team. A Leader plans every project of the team, as a
 * Project Manager plans their own, answers its day requests and sets its baselines; reviews its reports; and assesses the
 * KPI of its Engineers. Since migration 138 a Leader also has a Project Manager's rights and sees every project
 * (project-scope.ts); this team rule still decides what they plan. Site credentials they reveal only on the projects they
 * work on: a Leader holds credential.reveal, which a Project Manager does not.
 *
 * A project's team is its own team, else its lead engineer's department; a Leader's team is their department's. Both
 * read as one of the three project teams, as lib/project-portfolio.ts reads them (the Application groups 1G and 2G are
 * one team, Electrical work sits with IoT). No server code is imported here, so a screen can read the same rule.
 */

/** The project team a department or a project's team text belongs to ("" for none); the same rule as lib/project-portfolio.ts. */
export function projectTeamOf(text: string | null | undefined): string {
  const value = (text ?? "").toLowerCase();
  if (value.includes("application")) return "Application Team";
  if (value.includes("mechanic")) return "Mechanical Team";
  if (/\biot\b/.test(value) || value.includes("electric")) return "IoT Team";
  return "";
}

/** The team a person leads: their department's team when they hold the Leader role, else "". */
export const leaderTeamOf = (person: RoleBearer & { department?: string | null }): string => (hasRole(person, "Leader") ? projectTeamOf(person.department) : "");

/** A project's team: its own team text, else its lead engineer's department. */
export const projectTeam = (project: { team?: string | null; leadDepartment?: string | null }): string => projectTeamOf(project.team?.trim() ? project.team : project.leadDepartment);

/** A Leader plans the projects of the team they lead. */
export const leaderPlansProject = (person: RoleBearer & { department?: string | null }, project: { team?: string | null; leadDepartment?: string | null }): boolean => {
  const team = leaderTeamOf(person);
  return team !== "" && projectTeam(project) === team;
};

/** The same text rule in SQL: the project team of a team or department expression. */
export function projectTeamOfSql(text: string): string {
  return `CASE WHEN ${text} LIKE N'%application%' THEN N'Application Team'
    WHEN ${text} LIKE N'%mechanic%' THEN N'Mechanical Team'
    WHEN N' '+${text}+N' ' LIKE N'%[^a-z0-9]iot[^a-z0-9]%' OR ${text} LIKE N'%electric%' THEN N'IoT Team'
    ELSE N'' END`;
}

/** SQL for the project team of the dbo.projects row aliased `project`: its team, else its lead engineer's department. */
export function projectTeamSql(project = "p"): string {
  const text = `COALESCE(NULLIF(LTRIM(RTRIM(${project}.team)),N''),(SELECT team_lead.department FROM dbo.users team_lead WHERE team_lead.id=${project}.lead_engineer_id),N'')`;
  return `(${projectTeamOfSql(text)})`;
}

/** SQL that is true when the project aliased `project` belongs to the team bound as @leader_team (empty for a non-Leader). */
export const leaderTeamProjectSql = (project = "p"): string => `(@leader_team<>N'' AND ${projectTeamSql(project)}=@leader_team)`;
