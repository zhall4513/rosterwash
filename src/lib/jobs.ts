import { randomUUID } from 'node:crypto';
import { reconcileFeeEvent,reconcileExceptionEvent } from './reconcile';
import { query,transaction } from './db';
import { expireOffer,createVerification } from './workflows';
import { deliverNotification,sendEmail } from './email';
export async function runJobs(limit=30){let processed=0,failed=0;
 // A crashed worker's lease is recoverable. Provider requests use durable idempotency keys.
 await query("UPDATE jobs SET status='pending',locked_at=NULL WHERE status='running' AND locked_at<now()-interval '10 minutes'");
 for(let i=0;i<limit;i++){
 const job=await transaction(async db=>{const {rows:[j]}=await db.query("SELECT * FROM jobs WHERE status='pending' AND run_at<=now() ORDER BY run_at FOR UPDATE SKIP LOCKED LIMIT 1");if(!j)return null;await db.query("UPDATE jobs SET status='running',attempts=attempts+1,locked_at=now() WHERE id=$1",[j.id]);return j;});if(!job)break;
 try{
 if(job.kind==='expire_offer')await expireOffer(job.payload.offerId);
 else if(job.kind==='notification')await deliverNotification(job.payload.notificationId);
 else if(job.kind==='verification')await createVerification(job.payload.leadId);
 else if(job.kind==='verification_email'){const {rows:[c]}=await query('SELECT c.email,c.opted_out FROM leads l JOIN contacts c ON c.id=l.contact_id WHERE l.id=$1',[job.payload.leadId]);if(c&&!c.opted_out)await sendEmail(c.email,'A quick follow-up on your fleet request',`Did your company purchase services from the provider we introduced? Answer Yes, Not yet, or No here: ${process.env.APP_URL}/verify#${job.payload.token}\nYou can also opt out of follow-ups at that page.`,job.dedupe_key);}
 else if(job.kind==='stripe_event'){const {rows:[e]}=await query('SELECT type FROM webhook_events WHERE id=$1',[job.payload.eventId]);if(e?.type==='application_fee.created')await reconcileFeeEvent(job.payload.eventId);else await reconcileExceptionEvent(job.payload.eventId);}
 else if(job.kind==='recovery_email')await sendEmail(job.payload.email,'Recover your RosterWash account',`Reset your password using this one-time link: ${process.env.APP_URL}/reset#${job.payload.token}`,job.dedupe_key);
 else throw new Error('Unsupported job type. Administrative review required.');
 await query("UPDATE jobs SET status='completed',last_error=NULL,locked_at=NULL,payload=CASE WHEN kind IN ('recovery_email','verification_email') THEN '{}'::jsonb ELSE payload END WHERE id=$1",[job.id]);processed++;
 }catch(e){const attempts=job.attempts+1;const message=e instanceof Error?e.message:'Job failed';await query('UPDATE jobs SET status=$1,run_at=$2,last_error=$3,locked_at=NULL WHERE id=$4',[attempts>=5?'failed':'pending',new Date(Date.now()+Math.min(3600,60*2**attempts)*1000),message.slice(0,300),job.id]);failed++;}
 }return {processed,failed};}
