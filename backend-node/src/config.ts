import { isIP } from "node:net";
import { resolve } from "node:path";
import type { AuthenticationMode } from "./types.js";

export type TmtIdConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  publicBaseUrl: string;
  appBaseUrl: string;
  sessionSecret: string;
  sessionCookieSecure: boolean;
  masterDataUrl?: string;
  masterDataApiKey?: string;
  defaultRoleCode?: string;
};

export type AppConfig = {
  environment: "development" | "staging" | "production";
  host: string;
  port: number;
  allowedHosts: string[];
  corsOrigins: string[];
  businessTimeZone: string;
  auth: {
    mode: AuthenticationMode;
    teamTestSigningKey?: string;
    tenantId?: string;
    clientId?: string;
    audience?: string;
    requiredScope?: string;
  };
  tmtId?: TmtIdConfig;
  database: {
    connectionString: string;
    trustServerCertificate: boolean;
    applicationRoleName?: string;
    applicationRolePassword?: string;
  };
  documentStorage: {
    mode: "Local" | "Nas";
    rootPath: string;
    maxFileSizeBytes: number;
  };
  email: {
    mode: "Disabled" | "MicrosoftGraph";
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
    senderUser?: string;
    applicationBaseUrl?: string;
  };
};

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optional(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

function boolean(env: NodeJS.ProcessEnv, name: string): boolean {
  return optional(env, name)?.toLowerCase() === "true";
}

function positiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = optional(env, name);
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer.`);
  return value;
}

function listByPrefix(env: NodeJS.ProcessEnv, prefix: string): string[] {
  return Object.entries(env)
    .filter(([key, value]) => key.startsWith(prefix) && Boolean(value?.trim()))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value!.trim());
}

const WINDOWS_TO_IANA_TIME_ZONE: Readonly<Record<string, string>> = {
  "SE Asia Standard Time": "Asia/Bangkok",
};

export function normalizeBusinessTimeZone(value?: string): string {
  const configured = value?.trim() || "Asia/Bangkok";
  const normalized = WINDOWS_TO_IANA_TIME_ZONE[configured] ?? configured;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(
      new Date(),
    );
  } catch {
    throw new Error(
      `Business__TimeZoneId '${configured}' is not supported by this Node.js host.`,
    );
  }
  return normalized;
}

export function isPrivateIpv4(host: string): boolean {
  if (isIP(host) !== 4) return false;
  const [first = 0, second = 0] = host.split(".").map(Number);
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function validateOrigin(origin: string, allowPrivateLanHttp: boolean): void {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    origin.includes("*")
  )
    throw new Error(`Untrusted CORS origin: ${origin}`);
  if (url.protocol === "https:") return;
  if (
    allowPrivateLanHttp &&
    url.protocol === "http:" &&
    isPrivateIpv4(url.hostname)
  )
    return;
  if (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  )
    return;
  throw new Error(`CORS origin must use HTTPS: ${origin}`);
}

function validateGuid(name: string, value: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new Error(`${name} must be a GUID.`);
  }
}

function loadTmtIdConfig(
  env: NodeJS.ProcessEnv,
  environment: AppConfig["environment"],
  allowPrivateLanHttp: boolean,
): TmtIdConfig {
  const issuer = required(env, "OIDC_ISSUER");
  const issuerUrl = new URL(issuer);
  if (issuerUrl.protocol !== "https:")
    throw new Error("OIDC_ISSUER must use HTTPS.");
  if (issuerUrl.search || issuerUrl.hash)
    throw new Error("OIDC_ISSUER must not contain a query or fragment.");

  const publicBaseUrl = required(env, "PUBLIC_BASE_URL");
  validateOrigin(publicBaseUrl, allowPrivateLanHttp);
  // A split-origin deployment serves the app and the API from different ports,
  // so the post-login return has to target the app rather than the API origin
  // that owns the registered callback. A single-origin deployment leaves this
  // unset and both are the same value.
  const appBaseUrl = optional(env, "APP_BASE_URL") ?? publicBaseUrl;
  validateOrigin(appBaseUrl, allowPrivateLanHttp);

  const sessionSecret = required(env, "SESSION_SECRET");
  if (sessionSecret.length < 32 || sessionSecret.length > 512)
    throw new Error("SESSION_SECRET must contain 32-512 characters.");

  const sessionCookieSecureRaw = optional(
    env,
    "SESSION_COOKIE_SECURE",
  )?.toLowerCase();
  if (
    sessionCookieSecureRaw &&
    sessionCookieSecureRaw !== "true" &&
    sessionCookieSecureRaw !== "false"
  ) {
    throw new Error("SESSION_COOKIE_SECURE must be true or false.");
  }
  const sessionCookieSecure = sessionCookieSecureRaw !== "false";
  if (!sessionCookieSecure && environment !== "development")
    throw new Error("SESSION_COOKIE_SECURE may be false only in development.");

  const masterDataUrl = optional(env, "MASTER_DATA_URL");
  const masterDataApiKey = optional(env, "MASTER_DATA_API_KEY");
  if (Boolean(masterDataUrl) !== Boolean(masterDataApiKey))
    throw new Error(
      "MASTER_DATA_URL and MASTER_DATA_API_KEY are required together.",
    );
  if (masterDataUrl) validateOrigin(masterDataUrl, allowPrivateLanHttp);
  const defaultRoleCode = optional(env, "TMT_ID_DEFAULT_ROLE_CODE");
  if (defaultRoleCode !== undefined && !/^[A-Za-z][A-Za-z0-9 _-]{0,49}$/.test(defaultRoleCode))
    throw new Error("TMT_ID_DEFAULT_ROLE_CODE must be an existing dbo.roles code (1-50 characters).");

  return {
    issuer,
    clientId: required(env, "OIDC_CLIENT_ID"),
    clientSecret: required(env, "OIDC_CLIENT_SECRET"),
    publicBaseUrl,
    appBaseUrl,
    sessionSecret,
    sessionCookieSecure,
    ...(masterDataUrl ? { masterDataUrl } : {}),
    ...(masterDataApiKey ? { masterDataApiKey } : {}),
    ...(defaultRoleCode ? { defaultRoleCode } : {}),
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const environment = (
    optional(env, "NODE_ENV") ?? "development"
  ).toLowerCase();
  if (
    environment !== "development" &&
    environment !== "staging" &&
    environment !== "production"
  ) {
    throw new Error("NODE_ENV must be development, staging, or production.");
  }

  const mode = (optional(env, "Authentication__Mode") ??
    "Entra") as AuthenticationMode;
  if (
    mode !== "Development" &&
    mode !== "TeamTest" &&
    mode !== "Entra" &&
    mode !== "TmtId"
  ) {
    throw new Error("Authentication__Mode is invalid.");
  }
  if (mode === "Development" && environment !== "development")
    throw new Error(
      "Development authentication is allowed only in development.",
    );
  if (mode === "TeamTest" && environment !== "staging")
    throw new Error("TeamTest authentication is allowed only in staging.");

  const teamTestSigningKey = optional(
    env,
    "Authentication__TeamTestSigningKey",
  );
  if (
    mode === "TeamTest" &&
    (!teamTestSigningKey ||
      teamTestSigningKey.length < 32 ||
      teamTestSigningKey.length > 256)
  ) {
    throw new Error(
      "Authentication__TeamTestSigningKey must contain 32-256 characters.",
    );
  }

  const tenantId = optional(env, "Authentication__TenantId");
  const clientId = optional(env, "Authentication__ClientId");
  const audience = optional(env, "Authentication__Audience");
  const requiredScope = optional(env, "Authentication__RequiredScope");
  if (mode === "Entra") {
    for (const [name, value] of [
      ["Authentication__TenantId", tenantId],
      ["Authentication__ClientId", clientId],
      ["Authentication__Audience", audience],
    ] as const) {
      if (!value) throw new Error(`${name} is required.`);
      validateGuid(name, value);
    }
    if (clientId !== audience)
      throw new Error(
        "Authentication__Audience must equal Authentication__ClientId.",
      );
    if (!requiredScope || /\s/.test(requiredScope))
      throw new Error("Authentication__RequiredScope must be one scope name.");
  }

  const allowedHosts = (optional(env, "AllowedHosts") ?? "localhost;127.0.0.1")
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    environment !== "development" &&
    (allowedHosts.length === 0 ||
      allowedHosts.some((host) => host.includes("*")))
  ) {
    throw new Error("AllowedHosts must list exact hosts outside development.");
  }

  const allowPrivateLanHttp = environment === "staging" && mode === "TeamTest";
  const corsOrigins = listByPrefix(env, "Cors__AllowedOrigins__");
  if (environment !== "development" && corsOrigins.length === 0)
    throw new Error(
      "At least one CORS origin is required outside development.",
    );
  corsOrigins.forEach((origin) => validateOrigin(origin, allowPrivateLanHttp));

  const tmtId =
    mode === "TmtId"
      ? loadTmtIdConfig(env, environment, allowPrivateLanHttp)
      : undefined;

  const roleName = optional(env, "Database__ApplicationRoleName");
  const rolePassword = optional(env, "Database__ApplicationRolePassword");
  if (Boolean(roleName) !== Boolean(rolePassword))
    throw new Error(
      "Both database application-role values are required together.",
    );
  if (
    (roleName || rolePassword) &&
    !(environment === "staging" && mode === "TeamTest")
  ) {
    throw new Error(
      "Database application roles are allowed only in staging TeamTest mode.",
    );
  }
  if (roleName && !/^[A-Za-z][A-Za-z0-9_]{2,63}$/.test(roleName))
    throw new Error("Database application role name is invalid.");
  if (rolePassword && !/^[A-Za-z0-9_-]{32,256}$/.test(rolePassword))
    throw new Error("Database application role password is invalid.");

  const trustTeamTestCertificate = boolean(
    env,
    "Database__TrustServerCertificateForTeamTest",
  );
  if (
    trustTeamTestCertificate &&
    !(environment === "staging" && mode === "TeamTest")
  ) {
    throw new Error(
      "Database__TrustServerCertificateForTeamTest is allowed only in staging TeamTest mode.",
    );
  }

  const storageMode =
    optional(env, "DocumentStorage__Mode") ??
    (environment === "production" ? "Nas" : "Local");
  if (storageMode !== "Local" && storageMode !== "Nas")
    throw new Error("DocumentStorage__Mode must be Local or Nas.");
  if (environment === "production" && storageMode !== "Nas")
    throw new Error("DocumentStorage__Mode must be Nas in production.");
  const storagePath = required(env, "DocumentStorage__RootPath");
  const maxFileSizeBytes = positiveInteger(
    env,
    "DocumentStorage__MaxFileSizeBytes",
    52_428_800,
  );
  if (maxFileSizeBytes < 1_048_576 || maxFileSizeBytes > 524_288_000) {
    throw new Error(
      "DocumentStorage__MaxFileSizeBytes must be between 1 MiB and 500 MiB.",
    );
  }

  const emailMode = optional(env, "Email__Mode") ?? "Disabled";
  if (emailMode !== "Disabled" && emailMode !== "MicrosoftGraph")
    throw new Error("Email__Mode must be Disabled or MicrosoftGraph.");
  const emailTenantId = optional(env, "Email__TenantId");
  const emailClientId = optional(env, "Email__ClientId");
  const emailClientSecret = optional(env, "Email__ClientSecret");
  const emailSenderUser = optional(env, "Email__SenderUser");
  const emailApplicationBaseUrl = optional(env, "Email__ApplicationBaseUrl");
  if (emailMode === "MicrosoftGraph") {
    for (const [name, value] of [
      ["Email__TenantId", emailTenantId],
      ["Email__ClientId", emailClientId],
    ] as const) {
      if (!value) throw new Error(`${name} is required when Microsoft Graph email is enabled.`);
      validateGuid(name, value);
    }
    if (!emailClientSecret) throw new Error("Email__ClientSecret is required when Microsoft Graph email is enabled.");
    if (!emailSenderUser || !emailSenderUser.includes("@"))
      throw new Error("Email__SenderUser must be the sender mailbox user principal name.");
    if (!emailApplicationBaseUrl)
      throw new Error("Email__ApplicationBaseUrl is required when Microsoft Graph email is enabled.");
    validateOrigin(emailApplicationBaseUrl, allowPrivateLanHttp);
  }
  return {
    environment,
    host: optional(env, "HOST") ?? "127.0.0.1",
    port: positiveInteger(env, "PORT", 5106),
    allowedHosts,
    corsOrigins,
    businessTimeZone: normalizeBusinessTimeZone(
      optional(env, "Business__TimeZoneId"),
    ),
    auth: {
      mode,
      ...(teamTestSigningKey ? { teamTestSigningKey } : {}),
      ...(tenantId ? { tenantId } : {}),
      ...(clientId ? { clientId } : {}),
      ...(audience ? { audience } : {}),
      ...(requiredScope ? { requiredScope } : {}),
    },
    ...(tmtId ? { tmtId } : {}),
    database: {
      connectionString: required(env, "ConnectionStrings__IoTTeamCenter"),
      trustServerCertificate:
        environment === "development" || trustTeamTestCertificate,
      ...(roleName ? { applicationRoleName: roleName } : {}),
      ...(rolePassword ? { applicationRolePassword: rolePassword } : {}),
    },
    documentStorage: {
      mode: storageMode,
      rootPath: resolve(storagePath),
      maxFileSizeBytes,
    },
    email: {
      mode: emailMode,
      ...(emailTenantId ? { tenantId: emailTenantId } : {}),
      ...(emailClientId ? { clientId: emailClientId } : {}),
      ...(emailClientSecret ? { clientSecret: emailClientSecret } : {}),
      ...(emailSenderUser ? { senderUser: emailSenderUser } : {}),
      ...(emailApplicationBaseUrl ? { applicationBaseUrl: emailApplicationBaseUrl } : {}),
    },
  };
}
