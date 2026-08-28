export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

export function getSupabasePublicConfig(): SupabasePublicConfig | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return undefined;
  return { url, publishableKey };
}
