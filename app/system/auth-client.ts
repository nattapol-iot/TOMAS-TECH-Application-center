"use client";

import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
} from "@azure/msal-browser";

const tenantId = process.env.NEXT_PUBLIC_ENTRA_TENANT_ID ?? "";
const clientId = process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID ?? "";
const apiScope = process.env.NEXT_PUBLIC_ENTRA_API_SCOPE ?? "";
const ZERO_GUID = "00000000-0000-0000-0000-000000000000";
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const apiScopeMatch = apiScope.match(/^api:\/\/([0-9a-f-]+)\/([^/\s]+)$/i);
const apiApplicationId = apiScopeMatch?.[1] ?? "";
const isRealGuid = (value: string) => GUID_PATTERN.test(value) && value.toLowerCase() !== ZERO_GUID;

export const IS_ENTRA_CONFIGURED =
  isRealGuid(tenantId)
  && isRealGuid(clientId)
  && isRealGuid(apiApplicationId)
  && Boolean(apiScopeMatch?.[2]);

let instance: PublicClientApplication | null = null;
let initialized = false;

function assertConfigured() {
  if (!IS_ENTRA_CONFIGURED) {
    throw new Error("Microsoft Entra ยังไม่ได้กำหนดค่าจริง กรุณากำหนด Tenant ID, Client ID และ API scope ให้ครบก่อนเข้าสู่ระบบ");
  }
}

async function getInstance() {
  assertConfigured();
  if (!instance) {
    instance = new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri: typeof window === "undefined" ? undefined : window.location.origin,
        postLogoutRedirectUri: typeof window === "undefined" ? undefined : window.location.origin,
      },
      cache: { cacheLocation: "sessionStorage" },
      system: { allowPlatformBroker: false },
    });
  }
  if (!initialized) {
    await instance.initialize();
    initialized = true;
  }
  return instance;
}

export async function restoreAccount(): Promise<AccountInfo | null> {
  const client = await getInstance();
  const result = await client.handleRedirectPromise();
  const account = result?.account ?? client.getActiveAccount() ?? client.getAllAccounts()[0] ?? null;
  if (account) client.setActiveAccount(account);
  return account;
}

export async function signInWithMicrosoft(): Promise<AccountInfo> {
  const client = await getInstance();
  const result = await client.loginPopup({ scopes: ["openid", "profile", "email", apiScope], prompt: "select_account" });
  if (!result.account) throw new Error("Microsoft sign-in did not return an account.");
  client.setActiveAccount(result.account);
  return result.account;
}

export async function acquireApiToken(): Promise<string> {
  const client = await getInstance();
  const account = client.getActiveAccount() ?? client.getAllAccounts()[0];
  if (!account) throw new Error("No signed-in Microsoft account is available.");
  try {
    return (await client.acquireTokenSilent({ account, scopes: [apiScope] })).accessToken;
  } catch (error) {
    if (!(error instanceof InteractionRequiredAuthError)) throw error;
    throw new Error("Your Microsoft session has expired. Please sign in again.");
  }
}

export async function signOutMicrosoft() {
  const client = await getInstance();
  await client.logoutPopup({ account: client.getActiveAccount() ?? undefined, mainWindowRedirectUri: window.location.origin });
}
