/* u n i chat — responsive Supabase frontend.
   Uses only schema objects confirmed in the repository source. */
(() => {
  "use strict";
  const SUPABASE_URL = "https://zrgbzzxnoylevpwjavwr.supabase.co";
  const SUPABASE_KEY = "sb_publishable_Ajj55K3s5l9_Ty_5-4hIUQ_P06hFE8d";
  const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const $ = id => document.getElementById(id);
  const state = {
  user: null,
  profile: null,
  people: [],
  conversations: [],
  conversation: null,
  partner: null,
  messageChannel: null,
  inboxChannel: null,
  statusChannel: null,
  loaded: new Set(),
  statusGroups: new Map(),
  activeStatuses: [],
  activeStatusIndex: 0,
  selectedFile: null,
  previewUrl: null,
  recorder: null,
  stream: null,
  chunks: [],
  replyTo: null,
  statusColor: "#087f5b",
  avatarUrl: null
};
  const callState = { id:null, type:null, partnerId:null, peer:null, stream:null, signals:null, status:null, incoming:null, offer:null, ice:[], accepted:false, muted:false, camera:true, timer:null, startedAt:null, incomingChannel:null, history:[] };
  const VAPID_PUBLIC_KEY = "BCKiDBhZsdtjkWRAoNZDYb-JCqRDu8v3xjWSueeAmHymIzeYbBqU3BSVoJ6-C8GBqoEpTVzNlR7-72Bu_-gKcUc";
  const ui = {
    auth:$("authView"), app:$("appView"), login:$("loginForm"), signup:$("signupForm"),
    authError:$("authError"), authMessage:$("authMessage"), people:$("peopleList"), messages:$("messages"),
    composer:$("composer"), message:$("messageInput"), send:$("sendBtn"), attach:$("attachBtn"),
    media:$("mediaInput"), voice:$("voiceRecordBtn"), statusList:$("statusList")
  };
  function toast(message){const node=document.createElement("div");node.className="toast";node.textContent=message;$("toastRegion").append(node);setTimeout(()=>node.remove(),3800);}
  function errorText(error){return error?.message||"Something went wrong. Please try again.";}
  function showAuthError(message){ui.authError.textContent=message;ui.authMessage.textContent="";}
  function showAuthMessage(message){ui.authMessage.textContent=message;ui.authError.textContent="";}
  function showLoginMode(){ui.login.classList.remove("hidden");ui.signup.classList.add("hidden");$("showLoginBtn").classList.add("active");$("showSignupBtn").classList.remove("active");$("authHeading").textContent="Welcome back.";$("authSubheading").textContent="Sign in to continue your conversations.";showAuthMessage("");showAuthError("");}
  function showSignupMode(){ui.signup.classList.remove("hidden");ui.login.classList.add("hidden");$("showSignupBtn").classList.add("active");$("showLoginBtn").classList.remove("active");$("authHeading").textContent="Find your people.";$("authSubheading").textContent="Create an account to get started.";showAuthMessage("");showAuthError("");}
  function showSignedOut(){ui.app.classList.add("hidden");$("mobileNav").classList.add("hidden");ui.auth.classList.remove("hidden");}
  function setComposerEnabled(on){ui.message.disabled=!on;ui.send.disabled=!on;ui.attach.disabled=!on;ui.media.disabled=!on;ui.voice.disabled=!on;}
  function cleanChannels(){[state.messageChannel,state.inboxChannel,state.statusChannel,callState.incomingChannel].forEach(ch=>{if(ch)db.removeChannel(ch);});state.messageChannel=state.inboxChannel=state.statusChannel=null;callState.incomingChannel=null;}
  function avatarUrl(path){if(!path)return null;const {data}=db.storage.from("profile-pictures").getPublicUrl(path);return data?.publicUrl||null;}
  function setAvatar(path){const url=avatarUrl(path);state.avatarUrl=url;if(url){$("myProfileAvatar").src=url;$("myProfileAvatar").classList.remove("hidden");$("myProfileAvatarFallback").classList.add("hidden");}else{$("myProfileAvatar").classList.add("hidden");$("myProfileAvatarFallback").classList.remove("hidden");}}
  function setPartnerAvatar(path){const url=avatarUrl(path);if(url){$("partnerAvatar").src=url;$("partnerAvatar").classList.remove("hidden");$("partnerAvatarFallback").classList.add("hidden");}else{$("partnerAvatar").classList.add("hidden");$("partnerAvatarFallback").classList.remove("hidden");}}
  async function loadMyProfile(){const {data,error}=await db.from("profiles").select("id,display_name,username,avatar_path").eq("id",state.user.id).maybeSingle();if(error)throw error;state.profile=data||{id:state.user.id};setAvatar(state.profile.avatar_path);$("profileNameInput").value=state.profile.display_name||"";$("profileUsernameInput").value=state.profile.username||"";$("profilePhotoStatus").textContent=state.profile.avatar_path?"Tap to add an update or change your photo":"Add a picture or share your first update";}
  async function loadPeople(){const {data,error}=await db.from("profiles").select("id,display_name,username,avatar_path").neq("id",state.user.id).order("display_name").limit(100);if(error)throw error;state.people=data||[];renderPeople();}
  async function loadConversations(){state.conversations=[];const {data:memberships,error}=await db.from("conversation_members").select("conversation_id").eq("user_id",state.user.id);if(error)throw error;for(const membership of memberships||[]){const {data:members,error:memberError}=await db.from("conversation_members").select("user_id").eq("conversation_id",membership.conversation_id);if(memberError)continue;const other=members?.find(m=>m.user_id!==state.user.id);if(!other)continue;const profile=state.people.find(p=>p.id===other.user_id)||await fetchProfile(other.user_id);if(!profile)continue;const {data:latest}=await db.from("messages").select("*").eq("conversation_id",membership.conversation_id).eq("deleted_for_everyone",false).order("created_at",{ascending:false}).limit(1).maybeSingle();state.conversations.push({conversationId:membership.conversation_id,profile,lastMessage:latest});}state.conversations.sort((a,b)=>new Date(b.lastMessage?.created_at||0)-new Date(a.lastMessage?.created_at||0));renderPeople();}
  async function fetchProfile(id){const {data}=await db.from("profiles").select("id,display_name,username,avatar_path").eq("id",id).maybeSingle();return data;}
  function personCard(profile,conversation){const row=document.createElement("button");row.type="button";row.className="person-card";row.dataset.person=profile.id;const path=avatarUrl(profile.avatar_path);if(path){const img=document.createElement("img");img.className="person-card-avatar";img.src=path;img.alt="";row.append(img);}else{const avatar=document.createElement("span");avatar.className="person-card-avatar-fallback";avatar.textContent=(profile.display_name||"U").slice(0,1).toUpperCase();row.append(avatar);}const detail=document.createElement("span");detail.className="person-details";const name=document.createElement("span");name.className="person-name-row";const strong=document.createElement("strong");strong.textContent=profile.display_name||"u n i chat member";name.append(strong);detail.append(name);const username=document.createElement("small");username.textContent=profile.username?"@"+profile.username:"Member";detail.append(username);if(conversation?.lastMessage){const preview=document.createElement("small");preview.className="person-preview";preview.textContent=(conversation.lastMessage.sender_id===state.user.id?"You: ":"")||(conversation.lastMessage.body||"Message");preview.textContent=(conversation.lastMessage.sender_id===state.user.id?"You: ":"")+(conversation.lastMessage.body||({voice:"Voice message",image:"Photo",video:"Video"}[conversation.lastMessage.message_type]||"Attachment"));detail.append(preview);}row.append(detail);const action=document.createElement("span");action.className="person-message-btn";action.textContent=conversation?"Open":"Message";row.append(action);row.addEventListener("click",()=>conversation?openConversation(conversation.conversationId,profile):startConversation(profile.id));return row;}
  function renderPeople(){const query=$("peopleSearch").value.trim().toLowerCase();ui.people.replaceChildren();const conversations=state.conversations.filter(c=>`${c.profile.display_name||""} ${c.profile.username||""}`.toLowerCase().includes(query));const used=new Set();conversations.forEach(c=>{ui.people.append(personCard(c.profile,c));used.add(c.profile.id);});const heading=document.createElement("div");heading.className="list-label";heading.textContent="DISCOVER PEOPLE";ui.people.append(heading);const people=state.people.filter(p=>!used.has(p.id)&&`${p.display_name||""} ${p.username||""}`.toLowerCase().includes(query));$("peopleCount").textContent=`${people.length} people`;if(!people.length&&!conversations.length){const empty=document.createElement("div");empty.className="empty-state";empty.textContent=query?"No people matched your search.":"No other members found yet.";ui.people.append(empty);}people.forEach(p=>ui.people.append(personCard(p,null)));}
  async function startConversation(otherId){try{const {data,error}=await db.rpc("start_direct_conversation",{p_other_user_id:otherId});if(error)throw error;if(!data)throw new Error("No conversation was returned.");await loadConversations();const profile=state.people.find(p=>p.id===otherId)||await fetchProfile(otherId);await openConversation(data,profile);}catch(e){toast("Could not start conversation: "+errorText(e));}}
  async function openConversation(id,profile){state.conversation=id;state.partner=profile||await fetchProfileFromConversation(id);state.loaded.clear();if(state.messageChannel)await db.removeChannel(state.messageChannel);$("chatEmptyState").classList.add("hidden");$("chatActive").classList.remove("hidden");$("chatPanel").classList.add("mobile-open");$("partnerName").textContent=state.partner?.display_name||"Private conversation";$("connectionStatus").textContent="Private conversation";setPartnerAvatar(state.partner?.avatar_path);setComposerEnabled(false);ui.messages.replaceChildren();const loading=document.createElement("div");loading.className="system-message";loading.textContent="Loading messages…";ui.messages.append(loading);await loadMessages();setComposerEnabled(true);subscribeMessages(id);$("messageInput").focus();renderPeople();}
  async function fetchProfileFromConversation(id){const {data:members}=await db.from("conversation_members").select("user_id").eq("conversation_id",id);const other=members?.find(m=>m.user_id!==state.user.id);return other?fetchProfile(other.user_id):null;}
  async function loadMessages(){const {data,error}=await db.from("messages").select("*").eq("conversation_id",state.conversation).eq("deleted_for_everyone",false).order("created_at",{ascending:true});if(error){renderSystem("Unable to load messages.");toast(errorText(error));return;}const {data:hidden}=await db.from("message_user_hides").select("message_id").eq("user_id",state.user.id);const hiddenIds=new Set((hidden||[]).map(x=>x.message_id));const visible=(data||[]).filter(m=>!hiddenIds.has(m.id));ui.messages.replaceChildren();if(!visible.length)renderSystem("Your conversation starts here.");visible.forEach(renderMessage);saveOfflineMessages(visible).catch(()=>{});scrollBottom();}
  function renderSystem(text){const el=document.createElement("div");el.className="system-message";el.textContent=text;ui.messages.append(el);}
   function startReply(message) {
  state.replyTo = message;

  const preview = $("replyPreview");
  const previewText = $("replyPreviewText");

  const text =
    message.body ||
    (message.message_type === "image" ? "📷 Photo" :
    message.message_type === "video" ? "🎥 Video" :
    message.message_type === "voice" ? "🎤 Voice message" :
    "Attachment");

  previewText.textContent = text;
  preview.classList.remove("hidden");
  ui.message.focus();
}

function cancelReply() {
  state.replyTo = null;
  $("replyPreview").classList.add("hidden");
  $("replyPreviewText").textContent = "";
}
  async function mediaSignedUrl(path){if(!path)return null;const {data,error}=await db.storage.from("chat-media").createSignedUrl(path,3600);if(error)throw error;return data.signedUrl;}
 async function renderMessage(message) {
  if (!message?.id || state.loaded.has(message.id)) return;
  state.loaded.add(message.id);
  const wrap = document.createElement("article");

wrap.className = "message " + (
  message.sender_id === state.user.id ? "sent" : "received"
);

if (message.reply_to_message_id) {
  const { data: original } = await db
    .from("messages")
    .select("id, body, message_type, sender_id")
    .eq("id", message.reply_to_message_id)
    .eq("conversation_id", state.conversation)
    .maybeSingle();

  if (original) {
    const quote = document.createElement("div");
    quote.className = "reply-quote";

    const label = document.createElement("strong");
    label.textContent =
      original.sender_id === state.user.id
        ? "You"
        : "Replied message";

    const text = document.createElement("div");
    text.textContent =
      original.body ||
      ({
        image: "📷 Photo",
        video: "🎥 Video",
        voice: "🎤 Voice message"
      }[original.message_type] || "Attachment");

    quote.append(label, text);
    wrap.append(quote);
  }
}
  if (message.message_type === "voice" && message.attachment_path) {
    const audio = document.createElement("audio");
    audio.controls = true;
    try {
      audio.src = await mediaSignedUrl(message.attachment_path);
    } catch {
      audio.textContent = "Voice message unavailable";
    }
    wrap.append(audio);
  } else if (
    (message.message_type === "image" ||
     message.message_type === "video") &&
    message.attachment_path
  ) {
    try {
      const url = await mediaSignedUrl(message.attachment_path);
      if (message.message_type === "image") {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "Shared image";
        wrap.append(img);
      } else {
        const video = document.createElement("video");
        video.src = url;
        video.controls = true;
        video.playsInline = true;
        wrap.append(video);
      }
    } catch {
      const p = document.createElement("span");
      p.textContent = "Attachment unavailable";
      wrap.append(p);
    }
  } else {
    const body = document.createElement("div");
    body.textContent = message.body || "Attachment";
    wrap.append(body);
  }
  const time = document.createElement("small");
  time.className = "message-time";
  time.textContent = new Date(message.created_at).toLocaleTimeString(
    [],
    { hour: "2-digit", minute: "2-digit" }
  );
  wrap.append(time);
  const replyButton = document.createElement("button");
  replyButton.type = "button";
  replyButton.className = "message-reply-btn";
  replyButton.textContent = "↩ Reply";
  replyButton.addEventListener("click", () => {
    startReply(message);
  });
  wrap.append(replyButton);
  ui.messages.append(wrap);
  scrollBottom();
} 
  function scrollBottom(){ui.messages.scrollTop=ui.messages.scrollHeight;}
  function subscribeMessages(id){state.messageChannel=db.channel("private-chat-"+id).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"conversation_id=eq."+id},payload=>{if(state.conversation===id){renderMessage(payload.new);loadConversations().catch(()=>{});}}).subscribe(status=>{$("connectionStatus").textContent=status==="SUBSCRIBED"?"Connected":status==="CHANNEL_ERROR"?"Connection problem":"Connecting…";});}
  async function sendTextMessage(body) {
  const { data, error } = await db
    .from("messages")
    .insert({
      conversation_id: state.conversation,
      sender_id: state.user.id,
      body,
      message_type: "text",
      reply_to_message_id: state.replyTo?.id || null
    })
    .select()
    .single();

  if (error) throw error;

  cancelReply();
  renderMessage(data);
  loadConversations().catch(() => {});
  notifySend(data.id);
}
  async function notifySend(id){try{await db.functions.invoke("send-push",{body:{message_id:id}});}catch(e){console.warn("Push send unavailable",e);}}
  async function sendAttachment(file,type){if(file.size>50*1024*1024)throw new Error("File must be smaller than 50 MB.");const ext=(file.name.split(".").pop()||"bin").toLowerCase();const path=`${state.conversation}/${state.user.id}/${crypto.randomUUID()}.${ext}`;const {error:uploadError}=await db.storage.from("chat-media").upload(path,file,{contentType:file.type,upsert:false});if(uploadError)throw uploadError;const {data,error}=await db.from("messages").insert({conversation_id:state.conversation,sender_id:state.user.id,message_type:type,body:null,attachment_path:path}).select().single();if(error){await db.storage.from("chat-media").remove([path]);throw error;}renderMessage(data);notifySend(data.id);}
  async function openOfflineDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open("uni-chat-local",1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains("messages"))req.result.createObjectStore("messages",{keyPath:"cacheKey"});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function saveOfflineMessages(messages){if(!state.user||!state.conversation||!messages.length||!("indexedDB" in window))return;const dbx=await openOfflineDB();return new Promise((resolve,reject)=>{const tx=dbx.transaction("messages","readwrite");messages.forEach(m=>tx.objectStore("messages").put({cacheKey:`${state.user.id}:${state.conversation}:${m.id}`,userId:state.user.id,conversationId:state.conversation,message:m}));tx.oncomplete=()=>{dbx.close();resolve();};tx.onerror=()=>{dbx.close();reject(tx.error);};});}
  async function loadStatuses(){if(!state.user)return;ui.statusList.replaceChildren();const {data:statuses,error}=await db.from("status_updates").select("id,user_id,status_type,text_content,media_path,background_color,created_at,expires_at").gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(100);if(error){ui.statusList.textContent="Unable to load updates: "+error.message;return;}const ids=[...new Set([state.user.id,...(statuses||[]).map(s=>s.user_id)])];const {data:profiles}=await db.from("profiles").select("id,display_name,avatar_path").in("id",ids);const map=new Map((profiles||[]).map(p=>[p.id,p]));const grouped=new Map();(statuses||[]).forEach(s=>{if(!grouped.has(s.user_id))grouped.set(s.user_id,[]);grouped.get(s.user_id).push(s);});state.statusGroups=grouped;const {data:views}=await db.from("status_views").select("status_id").eq("viewer_id",state.user.id).in("status_id",(statuses||[]).map(s=>s.id).filter(Boolean));const viewed=new Set((views||[]).map(v=>v.status_id));function row(uid,mine){const profile=map.get(uid)||{};const items=grouped.get(uid)||[];const el=document.createElement("button");el.type="button";el.className="status-item";const ring=document.createElement("span");ring.className="status-ring"+(items.every(s=>viewed.has(s.id))?" viewed":"");const src=avatarUrl(profile.avatar_path);if(src){const img=document.createElement("img");img.src=src;img.alt="";ring.append(img);}else{const fallback=document.createElement("span");fallback.className="status-fallback";fallback.textContent=(profile.display_name||"U").slice(0,1).toUpperCase();ring.append(fallback);}const copy=document.createElement("span");const strong=document.createElement("strong");strong.textContent=mine?"Your status":profile.display_name||"u n i chat member";const small=document.createElement("small");small.textContent=items.length?new Date(items[0].created_at).toLocaleString():"No updates yet";copy.append(strong,small);el.append(ring,copy);el.addEventListener("click",()=>items.length?openStatusViewer(items,profile.display_name||"Your status"):openActionSheet());return el;}const mine=row(state.user.id,true);ui.statusList.append(mine);[...grouped.keys()].filter(id=>id!==state.user.id).forEach(id=>ui.statusList.append(row(id,false)));if(!statuses?.length){const note=document.createElement("div");note.className="empty-state";note.textContent="No updates yet. Share the first one.";ui.statusList.append(note);}}
  async function openStatusViewer(items,name){state.activeStatuses=[...items].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));state.activeStatusIndex=0;$("statusViewer").classList.remove("hidden");$("statusViewerName").textContent=name;await renderStatus();}
  async function renderStatus(){const item=state.activeStatuses[state.activeStatusIndex];if(!item)return;const content=$("statusViewerContent");content.replaceChildren();$("statusViewerTime").textContent=new Date(item.created_at).toLocaleString();$("statusViewerProgress").replaceChildren();state.activeStatuses.forEach((s,i)=>{const bar=document.createElement("span");bar.style.background=i<=state.activeStatusIndex?"#25d366":"#59625c";$("statusViewerProgress").append(bar);});if(item.status_type==="text"){content.textContent=item.text_content||"";content.style.background=item.background_color||"#087f5b";}else{try{const {data,error}=await db.storage.from("status-media").createSignedUrl(item.media_path,3600);if(error)throw error;if(item.status_type==="image"){const img=document.createElement("img");img.src=data.signedUrl;img.alt="Status photo";content.append(img);}else{const video=document.createElement("video");video.src=data.signedUrl;video.controls=true;video.autoplay=true;video.playsInline=true;content.append(video);}}catch(e){content.textContent="Unable to load this update.";}}if(item.text_content&&item.status_type!=="text"){const cap=document.createElement("p");cap.textContent=item.text_content;content.append(cap);}if(item.user_id!==state.user.id){const {error}=await db.from("status_views").insert({status_id:item.id,viewer_id:state.user.id});if(error&&error.code!=="23505")console.warn(error);}}
  function closeStatusViewer(){$("statusViewer").classList.add("hidden");$("statusViewerContent").replaceChildren();}
  function openActionSheet(){$("actionSheet").classList.remove("hidden");}
  function closeActionSheet(){$("actionSheet").classList.add("hidden");}
  function openStatusComposer(){$("statusComposer").classList.remove("hidden");$("statusChoiceView").classList.remove("hidden");$("textStatusEditor").classList.add("hidden");$("mediaStatusEditor").classList.add("hidden");}
  function closeStatusComposer(){$("statusComposer").classList.add("hidden");state.selectedFile=null;if(state.previewUrl)URL.revokeObjectURL(state.previewUrl);state.previewUrl=null;$("statusMediaInput").value="";}
  async function postTextStatus(){const text=$("textStatusInput").value.trim();if(!text){toast("Write something before posting.");return;}const btn=$("postTextStatus");btn.disabled=true;try{const {error}=await db.from("status_updates").insert({user_id:state.user.id,status_type:"text",text_content:text,background_color:state.statusColor,expires_at:new Date(Date.now()+86400000).toISOString()});if(error)throw error;$("textStatusInput").value="";closeStatusComposer();await loadStatuses();toast("Your status has been shared.");}catch(e){toast("Could not post status: "+errorText(e));}finally{btn.disabled=false;}}
  async function postMediaStatus(){const file=state.selectedFile;if(!file){toast("Choose a photo or video first.");return;}const video=file.type.startsWith("video/");const path=`${state.user.id}/${Date.now()}-${crypto.randomUUID()}.${(file.name.split(".").pop()|| (video?"mp4":"jpg")).toLowerCase()}`;const btn=$("postMediaStatus");btn.disabled=true;let uploaded=false;try{const {error}=await db.storage.from("status-media").upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;uploaded=true;const {error:insertError}=await db.from("status_updates").insert({user_id:state.user.id,status_type:video?"video":"image",media_path:path,text_content:$("mediaStatusCaption").value.trim()||null,expires_at:new Date(Date.now()+86400000).toISOString()});if(insertError)throw insertError;closeStatusComposer();await loadStatuses();toast("Your update has been shared.");}catch(e){if(uploaded)await db.storage.from("status-media").remove([path]);toast("Could not share update: "+errorText(e));}finally{btn.disabled=false;}}
  async function uploadProfilePhoto(file){if(!file||!state.user)return;if(!file.type.startsWith("image/")){toast("Choose an image file.");return;}if(file.size>10*1024*1024){toast("Profile photo must be smaller than 10 MB.");return;}const ext=(file.name.split(".").pop()||"jpg").toLowerCase();const path=`${state.user.id}/${crypto.randomUUID()}.${ext}`;try{const {error:upError}=await db.storage.from("profile-pictures").upload(path,file,{contentType:file.type,upsert:false});if(upError)throw upError;const old=state.profile?.avatar_path;const {error}=await db.from("profiles").update({avatar_path:path}).eq("id",state.user.id);if(error){await db.storage.from("profile-pictures").remove([path]);throw error;}state.profile.avatar_path=path;setAvatar(path);$("profilePhotoStatus").textContent="Tap to add an update or change your photo";if(old)db.storage.from("profile-pictures").remove([old]).then(()=>{});toast("Profile picture updated. No status was created.");}catch(e){toast("Could not update profile picture: "+errorText(e));}}
  async function saveProfile(){const name=$("profileNameInput").value.trim();if(!name||name.length>40){toast("Name must be between 1 and 40 characters.");return;}try{const {error}=await db.from("profiles").update({display_name:name}).eq("id",state.user.id);if(error)throw error;state.profile.display_name=name;toast("Profile updated.");$("profileModal").classList.add("hidden");}catch(e){toast("Could not save profile: "+errorText(e));}}
  async function startVoiceRecording(){if(state.recorder?.state==="recording"){state.recorder.stop();return;}if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast("Voice recording is not supported in this browser.");return;}try{state.stream=await navigator.mediaDevices.getUserMedia({audio:true});const types=["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus"];const mime=types.find(t=>MediaRecorder.isTypeSupported(t));state.recorder=new MediaRecorder(state.stream,mime?{mimeType:mime}:undefined);state.chunks=[];state.recorder.ondataavailable=e=>{if(e.data.size)state.chunks.push(e.data);};state.recorder.onstop=async()=>{const blob=new Blob(state.chunks,{type:state.recorder.mimeType||"audio/webm"});state.stream?.getTracks().forEach(t=>t.stop());state.stream=null;$("recordingStatus").classList.add("hidden");ui.voice.classList.remove("recording");try{await sendVoice(blob);}catch(e){toast("Voice message failed: "+errorText(e));}};state.recorder.start();$("recordingStatus").classList.remove("hidden");ui.voice.classList.add("recording");}catch(e){toast("Microphone unavailable: "+errorText(e));}}
  async function sendVoice(blob){if(blob.size>15*1024*1024)throw new Error("Voice message is too large.");const ext=blob.type.includes("mp4")?"m4a":blob.type.includes("ogg")?"ogg":"webm";const path=`${state.conversation}/${state.user.id}/${crypto.randomUUID()}.${ext}`;const {error:uploadError}=await db.storage.from("chat-media").upload(path,blob,{contentType:blob.type,upsert:false});if(uploadError)throw uploadError;const {data,error}=await db.from("messages").insert({conversation_id:state.conversation,sender_id:state.user.id,message_type:"voice",body:null,attachment_path:path}).select().single();if(error){await db.storage.from("chat-media").remove([path]);throw error;}renderMessage(data);notifySend(data.id);}
  function urlBase64ToUint8Array(value){const padding="=".repeat((4-value.length%4)%4);const base64=(value+padding).replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}
  async function enableNotifications(){if(!state.user){toast("Sign in before enabling notifications.");return;}if(!("Notification"in window)||!("serviceWorker"in navigator)||!("PushManager"in window)){toast("Push notifications are not supported in this browser.");return;}const buttons=[$("enableNotificationsBtn"),$("openNotificationSettings")].filter(Boolean);buttons.forEach(b=>b.disabled=true);try{const permission=await Notification.requestPermission();if(permission!=="granted")throw new Error("Notification permission was not granted.");const registration=await navigator.serviceWorker.ready;let subscription=await registration.pushManager.getSubscription();if(!subscription){subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)});}const json=subscription.toJSON();if(!subscription.endpoint||!json.keys?.p256dh||!json.keys?.auth)throw new Error("The browser returned an incomplete push subscription.");const {data,error}=await db.functions.invoke("save-push-subscription",{body:{endpoint:subscription.endpoint,p256dh:json.keys.p256dh,auth:json.keys.auth}});if(error)throw error;if(!data?.ok)throw new Error(data?.error||"The server did not confirm saving this device.");toast("Push notifications are enabled on this device.");}catch(e){toast("Could not enable notifications: "+errorText(e));}finally{buttons.forEach(b=>b.disabled=false);}}
  function switchSection(section){document.querySelectorAll("[data-section]").forEach(b=>b.classList.toggle("active",b.dataset.section===section));$("sectionHeading").textContent=({chats:"Chats",updates:"Updates",calls:"Calls",settings:"Settings"})[section];$("sectionCaption").textContent=({chats:"Your conversations, all in one place",updates:"Moments from your people",calls:"Your recent calls",settings:"Your account and preferences"})[section];["peoplePanel","updatesPanel","callsPanel","settingsPanel"].forEach(id=>$(id).classList.add("hidden"));({chats:"peoplePanel",updates:"updatesPanel",calls:"callsPanel",settings:"settingsPanel"})[section]&&$(({chats:"peoplePanel",updates:"updatesPanel",calls:"callsPanel",settings:"settingsPanel"})[section]).classList.remove("hidden");if(section==="updates")loadStatuses().catch(e=>console.warn(e));if(section==="calls")loadCallHistory().catch(e=>console.warn(e));if(section==="chats")renderPeople();}
  function subscribeInbox(){if(state.inboxChannel)db.removeChannel(state.inboxChannel);state.inboxChannel=db.channel("inbox-"+state.user.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},payload=>{const m=payload.new;if(m.sender_id!==state.user.id&&m.conversation_id!==state.conversation){toast("New message received.");}loadConversations().catch(()=>{});}).subscribe();}
  async function initialize(user){if(!user||!db)return;state.user=user;ui.auth.classList.add("hidden");ui.app.classList.remove("hidden");$("mobileNav").classList.remove("hidden");switchSection("chats");try{await loadMyProfile();await loadPeople();await loadConversations();await loadStatuses();subscribeInbox();subscribeToIncomingCalls().catch(e=>console.warn("Incoming call setup:",e));loadCallHistory().catch(e=>console.warn("Call history:",e));setComposerEnabled(false);}catch(e){console.error(e);toast("Some account data could not be loaded: "+errorText(e));}}
  function bindEvents(){
     $("cancelReplyBtn").addEventListener("click", cancelReply);
    $("showLoginBtn").addEventListener("click",showLoginMode);$("showSignupBtn").addEventListener("click",showSignupMode);
    document.querySelectorAll(".password-toggle").forEach(btn=>btn.addEventListener("click",()=>{const input=$(btn.dataset.target);input.type=input.type==="password"?"text":"password";btn.textContent=input.type==="password"?"Show":"Hide";}));
    ui.signup.addEventListener("submit",async e=>{e.preventDefault();const displayName=$("displayName").value.trim(),username=$("username").value.trim().toLowerCase(),email=$("signupEmail").value.trim(),password=$("signupPassword").value;if(!displayName||displayName.length>40||! /^[a-zA-Z0-9_]{3,20}$/.test(username)||password.length<8){showAuthError("Check your name, username (3–20 letters/numbers/underscores) and password (8+ characters).");return;}const btn=$("signupBtn");btn.disabled=true;btn.textContent="Creating account…";try{const {data,error}=await db.auth.signUp({email,password,options:{emailRedirectTo:location.href.split("#")[0],data:{display_name:displayName,username}}});if(error)throw error;if(data.session)await initialize(data.user);else showAuthMessage("Account created. Check your email to confirm, then sign in.");}catch(err){showAuthError("Registration failed: "+errorText(err));}finally{btn.disabled=false;btn.textContent="Create account";}});
    ui.login.addEventListener("submit",async e=>{e.preventDefault();const btn=$("loginBtn");btn.disabled=true;btn.textContent="Signing in…";try{const {data,error}=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(error)throw error;await initialize(data.user);}catch(err){showAuthError("Login failed: "+errorText(err));}finally{btn.disabled=false;btn.textContent="Sign in";}});
    $("recoverBtn").addEventListener("click",async()=>{const email=$("email").value.trim();if(!email){showAuthError("Enter your email address first.");return;}try{const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.href.split("#")[0]});if(error)throw error;showAuth
     Message("Password reset instructions have been sent if the account exists.");
}catch(e){showAuthError(errorText(e));}});
    ui.composer.addEventListener("submit",async e=>{e.preventDefault();const body=ui.message.value.trim();if(!body||!state.conversation)return;ui.send.disabled=true;try{await sendTextMessage(body);ui.message.value="";}catch(err){toast("Message could not be sent: "+errorText(err));}finally{ui.send.disabled=false;ui.message.focus();}});
    $("peopleSearch").addEventListener("input",renderPeople);$("newChatBtn").addEventListener("click",()=>{$("peopleSearch").focus();$("peopleSearch").scrollIntoView({behavior:"smooth",block:"center"});});$("emptyFindPeopleBtn").addEventListener("click",()=>{$("peopleSearch").focus();});
    $("backToPeopleBtn").addEventListener("click",()=>{$("chatPanel").classList.remove("mobile-open");$("chatActive").classList.add("hidden");$("chatEmptyState").classList.remove("hidden");state.conversation=null;setComposerEnabled(false);if(state.messageChannel){db.removeChannel(state.messageChannel);state.messageChannel=null;}});                                                                                                                                                          
       document.querySelectorAll("[data-section]").forEach(btn=>btn.addEventListener("click",()=>{switchSection(btn.dataset.section);if(window.innerWidth<=650){$("chatPanel").classList.remove("mobile-open");}}));
    $("mainMenuBtn").addEventListener("click",e=>{e.stopPropagation();$("mainMenu").classList.toggle("hidden");$("mainMenuBtn").setAttribute("aria-expanded",String(!$("mainMenu").classList.contains("hidden")));});document.addEventListener("click",e=>{if(!$("mainMenu").contains(e.target)&&!$("mainMenuBtn").contains(e.target))$("mainMenu").classList.add("hidden");});
    $("menuProfileBtn").addEventListener("click",()=>{$("profileModal").classList.remove("hidden");$("mainMenu").classList.add("hidden");});$("menuSettingsBtn").addEventListener("click",()=>switchSection("settings"));$("menuPrivacyBtn").addEventListener("click",()=>{switchSection("settings");toast("Privacy controls are not exposed by the inspected backend.");});$("menuNotificationsBtn").addEventListener("click",enableNotifications);$("menuHelpBtn").addEventListener("click",()=>toast("For help, review the README included with this project."));$("menuLogoutBtn").addEventListener("click",signOut);
    $("logoutBtn").addEventListener("click",signOut);$("openProfileSettings").addEventListener("click",()=>$("profileModal").classList.remove("hidden"));$("openNotificationSettings").addEventListener("click",enableNotifications);$("openPrivacySettings").addEventListener("click",()=>toast("No privacy preference table or API was found; no inactive toggles are shown."));
    $("myStatusAction").addEventListener("click",openActionSheet);$("myStatusViewBtn").addEventListener("click",()=>{const mine=state.statusGroups.get(state.user.id)||[];if(mine.length)openStatusViewer(mine,"Your status");else openActionSheet();});$("cancelActionSheet").addEventListener("click",closeActionSheet);$("actionSheet").addEventListener("click",e=>{if(e.target===$("actionSheet"))closeActionSheet();});$("addStatusAction").addEventListener("click",()=>{closeActionSheet();openStatusComposer();});$("changeProfilePhotoBtn").addEventListener("click",()=>{closeActionSheet();$("profilePhotoInput").click();});
    $("profilePhotoInput").addEventListener("change",e=>{uploadProfilePhoto(e.target.files?.[0]);e.target.value="";});$("closeStatusComposer").addEventListener("click",closeStatusComposer);$("createTextStatusBtn").addEventListener("click",()=>{$("statusChoiceView").classList.add("hidden");$("textStatusEditor").classList.remove("hidden");});$("mediaStatusOption").addEventListener("click",()=>$("statusMediaInput").click());
        $("statusMediaInput").addEventListener("change",e=>{const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith("image/")&&!file.type.startsWith("video/")){toast("Choose a photo or video.");return;}if(file.size>50*1024*1024){toast("Media must be smaller than 50 MB.");return;}state.selectedFile=file;if(state.previewUrl)URL.revokeObjectURL(state.previewUrl);state.previewUrl=URL.createObjectURL(file);const box=$("statusMediaPreview");box.replaceChildren();const el=document.createElement(file.type.startsWith("video/")?"video":"img");el.src=state.previewUrl;if(el.tagName==="VIDEO"){el.controls=true;el.playsInline=true;}else el.alt="Status preview";box.append(el);$("statusChoiceView").classList.add("hidden");$("mediaStatusEditor").classList.remove("hidden");});$("postTextStatus").addEventListener("click",postTextStatus);$("postMediaStatus").addEventListener("click",postMediaStatus);document.querySelectorAll("[data-color]").forEach(btn=>btn.addEventListener("click",()=>{state.statusColor=btn.dataset.color;$("textStatusEditor").style.background=state.statusColor;$("textStatusEditor").style.color="#fff";}));
    $("closeStatusViewer").addEventListener("click",closeStatusViewer);$("statusViewerContent").addEventListener("click",async e=>{if(e.target.closest("video"))return;const next=e.clientX>innerWidth/2?1:-1;const i=state.activeStatusIndex+next;if(i>=0&&i<state.activeStatuses.length){state.activeStatusIndex=i;await renderStatus();}else if(next>0)closeStatusViewer();});
    $("saveProfileBtn").addEventListener("click",saveProfile);document.querySelectorAll(".close-modal").forEach(b=>b.addEventListener("click",()=>b.closest(".modal-backdrop").classList.add("hidden")));$("profileModal").addEventListener("click",e=>{if(e.target===$("profileModal"))$("profileModal").classList.add("hidden");});
    ui.attach.addEventListener("click",()=>ui.media.click());ui.media.addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;try{const type=file.type.startsWith("video/")?"video":file.type.startsWith("image/")?"image":null;if(!type)throw new Error("Choose an image or video.");await sendAttachment(file,type);}catch(err){toast(errorText(err));}finally{ui.media.value="";}});
  }
  // WebRTC voice/video calling uses the repository's call_sessions and call_signals tables.
  const callEl=id=>$(id);
  function showCallUI(){callEl("callScreen").classList.remove("hidden");}
  function setCallStatus(message){callEl("callStatus").textContent=message;}
  function setCallTimer(){if(callState.timer)clearInterval(callState.timer);callState.startedAt=Date.now();callState.timer=setInterval(()=>{const sec=Math.floor((Date.now()-callState.startedAt)/1000);callEl("callTimer").textContent=String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0");},1000);}
  async function sendCallSignal(type,payload){if(!callState.id||!callState.partnerId||!state.user)throw new Error("Call session is not ready.");const {error}=await db.from("call_signals").insert({call_id:callState.id,sender_id:state.user.id,recipient_id:callState.partnerId,signal_type:type,payload});if(error)throw error;}
  function createCallPeer(){if(callState.peer)callState.peer.close();callState.peer=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}]});const pc=callState.peer;pc.onicecandidate=e=>{if(e.candidate)sendCallSignal("ice-candidate",e.candidate.toJSON()).catch(err=>{console.error(err);setCallStatus("Network signalling failed");});};pc.ontrack=e=>{const stream=e.streams[0];if(callState.type==="video"){callEl("remoteVideo").srcObject=stream;callEl("remoteVideo").classList.remove("hidden");callEl("remoteAudio").srcObject=null;}else{callEl("remoteAudio").srcObject=stream;callEl("remoteAudio").play().catch(()=>{});}};pc.onconnectionstatechange=()=>{if(pc.connectionState==="connected"){setCallStatus("Connected");if(!callState.timer)setCallTimer();}else if(pc.connectionState==="failed"){setCallStatus("Connection failed — try ending and calling again.");}else if(pc.connectionState==="disconnected"){setCallStatus("Connection interrupted…");}};return pc;}
  async function acquireCallMedia(){
    async function startCall(type){
    if(!state.user||!state.conversation)return toast("Open a conversation first.");
    if(callState.id)return toast("A call is already active.");
    try{
      callState.type=type;
      callState.partnerId=state.conversation.userId;
      callState.ice=[];
      callState.accepted=true;
      showCallUI();
      callEl("callPersonName").textContent=state.conversation.name||"Calling…";
      callEl("callAvatar").textContent=(state.conversation.name||"U").slice(0,1).toUpperCase();
      setCallStatus("Starting call…");
      await acquireCallMedia();
      const {data:call,error}=await db.from("call_sessions").insert({
        conversation_id:state.conversation.id,
        caller_id:state.user.id,
        callee_id:callState.partnerId,
        call_type:type,
        status:"ringing"
      }).select().single();
      if(error)throw error;
      callState.id=call.id;
      await subscribeCallSignals();
      await subscribeCallStatus();
      const pc=createCallPeer();
      callState.stream.getTracks().forEach(track=>pc.addTrack(track,callState.stream));
      const offer=await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendCallSignal("offer",offer);
      setCallStatus("Ringing…");
    }catch(err){
      console.error("Call start failed",err);
      await cleanupCall();
      toast("Could not start call: "+errorText(err));
    }
  }
  async function updateCallStatus(status){
    if(!callState.id)return;
    const id=callState.id;
    const {error}=await db.from("call_sessions").update({status}).eq("id",id);
    if(error)throw error;
    if(status==="accepted"){
      callState.accepted=true;
      callEl("incomingCallActions").classList.add("hidden");
      setCallStatus("Preparing connection…");
      if(callState.offer)await answerIncomingOffer();
    }else{
      try{await sendCallSignal("hangup",{status});}catch{}
      await cleanupCall();
    }
  }
  async function cleanupCall(){
    if(callState.timer){clearInterval(callState.timer);callState.timer=null;}
    if(callState.stream){callState.stream.getTracks().forEach(t=>t.stop());callState.stream=null;}
    if(callState.peer){callState.peer.ontrack=null;callState.peer.onicecandidate=null;callState.peer.close();callState.peer=null;}
    if(callState.signals){await db.removeChannel(callState.signals);callState.signals=null;}
    if(callState.status){await db.removeChannel(callState.status);callState.status=null;}
    callEl("localVideo").srcObject=null;
    callEl("remoteVideo").srcObject=null;
    callEl("remoteAudio").srcObject=null;
    callEl("incomingCallActions").classList.add("hidden");
    callEl("callScreen").classList.add("hidden");
    callState.id=null;callState.type=null;callState.partnerId=null;
    callState.incoming=null;callState.offer=null;callState.ice=[];
    callState.accepted=false;callState.muted=false;callState.camera=true;
    callState.startedAt=null;
    callEl("callTimer").textContent="00:00";
    callEl("muteCallBtn").classList.remove("is-off");
    callEl("cameraCallBtn").classList.remove("is-off");
  }
