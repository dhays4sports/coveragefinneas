# CoverageFit Agent-Native Capability API

Build: `CF-AGENT-CAPABILITY-1.0`

CoverageFit remains the insurance system of record. The Mesh, Muse, MCP, A2A, ChatGPT, Claude, Gemini, or any other outside agent platform is a distribution/control layer rather than CoverageFit's business-logic owner.

## Endpoints

- `GET /api/agent` — public API discovery metadata and canonical review links.
- `GET /api/agent/capabilities` — public machine-readable capability manifest.
- `POST /api/agent/invoke` — Mesh-authenticated capability invocation.

The initial exposed capabilities are intentionally narrow:

- `insurance.coverage_review.request`
- `insurance.callback.schedule`
- `insurance.agent.connect`

No endpoint binds insurance, quotes carrier pricing, exposes raw CRM data, sends unrestricted marketing, or accepts payment information.

## Execution modes

`COVERAGEFIT_AGENT_EXECUTION_MODE` defaults to `PREPARE_ONLY`.

- `PREPARE_ONLY` validates service authentication, current Mesh authority evidence, CoverageFit contact state, consent, jurisdiction, idempotency, and capability input, then returns a structured non-executing result.
- `LIVE_BOUNDED` enables only the three bounded handlers above. This must be deliberately configured after staging validation.

## Canonical contact reference

The first version requires an existing CoverageFit checkpoint ID (`408d_...`) as `contactRef`. The external agent platform never receives direct access to AgencyZoom, CoverageFit D1 internals, or raw CRM identifiers.

New-contact registration is intentionally not invented here. A live Muse submission should add it only after the platform's real connector schema and consent UX are available for review.

## Mesh service authentication

`POST /api/agent/invoke` requires the `mesh-service-auth-v1` assertion used by The Mesh.

Transport header:

`X-Mesh-Service-Auth: <base64url(JSON assertion)>`

The signature binds the service ID, audience, HTTP method, path, body digest, issued/expiry timestamps, and nonce. CoverageFit persists each nonce in D1 and fails closed on replay.

Required secrets/configuration:

- `COVERAGEFIT_MESH_SERVICE_AUTH_SECRET` — shared service-auth secret, at least 32 characters.
- `COVERAGEFIT_MESH_ALLOWED_SERVICE_IDS` — comma-separated exact service IDs allowed to invoke CoverageFit.
- `COVERAGEFIT_MESH_SERVICE_AUDIENCE` — optional, defaults to `provider:coveragefit`.
- `COVERAGEFIT_AGENT_EXECUTION_MODE` — `PREPARE_ONLY` (default) or `LIVE_BOUNDED`.
- `COVERAGEFIT_AGENT_LIVE_BOUNDED_ENABLED` — must also be explicitly enabled before `LIVE_BOUNDED` can activate; otherwise the runtime stays `PREPARE_ONLY`.

Authentication is not treated as user authority. The request body must also contain a fresh authenticated Mesh authority result with `decision: ALLOW`, and CoverageFit's own persisted contact/consent state remains authoritative for available communication actions.

## Idempotency

Every invocation has an opaque `invocationId`. CoverageFit stores the normalized request digest. Reusing the same ID with the same request returns the prior result; reusing it with different data fails with `409`.

Callback scheduling derives a deterministic booking UUID from the invocation ID, so retry/recovery uses the existing CoverageFit callback idempotency path rather than creating duplicate calendar events.

## Attribution

Agent distribution attribution is stored separately from the customer system-of-record identity:

- `platform`
- `adapterRef`
- `experienceRef`
- `sourceSurface`

This creates the foundation for measuring agent-originated demand without letting a platform listing become CoverageFit identity or authority.

## Invocation envelope

A signed Mesh caller sends the normalized capability request after Mesh-side authority evaluation. Example shape:

```json
{
  "schemaVersion": "1.0",
  "invocationId": "inv:coveragefit:example",
  "capabilityId": "insurance.coverage_review.request",
  "issuedAt": "2026-09-19T20:00:00.000Z",
  "applicationRef": "application:coveragefit",
  "providerRef": "provider:coveragefit",
  "jurisdiction": "US-CA",
  "authority": {
    "decision": "ALLOW",
    "evaluationRef": "authority:evaluation:example",
    "evaluatedAt": "2026-09-19T20:00:00.000Z",
    "permissionRef": "permission:example"
  },
  "distribution": {
    "platform": "MUSE",
    "adapterRef": "adapter:coveragefit:muse",
    "experienceRef": "experience:example",
    "sourceSurface": "muse.connector"
  },
  "input": {
    "contactRef": "408d_<existing CoverageFit checkpoint>",
    "lineOfBusiness": "HOME",
    "state": "CA",
    "reason": "renewal review"
  }
}
```

The external platform's own `approved`, `authorized`, or consent-like fields are not accepted in this envelope. The Mesh authority result must come through the authenticated service boundary, and CoverageFit re-checks its own contact/communication permissions before any bounded live action.


## Public technical documentation

- API base/discovery: `https://coveragefit.com/api/agent`
- Capability manifest: `https://coveragefit.com/api/agent/capabilities`
- OpenAPI 3.0.3: `https://coveragefit.com/openapi.json`
- Human-readable documentation: `https://coveragefit.com/docs/agent-api/`

The OpenAPI and documentation describe the existing `CF-AGENT-CAPABILITY-1.0` runtime. They do not enable `LIVE_BOUNDED`, create new capabilities, provision service credentials, or relax CoverageFit consent/authority checks.

## Public connector-review URLs

For third-party agent-platform review, the current public legal/support destinations are:

- Support: `https://coveragefit.com/support/`
- Privacy: `https://coveragefit.com/privacy/`
- Terms: `https://coveragefit.com/terms/`

The support URL is the canonical submission value when a platform accepts either a support email or URL. CoverageFit does not require a dedicated support mailbox for this release.
