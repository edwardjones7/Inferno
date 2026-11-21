/**
 * Where the online features live. The URL and the publishable key are public by design
 * (they ship inside every web and app build; row level security protects the data), so they
 * have defaults here and can be overridden per build with NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
 *
 * Everything online is optional: with no network or no account, the app works as before.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://czdbtpvpywtaoxwxhdlc.supabase.co";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_tEIeaZUwM2MTxHwmHHsanA_WKiFv0PK";

export const onlineConfigured = () => !!SUPABASE_URL && !!SUPABASE_KEY;
