// U N I CHAT — public registration + private one-to-one messaging foundation

const SUPABASE_URL = "https://zrgbzzxnoylevpwjavwr.supabase.co";
const SUPABASE_KEY = "sb_publishable_Ajj55K3s5l9_Ty_5-4hIUQ_P06hFE8d";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const authView = document.getElementById("authView");
const appView = document.getElementById("appView");
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
const messagesContainer = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const composer = document.getElementById("composer");
const partnerName = document.getElementById("partnerName");
const connectionStatus = document.getElementById("connectionStatus");
const logoutBtn = document.getElementById("logoutBtn");

let currentUser = null;
let currentConversation = null;
let realtimeChannel = null;
let loadedMessageIds = new Set();
let initializationInProgress = false;

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
function showChat() {
  authView.classList.add("hidden");
  appView.classList.remove("hidden");
}
function showAuth() {
  appView.classList.add("hidden");
  authView.classList.remove("hidden");
}
function showSystemMessage(message) {
  messagesContainer.innerHTML = "";
  const notice = document.createElement("div");
  notice.className = "system-message";
  notice.textContent = message;
  messagesContainer.appendChild(notice);
}
function setComposerEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
}

// Switch between sign-in and registration forms.
showLoginBtn.addEventListener("click", showLoginMode);
showSignupBtn.addEventListener("click", showSignupMode);

// Create a new account. Supabase sends a verification email when email
// confirmation is enabled in the project settings.
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

  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
      data: { display_name: displayName, username }
    }
  });

  signupBtn.disabled = false;
  signupBtn.textContent = "Create my account ✨";

  if (error) {
    const msg = error.message || "Unable to create account.";
    if (msg.toLowerCase().includes("username")) {
      showError("That username is already taken. Please choose another.");
    } else {
      showError("Registration failed: " + msg);
    }
    return;
  }

  if (data.session) {
    showMessage("Your account is created. Welcome to u n i chat!");
    // Auth state listener will open the signed-in view.
  } else {
    showMessage("Account created! Check your email and tap the confirmation link, then return here to sign in.");
    signupForm.reset();
    showLoginMode();
    showMessage("Check your email for the confirmation link. Then sign in here.");
  }
});

// Sign in existing users.
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearAuthNotices();

  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in...";

  const { error } = await db.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value
  });

  loginBtn.disabled = false;
  loginBtn.textContent = "Sign in 💗";

  if (error) showError("Login failed: " + error.message);
});

// Keep the interface in sync with the current Supabase session.
db.auth.onAuthStateChange((event, session) => {
  if (session && session.user) {
    currentUser = session.user;
    // Defer database work until after the auth callback has completed.
    setTimeout(() => initializeChat(session.user), 0);
  } else {
    currentUser = null;
    currentConversation = null;
    initializationInProgress = false;
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
  showChat();
  connectionStatus.textContent = "Loading your profile...";
  partnerName.textContent = "Welcome to u n i chat";
  showSystemMessage("Checking your account...");

  try {
    const { data: membership, error } = await db
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!membership) {
      const { data: profile } = await db
        .from("profiles")
        .select("display_name, username")
        .eq("id", user.id)
        .maybeSingle();

      partnerName.textContent = profile?.display_name || "Welcome!";
      connectionStatus.textContent = profile?.username ? "@" + profile.username : "Account ready";
      showSystemMessage("Your account is ready! The people directory and start-a-chat feature are the next development stage. Your messages will stay private to the people in each conversation.");
      return;
    }

    // Important: set the conversation ID before loading or sending messages.
    currentConversation = membership.conversation_id;
    setComposerEnabled(true);

    await loadPartnerName();
    await loadMessages();
    subscribeToMessages();
    connectionStatus.textContent = "Connected";
  } catch (error) {
    console.error(error);
    connectionStatus.textContent = "Connection problem";
    showSystemMessage("We couldn't load your account right now. Please refresh and try again.");
  } finally {
    initializationInProgress = false;
  }
}

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
    partnerName.textContent = "Waiting for someone";
    return;
  }

  const { data: profile } = await db
    .from("profiles")
    .select("display_name, username")
    .eq("id", partner.user_id)
    .maybeSingle();

  partnerName.textContent = profile?.display_name || "Your chat partner";
}

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

  const { data: hiddenMessages } = await db
    .from("message_user_hides")
    .select("message_id")
    .eq("user_id", currentUser.id);

  const hiddenIds = new Set((hiddenMessages || []).map(item => item.message_id));
  const visibleMessages = (messages || []).filter(message => !hiddenIds.has(message.id));

  if (!visibleMessages.length) {
    showSystemMessage("Your conversation starts here ❤️");
    return;
  }
  visibleMessages.forEach(displayMessage);
  scrollToBottom();
}

function displayMessage(message) {
  if (loadedMessageIds.has(message.id)) return;
  loadedMessageIds.add(message.id);

  const messageElement = document.createElement("div");
  const isMine = message.sender_id === currentUser.id;
  messageElement.className = isMine ? "message sent" : "message received";

  const body = document.createElement("div");
  body.className = "message-text";
  body.textContent = message.body || "";

  const time = document.createElement("small");
  time.className = "message-time";
  time.textContent = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit"
  });

  messageElement.appendChild(body);
  messageElement.appendChild(time);
  messagesContainer.appendChild(messageElement);
  scrollToBottom();
}

composer.addEventListener("submit", async (event) => {
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
      message_type: "text"
    })
    .select()
    .single();

  setComposerEnabled(true);
  if (error) {
    alert("Message could not be sent. Please try again.");
    console.error(error);
    return;
  }

  messageInput.value = "";
  displayMessage(data);
  messageInput.focus();
});

function subscribeToMessages() {
  if (realtimeChannel) db.removeChannel(realtimeChannel);

  realtimeChannel = db
    .channel("private-chat-" + currentConversation)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: "conversation_id=eq." + currentConversation
    }, payload => displayMessage(payload.new))
    .subscribe(status => {
      if (status === "SUBSCRIBED") connectionStatus.textContent = "Online";
      if (status === "CHANNEL_ERROR") connectionStatus.textContent = "Connection problem";
    });
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  const { error } = await db.auth.signOut();
  logoutBtn.disabled = false;
  if (error) {
    alert("Unable to sign out. Please try again.");
    console.error(error);
  }
});
