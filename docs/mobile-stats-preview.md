# Mobile Spot Stats preview

Development only: set `SURF_SPOT_STATS_LOCAL_PREVIEW=true` and
`SURF_SPOT_STATS_LAN_HOST` to the exact private IPv4 address and port used by
the phone, for example `10.1.11.199:3165`. Only that Host is accepted in addition
to loopback. Public IPs, other ports/hosts, malformed addresses and production
mode remain denied. Forwarded headers are not trusted.

This is NOT authentication. Anyone on the trusted LAN who can reach the preview
can view it. Do not expose it through a public tunnel or use it as a production
access-control mechanism. Restart with a new explicit value when the network
address changes; omit the value to return to desktop-only preview.

The current preview forwards the specified LAN address to the existing loopback
development server without rewriting Host. No archived data is published or
copied into public assets. Billing and public release gates remain unchanged.

Readability consolidation brought the existing signal-readability branch into
main: rating first, signal explanations, sharing, and validated sportsbook links.
It does not introduce a separate whale feed or historical whale backfill.
