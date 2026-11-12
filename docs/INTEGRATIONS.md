# Integrations

- **Railway:** intended app and PostgreSQL host. No Railway credentials/deployment configured.
- **Stripe Connect:** standard connected-account onboarding is coded for test keys. Billing gate defaults off. Recurring billing and webhook reconciliation require implementation and sandbox validation.
- **Resend:** optional API email adapter. Set `RESEND_API_KEY` and `EMAIL_FROM`; queued jobs retry when absent or failing.
- **Muse:** no connector/API credentials or verified capabilities were available. No Muse connection is claimed.
- **21st.dev:** current CLI installed locally; account sign-in absent, so no paid or hosted retrieval enabled.

- **Stripe webhook:** verified signatures, connected-account context, idempotent webhook inbox, and application-fee reconciliation are implemented. Validate with Stripe CLI/test account before enabling. Unsupported events remain pending; no successful live financial workflow is claimed.
