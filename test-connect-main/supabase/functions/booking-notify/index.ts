// Supabase Edge Function: booking-notify
// Sends booking status emails to students (best-effort).
//
// Required env vars (set in Supabase Dashboard > Edge Functions > Secrets):
// - RESEND_API_KEY
// - EMAIL_FROM (e.g. "Test Mentor <no-reply@yourdomain.com>")
//
// If RESEND_API_KEY is missing, the function will return 200 but skip sending.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Payload = {
  kind: "request_submitted" | "request_accepted" | "request_declined";
  to: string;
  payload?: {
    test_category?: string;
    test_subtype?: string | null;
    test_date_time?: string;
  };
};

function subjectFor(kind: Payload["kind"]) {
  switch (kind) {
    case "request_submitted":
      return "✅ Request submitted — Test Mentor";
    case "request_accepted":
      return "🎉 Request accepted — Test Mentor";
    case "request_declined":
      return "❌ Request declined — Test Mentor";
  }
}

function htmlFor(input: Payload) {
  const cat = input.payload?.test_category?.replaceAll("_", " ") ?? "";
  const subtype = input.payload?.test_subtype ? ` (${input.payload?.test_subtype})` : "";
  const dt = input.payload?.test_date_time ? new Date(input.payload?.test_date_time).toLocaleString() : "";

  const details = cat || dt
    ? `<p><b>Test:</b> ${cat}${subtype}${dt ? ` — <b>Date:</b> ${dt}` : ""}</p>`
    : "";

  if (input.kind === "request_submitted") {
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Your request was submitted successfully ✅</h2>
        ${details}
        <p>Status: <b>Pending</b> (waiting for teacher review)</p>
        <p>You can track it from your <b>Requests</b> page.</p>
      </div>
    `;
  }

  if (input.kind === "request_accepted") {
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Your request was accepted 🎉</h2>
        ${details}
        <p>Your chat with the teacher is now available in Test Mentor.</p>
      </div>
    `;
  }

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Your request was declined ❌</h2>
      ${details}
      <p>You can submit another request with a different teacher/time.</p>
    </div>
  `;
}

async function sendViaResend(apiKey: string, from: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error: ${res.status} ${text}`);
  }
}

Deno.serve(async (req) => {
  try {
    const body = (await req.json()) as Payload;
    if (!body?.kind || !body?.to) {
      return new Response(JSON.stringify({ ok: false, error: "Missing kind/to" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY") || "";
    const from = Deno.env.get("EMAIL_FROM") || "";

    // If not configured, skip sending but return OK (best-effort)
    if (!resendKey || !from) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const subject = subjectFor(body.kind);
    const html = htmlFor(body);
    await sendViaResend(resendKey, from, body.to, subject, html);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
