# CoverageFit Muse Connector Submission Package

CoverageFit version: **3.20.254**
Build: **CF-MUSE-API-DOCS-1.0**

## Muse form values

**Connection type**  
Raw API

**API URL**  
https://coveragefit.com/api/agent

**OpenAPI specification**  
https://coveragefit.com/openapi.json

**API or MCP documentation**  
https://coveragefit.com/docs/agent-api/

**Access requirements**  
Currently available for CoverageFit's California workflow (US-CA) and existing CoverageFit contacts with a valid CoverageFit contact reference. Requests must pass CoverageFit's contact and consent checks and a fresh authorized Mesh permission evaluation. Supported connector actions are limited to requesting a coverage review, scheduling a callback, and connecting with a licensed agent. The connector does not bind insurance coverage, return carrier pricing, expose raw CRM data, accept payments, or send unrestricted marketing.

**Authentication methods**  
Other

**Authentication description**  
CoverageFit uses custom Mesh service authentication via a signed `X-Mesh-Service-Auth` assertion. Authorized requests also include a fresh Mesh authority result and are revalidated against CoverageFit's own contact and consent state. The service assertion is short-lived and replay-protected; it is not a static end-user API key.

## Canonical review URLs

- API discovery: https://coveragefit.com/api/agent
- Capability manifest: https://coveragefit.com/api/agent/capabilities
- OpenAPI: https://coveragefit.com/openapi.json
- Documentation: https://coveragefit.com/docs/agent-api/
- Support: https://coveragefit.com/support/
- Privacy: https://coveragefit.com/privacy/
- Terms: https://coveragefit.com/terms/

## Current capability surface

- `insurance.coverage_review.request`
- `insurance.callback.schedule`
- `insurance.agent.connect`

All three are limited to `US-CA`, existing CoverageFit contact references, fresh Mesh `ALLOW` authority, and CoverageFit's own persisted consent/contact rules.

## Important deployment note

Muse end-to-end review should only be run after the deployed capability manifest reports the intended execution mode. CoverageFit defaults to `PREPARE_ONLY`; `LIVE_BOUNDED` requires explicit runtime enablement and should not be claimed until that configuration has been intentionally validated.
