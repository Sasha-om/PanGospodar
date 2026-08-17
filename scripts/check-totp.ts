/**
 * Verify the admin's second factor WITHOUT locking anyone out.
 *
 *   npm run check:totp             # asks for the code interactively
 *   npm run check:totp -- 123456   # or pass it straight in
 *
 * Two stages, in this order on purpose:
 *
 *   1. The implementation is checked against RFC 6238's own published test
 *      vectors. If this fails, the problem is the code and no amount of
 *      retyping codes will help.
 *   2. YOUR secret (read from the environment, never printed) is checked
 *      against the code your authenticator is showing right now.
 *
 * Run it before trusting 2FA in production: `ADMIN_TOTP_SECRET` being set is
 * already enough to require a code at /login, so a secret that does not match
 * the phone means a locked panel. If stage 2 fails, remove the variable in
 * Vercel and redeploy — the login goes straight back to password-only.
 *
 * Reads `.env.local`. To check the deployed values, pull them first:
 *   npx vercel env pull .env.local
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { config } from "dotenv";
import {
  adminTotpSecretIssue,
  isAdminTotpEnabled,
  verifyAdminTotp,
} from "../lib/totp";

config({ path: ".env.local", quiet: true });

/** ASCII "12345678901234567890" in base32 — the RFC's SHA-1 test key. */
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

let failures = 0;

function check(name: string, ok: boolean): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}`);
}

/** Evaluate `verifyAdminTotp` at a fixed instant, then put the clock back. */
function atTime(unixSeconds: number, code: string, secret: string): boolean {
  const realSecret = process.env.ADMIN_TOTP_SECRET;
  const realNow = Date.now;
  process.env.ADMIN_TOTP_SECRET = secret;
  Date.now = () => unixSeconds * 1000;
  try {
    return verifyAdminTotp(code);
  } finally {
    Date.now = realNow;
    // `process.env.X = undefined` stores the *string* "undefined", which would
    // read downstream as a configured (and, as it happens, valid base32)
    // secret. The key has to be removed instead.
    if (realSecret === undefined) {
      delete process.env.ADMIN_TOTP_SECRET;
    } else {
      process.env.ADMIN_TOTP_SECRET = realSecret;
    }
  }
}

async function main(): Promise<void> {
  console.log("\n1. Перевірка реалізації (тест-вектори RFC 6238)\n");
  // Appendix B: T=59 → 94287082, T=1111111109 → 07081804 (last 6 digits).
  check("код для T=59 приймається", atTime(59, "287082", RFC_SECRET));
  check("код для T=1111111109 приймається", atTime(1111111109, "081804", RFC_SECRET));
  check("чужий код відхиляється", !atTime(59, "000000", RFC_SECRET));
  check("зсув годинника на ±30 с прощається", atTime(89, "287082", RFC_SECRET));
  check("зсув на 90 с уже ні", !atTime(149, "287082", RFC_SECRET));

  if (failures > 0) {
    console.error("\nРеалізація TOTP зламана — далі перевіряти немає сенсу.\n");
    process.exit(1);
  }

  console.log("\n2. Перевірка вашого секрета\n");

  const issue = adminTotpSecretIssue();
  if (issue) {
    console.error(` FAIL  ${issue}\n`);
    process.exit(1);
  }
  if (!isAdminTotpEnabled()) {
    console.log(
      "  --   ADMIN_TOTP_SECRET не задано у .env.local — 2FA вимкнена.\n" +
        "       Щоб перевірити бойові значення: npx vercel env pull .env.local\n",
    );
    return;
  }

  const fromArgs = process.argv.slice(2).join("").replace(/\D/g, "");
  let code = fromArgs;
  if (!code) {
    const rl = createInterface({ input: stdin, output: stdout });
    code = (await rl.question("Введіть 6 цифр із застосунку: ")).replace(/\D/g, "");
    rl.close();
  }

  if (verifyAdminTotp(code)) {
    console.log(
      "\n  ok   Код прийнято. Секрет у .env.local збігається з вашим застосунком.\n" +
        "       Переконайтеся, що у Vercel записано ТОЙ САМИЙ секрет.\n",
    );
    return;
  }

  console.error(
    "\n FAIL  Код не підійшов. Найімовірніші причини:\n" +
      "       • у Vercel/.env.local не той секрет, що в застосунку;\n" +
      "       • секрет введено в застосунок із помилкою;\n" +
      "       • годинник телефона розійшовся більш ніж на 30 секунд.\n" +
      "       Поки не розберетесь — приберіть ADMIN_TOTP_SECRET у Vercel і\n" +
      "       зробіть Redeploy, інакше вхід в /admin буде заблоковано.\n",
  );
  process.exit(1);
}

void main();
