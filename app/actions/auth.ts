"use server";

import { redirect } from "next/navigation";
import { hashClientIp } from "@/lib/client-ip";
import {
  checkLoginRateLimit,
  recordFailedLoginAttempt,
} from "@/lib/login-rate-limit";
import { createSession, deleteSession } from "@/lib/session";
import { isAdminTotpEnabled, verifyAdminTotp } from "@/lib/totp";

export interface LoginState {
  error?: string;
}

const encoder = new TextEncoder();

/** Length-aware constant-time string comparison to avoid timing leaks. */
function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

/** Only allow redirecting back to in-app admin paths, never arbitrary URLs. */
function safeRedirectTarget(from: FormDataEntryValue | null): string {
  const value = typeof from === "string" ? from : "";
  return value.startsWith("/admin") ? value : "/admin";
}

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirectTarget(formData.get("from"));

  const expectedUser = process.env.ADMIN_USERNAME?.trim() || "admin";
  const expectedPass = process.env.ADMIN_PASSWORD?.trim();
  const sessionSecret = process.env.SESSION_SECRET?.trim();

  // Both are required. SESSION_SECRET is checked up front because
  // createSession() would otherwise throw *after* a correct password,
  // surfacing as an opaque server error.
  const missing = [
    expectedPass ? null : "ADMIN_PASSWORD",
    sessionSecret ? null : "SESSION_SECRET",
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    console.error(`[auth] Missing environment variables: ${missing.join(", ")}`);
    return {
      error:
        `Сервер не налаштовано: відсутн${missing.length > 1 ? "і змінні" : "я змінна"} ` +
        `${missing.join(", ")}. Додайте ${missing.length > 1 ? "їх" : "її"} у Vercel → ` +
        "Settings → Environment Variables і зробіть Redeploy " +
        "(для локальної роботи — у .env.local).",
    };
  }

  // Checked before the password itself: a scripted brute force gets a flat
  // "try later" long before its guesses matter.
  const ipHash = await hashClientIp("panhospodar-admin-login");
  const limited = await checkLoginRateLimit("admin", ipHash);
  if (limited) {
    return { error: limited };
  }

  // Evaluate both comparisons regardless, so timing does not reveal which failed.
  const userOk = timingSafeEqual(username, expectedUser);
  const passOk = timingSafeEqual(password, expectedPass!);
  // The second factor, when configured, is checked in the same breath as the
  // password and reported with the same wording: an attacker holding a stolen
  // password learns nothing about whether it was the right one.
  const totpOk = isAdminTotpEnabled()
    ? verifyAdminTotp(String(formData.get("code") ?? ""))
    : true;

  if (!userOk || !passOk || !totpOk) {
    await recordFailedLoginAttempt("admin", ipHash);
    return {
      error: isAdminTotpEnabled()
        ? "Невірний логін, пароль або код підтвердження."
        : "Невірний логін або пароль.",
    };
  }

  await createSession(username);
  // redirect() throws internally — keep it outside try/catch.
  redirect(redirectTo);
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
