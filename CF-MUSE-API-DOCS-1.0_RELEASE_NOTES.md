# CF-MUSE-API-DOCS-1.0 — Release Notes

CoverageFit version: **3.20.254**
Baseline: **3.20.253 / CF-MUSE-LEGAL-SUPPORT-1.0**

## Purpose

Make the existing bounded CoverageFit Agent Capability API reviewable as a Raw API connector without inventing undocumented capabilities or changing insurance execution authority.

## Added

- `GET /api/agent` public discovery endpoint with canonical API, documentation, OpenAPI, support, privacy, and terms links.
- `/openapi.json` OpenAPI 3.0.3 specification for the existing agent capability facade.
- `/docs/agent-api/` human-readable API documentation.
- `MUSE_SUBMISSION_PACKAGE.md` with the canonical Muse form values and paste-ready access/authentication language.
- OpenAPI/documentation entries in the public sitemap and explicit JSON cache/content headers.

## Existing runtime behavior preserved

- Capability build remains `CF-AGENT-CAPABILITY-1.0`.
- Exposed capabilities remain:
  - `insurance.coverage_review.request`
  - `insurance.callback.schedule`
  - `insurance.agent.connect`
- Jurisdiction remains `US-CA`.
- Existing `408d_...` CoverageFit contact reference remains required.
- `mesh-service-auth-v1`, fresh Mesh `ALLOW`, CoverageFit consent/contact rules, idempotency, and replay protection remain unchanged.
- `PREPARE_ONLY` remains the default execution mode; no live execution is enabled by this documentation release.
- No carrier quote/bind endpoint, raw CRM access, payment flow, unrestricted marketing, or new-contact registration is added.

## Database / migration impact

None. Migrations through `0018_cf_agent_capabilities.sql` remain current.
