import { supabaseAdmin } from "../config/supabase.js";

const CONVERSATION_SELECT = `*, product:products(id,title,slug,price,image_urls,status), shop:shops(id,name,slug,logo_url), buyer:profiles!conversations_buyer_id_fkey(id,display_name,avatar_url,university:universities(id,name,acronym)), seller:profiles!conversations_seller_id_fkey(id,display_name,avatar_url,university:universities(id,name,acronym)), messages(id,sender_id,body,read_at,created_at)`;
export class MessagingServiceError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
function mapped(error) {
  const code = error?.message?.match(/(PRODUCT|CONVERSATION|MESSAGE)_[A-Z_]+/)?.[0];
  const map = { PRODUCT_NOT_FOUND: [404,"Product not found."], CONVERSATION_OWN_PRODUCT_FORBIDDEN:[400,"You cannot message your own shop."], CONVERSATION_NOT_FOUND:[404,"Conversation not found."], CONVERSATION_ACCESS_FORBIDDEN:[403,"You cannot access this conversation."], MESSAGE_BODY_INVALID:[400,"Message body is invalid."] };
  return code && map[code] ? new MessagingServiceError(map[code][0],code,map[code][1]) : new MessagingServiceError(503,"MESSAGING_SERVICE_UNAVAILABLE","Messaging is temporarily unavailable.");
}
function present(conversation, userId) {
  const messages = [...(conversation.messages || [])].sort((a,b) => new Date(a.created_at)-new Date(b.created_at));
  return { ...conversation, messages: undefined, latest_message: messages.at(-1) || null, unread_count: messages.filter((m) => m.sender_id !== userId && !m.read_at).length };
}
export async function listConversations(userId) {
  const { data,error } = await supabaseAdmin.from("conversations").select(CONVERSATION_SELECT).or(`buyer_id.eq.${userId},seller_id.eq.${userId}`).order("last_message_at",{ascending:false}).limit(100);
  if(error) throw mapped(error); return data.map((row)=>present(row,userId));
}
export async function startConversation(userId, productId) {
  const {data,error}=await supabaseAdmin.rpc("start_marketplace_conversation",{p_buyer_id:userId,p_product_id:productId});
  if(error) throw mapped(error); return getConversation(data,userId);
}
export async function getConversation(id,userId) {
  const {data,error}=await supabaseAdmin.from("conversations").select(CONVERSATION_SELECT).eq("id",id).maybeSingle();
  if(error) throw mapped(error); if(!data) throw new MessagingServiceError(404,"CONVERSATION_NOT_FOUND","Conversation not found.");
  if(![data.buyer_id,data.seller_id].includes(userId)) throw new MessagingServiceError(403,"CONVERSATION_ACCESS_FORBIDDEN","You cannot access this conversation.");
  return { ...present(data,userId), messages:[...(data.messages||[])].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)) };
}
export async function sendMessage(id,userId,body) {
  const {data,error}=await supabaseAdmin.rpc("send_marketplace_message",{p_conversation_id:id,p_sender_id:userId,p_body:body});
  if(error) throw mapped(error); const {data:message,error:readError}=await supabaseAdmin.from("messages").select().eq("id",data).single();
  if(readError) throw mapped(readError); return message;
}
export async function markConversationRead(id,userId,messageIds) {
  await getConversation(id,userId); let query = supabaseAdmin.from("messages").update({read_at:new Date().toISOString()}).eq("conversation_id",id).neq("sender_id",userId).is("read_at",null);
  if (messageIds) query = query.in("id", messageIds);
  const { error } = await query;
  if(error) throw mapped(error);
}
export async function listNotifications(userId,{unreadOnly=false,limit=50}={}) {
  let query=supabaseAdmin.from("notifications").select("*",{count:"exact"}).eq("user_id",userId).order("created_at",{ascending:false}).limit(limit);
  if(unreadOnly) query=query.is("read_at",null); const {data,error,count}=await query; if(error) throw mapped(error); return {notifications:data,total:count||0};
}
export async function markNotificationRead(id,userId) { const {data,error}=await supabaseAdmin.from("notifications").update({read_at:new Date().toISOString()}).eq("id",id).eq("user_id",userId).select().maybeSingle(); if(error) throw mapped(error); if(!data) throw new MessagingServiceError(404,"NOTIFICATION_NOT_FOUND","Notification not found."); return data; }
export async function markAllNotificationsRead(userId) { const {error}=await supabaseAdmin.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",userId).is("read_at",null); if(error) throw mapped(error); }

export async function unreadMessageCount(userId) {
  const { count, error } = await supabaseAdmin.from("messages")
    .select("id, conversation:conversations!inner(buyer_id,seller_id)", { count: "exact", head: true })
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`, { referencedTable: "conversation" })
    .neq("sender_id", userId).is("read_at", null);
  if (error) throw mapped(error);
  return { count: count || 0 };
}
