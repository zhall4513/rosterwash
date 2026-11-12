import { database,closeDatabase } from '../src/lib/db';
import { readFile } from 'node:fs/promises';
const db=await database();
for(const f of ['001_initial.sql','002_financial_cases.sql'])await db.query(await readFile('db/migrations/'+f,'utf8'));
console.log('Database migration 001 applied.');await closeDatabase();
