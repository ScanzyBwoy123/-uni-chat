// ======================================
// U N I CHAT - PRIVATE MESSAGING APP
// ======================================

const SUPABASE_URL = "https://zrgbzzxnoylevpwjavwr.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_Ajj55K3s5l9_Ty_5-4hIUQ_P06hFE8d";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// App elements
const authView = document.getElementById("authView");
const appView = document.getElementById("appView");

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const authError = document.getElementById("authError");
const loginBtn = document.getElementById("loginBtn");

const messagesContainer = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const composer = document.getElementById("composer");

const partnerName = document.getElementById("partnerName");
const connectionStatus = document.getElementById("connectionStatus");
const logoutBtn = document.getElementById("logoutBtn");

let currentUser = null;
let currentConversation = null;
let realtimeChannel = null;
let loadedMessageIds = new Set();


// ======================================
// DISPLAY MESSAGES
// ======================================

function showError(message) {
  authError.textContent = message;
  authError.style.display = "block";
}

function clearError() {
  authError.textContent = "";
  authError.style.display = "none";
}

function showLogin() {
  authView.style.display = "flex";
  appView.style.display = "none";
}

function showChat() {
  authView.style.display = "none";
  appView.style.display = "flex";
}

function showSystemMessage(message) {
  messagesContainer.innerHTML = "";

  const notice = document.createElement("div");
  notice.className = "system-message";
  notice.textContent = message;

  messagesContainer.appendChild(notice);
}


// ======================================
// LOGIN
// ======================================

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  clearError();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showError("Enter your email and password.");
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in...";

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  loginBtn.disabled = false;
  loginBtn.textContent = "Sign In";

  if (error) {
    showError("Login failed: " + error.message);
    return;
  }

  currentUser = data.user;

  await initializeChat(currentUser);
});


// ======================================
// AUTHENTICATION STATE
// ======================================

db.auth.onAuthStateChange(async (event, session) => {
  if (session && session.user) {
    currentUser = session.user;

    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
      await initializeChat(currentUser);
    }
  } else {
    currentUser = null;
    currentConversation = null;

    if (realtimeChannel) {
      await db.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }

    showLogin();
  }
});


// ======================================
// INITIALIZE PRIVATE CHAT
// ======================================

async function initializeChat(user) {
  if (!user) return;

  showChat();

  connectionStatus.textContent = "Connecting...";
  partnerName.textContent = "Your private chat";

  showSystemMessage("Preparing your private conversation...");

  // Find this user's conversation membership
  const { data: membership, error } = await db
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    showSystemMessage(
      "Unable to load your conversation. Please try again."
    );

    console.error(error);
    return;
  }

  // No conversation has been created yet
  if (!membership) {
    connectionStatus.textContent = "Waiting for setup";

    showSystemMessage(
      "Your private conversation is being prepared. Both approved accounts must be linked before messaging can begin."
    );

    return;
  }
messageInput.disabled = false;
document.getElementById("sendBtn").disabled = false;

  await loadPartnerName();
  await loadMessages();
  subscribeToMessages();

  connectionStatus.textContent = "Connected";
}


// ======================================
// LOAD PARTNER NAME
// ======================================

async function loadPartnerName() {
  const { data: members, error } = await db
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", currentConversation);

  if (error || !members) {
    partnerName.textContent = "Private conversation";
    return;
  }

  const partner = members.find(
    member => member.user_id !== currentUser.id
  );

  if (!partner) {
    partnerName.textContent = "Waiting for your partner";
    return;
  }

  const { data: profile } = await db
    .from("profiles")
    .select("display_name")
    .eq("id", partner.user_id)
    .maybeSingle();

  partnerName.textContent =
    profile?.display_name || "Your partner";
}


// ======================================
// LOAD CHAT HISTORY
// ======================================

async function loadMessages() {
  messagesContainer.innerHTML = "";
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

  if (!messages || messages.length === 0) {
    showSystemMessage("Your conversation starts here ❤️");
    return;
  }

  // Find messages hidden by this user
  const { data: hiddenMessages } = await db
    .from("message_user_hides")
    .select("message_id")
    .eq("user_id", currentUser.id);

  const hiddenIds = new Set(
    (hiddenMessages || []).map(item => item.message_id)
  );

  messages.forEach(message => {
    if (!hiddenIds.has(message.id)) {
      displayMessage(message);
    }
  });

  scrollToBottom();
}


// ======================================
// DISPLAY A SINGLE MESSAGE
// ======================================

function displayMessage(message) {
  if (loadedMessageIds.has(message.id)) return;

  loadedMessageIds.add(message.id);

  const messageElement = document.createElement("div");

  const isMine = message.sender_id === currentUser.id;

  messageElement.className = isMine
    ? "message sent"
    : "message received";

  const text = document.createElement("div");
  text.className = "message-text";
  text.textContent = message.body || "";

  const time = document.createElement("small");

  time.className = "message-time";

  time.textContent = new Date(
    message.created_at
  ).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  messageElement.appendChild(text);
  messageElement.appendChild(time);

  messagesContainer.appendChild(messageElement);

  scrollToBottom();
}


// ======================================
// SEND MESSAGE
// ======================================

composer.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || !currentConversation) {
    alert("Your private conversation is not ready yet.");
    return;
  }

  const message = messageInput.value.trim();

  if (!message) return;

  messageInput.disabled = true;

  const { data, error } = await db
    .from("messages")
    .insert({
      conversation_id: currentConversation,
      sender_id: currentUser.id,
      body: message,
      message_type: "text"
    })
    .select()
    .single();

  messageInput.disabled = false;

  if (error) {
    alert("Message could not be sent. Please try again.");
    console.error(error);
    return;
  }

  messageInput.value = "";

  displayMessage(data);
  messageInput.focus();
});


// ======================================
// REAL-TIME MESSAGES
// ======================================

function subscribeToMessages() {
  if (realtimeChannel) {
    db.removeChannel(realtimeChannel);
  }

  realtimeChannel = db
    .channel("private-chat-" + currentConversation)

    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: "conversation_id=eq." + currentConversation
      },
      (payload) => {
        displayMessage(payload.new);
      }
    )

    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        connectionStatus.textContent = "Online";
      } else if (status === "CHANNEL_ERROR") {
        connectionStatus.textContent = "Connection problem";
      }
    });
}


// ======================================
// SCROLL TO LATEST MESSAGE
// ======================================

function scrollToBottom() {
  messagesContainer.scrollTop =
    messagesContainer.scrollHeight;
}


// ======================================
// LOG OUT
// ======================================

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;

  const { error } = await db.auth.signOut();

  logoutBtn.disabled = false;

  if (error) {
    alert("Unable to log out.");
    console.error(error);
  }
});
