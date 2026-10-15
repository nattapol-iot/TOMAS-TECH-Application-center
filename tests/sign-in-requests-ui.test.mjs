import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("someone signed in to TMT ID but not registered is told who they are and which email Employee Master needs", async () => {
  const shell = await read("app/system/ProductionApp.tsx");
  // Only the not-registered answer to bootstrap keeps the TMT ID person for the sign-in screen.
  assert.match(shell, /error instanceof ApiClientError && error\.code === "user_not_registered"\) setUnregistered\(session\.user\)/);
  assert.match(shell, /unregistered=\{unregistered\}/);
  assert.match(shell, /t\("SignIn\.signedInAs"\)\.replace\("\{name\}", unregistered\.name \?\? unregistered\.preferredUsername\)/);
  assert.match(shell, /unregistered\.signInEmail \?\? unregistered\.email \?\? unregistered\.preferredUsername/);
  assert.match(shell, /t\("SignIn\.waitingNote"\)/);
  const types = await read("app/system/tmt-id.types.ts");
  assert.match(types, /signInEmail\?: string;/);
});

test("Employee Master lists who is waiting to sign in and adds them with the email they tried", async () => {
  const [screen, client] = await Promise.all([read("app/system/production/CoreScreens.tsx"), read("app/system/api-client.ts")]);
  assert.match(client, /export const listSignInRequests = \(\) => apiRequest<SignInRequest\[\]>\("\/api\/v1\/master\/sign-in-requests"\);/);
  assert.match(client, /`\/api\/v1\/master\/sign-in-requests\/\$\{encodeURIComponent\(subject\)\}`, \{ method: "DELETE" \}/);
  // Only people who may add employees load and see the requests.
  assert.match(screen, /canWrite \? listSignInRequests\(\) : Promise\.resolve\(\[\]\)/);
  assert.match(screen, /\{canWrite && signInRequests\.length \? <Panel title=\{`\$\{t\("SignIn\.requestsTitle"\)\}/);
  // Add as employee opens the usual form with the name and the exact email already filled in.
  assert.match(screen, /setPrefill\(\{ nameEn: request\.name, email: request\.email \}\); setEditing\("new"\);/);
  assert.match(screen, /\} : \{ \.\.\.EMPTY_EMPLOYEE, \.\.\.prefill \}\);/);
  assert.match(screen, /request\.status === "new" \? <button className="btn primary sm"/);
  // The form no longer says an employee record grants no access, and lists every engineering department.
  assert.match(screen, /t\("SignIn\.employeeAccessNote"\)/);
  assert.doesNotMatch(screen, /Employee records do not grant login access/);
  assert.match(screen, /const EMPLOYEE_DEPARTMENTS = \["IoT Engineer Dept\.", "Application Engineer Dept\.", "Mechanical Engineer Dept\.", "Electrical Engineer Dept\.", "System Architect & System Engineer Dept\."\];/);
  // Department and level are real dropdowns (a datalist hides every option but the one already typed), with "Other" to type a new one.
  assert.match(screen, /<ChoiceSelect value=\{form\.department\} standard=\{EMPLOYEE_DEPARTMENTS\} inUse=\{departments\}/);
  assert.match(screen, /<ChoiceSelect value=\{form\.position\} standard=\{EMPLOYEE_LEVELS\} inUse=\{positions\}/);
  assert.doesNotMatch(screen, /list="employee-departments"|list="employee-positions"/);
  assert.match(screen, /<option value=\{OTHER_CHOICE\}>\{t\("Employee\.otherValue"\)\}<\/option>/);
  // Accounts the old first sign-in made (Admin, no department) are listed for the same people, and added with the same email.
  assert.match(client, /export const listUnlinkedAccounts = \(\) => apiRequest<UnlinkedAccount\[\]>\("\/api\/v1\/master\/unlinked-accounts"\);/);
  assert.match(screen, /canWrite \? listUnlinkedAccounts\(\) : Promise\.resolve\(\[\]\)/);
  assert.match(screen, /\{canWrite && unlinked\.length \? <Panel title=\{`\$\{t\("Employee\.unlinkedTitle"\)\}/);
  assert.match(screen, /setPrefill\(\{ nameEn: account\.name, email: account\.email, department: account\.department \}\); setEditing\("new"\);/);
  // An employee that already has the email is opened instead, since saving it links the account.
  assert.match(screen, /account\.employeeId !== null\s*\? <button className="btn ghost sm" type="button" onClick=\{\(\) => openEmployee\(account\)\}>/);
  assert.match(screen, /account\.role === "Admin" \? <div className="muted">\{t\("Employee\.unlinkedAdminHint"\)\}<\/div>/);
  // A new person is never filed under the IoT team by default.
  assert.match(screen, /employeeNo: 0, nameEn: "", nameTh: "", department: "", jobTitle: "",/);
});

test("every SignIn string has English, Thai and Japanese copy", async () => {
  const [shell, screen, dictionary] = await Promise.all([
    read("app/system/ProductionApp.tsx"), read("app/system/production/CoreScreens.tsx"), read("app/system/i18n.ts"),
  ]);
  const keys = [...new Set([shell, screen].flatMap((source) => [...source.matchAll(/"((?:SignIn|Employee)\.[A-Za-z]+)"/g)].map((match) => match[1])))];
  assert.ok(keys.length >= 15, `${keys.length} keys`);
  for (const key of keys) {
    const pattern = String.raw`^\s*"` + key.replace(".", "\\.") + String.raw`": \{ en: "[^"]+", th: "[^"]+", jp: "[^"]+" \},$`;
    assert.match(dictionary, new RegExp(pattern, "m"), `${key} needs en, th and jp`);
  }
});
