// Cloudflare Worker: приём заявок с формы vskrytseif.by и пересылка в Telegram.
//
// Деплой:
//   1. npm install -g wrangler   (если ещё не установлен)
//   2. wrangler login
//   3. wrangler secret put TELEGRAM_BOT_TOKEN     — вставьте токен бота от @BotFather
//   4. wrangler secret put TELEGRAM_CHAT_ID        — id чата/группы, куда слать заявки
//   5. wrangler deploy
//   6. Скопируйте выданный URL (https://<name>.<subdomain>.workers.dev)
//      в assets/js/main.js -> var LEAD_ENDPOINT = "...";
//
// Токен и chat_id НИКОГДА не должны попадать в main.js или другой клиентский код —
// они видны только этому воркеру через секреты Cloudflare.

const ALLOWED_ORIGIN = "https://vskrytseif.by";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request) });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "method_not_allowed" }, 405, request);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return json({ ok: false, error: "bad_json" }, 400, request);
    }

    const name = String(payload.name || "").slice(0, 200).trim();
    const phone = String(payload.phone || "").slice(0, 50).trim();
    const problem = String(payload.problem || "").slice(0, 2000).trim();
    const pageUrl = String(payload.page_url || "").slice(0, 500);
    const utm = payload.utm && typeof payload.utm === "object" ? payload.utm : {};
    const submittedAt = String(payload.submitted_at || new Date().toISOString());

    if (!name || !phone) {
      return json({ ok: false, error: "missing_fields" }, 400, request);
    }

    const utmLines = Object.keys(utm)
      .map((k) => `${escapeHtml(k)}: ${escapeHtml(String(utm[k]))}`)
      .join("\n");

    const text = [
      "🔔 <b>Новая заявка — вскрытьсейф.бел</b>",
      `Имя: ${escapeHtml(name)}`,
      `Телефон: ${escapeHtml(phone)}`,
      problem ? `Описание: ${escapeHtml(problem)}` : "",
      `Страница: ${escapeHtml(pageUrl)}`,
      utmLines ? `UTM:\n${utmLines}` : "",
      `Время: ${escapeHtml(submittedAt)}`
    ]
      .filter(Boolean)
      .join("\n");

    const tgUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const tgRes = await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML"
      })
    });

    if (!tgRes.ok) {
      return json({ ok: false, error: "telegram_error" }, 502, request);
    }

    return json({ ok: true }, 200, request);
  }
};

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(body, status, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders(request))
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
