# Decisions
- Start with a low-cost modular monolith, PostgreSQL and Railway.
- Use persistent PGlite locally to make the initial flow runnable without a database service.
- Keep public intake off until real coverage is configured.
- Require human approval for providers and document review.
- Keep Stripe creation behind `BILLING_ENABLED` and test-key checks; recurring billing returns a clear unavailable response.
- Provider identity is an email/password account; passwords use Node scrypt.
- Avoid external design dependencies; logo slot awaits the exact original file.
- Business-hour offer expiration currently counts weekdays 09:00-17:00 UTC and omits holidays. Replace with metro timezone calendars before launch.
