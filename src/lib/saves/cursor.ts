import "server-only";
import { uuid,isObject } from "../events/validation";
export type SavedCursor={v:1;at:string;id:string};
export function decodeCursor(value:string):SavedCursor|null{
 try{if(value.length>512||!/^[A-Za-z0-9_-]+$/.test(value))return null;const c:unknown=JSON.parse(Buffer.from(value,"base64url").toString("utf8"));
 if(!isObject(c)||Object.keys(c).sort().join(',')!=='at,id,v'||c.v!==1||!uuid(c.id)||typeof c.at!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(c.at)||!Number.isFinite(Date.parse(c.at)))return null;
 if(new Date(c.at.slice(0,10)+"T00:00:00Z").toISOString().slice(0,10)!==c.at.slice(0,10))return null;
 return c as SavedCursor;}catch{return null;}
}
export const encodeCursor=(at:string,id:string)=>Buffer.from(JSON.stringify({v:1,at,id})).toString("base64url");
