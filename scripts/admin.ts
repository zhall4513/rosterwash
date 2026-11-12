import { randomUUID } from 'node:crypto';
import { query,closeDatabase } from '../src/lib/db';
import { hashPassword } from '../src/lib/security';
const email=process.env.ADMIN_EMAIL?.trim().toLowerCase(),password=process.env.ADMIN_PASSWORD;
if(!email||!password||password.length<16)throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (minimum 16 characters) for this command only.');
await query("INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,'Owner',$3,'admin') ON CONFLICT(email) DO NOTHING",[randomUUID(),email,await hashPassword(password)]);
console.log('Admin provisioned if the email was not already registered.');await closeDatabase();
