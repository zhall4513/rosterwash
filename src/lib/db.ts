import { Pool, type PoolClient } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
export type Row = Record<string, any>;
export interface DB { query<T extends Row = Row>(sql: string, params?: any[]): Promise<{rows:T[]}> }
type State = { db?: Promise<DB>; pool?: Pool; local?: PGlite; tail: Promise<void> };
const g = globalThis as typeof globalThis & { rwdb?:State };
const state = g.rwdb ??= {tail:Promise.resolve()};
export async function database():Promise<DB> {
 return state.db ??= (async()=>{
  if (process.env.NODE_ENV==='production' && !process.env.DATABASE_URL && process.env.ALLOW_LOCAL_DB!=='true') throw new Error('DATABASE_URL is required in production');
  let db:DB;
  if(process.env.DATABASE_URL){state.pool = new Pool({connectionString:process.env.DATABASE_URL,max:10});db=state.pool;}
  else {const dir=process.env.LOCAL_DB_PATH || path.join(process.cwd(),'.data/postgres'); await mkdir(path.dirname(dir),{recursive:true}); state.local=new PGlite(dir);db=state.local as DB;}
  // Each statement is idempotent. Explicit migration command is required before production start.
  if(process.env.NODE_ENV!=='production' || process.env.ALLOW_LOCAL_DB==='true' || process.env.RUN_MIGRATIONS==='true') {
   for(const file of ['001_initial.sql','002_financial_cases.sql']){const sql=await readFile(path.join(process.cwd(),'db/migrations',file),'utf8');if(state.local)await state.local.exec(sql);else await db.query(sql);}
  }
  return db;
 })();
}
export async function query<T extends Row=Row>(sql:string,params:any[]=[]){return (await database()).query<T>(sql,params);}
export async function transaction<T>(fn:(db:DB)=>Promise<T>):Promise<T>{
 await database();
 if(state.pool){const client:PoolClient=await state.pool.connect();try{await client.query('BEGIN');const out=await fn(client);await client.query('COMMIT');return out;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
 let release!:()=>void;const before=state.tail;state.tail=new Promise<void>(r=>{release=r});await before;
 const db=await database();try{await db.query('BEGIN');const out=await fn(db);await db.query('COMMIT');return out;}catch(e){await db.query('ROLLBACK');throw e;}finally{release();}
}
export async function closeDatabase(){await state.pool?.end();await state.local?.close();}
