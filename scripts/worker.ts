import { runJobs } from '../src/lib/jobs';
import { closeDatabase } from '../src/lib/db';
if(!process.env.DATABASE_URL)throw new Error('A separate worker requires PostgreSQL. For local PGlite, use the authenticated /api/cron endpoint in the web process.');
console.log(await runJobs());await closeDatabase();
