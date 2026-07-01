"use server";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function loginAction(formData: FormData) {
  const cookieStore = await cookies();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  // Initialize Supabase SSR Client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    },
  );

  // 1. Log in the user
  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password,
    });

  if (authError) {
    return { error: authError.message };
  }

  const user = authData.user;
  let redirectTo = "/admin/dashboard";

  if (user && user.email) {
    const { data: existingVendor } = await supabase
      .from("vendors")
      .select("username, is_onboarded")
      .eq("email", user.email.toLowerCase())
      .maybeSingle();

    if (!existingVendor) {
      // Brand new user — create the row and send to onboard
      const generatedUsername = `vendor-${Math.floor(1000 + Math.random() * 9000)}`;
      const { error: insertError } = await supabase.from("vendors").insert([
        {
          email: user.email.toLowerCase(),
          name: user.email.split("@")[0],
          username: generatedUsername,
          views: 0,
          is_onboarded: false,
        },
      ]);

      if (insertError) {
        return { error: "Database sync failed: " + insertError.message };
      }

      redirectTo = "/admin/onboard";
    } else if (!existingVendor.is_onboarded) {
      // Existing user but never finished onboarding
      redirectTo = "/admin/onboard";
    } else {
      // Fully onboarded existing user
      redirectTo = "/admin/dashboard";
    }
  }

  return { success: true, redirectTo };
}
