const required = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_ENTRA_TENANT_ID",
  "NEXT_PUBLIC_ENTRA_CLIENT_ID",
  "NEXT_PUBLIC_ENTRA_API_SCOPE",
  "NEXT_PUBLIC_BUSINESS_TIME_ZONE",
  "SITE_ORIGIN",
];

const errors = [];
if (process.env.NEXT_PUBLIC_APP_MODE !== "production") {
  errors.push("NEXT_PUBLIC_APP_MODE must be exactly 'production'.");
}
for (const name of required) {
  if (!process.env[name]?.trim()) errors.push(`${name} is required.`);
}

for (const name of ["NEXT_PUBLIC_API_BASE_URL", "SITE_ORIGIN"]) {
  const value = process.env[name];
  if (!value) continue;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") errors.push(`${name} must use HTTPS for a production build.`);
    if (url.username || url.password) errors.push(`${name} must not contain credentials.`);
    if (url.hostname.endsWith(".invalid") || url.hostname === "example.tomastc.com" || url.hostname.endsWith(".example.tomastc.com")) {
      errors.push(`${name} still contains a placeholder hostname.`);
    }
    if (url.pathname !== "/" || url.search || url.hash) {
      errors.push(`${name} must contain only the trusted HTTPS origin (no path, query, or fragment).`);
    }
  } catch {
    errors.push(`${name} must be a valid absolute URL.`);
  }
}

const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
for (const name of ["NEXT_PUBLIC_ENTRA_TENANT_ID", "NEXT_PUBLIC_ENTRA_CLIENT_ID"]) {
  const value = process.env[name]?.trim();
  if (value && (!guidPattern.test(value) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value))) {
    errors.push(`${name} must be a real Microsoft Entra GUID, not a placeholder.`);
  }
}

const apiScope = process.env.NEXT_PUBLIC_ENTRA_API_SCOPE?.trim();
if (apiScope && (!/^api:\/\/[^/\s]+\/[^/\s]+$/.test(apiScope) || apiScope.includes("00000000-0000-0000-0000-000000000000"))) {
  errors.push("NEXT_PUBLIC_ENTRA_API_SCOPE must be a real exposed API scope in api://<application-id>/<scope> format.");
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
  console.error("Production build configuration is invalid:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log("Production environment validation passed.");
