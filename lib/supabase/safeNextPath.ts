/** Keep authentication redirects on this site, including URL-parser edge cases. */
export function safeNextPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/account";
  const base = "https://surf.invalid";
  try {
    const target = new URL(value, base);
    return target.origin === base ? `${target.pathname}${target.search}${target.hash}` : "/account";
  } catch {
    return "/account";
  }
}
