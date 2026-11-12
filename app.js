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
// Profile picture controls
const myProfileAvatar = document.getElementById("myProfileAvatar");
const myProfileAvatarFallback = document.getElementById("myProfileAvatarFallback");
const profilePhotoStatus = document.getElementById("profilePhotoStatus");
const changeProfilePhotoBtn = document.getElementById("changeProfilePhotoBtn");
const removeProfilePhotoBtn = document.getElementById("removeProfilePhotoBtn");
const profilePhotoInput = document.getElementById("profilePhotoInput");
// Status controls
const addStatusBtn = document.getElementById("addStatusBtn");
const statusList = document.getElementById("statusList");
// Chat
const messagesContainer = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const composer = document.getElementById("composer");
const attachBtn = document.getElementById("attachBtn");
const mediaInput = document.getElementById("mediaInput");
const partnerName = document.getElementById("partnerName");
const partnerAvatar = document.getElementById("partnerAvatar");
const partnerAvatarFallback = document.getElementById("partnerAvatarFallback");
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
// ---------------- PROFILE PICTURES ----------------

function getAvatarUrl(path) {
  if (!path) return null;

  return db.storage
    .from("profile-pictures")
    .getPublicUrl(path).data.publicUrl;
}

function displayMyProfilePhoto(path) {
  const url = getAvatarUrl(path);

  if (url) {
    myProfileAvatar.src = url;
    myProfileAvatar.classList.remove("hidden");
    myProfileAvatarFallback.classList.add("hidden");

    profilePhotoStatus.textContent = "Your profile picture is set.";
    changeProfilePhotoBtn.textContent = "Change photo";
    removeProfilePhotoBtn.classList.remove("hidden");
  } else {
    myProfileAvatar.removeAttribute("src");
    myProfileAvatar.classList.add("hidden");
    myProfileAvatarFallback.classList.remove("hidden");

    profilePhotoStatus.textContent = "Add a picture to your profile.";
    changeProfilePhotoBtn.textContent = "Add photo";
    removeProfilePhotoBtn.classList.add("hidden");
  }
}
// Load the signed-in user's profile picture
async function loadMyProfilePhoto() {
  if (!currentUser) return;

  const { data, error } = await db
    .from("profiles")
    .select("avatar_path")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Could not load profile picture:", error);
    return;
  }

  displayMyProfilePhoto(data?.avatar_path || null);
}
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
// ---------------- VOICE AND VIDEO CALLING ----------------

const callMenuToggle = document.getElementById("callMenuToggle");
const callDropdown = document.getElementById("callDropdown");
const audioCallMenuItem = document.getElementById("audioCallMenuItem");
const videoCallMenuItem = document.getElementById("videoCallMenuItem");

const callScreen = document.getElementById("callScreen");
const callStatus = document.getElementById("callStatus");
const callPersonName = document.getElementById("callPersonName");
const callTimer = document.getElementById("callTimer");
const callAvatar = document.getElementById("callAvatar");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const closeCallBtn = document.getElementById("closeCallBtn");
const muteCallBtn = document.getElementById("muteCallBtn");
const cameraCallBtn = document.getElementById("cameraCallBtn");
const endCallBtn = document.getElementById("endCallBtn");

const incomingCallActions = document.getElementById("incomingCallActions");
const acceptCallBtn = document.getElementById("acceptCallBtn");
const declineCallBtn = document.getElementById("declineCallBtn");

let callPeer = null;
let callStream = null;
let callChannel = null;
let activeCallId = null;
let activeCallType = null;
let callTimerInterval = null;
let callStartedAt = null;
let callStatusChannel = null;
let incomingCall = null;
let callPartnerId = null;
let pendingIceCandidates = [];
let isMicrophoneMuted = false;
let isCameraEnabled = true;
let isCallAccepted = false;
let pendingCallOffer = null;
// ---------------- WEBRTC CONNECTION HELPERS ----------------

async function sendCallSignal(signalType, payload) {
  if (!activeCallId || !callPartnerId || !currentUser) return;

  const { error } = await db
    .from("call_signals")
    .insert({
      call_id: activeCallId,
      sender_id: currentUser.id,
      recipient_id: callPartnerId,
      signal_type: signalType,
      payload: payload
    });

  if (error) {
    console.error("Call signalling error:", error);
    throw error;
  }
}

function createCallPeerConnection() {
  callPeer = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ]
  });

callPeer.onicecandidate = event => {
  if (event.candidate) {
    const candidate = event.candidate.toJSON();

    console.log("ICE candidate generated:", event.candidate.type);

    sendCallSignal("ice-candidate", candidate)
      .then(() => {
        console.log("ICE candidate sent successfully:", event.candidate.type);
        callStatus.textContent = "Network signal sent";
      })
      .catch(error => {
        console.error("ICE candidate send failed:", error);
        callStatus.textContent = "Network signal error";
        alert("Network signal error: " + error.message);
      });

  } else {
    console.log("ICE candidate gathering completed.");
  }
};  
  callPeer.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
    remoteVideo.play().catch(console.warn);
  };

  callPeer.onconnectionstatechange = () => {
  console.log("Call connection:", callPeer.connectionState);

  if (callPeer.connectionState === "connected") {
    callStatus.textContent = "Connected";

    if (!callTimerInterval) {
      callStartedAt = Date.now();

      callTimerInterval = setInterval(() => {
        const elapsed = Math.floor(
          (Date.now() - callStartedAt) / 1000
        );

        const minutes = String(
          Math.floor(elapsed / 60)
        ).padStart(2, "0");

        const seconds = String(
          elapsed % 60
        ).padStart(2, "0");

        callTimer.textContent = `${minutes}:${seconds}`;
      }, 1000);
    }
  }

  if (callPeer.connectionState === "failed") {
    callStatus.textContent = "Connection failed";
  }
};
  return callPeer;
}

async function prepareCallMedia() {
  callStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: activeCallType === "video"
  });

  localVideo.srcObject = callStream;

  if (callPeer) {
    callStream.getTracks().forEach(track => {
      callPeer.addTrack(track, callStream);
    });
  }

  return callStream;
}
// ---------------- ACCEPT INCOMING WEBRTC CALL ----------------

async function acceptIncomingWebRTCCall() {
  if (!pendingCallOffer || !activeCallId) {
    throw new Error("The caller's connection offer has not arrived yet.");
  }

  isCallAccepted = true;

  createCallPeerConnection();
  await prepareCallMedia();

  await callPeer.setRemoteDescription(
    new RTCSessionDescription(pendingCallOffer)
  );

  for (const candidate of pendingIceCandidates) {
    await callPeer.addIceCandidate(
      new RTCIceCandidate(candidate)
    );
  }

  pendingIceCandidates = [];

  const answer = await callPeer.createAnswer();
  await callPeer.setLocalDescription(answer);

  await sendCallSignal("answer", answer);

  pendingCallOffer = null;
  callStatus.textContent = "Connecting...";
}
// ---------------- CALL SIGNAL LISTENER ----------------

async function subscribeToCallSignals() {
  if (!activeCallId || !currentUser) {
    throw new Error("Missing call information.");
  }

  if (callChannel) {
    await db.removeChannel(callChannel);
    callChannel = null;
  }

  return new Promise((resolve, reject) => {
    callChannel = db
      .channel("call-signals-" + activeCallId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "call_signals",
          filter: "call_id=eq." + activeCallId
        },
        async payload => {
          const signal = payload.new;

          if (!signal || signal.recipient_id !== currentUser.id) return;

          try {
            if (signal.signal_type === "offer") {
              pendingCallOffer = signal.payload;

              callStatus.textContent = "Incoming call — tap Accept";

              if (isCallAccepted) {
                await acceptIncomingWebRTCCall();
              }
            }

            else if (signal.signal_type === "answer") {
              if (!callPeer) return;

              await callPeer.setRemoteDescription(
                new RTCSessionDescription(signal.payload)
              );

              for (const candidate of pendingIceCandidates) {
                await callPeer.addIceCandidate(
                  new RTCIceCandidate(candidate)
                );
              }

              pendingIceCandidates = [];
            }

            else if (signal.signal_type === "ice-candidate") {
              if (callPeer && callPeer.remoteDescription) {
                await callPeer.addIceCandidate(
                  new RTCIceCandidate(signal.payload)
                );
              } else {
                pendingIceCandidates.push(signal.payload);
              }
            }

          } catch (error) {
            console.error("Call signal error:", error);
          }
        }
      )
      .subscribe(status => {
        console.log("Call signals:", status);

        if (status === "SUBSCRIBED") {
          resolve();
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          reject(
            new Error("Could not subscribe to call signals: " + status)
          );
        }
      });
  });
}
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

const { data, error } = await db.functions.invoke(
  "save-push-subscription",
  {
    body: {
      endpoint: subscription.endpoint,
      p256dh: subscriptionData.keys.p256dh,
      auth: subscriptionData.keys.auth
    }
  }
);

if (error) throw error;

if (!data?.ok) {
  throw new Error(data?.error || "Could not save notification subscription.");
}

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
async function sendCallPushNotification(callId) {
  try {
    const { data, error } = await db.functions.invoke("send-push", {
      body: {
        call_id: callId
      }
    });

    if (error) throw error;

    console.log("Incoming-call notification:", data);
  } catch (error) {
    console.warn("Incoming-call notification failed:", error);
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
      voiceRecordBtn.textContent ="▶";
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
if (inboxRealtimeChannel) {
  db.removeChannel(inboxRealtimeChannel);
  inboxRealtimeChannel = null;
}

clearTimeout(inboxRefreshTimer);
inboxRefreshTimer = null;
    showAuth();
  }
});
// ---------------- INCOMING CALL LISTENER ----------------

let incomingCallChannel = null;

async function handleIncomingCall(call) {
  if (!call || call.status !== "ringing") return;
  if (call.callee_id !== currentUser.id) return;

  if (activeCallId && activeCallId !== call.id) return;

  incomingCall = call;
  activeCallId = call.id;
  activeCallType = call.call_type;
  callPartnerId = call.caller_id;

  isCallAccepted = false;
  pendingCallOffer = null;
  pendingIceCandidates = [];

  subscribeToCallStatus();

  callStatus.textContent =
    call.call_type === "video"
      ? "Incoming video call..."
      : "Incoming voice call...";

  callPersonName.textContent = "Incoming call";
  callAvatar.textContent = "♡";

  incomingCallActions.classList.remove("hidden");
  callScreen.classList.remove("hidden");

  await subscribeToCallSignals();

  const { data: offerSignal, error } = await db
    .from("call_signals")
    .select("payload")
    .eq("call_id", call.id)
    .eq("recipient_id", currentUser.id)
    .eq("signal_type", "offer")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (activeCallId !== call.id) return;

  if (offerSignal && !pendingCallOffer) {
    pendingCallOffer = offerSignal.payload;
    callStatus.textContent = "Incoming call — tap Accept";

    if (isCallAccepted) {
      await acceptIncomingWebRTCCall();
    }
  }
}

async function subscribeToIncomingCalls() {
  if (!currentUser) return;

  if (incomingCallChannel) {
    await db.removeChannel(incomingCallChannel);
    incomingCallChannel = null;
  }

  incomingCallChannel = db
    .channel("incoming-calls-" + currentUser.id)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "call_sessions",
        filter: "callee_id=eq." + currentUser.id
      },
      payload => {
        handleIncomingCall(payload.new).catch(error => {
          console.error("Incoming call setup failed:", error);
        });
      }
    )
    .subscribe(status => {
      console.log("Incoming call listener:", status);
    });

  // Recover a call that was created while the app was closed.
  const params = new URLSearchParams(window.location.search);
  const notificationCallId = params.get("incoming_call");

  let query = db
    .from("call_sessions")
    .select("*")
    .eq("callee_id", currentUser.id)
    .eq("status", "ringing");

  if (notificationCallId) {
    query = query.eq("id", notificationCallId);
  }

  const { data: pendingCalls, error } = await query
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Unable to recover pending call:", error);
    return;
  }

  if (pendingCalls && pendingCalls.length > 0) {
    await handleIncomingCall(pendingCalls[0]);

    if (notificationCallId) {
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );
    }
  }
}
// ---------------- CALL RESOURCE CLEANUP ----------------

async function cleanupCallResources() {
  // Stop the call timer
  if (callTimerInterval) {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
  }

  callStartedAt = null;

  // Stop microphone and camera
  if (callStream) {
    callStream.getTracks().forEach(track => {
      track.stop();
    });

    callStream = null;
  }

  // Close WebRTC connection
  if (callPeer) {
    callPeer.ontrack = null;
    callPeer.onicecandidate = null;
    callPeer.onconnectionstatechange = null;

    callPeer.close();
    callPeer = null;
  }

  // Clear video elements
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;

  // Remove call signalling subscription
  if (callChannel) {
    await db.removeChannel(callChannel);
    callChannel = null;
  }

  // Remove call status subscription
  if (callStatusChannel) {
    await db.removeChannel(callStatusChannel);
    callStatusChannel = null;
  }

  // Reset call information
  activeCallId = null;
  activeCallType = null;
  callPartnerId = null;
  incomingCall = null;
  pendingCallOffer = null;
  pendingIceCandidates = [];
  isCallAccepted = false;

  // Reset call controls
  isMicrophoneMuted = false;
  isCameraEnabled = true;

  // Hide call interface
  incomingCallActions.classList.add("hidden");
  callScreen.classList.add("hidden");

  callStatus.textContent = "Call ended";
  callTimer.textContent = "00:00";
}
// –––––––– CALL STATUS SYNCHRONISATION ––––––––
function subscribeToCallStatus() {
  if (!activeCallId) return;

  if (callStatusChannel) {
    db.removeChannel(callStatusChannel);
    callStatusChannel = null;
  }

  const watchedCallId = activeCallId;

  callStatusChannel = db
    .channel("call-status-" + watchedCallId)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "call_sessions",
        filter: "id=eq." + watchedCallId
      },
      async payload => {
        const call = payload.new;

        if (!call || activeCallId !== watchedCallId) return;

        if (call.status === "accepted") {
          callStatus.textContent = "Call accepted — connecting...";
          incomingCallActions.classList.add("hidden");
          return;
        }

        if (
          call.status === "declined" ||
          call.status === "ended" ||
          call.status === "missed"
        ) {
          const finalStatus =
            call.status === "declined"
              ? "Call declined"
              : call.status === "missed"
                ? "Missed call"
                : "Call ended";

          await cleanupCallResources();

          callStatus.textContent = finalStatus;
        }
      }
    )
    .subscribe(status => {
      console.log("Call status listener:", status);
    });
}

// ---------------- START A CALL ----------------

async function startCall(callType) {
  if (!currentUser || !currentConversation) {
    alert("Open a conversation before starting a call.");
    return;
  }

  if (activeCallId) {
    alert("A call is already active.");
    return;
  }

  try {
    callStatus.textContent = "Starting call...";
    callPersonName.textContent = partnerName.textContent;
    incomingCallActions.classList.add("hidden");
    callScreen.classList.remove("hidden");

    const { data: members, error: membersError } = await db
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", currentConversation);

    if (membersError) throw membersError;

    const partner = members.find(
      member => member.user_id !== currentUser.id
    );

    if (!partner) {
      throw new Error("Chat partner not found.");
    }

    const { data: call, error } = await db
      .from("call_sessions")
      .insert({
        conversation_id: currentConversation,
        caller_id: currentUser.id,
        callee_id: partner.user_id,
        call_type: callType,
        status: "ringing"
      })
      .select()
      .single();

    if (error) throw error;

    activeCallId = call.id;
activeCallType = callType;
callPartnerId = partner.user_id;

sendCallPushNotification(call.id);

subscribeToCallStatus();
    callStatus.textContent = "Preparing connection...";

    createCallPeerConnection();
    await prepareCallMedia();

    await subscribeToCallSignals();

    const offer = await callPeer.createOffer();
    await callPeer.setLocalDescription(offer);

    await sendCallSignal("offer", offer);

    callStatus.textContent = "Calling...";

  } catch (error) {
    console.error("Call error:", error);
    callStatus.textContent = "Unable to start call";
    alert("Unable to start the call: " + error.message);
  }
}
// ---------------- CALL DROPDOWN ----------------
// ---------------- CALL DROPDOWN ----------------

document.addEventListener("click", event => {
  const toggle = event.target.closest("#callMenuToggle");
  const voice = event.target.closest("#audioCallMenuItem");
  const video = event.target.closest("#videoCallMenuItem");

  if (toggle) {
    event.preventDefault();

    const isOpen = !callDropdown.classList.contains("hidden");

    callDropdown.classList.toggle("hidden", isOpen);
    toggle.setAttribute("aria-expanded", String(!isOpen));
    return;
  }

  if (voice) {
    callDropdown.classList.add("hidden");
    callMenuToggle.setAttribute("aria-expanded", "false");
    startCall("audio");
    return;
  }

  if (video) {
    callDropdown.classList.add("hidden");
    callMenuToggle.setAttribute("aria-expanded", "false");
    startCall("video");
    return;
  }

  if (!event.target.closest(".call-menu-container")) {
    callDropdown.classList.add("hidden");
    callMenuToggle.setAttribute("aria-expanded", "false");
  }
});
// ---------------- CALL ACCEPT, DECLINE AND END ----------------

async function updateActiveCall(status) {
  if (!activeCallId) return false;

  try {
    const { error } = await db
      .from("call_sessions")
      .update({ status })
      .eq("id", activeCallId);

    if (error) throw error;

    if (status === "accepted") {
      callStatus.textContent = "Call accepted — preparing connection...";
      incomingCallActions.classList.add("hidden");
      incomingCall = null;
      return true;
    }

    await cleanupCallResources();

    callStatus.textContent =
      status === "declined" ? "Call declined" : "Call ended";

    return true;

  } catch (error) {
    console.error("Call update error:", error);
    alert("Unable to update call: " + error.message);
    return false;
  }
}
acceptCallBtn.addEventListener("click", async () => {
  try {
    const updated = await updateActiveCall("accepted");

    if (!updated) return;

    isCallAccepted = true;

    if (pendingCallOffer) {
      await acceptIncomingWebRTCCall();
    }

  } catch (error) {
    console.error("Accept call error:", error);
    alert("Unable to accept call: " + error.message);
  }
});
declineCallBtn.addEventListener("click", () => {
  updateActiveCall("declined");
});

endCallBtn.addEventListener("click", () => {
  updateActiveCall("ended");
});
// ---------------- MICROPHONE MUTE CONTROL ----------------

muteCallBtn.addEventListener("click", () => {
  if (!callStream) {
    alert("Microphone is not available.");
    return;
  }

  const audioTracks = callStream.getAudioTracks();

  if (audioTracks.length === 0) {
    alert("No microphone track found.");
    return;
  }

  isMicrophoneMuted = !isMicrophoneMuted;

  audioTracks.forEach(track => {
    track.enabled = !isMicrophoneMuted;
  });

  muteCallBtn.textContent = isMicrophoneMuted ? "🔇" : "🎤";

  muteCallBtn.title = isMicrophoneMuted
    ? "Unmute microphone"
    : "Mute microphone";
});
// ---------------- CAMERA ON/OFF CONTROL ----------------

cameraCallBtn.addEventListener("click", () => {
  if (activeCallType !== "video") {
    alert("Camera controls are available during video calls.");
    return;
  }

  if (!callStream) {
    alert("Camera is not available.");
    return;
  }

  const videoTracks = callStream.getVideoTracks();

  if (videoTracks.length === 0) {
    alert("No camera track found.");
    return;
  }

  isCameraEnabled = !isCameraEnabled;

  videoTracks.forEach(track => {
    track.enabled = isCameraEnabled;
  });

  cameraCallBtn.textContent = isCameraEnabled ? "📷" : "🚫";

  cameraCallBtn.title = isCameraEnabled
    ? "Turn camera off"
    : "Turn camera on";
});
closeCallBtn.addEventListener("click", () => {
  updateActiveCall("ended");
});
// ---------------- LOAD WHATSAPP-STYLE STATUSES ----------------

async function loadStatuses() {
  if (!currentUser) return;

  statusList.replaceChildren();

  const { data: statuses, error } = await db
    .from("status_updates")
    .select("id, user_id, status_type, text_content, created_at, expires_at")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Could not load statuses:", error);
    statusList.textContent = "Unable to load updates.";
    return;
  }

  const userIds = [
    ...new Set([
      currentUser.id,
      ...(statuses || []).map(status => status.user_id)
    ])
  ];

  const { data: profiles, error: profileError } = await db
    .from("profiles")
    .select("id, display_name, avatar_path")
    .in("id", userIds);

  if (profileError) {
    console.error("Could not load status profiles:", profileError);
  }

  const profileMap = new Map(
    (profiles || []).map(profile => [profile.id, profile])
  );

  const statusIds = (statuses || []).map(status => status.id);

  let viewedStatusIds = new Set();

  if (statusIds.length > 0) {
    const { data: views, error: viewsError } = await db
      .from("status_views")
      .select("status_id")
      .eq("viewer_id", currentUser.id)
      .in("status_id", statusIds);

    if (viewsError) {
      console.error("Could not load status views:", viewsError);
    } else {
      viewedStatusIds = new Set(
        (views || []).map(view => view.status_id)
      );
    }
  }

  const groupedStatuses = new Map();

  (statuses || []).forEach(status => {
    if (!groupedStatuses.has(status.user_id)) {
      groupedStatuses.set(status.user_id, []);
    }

    groupedStatuses.get(status.user_id).push(status);
  });

  function createStatusRow(userId, isMine = false) {
    const profile = profileMap.get(userId) || {};
    const userStatuses = groupedStatuses.get(userId) || [];

    const row = document.createElement("div");
    row.className = "status-item";
    if (isMine) {
  row.addEventListener("click", openStatusComposer);
}
    const ring = document.createElement("div");
    ring.className = "status-ring";

    const hasUnseen = userStatuses.some(
      status => !viewedStatusIds.has(status.id)
    );

    if (!hasUnseen && userStatuses.length > 0) {
      ring.classList.add("status-viewed");
    }

    const avatarUrl = getAvatarUrl(profile.avatar_path);

    if (avatarUrl) {
      const avatar = document.createElement("img");
      avatar.className = "status-avatar";
      avatar.src = avatarUrl;
      avatar.alt = "Profile picture";
      ring.appendChild(avatar);
    } else {
      const fallback = document.createElement("div");
      fallback.className = "status-avatar";
      fallback.style.display = "grid";
      fallback.style.placeItems = "center";
      fallback.textContent = "♡";
      ring.appendChild(fallback);
    }

    if (isMine) {
      const badge = document.createElement("span");
      badge.textContent = "+";
      badge.style.position = "absolute";
      badge.style.right = "-2px";
      badge.style.bottom = "-2px";
      badge.style.width = "22px";
      badge.style.height = "22px";
      badge.style.borderRadius = "50%";
      badge.style.background = "#25d366";
      badge.style.color = "#fff";
      badge.style.display = "grid";
      badge.style.placeItems = "center";
      badge.style.fontSize = "18px";
      badge.style.border = "2px solid #211a30";

      ring.style.position = "relative";
      ring.appendChild(badge);
    }

    const details = document.createElement("div");
    details.className = "status-details";

    const name = document.createElement("strong");
    name.textContent = isMine
      ? "My status"
      : profile.display_name || "User";

    const time = document.createElement("small");

    if (userStatuses.length > 0) {
      time.textContent = new Date(
        userStatuses[0].created_at
      ).toLocaleString([], {
        hour: "2-digit",
        minute: "2-digit"
      });
    } else {
      time.textContent = "Tap to add status";
    }

    details.appendChild(name);
    details.appendChild(time);

    row.appendChild(ring);
    row.appendChild(details);

    return row;
  }

  // Always show my status first
  statusList.appendChild(
    createStatusRow(currentUser.id, true)
  );

  const otherUsers = [...groupedStatuses.keys()]
    .filter(userId => userId !== currentUser.id);

  if (otherUsers.length > 0) {
    const heading = document.createElement("p");
    heading.className = "status-empty";
    heading.textContent = "RECENT UPDATES";
    statusList.appendChild(heading);

    otherUsers.forEach(userId => {
      statusList.appendChild(
        createStatusRow(userId)
      );
    });
  } else {
    const empty = document.createElement("p");
    empty.className = "status-empty";
    empty.textContent = "No recent updates.";
    statusList.appendChild(empty);
  }
}
// ---------------- WHATSAPP STATUS COMPOSER ----------------

const statusComposer = document.getElementById("statusComposer");
const closeStatusComposer = document.getElementById("closeStatusComposer");

const statusChoiceView = document.getElementById("statusChoiceView");
const textStatusOption = document.getElementById("textStatusOption");
const mediaStatusOption = document.getElementById("mediaStatusOption");

const textStatusEditor = document.getElementById("textStatusEditor");
const textStatusCanvas = document.getElementById("textStatusCanvas");
const textStatusInput = document.getElementById("textStatusInput");
const changeStatusBackground = document.getElementById("changeStatusBackground");
const postTextStatus = document.getElementById("postTextStatus");

const mediaStatusEditor = document.getElementById("mediaStatusEditor");
const statusMediaInput = document.getElementById("statusMediaInput");
const statusMediaPreview = document.getElementById("statusMediaPreview");
const mediaStatusCaption = document.getElementById("mediaStatusCaption");
const postMediaStatus = document.getElementById("postMediaStatus");

let selectedStatusFile = null;
let statusPreviewUrl = null;
let selectedStatusBackground = "#075e54";

const statusBackgrounds = [
  "#075e54",
  "#128c7e",
  "#7b2cbf",
  "#c2185b",
  "#1565c0",
  "#e65100",
  "#37474f",
  "#283593"
];

function openStatusComposer() {
  if (!currentUser) {
    alert("Please sign in to create a status.");
    return;
  }

  statusComposer.classList.remove("hidden");
  statusChoiceView.classList.remove("hidden");
  textStatusEditor.classList.add("hidden");
  mediaStatusEditor.classList.add("hidden");
}

function hideStatusComposer() {
  statusComposer.classList.add("hidden");

  statusChoiceView.classList.remove("hidden");
  textStatusEditor.classList.add("hidden");
  mediaStatusEditor.classList.add("hidden");

  textStatusInput.value = "";
  mediaStatusCaption.value = "";

  selectedStatusFile = null;
  statusMediaInput.value = "";
  statusMediaPreview.replaceChildren();

  if (statusPreviewUrl) {
    URL.revokeObjectURL(statusPreviewUrl);
    statusPreviewUrl = null;
  }
}

addStatusBtn.addEventListener("click", openStatusComposer);

closeStatusComposer.addEventListener("click", hideStatusComposer);

statusComposer.addEventListener("click", event => {
  if (event.target === statusComposer) {
    hideStatusComposer();
  }
});

// ---------------- TEXT STATUS EDITOR ----------------

textStatusOption.addEventListener("click", () => {
  statusChoiceView.classList.add("hidden");
  textStatusEditor.classList.remove("hidden");

  textStatusInput.focus();
});

changeStatusBackground.addEventListener("click", () => {
  const currentIndex = statusBackgrounds.indexOf(
    selectedStatusBackground
  );

  selectedStatusBackground =
    statusBackgrounds[
      (currentIndex + 1) % statusBackgrounds.length
    ];

  textStatusCanvas.style.background =
    selectedStatusBackground;
});

// ---------------- POST TEXT STATUS ----------------

postTextStatus.addEventListener("click", async () => {
  if (!currentUser) return;

  const text = textStatusInput.value.trim();

  if (!text) {
    alert("Please type something first.");
    return;
  }

  postTextStatus.disabled = true;
  postTextStatus.textContent = "Posting...";

  try {
    const { error } = await db
      .from("status_updates")
      .insert({
        user_id: currentUser.id,
        status_type: "text",
        text_content: text,
        background_color: selectedStatusBackground,
        expires_at: new Date(
          Date.now() + 24 * 60 * 60 * 1000
        ).toISOString()
      });

    if (error) throw error;

    hideStatusComposer();
    await loadStatuses();

    alert("Your text status has been posted!");

  } catch (error) {
    console.error("Text status error:", error);
    alert("Could not post status: " + error.message);

  } finally {
    postTextStatus.disabled = false;
    postTextStatus.textContent = "Post";
  }
});

// ---------------- PHOTO AND VIDEO PICKER ----------------

mediaStatusOption.addEventListener("click", () => {
  statusMediaInput.click();
});

statusMediaInput.addEventListener("change", () => {
  const file = statusMediaInput.files[0];

  if (!file) return;

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  if (!isImage && !isVideo) {
    alert("Please select an image or video.");
    statusMediaInput.value = "";
    return;
  }

  if (file.size > 50 * 1024 * 1024) {
    alert("Your file must be smaller than 50 MB.");
    statusMediaInput.value = "";
    return;
  }

  selectedStatusFile = file;

  if (statusPreviewUrl) {
    URL.revokeObjectURL(statusPreviewUrl);
  }

  statusPreviewUrl = URL.createObjectURL(file);

  statusMediaPreview.replaceChildren();

  let preview;

  if (isImage) {
    preview = document.createElement("img");
    preview.alt = "Status image preview";
  } else {
    preview = document.createElement("video");
    preview.controls = true;
    preview.playsInline = true;
  }

  preview.src = statusPreviewUrl;

  statusMediaPreview.appendChild(preview);

  statusChoiceView.classList.add("hidden");
  mediaStatusEditor.classList.remove("hidden");
});

// ---------------- POST PHOTO OR VIDEO STATUS ----------------

postMediaStatus.addEventListener("click", async () => {
  if (!currentUser || !selectedStatusFile) {
    alert("Please select an image or video first.");
    return;
  }

  const file = selectedStatusFile;
  const isVideo = file.type.startsWith("video/");
  const statusType = isVideo ? "video" : "image";

  const extension = file.name.includes(".")
    ? file.name.split(".").pop().toLowerCase()
    : (isVideo ? "mp4" : "jpg");

  const filePath =
    currentUser.id + "/" +
    Date.now() + "-" +
    crypto.randomUUID() + "." +
    extension;

  postMediaStatus.disabled = true;
  postMediaStatus.textContent = "Uploading...";

  let uploadedPath = null;

  try {
    const { error: uploadError } = await db.storage
      .from("status-media")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) throw uploadError;

    uploadedPath = filePath;

    const { error: insertError } = await db
      .from("status_updates")
      .insert({
        user_id: currentUser.id,
        status_type: statusType,
        media_path: filePath,
        text_content: mediaStatusCaption.value.trim() || null,
        expires_at: new Date(
          Date.now() + 24 * 60 * 60 * 1000
        ).toISOString()
      });

    if (insertError) throw insertError;

    hideStatusComposer();
    await loadStatuses();

    alert("Your status has been posted!");

  } catch (error) {
    console.error("Media status error:", error);

    if (uploadedPath) {
      await db.storage
        .from("status-media")
        .remove([uploadedPath]);
    }

    alert("Could not post media status: " + error.message);

  } finally {
    postMediaStatus.disabled = false;
    postMediaStatus.textContent = "Post";
  }
});
async function initializeChat(user) {
  if (!user || initializationInProgress) return;

  initializationInProgress = true;
  currentUser = user;
  currentConversation = null;

  setComposerEnabled(false);

  authView.classList.add("hidden");
  appView.classList.remove("hidden");
  showDirectory();

  peopleCount.textContent = "Loading...";
  peopleList.replaceChildren();
  statusList.textContent = "Loading updates...";

  async function runStep(name, task, onError) {
    try {
      await Promise.race([
        task(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(name + " timed out")), 15000)
        )
      ]);
    } catch (error) {
      console.error(name + " error:", error);
      onError(error);
    }
  }

  await runStep(
    "Profile photo",
    loadMyProfilePhoto,
    error => console.warn(error)
  );

  await runStep(
    "Conversations",
    loadExistingConversations,
    error => console.warn(error)
  );

  await runStep(
    "People directory",
    loadPeople,
    error => {
      peopleCount.textContent = "Unable to load";
      showDirectoryNotice("Directory error: " + error.message);
    }
  );

  await runStep(
    "Status updates",
    loadStatuses,
    error => {
      statusList.textContent = "Unable to load updates: " + error.message;
    }
  );

  subscribeToInboxUpdates();
  subscribeToIncomingCalls();

  initializationInProgress = false;
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
  // Display the user's profile picture
  const avatarWrap = document.createElement("div");
  avatarWrap.className = "person-card-avatar-wrap";

  const avatarUrl = getAvatarUrl(profile.avatar_path);

  if (avatarUrl) {
    const avatar = document.createElement("img");
    avatar.className = "person-card-avatar";
    avatar.src = avatarUrl;
    avatar.alt = "Profile picture";
    avatarWrap.appendChild(avatar);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "person-card-avatar-fallback";
    fallback.textContent = "♡";
    avatarWrap.appendChild(fallback);
  }

  card.appendChild(avatarWrap);
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
    partnerAvatar.classList.add("hidden");
    partnerAvatarFallback.classList.remove("hidden");
    return;
  }

  const partner = members.find(
    member => member.user_id !== currentUser.id
  );

  if (!partner) {
    partnerName.textContent = "Private conversation";
    partnerAvatar.classList.add("hidden");
    partnerAvatarFallback.classList.remove("hidden");
    return;
  }

  const { data: profile } = await db
    .from("profiles")
    .select("display_name, username, avatar_path")
    .eq("id", partner.user_id)
    .maybeSingle();

  partnerName.textContent =
    profile?.display_name || "Your chat partner";

  const avatarUrl = getAvatarUrl(profile?.avatar_path);

  if (avatarUrl) {
    partnerAvatar.src = avatarUrl;
    partnerAvatar.classList.remove("hidden");
    partnerAvatarFallback.classList.add("hidden");
  } else {
    partnerAvatar.removeAttribute("src");
    partnerAvatar.classList.add("hidden");
    partnerAvatarFallback.classList.remove("hidden");
  }
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

await Promise.all(
  visibleMessages
    .filter(message => message.sender_id !== currentUser.id)
    .map(message => markMessageRead(message.id))
);

scrollToBottom();
await refreshInbox();
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

    if (payload.new.sender_id !== currentUser.id) {
      markMessageRead(payload.new.id).then(() => refreshInbox());
    } else {
      refreshInbox();
    }
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
// ---------------- PROFILE PHOTO UPLOAD ----------------

changeProfilePhotoBtn.addEventListener("click", () => {
  profilePhotoInput.click();
});

profilePhotoInput.addEventListener("change", async () => {
  const file = profilePhotoInput.files[0];

  if (!file || !currentUser) return;

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowedTypes.includes(file.type)) {
    alert("Please choose a JPG, PNG, or WEBP image.");
    profilePhotoInput.value = "";
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert("Your profile picture must not exceed 5 MB.");
    profilePhotoInput.value = "";
    return;
  }

  changeProfilePhotoBtn.disabled = true;
  profilePhotoStatus.textContent = "Uploading picture...";

  let newPath = null;

  try {
    const { data: oldProfile, error: oldProfileError } = await db
      .from("profiles")
      .select("avatar_path")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (oldProfileError) throw oldProfileError;

    const oldPath = oldProfile?.avatar_path || null;

    const extension = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    }[file.type];

    newPath = `${currentUser.id}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await db.storage
      .from("profile-pictures")
      .upload(newPath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });

    if (uploadError) throw uploadError;

    const { error: updateError } = await db
      .from("profiles")
      .update({
        avatar_path: newPath,
        updated_at: new Date().toISOString()
      })
      .eq("id", currentUser.id);

    if (updateError) throw updateError;

    displayMyProfilePhoto(newPath);

    if (oldPath && oldPath.startsWith(`${currentUser.id}/`)) {
      await db.storage
        .from("profile-pictures")
        .remove([oldPath]);
    }

    await loadPeople();

    alert("Your profile picture has been updated!");

  } catch (error) {
    console.error("Profile picture upload failed:", error);

    if (newPath) {
      await db.storage
        .from("profile-pictures")
        .remove([newPath]);
    }

    profilePhotoStatus.textContent = "Upload failed. Please try again.";
    alert("Could not upload your profile picture. Please try again.");

  } finally {
    changeProfilePhotoBtn.disabled = false;
    profilePhotoInput.value = "";
  }
});
// ---------------- REMOVE PROFILE PHOTO ----------------

removeProfilePhotoBtn.addEventListener("click", async () => {
  if (!currentUser) return;

  const confirmed = confirm(
    "Are you sure you want to remove your profile picture?"
  );

  if (!confirmed) return;

  removeProfilePhotoBtn.disabled = true;
  profilePhotoStatus.textContent = "Removing picture...";

  try {
    const { data: profile, error: fetchError } = await db
      .from("profiles")
      .select("avatar_path")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const oldPath = profile?.avatar_path || null;

    const { error: updateError } = await db
      .from("profiles")
      .update({
        avatar_path: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", currentUser.id);

    if (updateError) throw updateError;

    displayMyProfilePhoto(null);

    if (oldPath && oldPath.startsWith(`${currentUser.id}/`)) {
      const { error: removeError } = await db.storage
        .from("profile-pictures")
        .remove([oldPath]);

      if (removeError) {
        console.warn("Old profile image could not be deleted:", removeError);
      }
    }

    await loadPeople();

    alert("Your profile picture has been removed.");

  } catch (error) {
    console.error("Profile picture removal failed:", error);
    profilePhotoStatus.textContent = "Could not remove picture. Try again.";
    alert("Could not remove your profile picture. Please try again.");

  } finally {
    removeProfilePhotoBtn.disabled = false;
  }
});
