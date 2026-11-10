// U N I CHAT — authentication, people directory and private messaging

const SUPABASE_URL = "https://zrgbzzxnoylevpwjavwr.supabase.co";
const SUPABASE_KEY = "sb_publishable_Ajj55K3s5l9_Ty_5-4hIUQ_P06hFE8d";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      persistSession: false,
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
const partnerName = document.getElementById("partnerName");
const connectionStatus = document.getElementById("connectionStatus");
const logoutBtn = document.getElementById("logoutBtn");
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
let editingMessageId = null;
let messageActionMenu = null;

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
}
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

function createPersonCard(profile, buttonText, action) {
  const card = document.createElement("div");
  card.className = "person-card";

  const details = document.createElement("div");
  details.className = "person-details";

  const name = document.createElement("strong");
  name.textContent = profile.display_name || "u n i chat user";

  const username = document.createElement("small");
  username.textContent = profile.username
    ? "@" + profile.username
    : "Member";

  details.appendChild(name);
  details.appendChild(username);

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
        })
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
      profile
    });
  }
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
      if (!confirm("Delete this message for yourself?")) return;

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
      if (!confirm("Delete this message for everyone?")) return;

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
function displayMessage(message) {
  if (!message || loadedMessageIds.has(message.id)) return;

  loadedMessageIds.add(message.id);

  const element = document.createElement("div");

  element.className = message.sender_id === currentUser.id
    ? "message sent"
    : "message received";

  element.dataset.messageId = message.id;

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

  if (message.edited_at) {
    const edited = document.createElement("small");
    edited.className = "message-edited";
    edited.textContent = "Edited";
    element.appendChild(edited);
  }

  messagesContainer.appendChild(element);

    let pressTimer = null;
  let pressStartX = 0;
  let pressStartY = 0;
  let replyTriggered = false;

  element.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;

    pressStartX = event.clientX;
    pressStartY = event.clientY;
    replyTriggered = false;

    clearTimeout(pressTimer);

    pressTimer = setTimeout(() => {
      showMessageActionMenu(message, pressStartX, pressStartY);
    }, 550);
  });

  element.addEventListener("pointermove", event => {
    const deltaX = event.clientX - pressStartX;
    const deltaY = event.clientY - pressStartY;

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
  element.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;

    pressStartX = event.clientX;
    pressStartY = event.clientY;

    clearTimeout(pressTimer);

    pressTimer = setTimeout(() => {
      showMessageActionMenu(message, pressStartX, pressStartY);
    }, 550);
  });

  element.addEventListener("pointermove", event => {
    const moved = Math.abs(event.clientX - pressStartX) +
      Math.abs(event.clientY - pressStartY);

    if (moved > 12) clearTimeout(pressTimer);
  });

  element.addEventListener("pointerup", () => {
    clearTimeout(pressTimer);
  });

  element.addEventListener("pointercancel", () => {
    clearTimeout(pressTimer);
  });

    event.preventDefault();
    showMessageActionMenu(message, event.clientX, event.clientY);
  });

  scrollToBottom();
}
function closeMessageActionMenu() {
  if (messageActionMenu) {
    messageActionMenu.remove();
    messageActionMenu = null;
  }
}

function showMessageActionMenu(message, x, y) {
  closeMessageActionMenu();

  const menu = document.createElement("div");

  menu.style.position = "fixed";
  menu.style.left = Math.min(x, window.innerWidth - 180) + "px";
  menu.style.top = Math.min(y, window.innerHeight - 180) + "px";
  menu.style.zIndex = "9999";
  menu.style.background = "#24152f";
  menu.style.color = "white";
  menu.style.padding = "8px";
  menu.style.borderRadius = "12px";
  menu.style.boxShadow = "0 4px 18px rgba(0,0,0,0.35)";
  menu.style.minWidth = "150px";

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
    button.style.padding = "11px";
    button.style.border = "none";
    button.style.background = "transparent";
    button.style.color = "white";
    button.style.textAlign = "left";
    button.style.fontSize = "14px";

    button.addEventListener("click", () => {
      closeMessageActionMenu();
      handleMessageAction(action, message);
    });

    menu.appendChild(button);
  });

  document.body.appendChild(menu);
  messageActionMenu = menu;
}
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
      message_type: "text"
    })
    .select()
    .single();

  setComposerEnabled(true);

  if (error) {
    console.error(error);
    alert("Message could not be sent. Please try again.");
    return;
  }

    messageInput.value = "";
  displayMessage(data);
  messageInput.focus();
});

// ---------------- REALTIME ----------------

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
