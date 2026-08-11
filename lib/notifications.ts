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
 * Sends via Resend's REST API (no SDK dependency needed).
 * Requires RESEND_API_KEY; ORDER_EMAIL_FROM must be on a verified domain.
 */
export async function sendEmailNotification(
  order: Order,
): Promise<NotifyResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.ADMIN_EMAIL?.trim();
  const from = process.env.ORDER_EMAIL_FROM?.trim() || "onboarding@resend.dev";

  if (!apiKey || !to) {
    console.warn("[notify] Email not configured — skipping");
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
        from,
        to: [to],
        subject: `${emailHeading(order)} — ${order.firstName} ${order.lastName}`.trim(),
        html: buildOrderEmailHtml(order),
        reply_to: order.email.trim() || undefined,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} ${detail.slice(0, 200)}`);
    }
    console.info(`[notify] Email sent for order #${order.id}`);
    return { channel: "email", ok: true };
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : String(caught);
    console.error(`[notify] Email failed for #${order.id}: ${error}`);
    return { channel: "email", ok: false, error };
  }
}

/** Fire both channels; never throws. */
export async function notifyNewOrder(order: Order): Promise<NotifyResult[]> {
  return Promise.all([
    sendTelegramNotification(order),
    sendEmailNotification(order),
  ]);
}
