export function commission(cents:number,bps:number){if(!Number.isSafeInteger(cents)||cents<0||!Number.isInteger(bps)||bps<0||bps>10000)throw new Error('Invalid money');return Number((BigInt(cents)*BigInt(bps)+5000n)/10000n);}
export function addMonths(date:Date,months:number){const result=new Date(date);const day=result.getUTCDate();result.setUTCDate(1);result.setUTCMonth(result.getUTCMonth()+months);const last=new Date(Date.UTC(result.getUTCFullYear(),result.getUTCMonth()+1,0)).getUTCDate();result.setUTCDate(Math.min(day,last));return result;}
// Business hours mean Monday-Friday, 09:00-17:00 UTC. Holiday calendars are not yet supported.
export function businessDeadline(from:Date,hours:number){let d=new Date(from);let minutes=hours*60;while(minutes>0){d=new Date(d.getTime()+60000);if(d.getUTCDay()>0&&d.getUTCDay()<6&&d.getUTCHours()>=9&&d.getUTCHours()<17)minutes--;}return d;}
export function protectedAt(start:Date|null,end:Date|null,at:Date){return !start||!end||at>=start&&at<end;}
export const VEHICLES=['Delivery vans','Box trucks','Semi tractors','Trailers','Pickup trucks','Service vehicles','Buses','Mixed fleets','Other'];
export const FREQUENCIES=['Weekly','Biweekly','Monthly','Custom','One-time'];
export const STATES='AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
export const SHARE_CONSENT='I agree that RosterWash may share my request and contact information with a suitable independent washing provider to arrange a quote and send updates about this request.';
