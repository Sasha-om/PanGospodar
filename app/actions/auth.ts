"use server";

import { redirect } from "next/navigation";
import { createSession, deleteSession } from "@/lib/session";

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

  const expectedUser = process.env.ADMIN_USERNAME ?? "admin";
  const expectedPass = process.env.ADMIN_PASSWORD;

  if (!expectedPass) {
    return {
      error:
        "Сервер не налаштовано: відсутня змінна ADMIN_PASSWORD. Додайте її у .env.local.",
    };
  }

  // Evaluate both comparisons regardless, so timing does not reveal which failed.
  const userOk = timingSafeEqual(username, expectedUser);
  const passOk = timingSafeEqual(password, expectedPass);
  if (!userOk || !passOk) {
    return { error: "Невірний логін або пароль." };
  }

  await createSession(username);
  // redirect() throws internally — keep it outside try/catch.
  redirect(redirectTo);
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
