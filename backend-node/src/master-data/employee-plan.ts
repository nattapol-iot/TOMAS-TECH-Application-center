export type LocalEmployee = { id: number; email: string; nameEn: string; nameTh: string; nickname: string; isActive: boolean; masterKey: string | null };
export type EmployeeChange = { id: number; masterKey: string; nameEn: string; nameTh: string; nickname: string };
export type EmployeePlan = { changes: EmployeeChange[]; deactivate: number[]; unmatched: number };

const text = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
const lower = (value: unknown) => text(value, 256).toLowerCase();

type DirectoryPerson = { key: string; emails: string[]; nameEn: string; nameTh: string; nickname: string };

function directoryPerson(row: Record<string, unknown>): DirectoryPerson | null {
  const key = text(row.lineworks_user_id, 100);
  if (!key) return null;
  const nameEn = text(row.english_name, 200) || [text(row.first_name, 100), text(row.last_name, 100)].filter(Boolean).join(" ");
  return { key, emails: [lower(row.employee_lineworks_email), lower(row.microsoft_email)].filter(Boolean), nameEn, nameTh: text(row.thai_name, 200), nickname: text(row.nickname, 100) };
}

/**
 * What master's active directory changes on dbo.employees. A row is matched by the LINE WORKS id kept from an earlier match,
 * else by an email only one person in master holds. Master fills names and nicknames, never blanking one it lacks. Only a row
 * that matched before and is missing now becomes inactive, so an email that never matched cannot switch anyone off.
 */
export function planEmployeeSync(local: readonly LocalEmployee[], directory: readonly unknown[]): EmployeePlan {
  const people = directory.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map(directoryPerson).filter((person): person is DirectoryPerson => person !== null);
  const byKey = new Map(people.map((person) => [person.key, person]));
  const byEmail = new Map<string, DirectoryPerson | null>();
  for (const person of people) for (const email of new Set(person.emails)) byEmail.set(email, byEmail.has(email) ? null : person);

  const plan: EmployeePlan = { changes: [], deactivate: [], unmatched: 0 };
  const claimed = new Set(local.map((row) => row.masterKey).filter((key): key is string => Boolean(key)));
  for (const row of local) {
    const fromKey = row.masterKey ? byKey.get(row.masterKey) : undefined;
    const fromEmail = row.masterKey ? undefined : byEmail.get(lower(row.email));
    const person = fromKey ?? (fromEmail && !claimed.has(fromEmail.key) ? fromEmail : undefined);
    if (!person) {
      if (row.masterKey && row.isActive) plan.deactivate.push(row.id);
      else if (!row.masterKey) plan.unmatched++;
      continue;
    }
    claimed.add(person.key);
    const next = { nameEn: person.nameEn || row.nameEn, nameTh: person.nameTh || row.nameTh, nickname: person.nickname || row.nickname };
    if (row.masterKey !== person.key || next.nameEn !== row.nameEn || next.nameTh !== row.nameTh || next.nickname !== row.nickname) {
      plan.changes.push({ id: row.id, masterKey: person.key, ...next });
    }
  }
  return plan;
}
