CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS partners(
 id uuid PRIMARY KEY, legal_name text NOT NULL, dba text, email text NOT NULL UNIQUE, phone text NOT NULL,
 address text NOT NULL, website text, zips text[] NOT NULL, radius_miles integer NOT NULL DEFAULT 25 CHECK(radius_miles BETWEEN 0 AND 500),
 vehicles text[] NOT NULL, capabilities text[] NOT NULL DEFAULT '{}', experience text, capacity integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'Applied' CHECK(status IN ('Applied','Incomplete','Under Review','Approved','Rejected','Suspended','Terminated')),
 available boolean NOT NULL DEFAULT true, priority integer NOT NULL DEFAULT 0,
 commission_bps integer NOT NULL DEFAULT 1000 CHECK(commission_bps BETWEEN 0 AND 10000), protection_months integer NOT NULL DEFAULT 24 CHECK(protection_months BETWEEN 1 AND 120),
 agreement_signed_ref text, insurance_reviewed boolean NOT NULL DEFAULT false, review_notes text,
 stripe_account text UNIQUE, stripe_ready boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users(id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('admin','partner')), partner_id uuid REFERENCES partners(id), created_at timestamptz NOT NULL DEFAULT now(), CHECK((role='partner' AND partner_id IS NOT NULL) OR role='admin'));
CREATE TABLE IF NOT EXISTS sessions(token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS recovery_tokens(token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL, used_at timestamptz);
CREATE TABLE IF NOT EXISTS regions(id uuid PRIMARY KEY, name text NOT NULL, state text NOT NULL CHECK(length(state)=2), zips text[] NOT NULL, active boolean NOT NULL DEFAULT false, waitlist boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS settings(id integer PRIMARY KEY CHECK(id=1), commission_bps integer NOT NULL DEFAULT 1000 CHECK(commission_bps BETWEEN 0 AND 10000), protection_months integer NOT NULL DEFAULT 24 CHECK(protection_months BETWEEN 1 AND 120), response_business_hours integer NOT NULL DEFAULT 24 CHECK(response_business_hours BETWEEN 1 AND 120), intake_open boolean NOT NULL DEFAULT false);
INSERT INTO settings(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE SEQUENCE IF NOT EXISTS referral_sequence START 1001;
CREATE TABLE IF NOT EXISTS organizations(id uuid PRIMARY KEY, name text NOT NULL, identity_key text NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS contacts(id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL, email text NOT NULL, phone text NOT NULL, opted_out boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS locations(id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), address text NOT NULL, city text NOT NULL, state text NOT NULL CHECK(length(state)=2), zip text NOT NULL CHECK(zip ~ '^[0-9]{5}$'));
CREATE TABLE IF NOT EXISTS leads(id uuid PRIMARY KEY, referral_code text NOT NULL UNIQUE, organization_id uuid NOT NULL REFERENCES organizations(id), contact_id uuid NOT NULL REFERENCES contacts(id), location_id uuid NOT NULL REFERENCES locations(id),
 vehicle_count integer NOT NULL CHECK(vehicle_count BETWEEN 1 AND 100000), vehicles text[] NOT NULL, frequency text NOT NULL, schedule text, details text,
 source text NOT NULL DEFAULT 'website', utm jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'New', partner_id uuid REFERENCES partners(id),
 dedupe_key text NOT NULL, submission_key uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS leads_dedupe ON leads(dedupe_key,created_at);
CREATE TABLE IF NOT EXISTS consents(id uuid PRIMARY KEY, lead_id uuid NOT NULL REFERENCES leads(id), version text NOT NULL, purpose text NOT NULL, text_snapshot text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS agreements(id uuid PRIMARY KEY, partner_id uuid NOT NULL REFERENCES partners(id), version text NOT NULL, commission_bps integer NOT NULL, protection_months integer NOT NULL, acknowledged_at timestamptz NOT NULL DEFAULT now(), signed_document_ref text, signed_at timestamptz);
CREATE TABLE IF NOT EXISTS offers(id uuid PRIMARY KEY, lead_id uuid NOT NULL REFERENCES leads(id), partner_id uuid NOT NULL REFERENCES partners(id), status text NOT NULL CHECK(status IN ('Offered','Accepted','Declined','Expired','Revoked')), expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), responded_at timestamptz, UNIQUE(lead_id,partner_id));
CREATE UNIQUE INDEX IF NOT EXISTS one_active_offer ON offers(lead_id) WHERE status='Offered';
CREATE UNIQUE INDEX IF NOT EXISTS one_accepted_offer ON offers(lead_id) WHERE status='Accepted';
CREATE TABLE IF NOT EXISTS relationships(id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), lead_id uuid NOT NULL UNIQUE REFERENCES leads(id), partner_id uuid NOT NULL REFERENCES partners(id), agreement_id uuid NOT NULL REFERENCES agreements(id), commission_bps integer NOT NULL, protection_months integer NOT NULL, starts_at timestamptz, expires_at timestamptz, stripe_customer text, UNIQUE(partner_id,stripe_customer), UNIQUE(partner_id,organization_id));
CREATE TABLE IF NOT EXISTS status_history(id uuid PRIMARY KEY, lead_id uuid NOT NULL REFERENCES leads(id), status text NOT NULL, actor_id uuid REFERENCES users(id), note text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS audit_logs(id uuid PRIMARY KEY, actor_id uuid REFERENCES users(id), action text NOT NULL, entity_id text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS jobs(id uuid PRIMARY KEY, kind text NOT NULL, dedupe_key text NOT NULL UNIQUE, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, run_at timestamptz NOT NULL DEFAULT now(), last_error text, locked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status,run_at);
CREATE TABLE IF NOT EXISTS notifications(id uuid PRIMARY KEY, lead_id uuid REFERENCES leads(id), partner_id uuid REFERENCES partners(id), kind text NOT NULL, status text NOT NULL DEFAULT 'queued', provider_id text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS verifications(id uuid PRIMARY KEY, lead_id uuid NOT NULL REFERENCES leads(id), token_hash text NOT NULL UNIQUE, response text CHECK(response IN ('Yes','Not yet','No')), expires_at timestamptz NOT NULL, responded_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS discrepancies(id uuid PRIMARY KEY, lead_id uuid NOT NULL REFERENCES leads(id), state text NOT NULL DEFAULT 'Informational discrepancy', notes text, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS one_open_discrepancy ON discrepancies(lead_id) WHERE state != 'Resolved';
CREATE TABLE IF NOT EXISTS documents(id uuid PRIMARY KEY, partner_id uuid NOT NULL REFERENCES partners(id), kind text NOT NULL, filename text NOT NULL, content_type text NOT NULL, content bytea NOT NULL, reviewed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS billing_records(id uuid PRIMARY KEY, relationship_id uuid NOT NULL REFERENCES relationships(id), partner_id uuid NOT NULL REFERENCES partners(id), kind text NOT NULL CHECK(kind IN ('recurring','invoice')), amount_cents integer NOT NULL CHECK(amount_cents>0), commission_cents integer NOT NULL CHECK(commission_cents>=0), stripe_id text UNIQUE, status text NOT NULL DEFAULT 'pending', request_key uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS webhook_events(id text PRIMARY KEY, account text NOT NULL, type text NOT NULL, status text NOT NULL DEFAULT 'pending', payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, last_error text);
CREATE TABLE IF NOT EXISTS payments(id text PRIMARY KEY, relationship_id uuid NOT NULL REFERENCES relationships(id), invoice_id text NOT NULL, amount_cents integer NOT NULL CHECK(amount_cents>0), qualifying_cents integer NOT NULL, paid_at timestamptz NOT NULL, application_fee_id text UNIQUE, fee_collected_cents integer NOT NULL DEFAULT 0, refunded_cents integer NOT NULL DEFAULT 0, disputed boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS ledger(id uuid PRIMARY KEY, payment_id text NOT NULL REFERENCES payments(id), kind text NOT NULL, amount_cents integer NOT NULL, external_id text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rate_limits(key text PRIMARY KEY, count integer NOT NULL, resets_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS prospects(id uuid PRIMARY KEY, organization text NOT NULL, email text NOT NULL, source text NOT NULL, status text NOT NULL DEFAULT 'Not contacted', opted_out boolean NOT NULL DEFAULT false, follow_up_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES('001') ON CONFLICT DO NOTHING;
