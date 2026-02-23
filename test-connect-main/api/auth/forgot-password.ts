import { createClient } from "@supabase/supabase-js";

type ThrottleRecord = {
  ipAt?: number;
  emailAt?: number;
};

const WINDOW_MS = 60_000;
const throttleByIp = new Map<string, number>();
const throttleByEmail = new Map<string, number>();

function nowMs() {
  return Date.now();
}

function readIp(req: any): string {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = req.headers?.["x-real-ip"];
  if (typeof realIp === "string" && realIp.length > 0) {
    return realIp.trim();
  }

  return "unknown";
}

function isRateLimited(ip: string, email: string): ThrottleRecord {
  const now = nowMs();
  const ipAt = throttleByIp.get(ip);
  const emailAt = throttleByEmail.get(email);

  return {
    ipAt: ipAt && now - ipAt < WINDOW_MS ? ipAt : undefined,
    emailAt: emailAt && now - emailAt < WINDOW_MS ? emailAt : undefined,
  };
}

function markRequest(ip: string, email: string) {
  const now = nowMs();
  throttleByIp.set(ip, now);
  throttleByEmail.set(email, now);
}

function genericSuccessResponse(res: any) {
  return res.status(200).json({
    ok: true,
    message: "If this email exists, a reset link has been sent.",
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const emailRaw = String(req.body?.email ?? "").trim();
  const email = emailRaw.toLowerCase();

  if (!email) {
    return genericSuccessResponse(res);
  }

  const ip = readIp(req);
  const throttled = isRateLimited(ip, email);

  if (throttled.ipAt || throttled.emailAt) {
    return res.status(429).json({
      ok: false,
      message: "Too many reset requests. Please wait a minute and try again.",
    });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({
      ok: false,
      message: "Server is not configured for password reset.",
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const redirectTo =
    process.env.RESET_PASSWORD_REDIRECT_TO ||
    "https://test-mentor-hazel.vercel.app/auth/reset-password";

  try {
    await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo });
  } catch {
    // intentionally swallow to avoid account enumeration behavior
  }

  markRequest(ip, email);
  return genericSuccessResponse(res);
}
