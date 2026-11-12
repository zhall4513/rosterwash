import { query } from './db';
export async function sendEmail(to:string,subject:string,text:string,idempotencyKey:string){
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)throw new Error('Email provider is not configured. Message retained for retry.');
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[to],subject,text}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(`Email delivery failed (${response.status})`);
 return (await response.json()).id as string;
}
export async function deliverNotification(id:string){
 const {rows:[n]}=await query(`SELECT n.*,l.referral_code,l.vehicle_count,l.frequency,p.city,p.state,c.email AS customer_email,c.opted_out,pr.email AS partner_email,pr.legal_name AS partner_name FROM notifications n JOIN leads l ON l.id=n.lead_id JOIN locations p ON p.id=l.location_id JOIN contacts c ON c.id=l.contact_id LEFT JOIN partners pr ON pr.id=n.partner_id WHERE n.id=$1`,[id]);
 if(!n||n.status==='sent')return;
 const app=process.env.APP_URL||'http://localhost:3000';
 let to=n.customer_email,subject='Your RosterWash request',text=`We received your fleet washing request ${n.referral_code}. We are checking coverage. No provider is assigned until a provider accepts. RosterWash connects customers with independent washing companies.`;
 if(n.kind==='partner_offer'){to=n.partner_email;subject='A fleet referral is available';text=`A fleet of ${n.vehicle_count} vehicles in ${n.city}, ${n.state} requests ${n.frequency.toLowerCase()} washing. Sign in to review the exclusive offer: ${app}/login`;}
 if(n.kind==='customer_matched'){text=`An independent provider, ${n.partner_name}, has accepted your request ${n.referral_code}. They will contact you to discuss pricing and scheduling.`;}
 if(n.kind==='admin_unmatched'){const {rows}=await query("SELECT email FROM users WHERE role='admin' ORDER BY created_at LIMIT 1");if(!rows[0])throw new Error('No administrator configured');to=rows[0].email;subject='A referral needs coverage';text=`A request is unmatched. Review the coverage queue: ${app}/portal/leads`;}
 if(n.opted_out&&!['partner_offer','admin_unmatched'].includes(n.kind)){await query("UPDATE notifications SET status='suppressed' WHERE id=$1",[id]);return;}
 const providerId=await sendEmail(to,subject,text,`notification-${id}`);await query("UPDATE notifications SET status='sent',provider_id=$1 WHERE id=$2",[providerId,id]);
}
