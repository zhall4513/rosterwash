import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { query,transaction } from './db';
import { HttpError,type User,audit } from './security';
import { commission, protectedAt } from './rules';
import { z } from 'zod';
export function stripeClient(){if(!process.env.STRIPE_SECRET_KEY)throw new HttpError(503,'Stripe is not configured.');return new Stripe(process.env.STRIPE_SECRET_KEY,{maxNetworkRetries:2});}
function requireTestMode(){if(!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'))throw new HttpError(503,'Live billing is locked pending financial and legal validation.');}
export async function connectStripe(user:User){requireTestMode();const stripe=stripeClient();let {rows:[partner]}=await query('SELECT * FROM partners WHERE id=$1',[user.partner_id]);if(!partner)throw new HttpError(404,'Partner not found.');if(!partner.stripe_account){const account=await stripe.accounts.create({type:'standard',country:'US',email:partner.email,metadata:{partner_id:partner.id}},{idempotencyKey:`partner-account-${partner.id}`});await query('UPDATE partners SET stripe_account=$1 WHERE id=$2',[account.id,partner.id]);partner={...partner,stripe_account:account.id};}const app=process.env.APP_URL||'http://localhost:3000';const link=await stripe.accountLinks.create({account:partner.stripe_account,refresh_url:`${app}/portal/partnership`,return_url:`${app}/portal/partnership`,type:'account_onboarding'});return {url:link.url};}
export async function refreshStripe(user:User){requireTestMode();const {rows:[p]}=await query('SELECT stripe_account FROM partners WHERE id=$1',[user.partner_id]);if(!p?.stripe_account)throw new HttpError(409,'Connect Stripe first.');const a=await stripeClient().accounts.retrieve(p.stripe_account);await query('UPDATE partners SET stripe_ready=$1 WHERE id=$2',[Boolean(a.charges_enabled&&a.details_submitted),user.partner_id]);return {ok:true};}
const billingSchema=z.object({relationshipId:z.uuid(),kind:z.enum(['recurring','invoice']),amountCents:z.number().int().positive().max(100000000),description:z.string().trim().min(1).max(300),dueDays:z.number().int().min(0).max(90),interval:z.enum(['week','month']).default('month'),requestKey:z.uuid()});
export async function createBilling(user:User,raw:unknown){const d=billingSchema.parse(raw);requireTestMode();if(process.env.BILLING_ENABLED!=='true')throw new HttpError(503,'Billing is locked until Stripe test validation and agreement review are complete.');
 // Recurring fees need draft-invoice reconciliation and authorization validation before activation.
 if(d.kind==='recurring')throw new HttpError(503,'Recurring billing is awaiting Stripe sandbox validation. No subscription or charge was created.');
 const stripe=stripeClient();
 const {rows:[r]}=await query(`SELECT r.*,p.stripe_account,p.stripe_ready,p.status,c.email,c.name AS contact_name,o.name AS business FROM relationships r JOIN partners p ON p.id=r.partner_id JOIN leads l ON l.id=r.lead_id JOIN contacts c ON c.id=l.contact_id JOIN organizations o ON o.id=r.organization_id WHERE r.id=$1 AND r.partner_id=$2`,[d.relationshipId,user.partner_id]);
 if(!r||r.status!=='Approved'||!r.stripe_ready)throw new HttpError(409,'An approved connected account and accepted customer are required.');
 const existing=await query('SELECT * FROM billing_records WHERE request_key=$1',[d.requestKey]);if(existing.rows[0]?.stripe_id)return {ok:true,message:'Invoice already created.'};
 const fee=protectedAt(r.starts_at?new Date(r.starts_at):null,r.expires_at?new Date(r.expires_at):null,new Date())?commission(d.amountCents,r.commission_bps):0;
 const account={stripeAccount:r.stripe_account};
 if(!r.stripe_customer){const customer=await stripe.customers.create({name:r.business,email:r.email,metadata:{relationship_id:r.id}},{...account,idempotencyKey:`customer-${r.id}`});r.stripe_customer=customer.id;await query('UPDATE relationships SET stripe_customer=$1 WHERE id=$2',[customer.id,r.id]);}
 const id=randomUUID();await query("INSERT INTO billing_records(id,relationship_id,partner_id,kind,amount_cents,commission_cents,request_key) VALUES($1,$2,$3,'invoice',$4,$5,$6) ON CONFLICT(request_key) DO NOTHING",[id,r.id,user.partner_id,d.amountCents,fee,d.requestKey]);
 // Tax, discounts, non-washing lines and external items are deliberately unsupported in this limited test flow.
 const invoice=await stripe.invoices.create({customer:r.stripe_customer,collection_method:'send_invoice',days_until_due:d.dueDays,auto_advance:false,application_fee_amount:fee||undefined,pending_invoice_items_behavior:'exclude',metadata:{relationship_id:r.id,request_key:d.requestKey,qualifying_cents:String(d.amountCents)}},{...account,idempotencyKey:`invoice-${d.requestKey}`});
 await stripe.invoiceItems.create({customer:r.stripe_customer,invoice:invoice.id,amount:d.amountCents,currency:'usd',description:d.description},{...account,idempotencyKey:`item-${d.requestKey}`});
 // Keep the draft: collecting at a later date can change eligibility. Finalization remains gated.
 await query("UPDATE billing_records SET stripe_id=$1,status='test_draft' WHERE request_key=$2",[invoice.id,d.requestKey]);
 await transaction(db=>audit(db,user.id,'billing.test_draft_created',r.id,{invoiceId:invoice.id}));return {ok:true,message:'Stripe test draft created. It was not finalized, sent or charged.'};
}
