const required = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_BUSINESS_TIME_ZONE",
  "SITE_ORIGIN",
];

const errors = [];
if (process.env.NEXT_PUBLIC_APP_MODE !== "team-test") {
  errors.push("NEXT_PUBLIC_APP_MODE must be exactly 'team-test'.");
}
if (process.env.NEXT_PUBLIC_AUTH_MODE !== "team-test") {
  errors.push("NEXT_PUBLIC_AUTH_MODE must be exactly 'team-test'.");
}
for (const name of required) {
  if (!process.env[name]?.trim()) errors.push(`${name} is required.`);
}

for (const name of ["NEXT_PUBLIC_API_BASE_URL", "SITE_ORIGIN"]) {
  const value = process.env[name];
  if (!value) continue;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") errors.push(`${name} must use HTTPS for team testing.`);
    if (url.username || url.password) errors.push(`${name} must not contain credentials.`);
    if (url.pathname !== "/" || url.search || url.hash) errors.push(`${name} must contain only an HTTPS origin.`);
  } catch {
    errors.push(`${name} must be a valid absolute URL.`);
  }
}

const businessTimeZone = process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE?.trim();
if (businessTimeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: businessTimeZone }).format(new Date());
  } catch {
    errors.push("NEXT_PUBLIC_BUSINESS_TIME_ZONE must be a valid IANA time-zone identifier.");
  }
}

if (errors.length) {
  console.error("Team-test build configuration is invalid:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log("Team-test environment validation passed.");
