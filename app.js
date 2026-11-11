// U N I CHAT — authentication, people directory and private messaging

const SUPABASE_URL = "https://zrgbzzxnoylevpwjavwr.supabase.co";
const SUPABASE_KEY = "sb_publishable_Ajj55K3s5l9_Ty_5-4hIUQ_P06hFE8d";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true
}
  }
);
// Main screens
const authView = document.getElementById("authView");
const appView = document.getElementById("appView");
const peoplePanel = document.getElementById("peoplePanel");
const chatPanel = document.getElementById("chatPanel");

// Authentication
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const displayNameInput = document.getElementById("displayName");
const usernameInput = document.getElementById("username");
const signupEmailInput = document.getElementById("signupEmail");
const signupPasswordInput = document.getElementById("signupPassword");
const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");
const authError = document.getElementById("authError");
const authMessage = document.getElementById("authMessage");
const showLoginBtn = document.getElementById("showLoginBtn");
const showSignupBtn = document.getElementById("showSignupBtn");

// Directory
const peopleSearch = document.getElementById("peopleSearch");
const peopleCount = document.getElementById("peopleCount");
const peopleList = document.getElementById("peopleList");
const backToPeopleBtn = document.getElementById("backToPeopleBtn");

// Chat
const messagesContainer = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const composer = document.getElementById("composer");
const attachBtn = document.getElementById("attachBtn");
const mediaInput = document.getElementById("mediaInput");
const partnerName = document.getElementById("partnerName");
const connectionStatus = document.getElementById("connectionStatus");
const logoutBtn = document.getElementById("logoutBtn");
const enableNotificationsBtn = document.getElementById("enableNotificationsBtn");
const voiceRecordBtn = document.getElementById("voiceRecordBtn");
const recordingStatus = document.getElementById("recordingStatus");
// Reply controls
const replyPreview = document.getElementById("replyPreview");
const replyPreviewText = document.getElementById("replyPreviewText");
const cancelReplyBtn = document.getElementById("cancelReplyBtn");

let replyingToMessage = null;

let currentUser = null;
let currentConversation = null;
let realtimeChannel = null;
let loadedMessageIds = new Set();
let initializationInProgress = false;
let peopleCache = [];
let conversationCache = [];
let inboxRealtimeChannel = null;
let inboxRefreshTimer = null;
let editingMessageId = null;
let messageActionMenu = null;
// ---------------- PUSH NOTIFICATIONS ----------------

const VAPID_PUBLIC_KEY =
  "BCKiDBhZsdtjkWRAoNZDYb-JCqRDu8v3xjWSueeAmHymIzeYbBqU3BSVoJ6-C8GBqoEpTVzNlR7-72Bu_-gKcUc";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = atob(base64);
  return Uint8Array.from(rawData, char => char.charCodeAt(0));
}

function encodePushKey(key) {
  return btoa(String.fromCharCode(...new Uint8Array(key)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

enableNotificationsBtn.addEventListener("click", async () => {
  if (!currentUser) {
    alert("Please sign in first.");
    return;
  }

  if (!("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)) {
    alert("Push notifications are not supported by this browser.");
    return;
  }

  try {
    enableNotificationsBtn.disabled = true;
    enableNotificationsBtn.textContent = "…";

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      throw new Error("Notification permission was not granted.");
    }

    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    const subscriptionData = subscription.toJSON();

    const { error } = await db
      .from("push_subscriptions")
      .upsert({
        user_id: currentUser.id,
        endpoint: subscription.endpoint,
        p256dh: subscriptionData.keys.p256dh,
        auth: subscriptionData.keys.auth,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "endpoint"
      });

    if (error) throw error;

    enableNotificationsBtn.textContent = "🔔";
    alert("Notifications enabled successfully! 💗");

  } catch (error) {
    console.error("Notification setup failed:", error);
    enableNotificationsBtn.textContent = "🔔";
    alert("Could not enable notifications: " + error.message);

  } finally {
    enableNotificationsBtn.disabled = false;
  }
});
// Send a push notification to the other chat participant
async function sendPushNotification(messageId) {
  try {
    const { error } = await db.functions.invoke("send-push", {
      body: {
        message_id: messageId
      }
    });

    if (error) throw error;

    console.log("Push notification request completed.");
  } catch (error) {
    console.warn("Push notification failed:", error);
  }
}
// ---------------- VOICE MESSAGES ----------------

let activeRecorder = null;
let activeAudioStream = null;
let audioChunks = [];
let recordingTimer = null;
let recordingStartedAt = 0;

async function uploadVoiceMessage(blob, mimeType) {
  if (!currentUser || !currentConversation) return;

  if (blob.size > 15 * 1024 * 1024) {
    throw new Error("Voice message is too large.");
  }

  const contentType = (
    blob.type || mimeType || "audio/webm"
  ).split(";")[0];

  let extension = "webm";

  if (contentType === "audio/mp4") extension = "m4a";
  if (contentType === "audio/ogg") extension = "ogg";
  if (contentType === "audio/mpeg") extension = "mp3";

  const filePath =
    `${currentConversation}/${currentUser.id}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await db.storage
    .from("chat-media")
    .upload(filePath, blob, {
      contentType,
      upsert: false
    });

  if (uploadError) throw uploadError;

  const { data, error } = await db
    .from("messages")
    .insert({
      conversation_id: currentConversation,
      sender_id: currentUser.id,
      message_type: "voice",
      body: null,
      attachment_path: filePath
    })
    .select()
    .single();

  if (error) {
    await db.storage.from("chat-media").remove([filePath]);
    throw error;
  }

  sendPushNotification(data.id);
  displayMessage(data);
}

voiceRecordBtn.addEventListener("click", async () => {
  // Stop an existing recording
  if (activeRecorder && activeRecorder.state === "recording") {
    activeRecorder.stop();
    return;
  }
  if (
    !navigator.mediaDevices?.getUserMedia ||
    !window.MediaRecorder
  ) {
    alert("Voice recording is not supported by this browser.");
    return;
  }
  try {
    activeAudioStream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });
    const supportedTypes = [
      "audio/mp4",
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus"
    ];
    const selectedType = supportedTypes.find(type =>
      MediaRecorder.isTypeSupported(type)
    );
    activeRecorder = new MediaRecorder(
      activeAudioStream,
      selectedType ? { mimeType: selectedType } : undefined
    );
    audioChunks = [];
    activeRecorder.ondataavailable = event => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    activeRecorder.onstop = async () => {
      clearInterval(recordingTimer);
      if (activeAudioStream) {
        activeAudioStream.getTracks().forEach(track => track.stop());
        activeAudioStream = null;
      }
      recordingStatus.classList.add("hidden");
      // Return button to idle appearance
      voiceRecordBtn.textContent = "▶";
      voiceRecordBtn.classList.remove("is-recording");
      const blob = new Blob(audioChunks, {
        type: activeRecorder?.mimeType || "audio/webm"
      });
      activeRecorder = null;
      try {
        if (!blob.size) {
          throw new Error("No audio was recorded.");
        }
        recordingStatus.textContent = "Sending voice message...";
        await uploadVoiceMessage(blob, blob.type);
        recordingStatus.textContent = "Voice message sent! 💗";
      } catch (error) {
        console.error("Voice message error:", error);
        alert("Voice message failed: " + error.message);
      } finally {
        setComposerEnabled(!!currentConversation);
        voiceRecordBtn.disabled = false;
        voiceRecordBtn.textContent = "▶";
        voiceRecordBtn.classList.remove("is-recording");
        audioChunks = [];
        setTimeout(() => {
          recordingStatus.classList.add("hidden");
        }, 2000);
      }
    };
    setComposerEnabled(false);
    // Keep recording button enabled so it can stop recording
    voiceRecordBtn.disabled = false;
    activeRecorder.start();
    recordingStartedAt = Date.now();
    // Show red circular stop button
    voiceRecordBtn.textContent = "■";
    voiceRecordBtn.classList.add("is-recording");
    recordingStatus.classList.remove("hidden");
    recordingTimer = setInterval(() => {
      const seconds = Math.floor(
        (Date.now() - recordingStartedAt) / 1000
      );
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      recordingStatus.textContent =
        "Recording " +
        String(minutes).padStart(2, "0") +
        ":" +
        String(remainingSeconds).padStart(2, "0");
      // Maximum recording time: 2 minutes
      if (
        seconds >= 120 &&
        activeRecorder?.state === "recording"
      ) {
        activeRecorder.stop();
      }
    }, 1000);
  } catch (error) {
    console.error("Microphone error:", error);
    if (activeAudioStream) {
      activeAudioStream.getTracks().forEach(track => track.stop());
      activeAudioStream = null;
    }
    alert("Could not access your microphone: " + error.message);
    voiceRecordBtn.textContent = "▶";
    voiceRecordBtn.classList.remove("is-recording");
    setComposerEnabled(!!currentConversation);
  }
});
// ---------------- AUTH MESSAGES ----------------

function showError(message) {
  authError.textContent = message;
  authError.style.display = "block";
  authMessage.textContent = "";
}

function showMessage(message) {
  authMessage.textContent = message;
  authError.textContent = "";
  authError.style.display = "none";
}

function clearAuthNotices() {
  authError.textContent = "";
  authError.style.display = "none";
  authMessage.textContent = "";
}

function showLoginMode() {
  loginForm.classList.remove("hidden");
  signupForm.classList.add("hidden");
  showLoginBtn.classList.add("active");
  showSignupBtn.classList.remove("active");
  clearAuthNotices();
}

function showSignupMode() {
  signupForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  showSignupBtn.classList.add("active");
  showLoginBtn.classList.remove("active");
  clearAuthNotices();
}

function showAuth() {
  appView.classList.add("hidden");
  authView.classList.remove("hidden");
}

function showDirectory() {
  peoplePanel.classList.remove("hidden");
  chatPanel.classList.add("hidden");
}

function showChatPanel() {
  peoplePanel.classList.add("hidden");
  chatPanel.classList.remove("hidden");
}

function showSystemMessage(message) {
  messagesContainer.replaceChildren();

  const notice = document.createElement("div");
  notice.className = "system-message";
  notice.textContent = message;

  messagesContainer.appendChild(notice);
}

function setComposerEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
  attachBtn.disabled = !enabled;
  mediaInput.disabled = !enabled;
  voiceRecordBtn.disabled = !enabled;
}
attachBtn.addEventListener("click", () => {
  if (!currentUser || !currentConversation) return;
  mediaInput.click();
});
// ---------------- REPLY PREVIEW ----------------

function setReplyToMessage(message) {
  if (!message || !currentConversation) return;

  replyingToMessage = message;

  replyPreviewText.textContent = message.body || "Message";
  replyPreview.classList.remove("hidden");

  messageInput.focus();
}

function clearReply() {
  replyingToMessage = null;
  replyPreview.classList.add("hidden");
  replyPreviewText.textContent = "";
}

cancelReplyBtn.addEventListener("click", clearReply);
// ---------------- AUTHENTICATION ----------------

showLoginBtn.addEventListener("click", showLoginMode);
showSignupBtn.addEventListener("click", showSignupMode);

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearAuthNotices();

  const displayName = displayNameInput.value.trim();
  const username = usernameInput.value.trim().toLowerCase();
  const email = signupEmailInput.value.trim();
  const password = signupPasswordInput.value;

  if (displayName.length < 1 || displayName.length > 40) {
    showError("Your name must be between 1 and 40 characters.");
    return;
  }

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    showError("Username must be 3–20 characters using letters, numbers or underscores.");
    return;
  }

  if (password.length < 8) {
    showError("Use a password with at least 8 characters.");
    return;
  }

  signupBtn.disabled = true;
  signupBtn.textContent = "Creating account...";

  try {
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname,
        data: {
          display_name: displayName,
          username: username
        }
      }
    });

    if (error) throw error;

    if (data.session) {
      showMessage("Your account is created. Welcome to u n i chat!");
    } else {
      signupForm.reset();
      showLoginMode();
      showMessage("Account created! Check your email for the confirmation link, then sign in.");
    }
  } catch (error) {
    showError("Registration failed: " + error.message);
  } finally {
    signupBtn.disabled = false;
    signupBtn.textContent = "Create my account ✨";
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearAuthNotices();

  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in...";

  try {
    const { error } = await db.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value
    });

    if (error) throw error;
  } catch (error) {
    showError("Login failed: " + error.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign in 💗";
  }
});

// ---------------- SESSION ----------------

db.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    currentUser = session.user;
    setTimeout(() => initializeChat(session.user), 0);
  } else {
    currentUser = null;
    currentConversation = null;
    initializationInProgress = false;
    peopleCache = [];
    conversationCache = [];

    setComposerEnabled(false);

    if (realtimeChannel) {
      db.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }

    showAuth();
  }
});

async function initializeChat(user) {
  if (!user || initializationInProgress) return;

  initializationInProgress = true;
  currentUser = user;
  currentConversation = null;

    setComposerEnabled(false);

  // Hide login and registration after successful sign-in
  authView.classList.add("hidden");

  // Display the main application
  appView.classList.remove("hidden");
  showDirectory();

  peopleCount.textContent = "Loading...";
  peopleList.replaceChildren();

  try {
  await loadExistingConversations();
  await loadPeople();
  subscribeToInboxUpdates();
} catch (error) {
    console.error(error);
    peopleCount.textContent = "Unable to load";
    showDirectoryNotice("We couldn't load the directory. Please refresh and try again.");
  } finally {
    initializationInProgress = false;
  }
}

// ---------------- DIRECTORY ----------------

function showDirectoryNotice(message) {
  const notice = document.createElement("p");
  notice.className = "preview-note";
  notice.textContent = message;
  peopleList.appendChild(notice);
}

function createSectionTitle(title) {
  const heading = document.createElement("h3");
  heading.className = "directory-section-title";
  heading.textContent = title;
  peopleList.appendChild(heading);
}

function createPersonCard(profile, buttonText, action, conversation = null) {
  const card = document.createElement("div");
  card.className = "person-card";

  if (conversation?.unreadCount > 0) {
    card.classList.add("has-unread");
  }

  const details = document.createElement("div");
  details.className = "person-details";

  const nameRow = document.createElement("div");
  nameRow.className = "person-name-row";

  const name = document.createElement("strong");
  name.textContent = profile.display_name || "u n i chat user";
  nameRow.appendChild(name);

  if (conversation?.unreadCount > 0) {
    const badge = document.createElement("span");
    badge.className = "unread-badge";
    badge.textContent = conversation.unreadCount > 99
      ? "99+"
      : String(conversation.unreadCount);

    nameRow.appendChild(badge);
  }

  const username = document.createElement("small");
  username.textContent = profile.username
    ? "@" + profile.username
    : "Member";

  details.appendChild(nameRow);
  details.appendChild(username);

  if (conversation?.lastMessage) {
    const preview = document.createElement("small");
    preview.className = "person-preview";

    const message = conversation.lastMessage;
    const prefix = message.sender_id === currentUser.id ? "You: " : "";

    preview.textContent = prefix + (
      message.body ||
      (message.message_type === "voice" ? "🎤 Voice message" :
      message.message_type === "image" ? "📷 Photo" :
      message.message_type === "video" ? "🎬 Video" : "Attachment")
    );

    details.appendChild(preview);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "person-message-btn";
  button.textContent = buttonText;
  button.addEventListener("click", action);

  card.appendChild(details);
  card.appendChild(button);

  return card;
}

async function loadPeople() {
  const { data, error } = await db
    .from("profiles")
    .select("id, display_name, username, avatar_path")
    .neq("id", currentUser.id)
    .order("display_name")
    .limit(100);

  if (error) throw error;

  peopleCache = data || [];
  renderDirectory();
}

function renderDirectory() {
  const search = peopleSearch.value.trim().toLowerCase();

  peopleList.replaceChildren();

  const filteredPeople = peopleCache.filter(person => {
    const name = (person.display_name || "").toLowerCase();
    const username = (person.username || "").toLowerCase();

    return name.includes(search) || username.includes(search);
  });

  const filteredConversations = conversationCache.filter(item => {
    const name = (item.profile.display_name || "").toLowerCase();
    const username = (item.profile.username || "").toLowerCase();

    return name.includes(search) || username.includes(search);
  });

  peopleCount.textContent = filteredPeople.length + " people";

  if (filteredConversations.length) {
    createSectionTitle("Your conversations");

    filteredConversations.forEach(item => {
      peopleList.appendChild(
        createPersonCard(item.profile, "Open chat", () => {
  openConversation(item.conversationId);
}, item)
      );
    });
  }

  createSectionTitle("Discover people");

  if (!filteredPeople.length) {
    showDirectoryNotice(
      search
        ? "No users matched your search."
        : "No other users have registered yet. Invite someone to join u n i chat!"
    );
    return;
  }

  filteredPeople.forEach(person => {
    peopleList.appendChild(
      createPersonCard(person, "Message", () => {
        startConversation(person.id);
      })
    );
  });
}

peopleSearch.addEventListener("input", renderDirectory);

// ---------------- EXISTING CONVERSATIONS ----------------

async function loadExistingConversations() {
  conversationCache = [];

  const { data: memberships, error } = await db
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", currentUser.id);

  if (error) throw error;

  for (const membership of memberships || []) {
    const { data: members, error: memberError } = await db
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", membership.conversation_id);

    if (memberError) {
      console.error(memberError);
      continue;
    }

    const otherMember = (members || []).find(
      member => member.user_id !== currentUser.id
    );

    if (!otherMember) continue;

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id, display_name, username, avatar_path")
      .eq("id", otherMember.user_id)
      .maybeSingle();

    if (profileError || !profile) continue;

    conversationCache.push({
      conversationId: membership.conversation_id,
      profile,
      unreadCount: 0,
      lastMessage: null
    });
  }

  const conversationIds = conversationCache.map(
    item => item.conversationId
  );

  if (!conversationIds.length) {
    renderDirectory();
    return;
  }

  const { data: messages, error: messagesError } = await db
    .from("messages")
    .select("id, conversation_id, sender_id, body, message_type, created_at, deleted_for_everyone")
    .in("conversation_id", conversationIds)
    .eq("deleted_for_everyone", false)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (messagesError) throw messagesError;

  const visibleMessages = messages || [];
  const messageIds = visibleMessages.map(message => message.id);

  let readMessageIds = new Set();

  if (messageIds.length) {
    const { data: reads, error: readsError } = await db
      .from("message_reads")
      .select("message_id")
      .eq("user_id", currentUser.id)
      .in("message_id", messageIds);

    if (readsError) {
      console.warn("Could not load read receipts:", readsError);
    } else {
      readMessageIds = new Set(
        (reads || []).map(read => read.message_id)
      );
    }
  }

  const byConversation = new Map(
    conversationCache.map(item => [
      item.conversationId,
      item
    ])
  );

  visibleMessages.forEach(message => {
    const item = byConversation.get(message.conversation_id);

    if (!item) return;

    if (!item.lastMessage) {
      item.lastMessage = message;
    }

    if (
      message.sender_id !== currentUser.id &&
      !readMessageIds.has(message.id)
    ) {
      item.unreadCount += 1;
    }
  });

  conversationCache.sort((a, b) => {
    const aTime = a.lastMessage?.created_at || "";
    const bTime = b.lastMessage?.created_at || "";

    return bTime.localeCompare(aTime);
  });

  renderDirectory();
}

// ---------------- START PRIVATE CONVERSATION ----------------

async function startConversation(otherUserId) {
  if (!currentUser) return;

  peopleList.querySelectorAll("button").forEach(button => {
    button.disabled = true;
  });

  try {
    const { data: conversationId, error } = await db.rpc(
      "start_direct_conversation",
      { p_other_user_id: otherUserId }
    );

    if (error) throw error;
    if (!conversationId) throw new Error("No conversation was returned.");

    await loadExistingConversations();
    await openConversation(conversationId);
  } catch (error) {
    console.error(error);
    alert("We couldn't start this conversation. Please try again.");
    renderDirectory();
  }
}

// ---------------- OPEN CHAT ----------------

async function openConversation(conversationId) {
  if (!conversationId) return;

  currentConversation = conversationId;
  loadedMessageIds.clear();

  if (realtimeChannel) {
    await db.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  showChatPanel();
  setComposerEnabled(false);

  partnerName.textContent = "Private conversation";
  connectionStatus.textContent = "Connecting...";
  showSystemMessage("Loading your conversation...");

  await loadPartnerName();
  await loadMessages();

  setComposerEnabled(true);
  subscribeToMessages();

  connectionStatus.textContent = "Connected";
  messageInput.focus();
}

backToPeopleBtn.addEventListener("click", async () => {
  currentConversation = null;
  setComposerEnabled(false);

  if (realtimeChannel) {
    await db.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  showDirectory();
});

// ---------------- CHAT PARTNER ----------------

async function loadPartnerName() {
  const { data: members, error } = await db
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", currentConversation);

  if (error || !members) {
    partnerName.textContent = "Private conversation";
    return;
  }

  const partner = members.find(member => member.user_id !== currentUser.id);

  if (!partner) {
    partnerName.textContent = "Private conversation";
    return;
  }

  const { data: profile } = await db
    .from("profiles")
    .select("display_name, username")
    .eq("id", partner.user_id)
    .maybeSingle();

  partnerName.textContent = profile?.display_name || "Your chat partner";
}
// ---------------- CUSTOM DELETE CONFIRMATION ----------------

function showDeleteConfirmation(scope) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "uni-confirm-overlay";

    const dialog = document.createElement("div");
    dialog.className = "uni-confirm-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const title = document.createElement("h2");
    title.textContent = scope === "everyone"
      ? "Delete for everyone?"
      : "Delete for yourself?";

    const description = document.createElement("p");
    description.textContent = scope === "everyone"
      ? "This message will be removed for both people."
      : "This message will disappear from your chat only.";

    const buttons = document.createElement("div");
    buttons.className = "uni-confirm-actions";

    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.className = "uni-confirm-cancel";

    const confirm = document.createElement("button");
    confirm.textContent = "Delete";
    confirm.className = "uni-confirm-delete";

    const finish = value => {
      overlay.remove();
      document.removeEventListener("keydown", onKeyDown);
      resolve(value);
    };

    const onKeyDown = event => {
      if (event.key === "Escape") finish(false);
    };

    cancel.onclick = () => finish(false);
    confirm.onclick = () => finish(true);

    overlay.onclick = event => {
      if (event.target === overlay) finish(false);
    };

    buttons.append(cancel, confirm);
    dialog.append(title, description, buttons);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    document.addEventListener("keydown", onKeyDown);
    cancel.focus();
  });
}

// ---------------- MESSAGE ACTIONS ----------------

async function handleMessageAction(action, message) {
  if (!message || !currentUser) return;

  try {
    if (action === "edit") {
      const newBody = prompt("Edit your message:", message.body || "");

      if (newBody === null) return;

      if (!newBody.trim()) {
        alert("A message cannot be empty.");
        return;
      }

      const { error } = await db.rpc("edit_own_message", {
        p_message_id: message.id,
        p_body: newBody.trim()
      });

      if (error) throw error;

      message.body = newBody.trim();
      message.edited_at = new Date().toISOString();

      const element = messagesContainer.querySelector(
        `[data-message-id="${message.id}"]`
      );

      if (element) {
        element.querySelector(".message-text").textContent = message.body;

        let editedLabel = element.querySelector(".message-edited");

        if (!editedLabel) {
          editedLabel = document.createElement("small");
          editedLabel.className = "message-edited";
          editedLabel.textContent = "Edited";
          element.appendChild(editedLabel);
        }
      }

      alert("Message edited successfully.");
    }

    if (action === "delete_me") {
      if (!(await showDeleteConfirmation("me"))) return;

      const { error } = await db.rpc("hide_message_for_me", {
        p_message_id: message.id
      });

      if (error) throw error;

      const element = messagesContainer.querySelector(
        `[data-message-id="${message.id}"]`
      );

      if (element) element.remove();

      loadedMessageIds.delete(message.id);
    }

    if (action === "delete_everyone") {
      if (!(await showDeleteConfirmation("everyone"))) return;

      const { error } = await db.rpc("delete_own_message_for_everyone", {
        p_message_id: message.id
      });

      if (error) throw error;

      const element = messagesContainer.querySelector(
        `[data-message-id="${message.id}"]`
      );

      if (element) element.remove();

      loadedMessageIds.delete(message.id);
    }

  } catch (error) {
    console.error("Message action failed:", error);
    alert("Action failed: " + error.message);
  }
}
// ---------------- MESSAGES ----------------

async function loadMessages() {
  messagesContainer.replaceChildren();
  loadedMessageIds.clear();

  const { data: messages, error } = await db
    .from("messages")
    .select("*")
    .eq("conversation_id", currentConversation)
    .eq("deleted_for_everyone", false)
    .order("created_at", { ascending: true });

  if (error) {
    showSystemMessage("Unable to load messages.");
    console.error(error);
    return;
  }

  const { data: hiddenMessages } = await db
    .from("message_user_hides")
    .select("message_id")
    .eq("user_id", currentUser.id);

  const hiddenIds = new Set(
    (hiddenMessages || []).map(item => item.message_id)
  );

  const visibleMessages = (messages || []).filter(
    message => !hiddenIds.has(message.id)
  );

  if (!visibleMessages.length) {
    showSystemMessage("Your conversation starts here ❤️");
    return;
  }

  visibleMessages.forEach(displayMessage);
  scrollToBottom();
}
function openMediaViewer(url, type) {
  const overlay = document.createElement("div");
  overlay.className = "media-viewer-overlay";

  const closeButton = document.createElement("button");
  closeButton.className = "media-viewer-close";
  closeButton.textContent = "×";
  closeButton.type = "button";

  const content = document.createElement(
    type === "image" ? "img" : "video"
  );

  content.className = "media-viewer-content";
  content.src = url;

  if (type === "image") {
    content.alt = "Full-screen shared picture";
  } else {
    content.controls = true;
    content.autoplay = true;
    content.playsInline = true;
  }

  function closeViewer() {
    document.removeEventListener("keydown", handleKey);
    if (type === "video") {
      content.pause();
      content.removeAttribute("src");
      content.load();
    }
    overlay.remove();
  }

  function handleKey(event) {
    if (event.key === "Escape") closeViewer();
  }

  closeButton.addEventListener("click", closeViewer);

  overlay.addEventListener("click", event => {
    if (event.target === overlay) closeViewer();
  });

  overlay.append(closeButton, content);
  document.body.appendChild(overlay);

  document.addEventListener("keydown", handleKey);
}
async function displayMessage(message) {
  if (!message || loadedMessageIds.has(message.id)) return;

  loadedMessageIds.add(message.id);

  const element = document.createElement("div");

  element.className = message.sender_id === currentUser.id
    ? "message sent"
    : "message received";

  element.dataset.messageId = message.id;
// Display the message being replied to
if (message.reply_to_message_id) {
  const replyBox = document.createElement("div");
  replyBox.className = "message-reply";

  const replyLabel = document.createElement("small");
  replyLabel.textContent = "↪ Replying to";

  const replyText = document.createElement("div");
  replyText.className = "message-reply-text";
  replyText.textContent = "Loading original message...";

  replyBox.appendChild(replyLabel);
  replyBox.appendChild(replyText);
  element.appendChild(replyBox);

  db
    .from("messages")
    .select("body")
    .eq("id", message.reply_to_message_id)
    .eq("deleted_for_everyone", false)
    .maybeSingle()
    .then(({ data, error }) => {
      replyText.textContent = error
        ? "Original message unavailable"
        : data?.body || "Original message unavailable";
    });
}
  
  const body = document.createElement("div");
  body.className = "message-text";
  body.textContent = message.body || "";

  const time = document.createElement("small");
  time.className = "message-time";
  time.textContent = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  element.appendChild(body);
  element.appendChild(time);
// ---------------- DISPLAY IMAGE AND VIDEO ----------------

if (message.attachment_path) {
  const { data, error } = await db.storage
    .from("chat-media")
    .createSignedUrl(message.attachment_path, 3600);

  if (error) {
    console.error("Media display error:", error);
    body.textContent = "Media could not be loaded.";
  } else {
    let mediaElement;

    if (message.message_type === "image") {
      mediaElement = document.createElement("img");
      mediaElement.className = "chat-media-image";
      mediaElement.alt = "Shared picture";
      } else if (message.message_type === "voice") {

  mediaElement = document.createElement("audio");

  mediaElement.className = "chat-voice-audio";

  mediaElement.controls = true;

  mediaElement.preload = "metadata";

  mediaElement.setAttribute(
    "aria-label",
    "Voice message"
  );

  body.textContent = " Voice message";
    } else if (message.message_type === "video") {
      mediaElement = document.createElement("video");
      mediaElement.className = "chat-media-video";
      mediaElement.controls = true;
      mediaElement.playsInline = true;
    }

    if (mediaElement) {
  mediaElement.src = data.signedUrl;

  if (message.message_type === "image") {
    mediaElement.style.cursor = "zoom-in";

    mediaElement.addEventListener("click", () => {
      openMediaViewer(data.signedUrl, "image");
    });

  } else if (message.message_type === "video") {
    const expandButton = document.createElement("button");

    expandButton.type = "button";
    expandButton.textContent = "⛶ View full screen";

    expandButton.addEventListener("click", () => {
      openMediaViewer(data.signedUrl, "video");
    });

    element.insertBefore(expandButton, time);
  }

  element.insertBefore(mediaElement, time);
}
  }
}
  if (message.edited_at) {
    const edited = document.createElement("small");
    edited.className = "message-edited";
    edited.textContent = "Edited";
    element.appendChild(edited);
  }

  messagesContainer.appendChild(element);

  let pressTimer = null;
  let startX = 0;
  let startY = 0;
  let replyTriggered = false;

  element.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;

    startX = event.clientX;
    startY = event.clientY;
    replyTriggered = false;

    clearTimeout(pressTimer);

    pressTimer = setTimeout(() => {
      showMessageActionMenu(message, startX, startY);
    }, 550);
  });

  element.addEventListener("pointermove", event => {
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    if (
      event.pointerType === "touch" &&
      deltaX > 65 &&
      Math.abs(deltaY) < 45 &&
      !replyTriggered
    ) {
      clearTimeout(pressTimer);
      replyTriggered = true;
      setReplyToMessage(message);
      return;
    }

    if (Math.abs(deltaX) + Math.abs(deltaY) > 12) {
      clearTimeout(pressTimer);
    }
  });

  element.addEventListener("pointerup", () => {
    clearTimeout(pressTimer);
  });

  element.addEventListener("pointercancel", () => {
    clearTimeout(pressTimer);
  });

  element.addEventListener("contextmenu", event => {
    event.preventDefault();
    showMessageActionMenu(message, event.clientX, event.clientY);
  });

  scrollToBottom();
}
// ---------------- MESSAGE ACTION MENU ----------------

function closeMessageActionMenu() {
  if (messageActionMenu) {
    document.removeEventListener(
      "pointerdown",
      messageActionMenu.outsideHandler,
      true
    );

    document.removeEventListener(
      "keydown",
      messageActionMenu.escapeHandler
    );

    messageActionMenu.remove();
    messageActionMenu = null;
  }
}

function showMessageActionMenu(message, x, y) {
  closeMessageActionMenu();

  const menu = document.createElement("div");

  menu.style.position = "fixed";
  menu.style.left = Math.max(
    10,
    Math.min(x, window.innerWidth - 190)
  ) + "px";

  menu.style.top = Math.max(
    10,
    Math.min(y, window.innerHeight - 260)
  ) + "px";

  menu.style.zIndex = "99999";
  menu.style.background = "#24152f";
  menu.style.color = "white";
  menu.style.padding = "8px";
  menu.style.borderRadius = "14px";
  menu.style.boxShadow = "0 5px 25px rgba(0,0,0,0.5)";
  menu.style.minWidth = "170px";

  menu.addEventListener("pointerdown", event => {
    event.stopPropagation();
  });

  const actions = message.sender_id === currentUser.id
    ? [
        [" Edit message", "edit"],
        [" Delete for me", "delete_me"],
        [" Delete for everyone", "delete_everyone"]
      ]
    : [
        [" Delete for me", "delete_me"]
      ];

  actions.forEach(([label, action]) => {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = label;

    button.style.display = "block";
    button.style.width = "100%";
    button.style.padding = "12px";
    button.style.border = "none";
    button.style.background = "transparent";
    button.style.color = "white";
    button.style.textAlign = "left";
    button.style.fontSize = "14px";
    button.style.cursor = "pointer";

    button.addEventListener("click", () => {
      closeMessageActionMenu();
      handleMessageAction(action, message);
    });

    menu.appendChild(button);
  });

  // Cancel button
  const cancelButton = document.createElement("button");

  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";

  cancelButton.style.display = "block";
  cancelButton.style.width = "100%";
  cancelButton.style.padding = "12px";
  cancelButton.style.marginTop = "5px";
  cancelButton.style.border = "none";
  cancelButton.style.borderTop = "1px solid #ffffff30";
  cancelButton.style.background = "transparent";
  cancelButton.style.color = "#ff9ac5";
  cancelButton.style.fontSize = "14px";
  cancelButton.style.cursor = "pointer";

  cancelButton.addEventListener("click", closeMessageActionMenu);

  menu.appendChild(cancelButton);

  // Close when tapping outside
  menu.outsideHandler = event => {
    if (!menu.contains(event.target)) {
      closeMessageActionMenu();
    }
  };

  // Close when pressing Escape
  menu.escapeHandler = event => {
    if (event.key === "Escape") {
      closeMessageActionMenu();
    }
  };

  document.body.appendChild(menu);
  messageActionMenu = menu;

  setTimeout(() => {
    if (messageActionMenu === menu) {
      document.addEventListener(
        "pointerdown",
        menu.outsideHandler,
        true
      );

      document.addEventListener(
        "keydown",
        menu.escapeHandler
      );
    }
  }, 0);
}
 // ---------------- IMAGE AND VIDEO UPLOAD ----------------

mediaInput.addEventListener("change", async () => {
  const file = mediaInput.files[0];

  if (!file || !currentUser || !currentConversation) {
    mediaInput.value = "";
    return;
  }

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  if (!isImage && !isVideo) {
    alert("Please select an image or video.");
    mediaInput.value = "";
    return;
  }

  if (file.size > 50 * 1024 * 1024) {
    alert("The maximum file size is 50 MB.");
    mediaInput.value = "";
    return;
  }

  setComposerEnabled(false);
  attachBtn.textContent = "…";

  let uploadedPath = null;

  try {
    const extension = file.name.split(".").pop().toLowerCase();

    const filePath =
      `${currentConversation}/${currentUser.id}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await db.storage
      .from("chat-media")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) throw uploadError;

    uploadedPath = filePath;

    const { data, error } = await db
      .from("messages")
      .insert({
        conversation_id: currentConversation,
        sender_id: currentUser.id,
        message_type: isImage ? "image" : "video",
        body: null,
        attachment_path: filePath
      })
      .select()
      .single();

    if (error) throw error;
sendPushNotification(data.id);
    displayMessage(data);

    alert("Media sent successfully! 💗");

  } catch (error) {
    console.error("Media upload error:", error);

    if (uploadedPath) {
      await db.storage.from("chat-media").remove([uploadedPath]);
    }

    alert("Upload failed: " + error.message);

  } finally {
    mediaInput.value = "";
    attachBtn.textContent = "＋";
    setComposerEnabled(!!currentConversation);
  }
});


// ---------------- SEND MESSAGE ----------------

composer.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser || !currentConversation) return;

  const body = messageInput.value.trim();
  if (!body) return;

  setComposerEnabled(false);

  const { data, error } = await db
    .from("messages")
    .insert({
      conversation_id: currentConversation,
      sender_id: currentUser.id,
      body,
      message_type: "text",
      reply_to_message_id: replyingToMessage
        ? replyingToMessage.id
        : null
    })
    .select()
    .single();

  setComposerEnabled(true);

  if (error) {
    console.error(error);
    alert("Message could not be sent. Please try again.");
    return;
  }
sendPushNotification(data.id);
  messageInput.value = "";
  clearReply();
  displayMessage(data);
  messageInput.focus();
});
// ---------------- REALTIME ----------------
async function markMessageRead(messageId) {
  if (!messageId || !currentUser) return;

  const { error } = await db.rpc("mark_message_read", {
    p_message_id: messageId
  });

  if (error) {
    console.warn("Could not mark message as read:", error);
  }
}

async function refreshInbox() {
  if (!currentUser || initializationInProgress) return;

  try {
    await loadExistingConversations();
    renderDirectory();
  } catch (error) {
    console.warn("Inbox refresh failed:", error);
  }
}

function subscribeToInboxUpdates() {
  if (!currentUser) return;

  if (inboxRealtimeChannel) {
    db.removeChannel(inboxRealtimeChannel);
  }

  inboxRealtimeChannel = db
    .channel("inbox-updates-" + currentUser.id)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "messages"
    }, payload => {
      const message = payload.new || payload.old;

      if (!message?.conversation_id) return;

      if (
        payload.eventType === "INSERT" &&
        message.sender_id !== currentUser.id &&
        currentConversation === message.conversation_id
      ) {
        markMessageRead(message.id);
      }

      clearTimeout(inboxRefreshTimer);
      inboxRefreshTimer = setTimeout(refreshInbox, 400);
    })
    .subscribe(status => {
      if (status === "CHANNEL_ERROR") {
        console.warn("Inbox live updates could not connect.");
      }
    });

  if (!window.uniInboxFocusHandler) {
    window.uniInboxFocusHandler = () => {
      if (document.visibilityState === "visible") {
        refreshInbox();
      }
    };

    document.addEventListener(
      "visibilitychange",
      window.uniInboxFocusHandler
    );
  }
}
function subscribeToMessages() {
  if (realtimeChannel) {
    db.removeChannel(realtimeChannel);
  }

  const conversationId = currentConversation;

  realtimeChannel = db
    .channel("private-chat-" + conversationId)

    // New messages
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: "conversation_id=eq." + conversationId
      },
      payload => {
        if (currentConversation === conversationId) {
          displayMessage(payload.new);
        }
      }
    )

    // Edited or deleted messages
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: "conversation_id=eq." + conversationId
      },
      payload => {
        if (currentConversation !== conversationId) return;

        const message = payload.new;

        const element = messagesContainer.querySelector(
          `[data-message-id="${message.id}"]`
        );

        if (message.deleted_for_everyone) {
          if (element) element.remove();
          return;
        }

        if (element) {
          const body = element.querySelector(".message-text");

          if (body) {
            body.textContent = message.body || "";
          }

          if (message.edited_at && !element.querySelector(".message-edited")) {
            const edited = document.createElement("small");
            edited.className = "message-edited";
            edited.textContent = "Edited";
            element.appendChild(edited);
          }
        }
      }
    )
    .subscribe(status => {
      if (status === "SUBSCRIBED") {
        connectionStatus.textContent = "Online";
      }

      if (status === "CHANNEL_ERROR") {
        connectionStatus.textContent = "Connection problem";
      }
    });
}
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ---------------- SIGN OUT ----------------

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;

  const { error } = await db.auth.signOut();

  logoutBtn.disabled = false;

  if (error) {
    alert("Unable to sign out. Please try again.");
    console.error(error);
}
});
// ---------------- PWA SERVICE WORKER ----------------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then(() => {
        console.log("u n i chat app is ready.");
      })
      .catch(error => {
        console.error("App installation setup failed:", error);
      });
  });
}
