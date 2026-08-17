import {
  contactChannelLabel,
  formatOrderTotal,
  isReservation,
  paymentLabel,
  type Order,
} from "@/lib/orders";

/**
 * Order notifications (server-only).
 *
 * Every sender returns a result instead of throwing: a notification failure
 * must never lose an order that is already saved in the database.
 */

export interface NotifyResult {
  channel: "telegram" | "email";
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

/* ------------------------------- Telegram ------------------------------- */

/** Escape the characters Telegram's HTML parse mode treats as markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Heading that tells the seller at a glance what kind of request came in. */
function telegramHeading(order: Order): string {
  switch (order.type) {
    case "RESERVATION":
      return `🔖 <b>РЕЗЕРВ ТОВАРУ #${order.id}</b>`;
    case "BUY_NOW":
      return `⚡ <b>КУПІВЛЯ З КАРТКИ ТОВАРУ #${order.id}</b>`;
    default:
      return `🛍️ <b>НОВЕ ЗАМОВЛЕННЯ #${order.id}</b>`;
  }
}

export function buildTelegramMessage(order: Order): string {
  const lines = [
    telegramHeading(order),
    "",
    `👤 <b>Клієнт:</b> ${escapeHtml(`${order.firstName} ${order.lastName}`.trim())}`,
    `📞 <b>Телефон:</b> ${escapeHtml(order.phone)}`,
  ];

  // Keep every way of reaching the customer together, before the order detail.
  if (order.email.trim()) {
    lines.push(`✉️ <b>Email:</b> ${escapeHtml(order.email)}`);
  }

  // A reservation carries no delivery or payment choice — the seller agrees
  // both on the call, so printing empty rows would only add noise.
  if (isReservation(order)) {
    lines.push(
      "",
      "⚠️ <b>Товар зарезервовано.</b> Зателефонуйте клієнту, щоб узгодити спосіб доставки та оплати.",
    );
  } else {
    lines.push(
      `📲 <b>Спосіб зв'язку:</b> ${escapeHtml(contactChannelLabel(order.contactChannel))}`,
      `📍 <b>Доставка:</b> ${escapeHtml(order.city)}, ${escapeHtml(order.warehouse)}`,
      `💳 <b>Спосіб оплати:</b> ${escapeHtml(paymentLabel(order.paymentMethod))}`,
      `💬 <b>Коментар:</b> ${escapeHtml(order.comment.trim() || "Відсутній")}`,
    );
  }

  lines.push("", "📦 <b>Товари:</b>");
  for (const item of order.items) {
    lines.push(
      `• ${escapeHtml(item.name)} x ${item.quantity} = ` +
        `${(item.price * item.quantity).toLocaleString("uk-UA")} грн`,
    );
  }

  lines.push("", `💰 <b>Загальна сума:</b> ${formatOrderTotal(order.total)}`);
  return lines.join("\n");
}

export async function sendTelegramNotification(
  order: Order,
): Promise<NotifyResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!token || !chatId) {
    console.warn("[notify] Telegram not configured — skipping");
    return { channel: "telegram", ok: false, skipped: true };
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: buildTelegramMessage(order),
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} ${detail.slice(0, 200)}`);
    }
    console.info(`[notify] Telegram sent for order #${order.id}`);
    return { channel: "telegram", ok: true };
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : String(caught);
    console.error(`[notify] Telegram failed for #${order.id}: ${error}`);
    return { channel: "telegram", ok: false, error };
  }
}

/* --------------------------------- Email -------------------------------- */

function emailHeading(order: Order): string {
  switch (order.type) {
    case "RESERVATION":
      return `🔖 Резерв товару #${order.id}`;
    case "BUY_NOW":
      return `⚡ Купівля з картки товару #${order.id}`;
    default:
      return `🛍️ Нове замовлення #${order.id}`;
  }
}

export function buildOrderEmailHtml(order: Order): string {
  const reservation = isReservation(order);
  const rows = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e7e5e4">
            ${escapeHtml(item.name)}
            <div style="color:#78716c;font-size:12px">Код: ${escapeHtml(item.sku)}</div>
          </td>
          <td style="padding:8px;border-bottom:1px solid #e7e5e4;text-align:center">${item.quantity}</td>
          <td style="padding:8px;border-bottom:1px solid #e7e5e4;text-align:right;white-space:nowrap">
            ${(item.price * item.quantity).toLocaleString("uk-UA")} грн
          </td>
        </tr>`,
    )
    .join("");

  const field = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 8px;color:#78716c;white-space:nowrap">${label}</td>
      <td style="padding:6px 8px;font-weight:600;color:#292524">${escapeHtml(value)}</td>
    </tr>`;

  return `<!doctype html>
<html lang="uk"><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#292524">
  <div style="max-width:640px;margin:0 auto;padding:24px">
    <div style="background:#fff;border:1px solid #e7e5e4;border-radius:4px;padding:24px">
      <h1 style="margin:0 0 4px;font-size:20px">${emailHeading(order)}</h1>
      <p style="margin:0 0 20px;color:#78716c;font-size:13px">
        ПанГосподар · ${new Date(order.createdAt).toLocaleString("uk-UA")}
      </p>

      <h2 style="font-size:14px;text-transform:uppercase;color:#78716c;margin:0 0 8px">Клієнт</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
        ${field("Ім'я", `${order.firstName} ${order.lastName}`.trim())}
        ${field("Телефон", order.phone)}
        ${order.email.trim() ? field("Email", order.email) : ""}
        ${reservation ? "" : field("Спосіб зв'язку", contactChannelLabel(order.contactChannel))}
      </table>

      ${
        reservation
          ? `<p style="margin:0 0 20px;padding:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:4px;font-size:14px;color:#9a3412">
        <strong>Товар зарезервовано.</strong> Зателефонуйте клієнту, щоб узгодити спосіб доставки та оплати.
      </p>`
          : `<h2 style="font-size:14px;text-transform:uppercase;color:#78716c;margin:0 0 8px">Доставка та оплата</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
        ${field("Місто", order.city)}
        ${field("Відділення", order.warehouse)}
        ${field("Оплата", paymentLabel(order.paymentMethod))}
        ${field("Коментар", order.comment.trim() || "Відсутній")}
      </table>`
      }

      <h2 style="font-size:14px;text-transform:uppercase;color:#78716c;margin:0 0 8px">Товари</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#fafaf9">
            <th style="padding:8px;text-align:left">Товар</th>
            <th style="padding:8px;text-align:center">К-сть</th>
            <th style="padding:8px;text-align:right">Сума</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <p style="margin-top:16px;text-align:right;font-size:18px;font-weight:800">
        Загальна сума: ${formatOrderTotal(order.total)}
      </p>
    </div>
  </div>
</body></html>`;
}

/**
 * One POST to Resend's REST API (no SDK dependency needed), shared by every
 * message the site sends.
 *
 * Resend's error body is the only place that says *why* a message was refused —
 * an unverified domain, a sandbox sender that may only write to the account
 * owner, a revoked key — so it is carried back in `error` and logged verbatim
 * rather than collapsed into "email failed".
 */
async function sendViaResend(input: {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** Prefix for log lines, e.g. `order #12`. Never contains an address. */
  context: string;
}): Promise<NotifyResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn(`[notify] ${input.context}: RESEND_API_KEY not set — skipping`);
    return { channel: "email", ok: false, skipped: true };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        reply_to: input.replyTo || undefined,
      }),
      // Mail must not hold a Server Action open indefinitely.
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} ${detail.slice(0, 300)}`);
    }
    console.info(`[notify] ${input.context}: email sent`);
    return { channel: "email", ok: true };
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : String(caught);
    console.error(`[notify] ${input.context}: email failed — ${error}`);
    return { channel: "email", ok: false, error };
  }
}

/**
 * Sends via Resend's REST API (no SDK dependency needed).
 * Requires RESEND_API_KEY; ORDER_EMAIL_FROM must be on a verified domain.
 */
export async function sendEmailNotification(
  order: Order,
): Promise<NotifyResult> {
  const to = process.env.ADMIN_EMAIL?.trim();
  // The shop's own invoice may use the shared sandbox sender: it goes to the
  // Resend account owner, which is exactly who ADMIN_EMAIL is. Customer-facing
  // mail below cannot (see `sendPasswordResetEmail`).
  const from = process.env.ORDER_EMAIL_FROM?.trim() || "onboarding@resend.dev";

  if (!to) {
    console.warn("[notify] ADMIN_EMAIL not set — skipping order email");
    return { channel: "email", ok: false, skipped: true };
  }

  return sendViaResend({
    from,
    to,
    subject: `${emailHeading(order)} — ${order.firstName} ${order.lastName}`.trim(),
    html: buildOrderEmailHtml(order),
    replyTo: order.email.trim(),
    context: `order #${order.id}`,
  });
}

/* --------------------------- password reset mail -------------------------- */

export function buildPasswordResetEmailHtml(
  link: string,
  ttlMinutes: number,
): string {
  // `link` carries a base64url token and the site's own origin — no user input
  // reaches this template — but it is escaped anyway, so this stays safe if the
  // origin ever becomes configurable by someone else.
  const safeLink = escapeHtml(link).replace(/"/g, "&quot;");
  return `<!doctype html>
<html lang="uk"><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#292524">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#fff;border:1px solid #e7e5e4;border-radius:4px;padding:24px">
      <h1 style="margin:0 0 12px;font-size:20px">Відновлення пароля</h1>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6">
        Ви (або хтось інший) попросили відновити пароль до особистого кабінету
        ПанГосподар. Натисніть кнопку нижче, щоб задати новий пароль.
      </p>
      <p style="margin:0 0 20px">
        <a href="${safeLink}"
           style="display:inline-block;background:#ff6b00;color:#fff;text-decoration:none;
                  font-weight:700;font-size:15px;padding:12px 24px;border-radius:4px">
          Задати новий пароль
        </a>
      </p>
      <p style="margin:0 0 16px;font-size:13px;color:#78716c;line-height:1.6">
        Посилання дійсне ${ttlMinutes} хвилин і спрацює лише один раз.
        Якщо ви цього не просили — просто проігноруйте цей лист, ваш пароль
        залишиться без змін.
      </p>
      <p style="margin:0;font-size:12px;color:#a8a29e;word-break:break-all">
        Кнопка не працює? Скопіюйте посилання: ${safeLink}
      </p>
    </div>
  </div>
</body></html>`;
}

/**
 * Can reset mail actually be delivered to an arbitrary customer?
 *
 * Checked *before* the account lookup so an unconfigured shop shows the same
 * honest error to everyone — reporting it only when the address happens to
 * exist would turn the form into an account-enumeration oracle.
 */
export function isPasswordResetEmailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.ORDER_EMAIL_FROM?.trim(),
  );
}

/**
 * Send a reset link to the customer.
 *
 * Unlike the order notifications, this one goes to a *customer's* address, not
 * the shop's own — which means Resend needs a verified sending domain
 * (`ORDER_EMAIL_FROM`). With the shared `onboarding@resend.dev` sender, Resend
 * only delivers to the account owner, so every other customer would silently
 * get nothing. Hence the explicit "not configured" result: the caller reports a
 * plain failure to the customer rather than pretending mail was sent.
 */
export async function sendPasswordResetEmail(
  to: string,
  link: string,
  ttlMinutes: number,
): Promise<NotifyResult> {
  const from = process.env.ORDER_EMAIL_FROM?.trim();
  if (!from) {
    console.warn(
      "[notify] password reset: ORDER_EMAIL_FROM not set — a verified sending domain is required to mail a customer",
    );
    return { channel: "email", ok: false, skipped: true };
  }

  // The address itself is never logged — it is the one thing in this flow worth
  // keeping out of the log stream.
  return sendViaResend({
    from,
    to,
    subject: "Відновлення пароля — ПанГосподар",
    html: buildPasswordResetEmailHtml(link, ttlMinutes),
    context: "password reset",
  });
}

/**
 * "Your password has just been changed."
 *
 * The one message in this flow the customer did not ask for, and the reason it
 * exists: a password change is the last step of an account takeover, and this
 * is what turns it into something the owner finds out about the same minute
 * rather than the next time they fail to sign in. Sent for both routes — the
 * reset link and the in-account change.
 */
export function buildPasswordChangedEmailHtml(): string {
  return `<!doctype html>
<html lang="uk"><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#292524">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#fff;border:1px solid #e7e5e4;border-radius:4px;padding:24px">
      <h1 style="margin:0 0 12px;font-size:20px">Пароль змінено</h1>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6">
        Пароль до вашого особистого кабінету ПанГосподар щойно змінили.
        Усі попередні входи на інших пристроях завершено.
      </p>
      <p style="margin:0;padding:12px;background:#fff7ed;border:1px solid #fed7aa;
                border-radius:4px;font-size:14px;line-height:1.6;color:#9a3412">
        <strong>Це були не ви?</strong> Одразу зателефонуйте нам — ми заблокуємо
        доступ до акаунта та перевіримо замовлення.
      </p>
    </div>
  </div>
</body></html>`;
}

export async function sendPasswordChangedEmail(
  to: string,
): Promise<NotifyResult> {
  const from = process.env.ORDER_EMAIL_FROM?.trim();
  if (!from || !to) {
    return { channel: "email", ok: false, skipped: true };
  }
  return sendViaResend({
    from,
    to,
    subject: "Пароль до кабінету змінено — ПанГосподар",
    html: buildPasswordChangedEmailHtml(),
    context: "password changed",
  });
}

/** Fire both channels; never throws. */
export async function notifyNewOrder(order: Order): Promise<NotifyResult[]> {
  return Promise.all([
    sendTelegramNotification(order),
    sendEmailNotification(order),
  ]);
}
