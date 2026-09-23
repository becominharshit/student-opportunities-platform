import "server-only";
import { NextRequest,NextResponse } from "next/server";
import { createRequestSupabaseClient } from "../supabase/request";
import { appOrigin } from "../auth/config";
import { uuid } from "../events/validation";
import { saveDestination } from "./policy";
export async function savePost(request:NextRequest){
 const response=NextResponse.redirect(new URL('/saved',appOrigin()),303);
 response.headers.set('Cache-Control','private, no-store, max-age=0');
 let destination='/saved';
 const error=(message:string,status:number)=>{
  const href=destination.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
  const result=new NextResponse(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bookmark not changed</title></head><body><main><h1>Bookmark not changed</h1><p>${message}</p><a href="${href}">Return to opportunities</a></main></body></html>`,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store, max-age=0'}});
  for(const c of response.cookies.getAll())result.cookies.set(c);return result;
 };
 if(request.headers.get('origin')!==appOrigin()||request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/x-www-form-urlencoded')return error('Invalid request. Reload the page and try again.',403);
 try{
  const reader=request.body?.getReader();if(!reader)return error('No form submitted.',400);const chunks:Uint8Array[]=[];let size=0;
  while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>4096){await reader.cancel();return error('This request is too large.',413);}chunks.push(item.value);}
  const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  if([...form.keys()].some(k=>!['event_id','operation','return_to'].includes(k))||[...new Set(form.keys())].some(k=>form.getAll(k).length!==1))return error('Invalid bookmark form.',400);
  const id=form.get('event_id'),operation=form.get('operation');destination=saveDestination(form.get('return_to'));
  if(!uuid(id)||!['save','unsave'].includes(operation??''))return error('Invalid bookmark operation.',400);
  const client=createRequestSupabaseClient(request,response),identity=await client.auth.getUser();
  if(identity.error||!identity.data.user?.email_confirmed_at)return error('Please sign in again before changing a bookmark.',401);
  const userId=identity.data.user.id;
  if(operation==='save'){
   const event=await client.from('events').select('id').eq('id',id!).eq('publication_status','published').maybeSingle();
   if(event.error)return error('Bookmarks are temporarily unavailable. Please retry.',503);
   if(!event.data)return error('This opportunity is not currently available to save.',404);
   const r=await client.from('saved_events').upsert({user_id:userId,event_id:id!},{onConflict:'user_id,event_id',ignoreDuplicates:true});if(r.error)return error('The bookmark could not be saved. Please retry.',503);
  }else{const r=await client.from('saved_events').delete().eq('user_id',userId).eq('event_id',id!);if(r.error)return error('The bookmark could not be removed. Please retry.',503);}
  response.headers.set('Location',new URL(destination,appOrigin()).href);return response;
 }catch{return error('Bookmarks are temporarily unavailable. Please retry.',503);}
}
