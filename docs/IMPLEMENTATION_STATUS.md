# Implementation status

## Implemented
- Responsive public landing page, quote request, provider recruitment and application forms.
- PostgreSQL/PGlite schema, migrations, server validation, consent snapshot, deduplication, referral IDs.
- Server-side sessions, partner/admin roles, audit log foundation, rate limits and security headers.
- Closed-by-default geo coverage, exclusive sequential lead routing, offer expiry jobs and provider status updates.
- Basic role-filtered portal; Stripe test connected-account onboarding and locked one-time invoice draft scaffolding.

## Not complete
- Brand image isn't in the checkout, so exact logo/colors are not yet used. Uploaded chat image isn't available as a file.
- Rich admin and partner controls, secure document upload, email delivery credentials, verification UI, complete error handling and accessible visual refinement.
- Stripe recurring billing, webhook reconciliation, refunds, ledger and tested commission collection remain unimplemented. Billing must remain disabled.
- Playwright visual workflow, actual Railway deployment and current live integration documentation not verified.
- Password recovery issue/reset endpoints and pages are wired through hashed, expiring, single-use tokens. Delivery still requires Resend configuration.
- Private provider document upload/download supports PDFs and common images with size and signature checks. Admin can mark documents reviewed.
- Admin can add metro coverage and toggle intake; partner review and customer verification views exist.
- Stripe webhook signatures are verified, events are stored idempotently, and a worker reconciles verified application-fee events against successful connected charges. Unsupported or mismatched events remain retryable/visible for review. This code has not been exercised against Stripe sandbox events; billing stays disabled.
- Playwright public-flow tests pass in the current environment using `/usr/bin/chromium`; Chromium download from Playwright CDN was blocked.
- Providers can now submit referral outcomes and optional notes from their portal. Admin discrepancy state changes are supported with an audit trail. Mobile viewport smoke test added.
- Customer verification page now has a working unsubscribe action that suppresses future contact. The previously incomplete mobile Playwright run was rerun successfully against the system Chromium.
- Admin agreement workflow stores an executed document, requires admin review before marking execution, and blocks provider approval unless reviewed insurance, executed agreement and connected Stripe are all present. An integration test confirms routing excludes a provider with no executed agreement.
- Security headers now preserve Next.js development eval only in development, with tighter production script policy. Robots and sitemap routes cover public pages and keep portals/API paths out of crawl targets. Branded 404 added.
- Partner portal now includes test-mode Stripe connect/refresh actions, private document upload, and protected referral relationship terms. Admin controls include default commission and duration settings.
- Refund and dispute webhook events update idempotent payment records and create review cases in the admin financial cases view. Fee refund collection remains a human review action; sandbox lifecycle has not yet been tested.
- Browser end-to-end test now submits a customer request and verifies the referral ID and waitlist state. Development-only CSRF origin validation accepts loopback host aliases on the same port; production remains bound to APP_URL.
