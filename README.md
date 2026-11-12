# RosterWash

A fleet-washing referral platform connecting operators with independent providers.

## Local development

```sh
npm ci
npm run dev
```

Local database uses persistent PGlite in `.data/`. Intake defaults closed until an admin activates supported geography. Create an owner in a secure local shell with `ADMIN_EMAIL` and `ADMIN_PASSWORD` (16+ chars), then run `npm run admin:create`. Production must use PostgreSQL. See [deployment](docs/DEPLOYMENT.md) and [status](docs/IMPLEMENTATION_STATUS.md).
