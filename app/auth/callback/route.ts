import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { safeNextPath } from "@/lib/supabase/safeNextPath";
import { isEmailConfirmationType } from "@/lib/supabase/authSupport";

function redirectWithoutCaching(path: string, request: NextRequest) {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  const next = safeNextPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const supabase = await createSupabaseServerClient();

  try {
    if (supabase && code && code.length <= 4096) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return redirectWithoutCaching(next, request);
    } else if (supabase && tokenHash && tokenHash.length <= 4096 && isEmailConfirmationType(type)) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (!error) return redirectWithoutCaching(next, request);
    }
  } catch {
    // Expired/malformed links or an unavailable provider should lead back to
    // account help, not leak provider details or strand the user on an error.
  }

  return redirectWithoutCaching("/account?confirmation=failed", request);
}
