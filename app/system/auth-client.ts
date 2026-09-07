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

export async function signInWithMicrosoft(): Promise<void> {
  // Redirect, not popup: popups fail unpredictably behind third-party storage
  // partitioning, popup blockers, and embedded/iframe previews (block_nested_popups,
  // no_token_request_cache_error). The page navigates away here; restoreAccount()'s
  // handleRedirectPromise() picks up the result after Microsoft redirects back.
  const client = await getInstance();
  await client.loginRedirect({ scopes: ["openid", "profile", "email", apiScope], prompt: "select_account" });
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

const graphFilesScope = "Files.Read";

async function acquireGraphFilesToken(): Promise<string> {
  const client = await getInstance();
  const account = client.getActiveAccount() ?? client.getAllAccounts()[0];
  if (!account) throw new Error("กรุณาเข้าสู่ระบบด้วย Microsoft ก่อน Auto update");
  try {
    return (await client.acquireTokenSilent({ account, scopes: [graphFilesScope] })).accessToken;
  } catch (error) {
    if (!(error instanceof InteractionRequiredAuthError)) throw error;
    const result = await client.acquireTokenPopup({ account, scopes: [graphFilesScope] });
    if (result.account) client.setActiveAccount(result.account);
    return result.accessToken;
  }
}

function graphShareId(sharingUrl: string): string {
  const bytes = new TextEncoder().encode(sharingUrl);
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return `u!${btoa(binary).replaceAll("/", "_").replaceAll("+", "-").replace(/=+$/, "")}`;
}

export async function downloadMicrosoftSharedFile(sharingUrl: string): Promise<Blob> {
  const token = await acquireGraphFilesToken();
  const response = await fetch(`https://graph.microsoft.com/v1.0/shares/${graphShareId(sharingUrl)}/driveItem/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("ไม่สามารถอ่านรายการต้นฉบับจาก Microsoft 365 ได้ กรุณาตรวจสิทธิ์ของบัญชี");
  return response.blob();
}

export async function getMicrosoftSharedFilePreview(sharingUrl: string): Promise<string> {
  const token = await acquireGraphFilesToken();
  const response = await fetch(`https://graph.microsoft.com/v1.0/shares/${graphShareId(sharingUrl)}/driveItem/preview`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (!response.ok) throw new Error("Microsoft 365 ไม่สามารถสร้าง Preview สำหรับไฟล์นี้ได้");
  const preview = await response.json() as { getUrl?: string };
  if (!preview.getUrl) throw new Error("Microsoft 365 ไม่ได้ส่ง URL สำหรับ Preview กลับมา");
  const previewUrl = new URL(preview.getUrl);
  if (previewUrl.protocol !== "https:") throw new Error("Microsoft 365 ส่ง URL สำหรับ Preview ที่ไม่ปลอดภัย");
  return previewUrl.href;
}

/**
 * Forces an interactive Microsoft sign-in immediately before a signature.
 *
 * A signature image proves nothing on its own — it can be pasted. This
 * application holds no password, so the assurance that the person is present is
 * a fresh credential: this deliberately bypasses the silent cache with an
 * interactive prompt, and the API then checks how recently the token was issued
 * and records that evidence in the signature event chain.
 */
export async function reauthenticateForSigning(): Promise<void> {
  const client = await getInstance();
  const account = client.getActiveAccount() ?? client.getAllAccounts()[0];
  if (!account) throw new Error('No signed-in Microsoft account is available.');
  const result = await client.acquireTokenPopup({ account, scopes: [apiScope], prompt: 'login' });
  if (result.account) client.setActiveAccount(result.account);
}

export async function signOutMicrosoft() {
  const client = await getInstance();
  await client.logoutRedirect({ account: client.getActiveAccount() ?? undefined });
}
