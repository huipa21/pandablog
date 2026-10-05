# Spec 02: SSRF-safe outbound requests

Task: **REV-1.4**. Finding: F-04.

## 1. Baseline and scope

The media importer duplicates the shared IP guard. Both miss hex-form IPv4-mapped IPv6 and much of link-local IPv6. Media import pins DNS correctly; webhooks validate DNS then call a separate resolving `fetch`. The image timeout is socket inactivity, not a whole-operation deadline; webhook bodies are not explicitly consumed/cancelled.

Retain content-manager authorization for image import and existing superadmin configuration/test authorization for webhooks. This specification fixes transport policy, not permission escalation assumptions.

## 2. One address policy

Use a maintained, tested IP parser/CIDR implementation or a small rigorously tested binary-address helper. No string-prefix-only IPv6 classification.

- Accept only HTTP/HTTPS URLs with bounded length, valid ports, and no embedded credentials.
- Canonicalize IP literals after URL parsing. IPv4-mapped IPv6 must be converted to its IPv4 meaning before classification.
- Deny loopback, unspecified, private/ULA, link-local, multicast, reserved/non-global destinations, including IPv4 metadata-service ranges and carrier-grade NAT unless an explicit reviewed policy requires them.
- Deny localhost and local-only names; still check every resolved A/AAAA record. A mixed public/private answer fails closed.
- Maintain tests for full `fe80::/10`, `fc00::/7`, mapped addresses in dotted/hex form, IPv4 alternate textual URL forms, compressed/expanded IPv6, and invalid input.
- A library's `isPrivate()` may not mean all non-public space: enumerate the policy and test it.

## 3. Validated connection identity

Expose one internal transport helper for image import and webhooks:

1. Parse/validate URL and start the overall deadline.
2. Resolve all addresses, validate them, select an allowed address.
3. Connect to **that exact address** with original host header, TLS SNI and certificate verification against the original hostname.
4. Follow redirects only for the image flow, with its existing small hop cap; repeat validation/pinning on every hop. Webhooks remain redirect-rejecting.

Avoid default `fetch` doing a second uncontrolled lookup after validation. If using an Undici dispatcher, confirm it supports the installed Node 22 version and bounded lifecycle. Do not add an unbounded per-host agent cache. No insecure TLS options.

## 4. Work and response limits

- Overall deadline covers DNS, connection, redirects, headers and response bytes. Preserve image 10 MiB response cap unless separately changed by media settings/spec; count actual bytes rather than trusting Content-Length.
- Maintain an inactivity timeout as a secondary protection, not a replacement for the overall deadline.
- Abort outbound I/O when the requesting client disconnects where appropriate. Fire-and-forget alerts have their own bounded admission, not a request that can live forever.
- Destroy/cancel unused redirect/error/success bodies. For a webhook that needs only status, do not buffer its response body; close or drain it under a finite cap and deadline.
- Image byte sniffing/decoder validation happens after transport checks. A text/html service response need not be returned to the attacker to make SSRF harmful.
- Queue/drop/coalesce login alerts under a documented finite budget so a failed-login flood cannot launch unlimited webhook requests. Never log webhook credentials or full sensitive URLs.

## 5. Tests and acceptance

Inject resolver and connector independently. Tests must assert **no connection attempt** for denied addresses, not merely that image decoding eventually fails.

- [ ] `http://[::ffff:127.0.0.1]/`, `http://[::ffff:169.254.169.254]/`, and `http://[fe90::1]/` reject before connecting.
- [ ] Public validation followed by a fake DNS change cannot alter the pinned connection target.
- [ ] HTTPS Host/SNI/certificate identity remains the original host; invalid certificates fail.
- [ ] Every redirect hop is checked; redirect response bodies do not stay open.
- [ ] Slow-drip bodies, stalled DNS, excessive body size, malformed headers and client abort clean up within the configured policy.
- [ ] Webhook success/error bodies and any custom agents are disposed; repeated failures leave stable socket/handle counts.
- [ ] Test fixtures use injected connectors/local explicit test overrides only. Never probe real cloud metadata or private services to prove the bypass.
