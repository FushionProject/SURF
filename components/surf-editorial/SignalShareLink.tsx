"use client";

import { useState } from "react";

/** A selectable link remains usable on HTTP LAN previews, without clipboard access. */
export function SignalShareLink({ href }: { href: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const [url, setUrl] = useState("");

  async function copyLink() {
    const absolute = new URL(href, window.location.origin).href;
    setUrl(absolute);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(absolute);
      setStatus("copied");
    } catch {
      setStatus("manual");
    }
  }

  return <div className="bn-card-share">
    <button type="button" onClick={copyLink} aria-label="Copy link to this signal">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 4 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0)" />
      </svg>
      Copy link
    </button>
    <span className="bn-card-copy-status" role="status">{status === "copied" ? "Link copied" : status === "manual" ? "Select and copy the link below." : ""}</span>
    {status === "manual" && <div className="bn-card-manual-link">
      <input aria-label="Direct link to this signal" value={url} readOnly onFocus={(event) => event.currentTarget.select()} />
      <a href={href}>Open this signal ↗</a>
    </div>}
  </div>;
}
