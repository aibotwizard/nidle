# ADR 0008 — `networkAccess: ["none"]` in the MVP manifest

- **Status:** accepted (will be amended at M3)
- **Date:** 2026-06-23
- **Deciders:** AO, PO
- **Related:** [../../plugin/manifest.json](../../plugin/manifest.json),
  [../constitution.md](../constitution.md) §3.4,
  ADR-0006 (MVP upload-only)

## Context

Figma plugin manifests declare a network-access policy. The relevant
shapes:

- `"allowedDomains": ["none"]` — the iframe cannot `fetch` or load any
  external resource. Strongest posture.
- `"allowedDomains": ["https://gitlab.example.com"]` — fetch limited to
  named hosts.
- `"allowedDomains": ["*"]` — no restriction.

The MVP (ADR-0006) does no network I/O: upload-only, parsing happens
in the iframe, the only cross-boundary traffic is `postMessage` to the
sandbox. M3 introduces GitLab fetch, at which point this policy has to
change.

A separate question: should the MVP ship `["*"]` so M3 doesn't need a
manifest change? No — that would publish unnecessary capability and
defeats constitution §3.4's "no outbound calls beyond configured
GitLab" assertion. The principle is: the manifest reflects what the
build actually needs, no more.

## Decision

The MVP manifest sets `networkAccess.allowedDomains` to `["none"]`. The
UI bundle is single-file and inlined (ADR-0003), so no resource load
is even attempted.

This decision is **scoped to the MVP**. When M3 (GitLab) ships, the
manifest will be amended to either:

- `["<configured-gitlab-host>"]` — installation-time configuration; the
  user (or their admin) enters their GitLab host before the plugin is
  published into their workspace; **or**
- a runtime-resolved list using Figma's `networkAccess.devAllowedDomains`
  + per-install build, if the per-user host requirement turns out to
  be hard to satisfy at publish time.

The choice between those two M3 sub-options is deferred to ADR-0009 (to
be written when M3 starts).

## Consequences

**Positive**

- Strongest possible network posture at MVP. Constitution §3.4
  ("no outbound calls beyond Figma's APIs") is enforced by the
  manifest, not just by code review.
- A reviewer can verify the security claim by reading one line of
  [../../plugin/manifest.json](../../plugin/manifest.json).
- Failure modes are explicit: if anyone accidentally adds a `fetch` or
  a `<script src>`, Figma will block it loudly rather than silently
  succeeding in dev and silently failing in prod.

**Negative**

- Webfonts referenced by the design asset (Inter, JetBrains Mono from
  Google Fonts) are not loaded — addressed in ADR-0003's negative
  consequences. UX accepts the system-font fallback for MVP.
- M3 *will* require a manifest amendment, which is a follow-up ADR
  and a separate PR. That's intentional — the change should be
  visible.
