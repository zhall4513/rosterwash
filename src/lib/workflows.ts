import { randomUUID, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { query, transaction, type DB, type Row } from './db';
import { audit, digest, hashPassword, HttpError, type User } from './security';
import { businessDeadline, VEHICLES, FREQUENCIES, STATES, SHARE_CONSENT } from './rules';
const text=z.string().trim().min(1).max(200);
const email=z.email().max(254).transform(v=>v.toLowerCase().trim());
const zip=z.string().regex(/^\d{5}$/,'Enter a five-digit ZIP code.');
const phone=z.string().trim().regex(/^[+()\d .-]{10,30}$/,'Enter a valid phone number.');
const vehicles=z.array(z.enum(VEHICLES as [string,...string[]])).min(1).max(9);
export const leadSchema=z.object({business:text,name:text,email,phone,address:text,city:text,state:z.enum(STATES as [string,...string[]]),zip,count:z.coerce.number().int().min(1).max(100000),vehicles,frequency:z.enum(FREQUENCIES as [string,...string[]]),schedule:z.string().max(500).default(''),details:z.string().max(3000).default(''),consent:z.literal(true),submissionKey:z.uuid(),website:z.string().max(0).optional(),utm:z.record(z.string().max(50),z.string().max(200)).optional()});
export const applicationSchema=z.object({legalName:text,dba:z.string().max(200).default(''),name:text,email,phone,address:text,website:z.union([z.url().max(300),z.literal('')]).default(''),zips:z.array(zip).min(1).max(1000),radius:z.coerce.number().int().min(0).max(500),vehicles,capabilities:z.array(z.string().max(100)).max(20).default([]),experience:z.string().max(3000),capacity:z.coerce.number().int().min(1).max(10000),password:z.string().min(12).max(128),acknowledge:z.literal(true)});
export async function enqueue(db:DB,kind:string,key:string,payload:object,runAt=new Date()) {await db.query('INSERT INTO jobs(id,kind,dedupe_key,payload,run_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(dedupe_key) DO NOTHING',[randomUUID(),kind,key,JSON.stringify(payload),runAt]);}
export async function notify(db:DB,kind:string,leadId:string,partnerId:string|null=null){const id=randomUUID();await db.query('INSERT INTO notifications(id,lead_id,partner_id,kind) VALUES($1,$2,$3,$4)',[id,leadId,partnerId,kind]);await enqueue(db,'notification',`notification:${id}`,{notificationId:id});}
export async function history(db:DB,leadId:string,status:string,actor:string|null=null,note=''){await db.query('UPDATE leads SET status=$1 WHERE id=$2',[status,leadId]);await db.query('INSERT INTO status_history(id,lead_id,status,actor_id,note) VALUES($1,$2,$3,$4,$5)',[randomUUID(),leadId,status,actor,note]);}
export async function routeLead(db:DB,leadId:string){
 const {rows:[lead]}=await db.query('SELECT l.*,p.zip FROM leads l JOIN locations p ON p.id=l.location_id WHERE l.id=$1 FOR UPDATE OF l',[leadId]);
 if(!lead||lead.partner_id)return;
 if((await db.query("SELECT 1 FROM offers WHERE lead_id=$1 AND status IN ('Offered','Accepted')",[leadId])).rows.length)return;
 const {rows:[settings]}=await db.query('SELECT * FROM settings WHERE id=1');
 const coverage=await db.query('SELECT 1 FROM regions WHERE active=true AND $1=ANY(zips)',[lead.zip]);
 if(!settings.intake_open||!coverage.rows.length){await history(db,leadId,'Waitlisted');return;}
 const {rows:[partner]}=await db.query(`SELECT p.*,a.id AS agreement_id FROM partners p JOIN LATERAL(SELECT id FROM agreements WHERE partner_id=p.id AND signed_document_ref IS NOT NULL AND signed_at IS NOT NULL ORDER BY acknowledged_at DESC LIMIT 1)a ON true WHERE p.status='Approved' AND p.available=true AND p.insurance_reviewed=true AND p.stripe_ready=true AND $1=ANY(p.zips) AND p.vehicles @> $2::text[] AND NOT EXISTS(SELECT 1 FROM offers o WHERE o.lead_id=$3 AND o.partner_id=p.id) AND (SELECT count(*) FROM offers o WHERE o.partner_id=p.id AND o.status='Offered')<p.capacity ORDER BY p.priority DESC,p.created_at,p.id LIMIT 1`,[lead.zip,lead.vehicles,leadId]);
 if(!partner){await history(db,leadId,'Unmatched');await notify(db,'admin_unmatched',leadId);return;}
 const id=randomUUID(),expires=businessDeadline(new Date(),settings.response_business_hours);
 await db.query("INSERT INTO offers(id,lead_id,partner_id,status,expires_at) VALUES($1,$2,$3,'Offered',$4)",[id,leadId,partner.id,expires]);
 await history(db,leadId,'Offered');await enqueue(db,'expire_offer',`expire:${id}`,{offerId:id},expires);await notify(db,'partner_offer',leadId,partner.id);await audit(db,null,'lead.offered',leadId,{offerId:id,partnerId:partner.id});
}
export async function submitLead(raw:unknown){const data=leadSchema.parse(raw);return transaction(async db=>{
 const previous=await db.query('SELECT referral_code,status FROM leads WHERE submission_key=$1',[data.submissionKey]);if(previous.rows[0])return previous.rows[0];
 const key=digest([data.business.trim().toLowerCase(),data.email,data.address.trim().toLowerCase(),data.zip].join('|'));
 // A transaction-scoped advisory lock closes the duplicate check/insert race across processes.
 await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key]);
 const duplicate=await db.query("SELECT referral_code,status FROM leads WHERE dedupe_key=$1 AND created_at>now()-interval '30 days'",[key]);if(duplicate.rows[0])return duplicate.rows[0];
 let {rows:[org]}=await db.query('SELECT id FROM organizations WHERE identity_key=$1',[key]);
 if(!org){org={id:randomUUID()};await db.query('INSERT INTO organizations(id,name,identity_key) VALUES($1,$2,$3)',[org.id,data.business,key]);}
 const contactId=randomUUID(),locationId=randomUUID(),id=randomUUID();
 await db.query('INSERT INTO contacts(id,organization_id,name,email,phone) VALUES($1,$2,$3,$4,$5)',[contactId,org.id,data.name,data.email,data.phone]);
 await db.query('INSERT INTO locations(id,organization_id,address,city,state,zip) VALUES($1,$2,$3,$4,$5,$6)',[locationId,org.id,data.address,data.city,data.state,data.zip]);
 const {rows:[sequence]}=await db.query("SELECT 'RW-'||lpad(nextval('referral_sequence')::text,7,'0') AS code");
 await db.query('INSERT INTO leads(id,referral_code,organization_id,contact_id,location_id,vehicle_count,vehicles,frequency,schedule,details,dedupe_key,submission_key,utm) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[id,sequence.code,org.id,contactId,locationId,data.count,data.vehicles,data.frequency,data.schedule,data.details,key,data.submissionKey,JSON.stringify(data.utm||{})]);
 await db.query('INSERT INTO consents(id,lead_id,version,purpose,text_snapshot) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,'2026-11-v1','quote_and_request_updates',SHARE_CONSENT]);
 await history(db,id,'New');await routeLead(db,id);await notify(db,'customer_received',id);await audit(db,null,'lead.created',id);
 const {rows:[out]}=await db.query('SELECT referral_code,status FROM leads WHERE id=$1',[id]);return out;
 });}
export async function applyPartner(raw:unknown){const d=applicationSchema.parse(raw);const password=await hashPassword(d.password);return transaction(async db=>{
 if((await db.query('SELECT 1 FROM users WHERE email=$1',[d.email])).rows.length)throw new HttpError(409,'An account already exists. Please sign in or recover access.');
 const id=randomUUID(),uid=randomUUID();const {rows:[s]}=await db.query('SELECT * FROM settings WHERE id=1');
 await db.query('INSERT INTO partners(id,legal_name,dba,email,phone,address,website,zips,radius_miles,vehicles,capabilities,experience,capacity,commission_bps,protection_months) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',[id,d.legalName,d.dba,d.email,d.phone,d.address,d.website,d.zips,d.radius,d.vehicles,d.capabilities,d.experience,d.capacity,s.commission_bps,s.protection_months]);
 await db.query("INSERT INTO users(id,email,name,password_hash,role,partner_id) VALUES($1,$2,$3,$4,'partner',$5)",[uid,d.email,d.name,password,id]);
 await db.query('INSERT INTO agreements(id,partner_id,version,commission_bps,protection_months) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,'draft-2026-11-v1',s.commission_bps,s.protection_months]);
 await audit(db,uid,'partner.applied',id);return {id,userId:uid};
 });}
export async function respondOffer(user:User,offerId:string,accept:boolean){return transaction(async db=>{
 // Lock lead first, consistently with routing and expiry.
 const {rows:[ref]}=await db.query('SELECT lead_id FROM offers WHERE id=$1 AND partner_id=$2',[offerId,user.partner_id]);if(!ref)throw new HttpError(404,'Offer not found.');
 const {rows:[lead]}=await db.query('SELECT * FROM leads WHERE id=$1 FOR UPDATE',[ref.lead_id]);
 const {rows:[offer]}=await db.query('SELECT * FROM offers WHERE id=$1 FOR UPDATE',[offerId]);
 if(offer.status!=='Offered'||new Date(offer.expires_at)<=new Date())throw new HttpError(409,'This offer is no longer available.');
 const {rows:[p]}=await db.query('SELECT * FROM partners WHERE id=$1 FOR UPDATE',[user.partner_id]);
 if(p.status!=='Approved'||!p.available||!p.insurance_reviewed||!p.stripe_ready)throw new HttpError(409,'Your account is not currently eligible for referrals.');
 const {rows:[agreement]}=await db.query('SELECT * FROM agreements WHERE partner_id=$1 AND signed_at IS NOT NULL AND signed_document_ref IS NOT NULL ORDER BY acknowledged_at DESC LIMIT 1',[p.id]);
 if(accept&&!agreement)throw new HttpError(409,'A reviewed signed agreement is required.');
 await db.query('UPDATE offers SET status=$1,responded_at=now() WHERE id=$2',[accept?'Accepted':'Declined',offerId]);
 if(accept){await db.query('UPDATE leads SET partner_id=$1 WHERE id=$2',[p.id,lead.id]);await db.query('INSERT INTO relationships(id,organization_id,lead_id,partner_id,agreement_id,commission_bps,protection_months) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(partner_id,organization_id) DO NOTHING',[randomUUID(),lead.organization_id,lead.id,p.id,agreement.id,agreement.commission_bps,agreement.protection_months]);await history(db,lead.id,'Accepted',user.id);await notify(db,'customer_matched',lead.id,p.id);}
 else await routeLead(db,lead.id);
 await audit(db,user.id,accept?'offer.accepted':'offer.declined',offerId);return {ok:true};
 });}
export async function updateOutcome(user:User,leadId:string,status:string,note:string){if(!['Contacted','Quoted','Negotiating','Won','Lost','No Response'].includes(status))throw new HttpError(400,'Invalid outcome.');return transaction(async db=>{const {rows:[lead]}=await db.query('SELECT * FROM leads WHERE id=$1 AND partner_id=$2 FOR UPDATE',[leadId,user.partner_id]);if(!lead)throw new HttpError(404,'Referral not found.');await history(db,leadId,status,user.id,note);if(status==='Lost')await enqueue(db,'verification',`lost:${leadId}`,{leadId},new Date(Date.now()+3*86400000));await audit(db,user.id,'lead.outcome',leadId,{status});return {ok:true};});}
export async function expireOffer(offerId:string){await transaction(async db=>{const {rows:[o]}=await db.query('SELECT lead_id FROM offers WHERE id=$1',[offerId]);if(!o)return;await db.query('SELECT id FROM leads WHERE id=$1 FOR UPDATE',[o.lead_id]);const {rows}=await db.query("UPDATE offers SET status='Expired',responded_at=now() WHERE id=$1 AND status='Offered' AND expires_at<=now() RETURNING lead_id",[offerId]);if(rows.length)await routeLead(db,o.lead_id);});}
export async function createVerification(leadId:string){await transaction(async db=>{const {rows:[c]}=await db.query('SELECT c.opted_out FROM leads l JOIN contacts c ON c.id=l.contact_id WHERE l.id=$1',[leadId]);if(!c||c.opted_out)return;const existing=await db.query("SELECT 1 FROM verifications WHERE lead_id=$1 AND created_at>now()-interval '30 days'",[leadId]);if(existing.rows.length)return;const token=randomBytes(32).toString('hex'),id=randomUUID();await db.query("INSERT INTO verifications(id,lead_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '30 days')",[id,leadId,digest(token)]);await enqueue(db,'verification_email',`verification-email:${id}`,{leadId,token});});}
export async function verificationResponse(token:string,response:string){if(!['Yes','Not yet','No'].includes(response))throw new HttpError(400,'Invalid response.');return transaction(async db=>{const {rows:[v]}=await db.query('UPDATE verifications SET response=$1,responded_at=now() WHERE token_hash=$2 AND responded_at IS NULL AND expires_at>now() RETURNING *',[response,digest(token)]);if(!v)throw new HttpError(410,'This verification link has expired or was already used.');const {rows:[lead]}=await db.query('SELECT * FROM leads WHERE id=$1 FOR UPDATE',[v.lead_id]);if(response==='Yes'&&lead.status==='Lost'){await db.query('INSERT INTO discrepancies(id,lead_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[randomUUID(),lead.id]);await history(db,lead.id,'Pending Verification');}await audit(db,null,'verification.responded',v.lead_id,{response});return {ok:true};});}
export async function getLeads(user:User,search=''):Promise<Row[]>{if(user.role==='admin')return (await query(`SELECT l.*,o.name AS business,c.name AS contact_name,c.email,c.phone,p.address,p.city,p.state,p.zip FROM leads l JOIN organizations o ON o.id=l.organization_id JOIN contacts c ON c.id=l.contact_id JOIN locations p ON p.id=l.location_id WHERE (o.name ILIKE $1 OR l.referral_code ILIKE $1) ORDER BY l.created_at DESC LIMIT 200`,[`%${search}%`])).rows;
 // Offered previews are deliberately selected without contact, company, address, notes or UTM data.
 const previews=(await query(`SELECT l.id,l.referral_code,l.vehicle_count,l.vehicles,l.frequency,p.city,p.state,o.id AS offer_id,o.expires_at,'Offered' AS status FROM offers o JOIN leads l ON l.id=o.lead_id JOIN locations p ON p.id=l.location_id WHERE o.partner_id=$1 AND o.status='Offered' AND o.expires_at>now() ORDER BY o.created_at DESC`,[user.partner_id])).rows;
 const accepted=(await query(`SELECT l.*,o.name AS business,c.name AS contact_name,c.email,c.phone,p.address,p.city,p.state,p.zip FROM leads l JOIN organizations o ON o.id=l.organization_id JOIN contacts c ON c.id=l.contact_id JOIN locations p ON p.id=l.location_id WHERE l.partner_id=$1 ORDER BY l.created_at DESC LIMIT 200`,[user.partner_id])).rows;return [...previews,...accepted];}
