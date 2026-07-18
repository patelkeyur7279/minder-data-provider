# bad-provider (certification fixture)

This is a deliberately non-compliant provider fixture used by
`tests/provider-certification.test.ts` to assert that `scripts/certify-provider.js` correctly
fails a provider that violates the certification checklist. It is missing the "## Security" and
"## Credentials" sections on purpose.

## Setup

Not documented on purpose — this fixture exists to fail certification.
