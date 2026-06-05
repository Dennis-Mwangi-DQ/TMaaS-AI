const chatWindow = document.getElementById('chatWindow');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const quickReplies = document.getElementById('quickReplies');
const errorBanner = document.getElementById('errorBanner');
const connectionStatus = document.getElementById('connectionStatus');
const connectionHint = document.getElementById('connectionHint');
const composerStatus = document.getElementById('composerStatus');
const loadingTimer = document.getElementById('loadingTimer');
const waitCard = document.getElementById('waitCard');
const chatForm = document.getElementById('chatForm');
const resetButton = document.getElementById('resetButton');

const SESSION_KEY = 'browzChatSessionId';
const TRANSCRIPT_KEY = 'browzChatTranscript';

let sessionId = localStorage.getItem(SESSION_KEY);
let loadingIntervalId = null;
let loadingStartedAt = null;
let pendingMessageId = null;

if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, sessionId);
}

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function setBanner(message = '', type = 'error') {
  if (!message) {
    errorBanner.hidden = true;
    errorBanner.textContent = '';
    return;
  }

  errorBanner.hidden = false;
  errorBanner.dataset.type = type;
  errorBanner.textContent = message;
}

function setStatus(title, hint) {
  connectionStatus.textContent = title;
  connectionHint.textContent = hint;
}

function scrollToBottom() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function buildMetaLabel(sender, timestamp) {
  const labelMap = {
    user: 'You',
    agent: 'Browz Concierge',
    system: 'System',
    error: 'Error',
  };

  const time = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${labelMap[sender] ?? sender} • ${time}`;
}

function persistTranscript() {
  const messages = Array.from(chatWindow.querySelectorAll('.message[data-persist="true"]')).map((node) => ({
    sender: node.dataset.sender,
    text: node.querySelector('.bubble')?.textContent ?? '',
    timestamp: node.dataset.timestamp,
  }));

  localStorage.setItem(TRANSCRIPT_KEY, JSON.stringify(messages));
}

function addMessage(text, sender, options = {}) {
  const wrapper = document.createElement('article');
  wrapper.className = `message ${sender}`;
  wrapper.dataset.sender = sender;
  wrapper.dataset.timestamp = options.timestamp ?? new Date().toISOString();
  wrapper.dataset.persist = options.persist === false ? 'false' : 'true';

  if (options.id) {
    wrapper.dataset.id = options.id;
  }

  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = buildMetaLabel(sender, wrapper.dataset.timestamp);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;

  wrapper.append(meta, bubble);
  chatWindow.appendChild(wrapper);
  scrollToBottom();

  if (options.persist !== false) {
    persistTranscript();
  }

  return wrapper;
}

function removeEmptyState() {
  const emptyState = chatWindow.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }
}

function showEmptyState() {
  if (chatWindow.children.length > 0) {
    return;
  }

  const emptyState = document.createElement('div');
  emptyState.className = 'empty-state';
  emptyState.innerHTML = `
    <span class="eyebrow">Browz Booking Concierge</span>
    <h3>Start a conversation</h3>
    <p>Try asking about available slots, consultation requirements, pricing, or payment links.</p>
  `;
  chatWindow.appendChild(emptyState);
}

function addLoadingMessage() {
  const id = `loading-${Date.now()}`;
  const wrapper = document.createElement('article');
  wrapper.className = 'message system';
  wrapper.dataset.sender = 'system';
  wrapper.dataset.id = id;
  wrapper.dataset.persist = 'false';
  wrapper.dataset.timestamp = new Date().toISOString();

  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = buildMetaLabel('system', wrapper.dataset.timestamp);

  const bubble = document.createElement('div');
  bubble.className = 'bubble loading-bubble';
  bubble.innerHTML = `
    <span class="loading-dots" aria-hidden="true"><span></span><span></span><span></span></span>
    <span>Waiting for the model to respond...</span>
  `;

  wrapper.append(meta, bubble);
  chatWindow.appendChild(wrapper);
  scrollToBottom();
  return id;
}

function removeMessageById(id) {
  if (!id) {
    return;
  }

  const node = chatWindow.querySelector(`.message[data-id="${id}"]`);
  if (node) {
    node.remove();
  }
}

function setLoading(enabled) {
  sendButton.disabled = enabled;
  messageInput.disabled = enabled;
  resetButton.disabled = enabled;

  if (enabled) {
    loadingStartedAt = Date.now();
    waitCard.hidden = false;
    composerStatus.textContent = 'Waiting for Ollama... this can take a minute or two';
    setStatus('Thinking...', 'Ollama can take 1 to 3 minutes to answer. We will keep the timer running.');
    loadingTimer.textContent = '00:00';
    pendingMessageId = addLoadingMessage();

    loadingIntervalId = window.setInterval(() => {
      if (loadingStartedAt) {
        loadingTimer.textContent = formatElapsed(Date.now() - loadingStartedAt);
      }
    }, 1000);
    return;
  }

  if (loadingIntervalId) {
    window.clearInterval(loadingIntervalId);
    loadingIntervalId = null;
  }

  loadingStartedAt = null;
  waitCard.hidden = true;
  composerStatus.textContent = 'Press Enter to send';
  setStatus('Ready to chat', 'Ask about bookings, availability, consultations, or payment links.');
  removeMessageById(pendingMessageId);
  pendingMessageId = null;
}

function renderQuickReplies(replies) {
  quickReplies.innerHTML = '';
  if (!replies || replies.length === 0) {
    return;
  }

  replies.forEach((reply) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quick-reply';
    button.textContent = reply;
    button.addEventListener('click', () => {
      messageInput.value = reply;
      autoresizeTextarea();
      messageInput.focus();
    });
    quickReplies.appendChild(button);
  });
}

function autoresizeTextarea() {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 180)}px`;
}

function readErrorMessage(payload, fallback) {
  if (!payload) {
    return fallback;
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload.error === 'string') {
    return payload.error;
  }

  if (typeof payload.message === 'string') {
    return payload.message;
  }

  if (payload.details) {
    return `${fallback} ${JSON.stringify(payload.details)}`;
  }

  return fallback;
}

async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message) {
    return;
  }

  removeEmptyState();
  setBanner('');
  addMessage(message, 'user');
  messageInput.value = '';
  autoresizeTextarea();
  renderQuickReplies([]);
  setLoading(true);

  try {
    const response = await fetch('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, sessionId }),
    });

    const rawText = await response.text();
    let result = null;

    try {
      result = rawText ? JSON.parse(rawText) : null;
    } catch {
      result = null;
    }

    if (!response.ok) {
      const errorMessage = readErrorMessage(
        result,
        rawText || `Request failed with status ${response.status}.`,
      );
      setBanner(errorMessage);
      addMessage(errorMessage, 'error');
      return;
    }

    const responseText =
      (result && typeof result.response === 'string' && result.response.trim()) ||
      'The server returned an empty reply.';

    addMessage(responseText, 'agent');

    if (Array.isArray(result?.quickReplies)) {
      renderQuickReplies(result.quickReplies);
    }

    if (result?.sessionId && result.sessionId !== sessionId) {
      sessionId = result.sessionId;
      localStorage.setItem(SESSION_KEY, sessionId);
    }
  } catch (error) {
    const messageText =
      error instanceof Error
        ? error.message
        : 'Unable to reach the server. Please check that the backend is running.';
    setBanner(messageText);
    addMessage(messageText, 'error');
  } finally {
    setLoading(false);
    messageInput.focus();
  }
}

function resetChat() {
  sessionId = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, sessionId);
  localStorage.removeItem(TRANSCRIPT_KEY);
  chatWindow.innerHTML = '';
  renderQuickReplies([]);
  setBanner('');
  showEmptyState();
  addMessage(
    'Welcome to Browz Concierge. Ask about availability, bookings, consultations, or payment links to begin.',
    'agent',
  );
  setStatus('Ready to chat', 'Ask about bookings, availability, consultations, or payment links.');
  messageInput.value = '';
  autoresizeTextarea();
  messageInput.focus();
}

function restoreTranscript() {
  const raw = localStorage.getItem(TRANSCRIPT_KEY);
  if (!raw) {
    return false;
  }

  try {
    const transcript = JSON.parse(raw);
    if (!Array.isArray(transcript) || transcript.length === 0) {
      return false;
    }

    transcript.forEach((entry) => {
      if (!entry || typeof entry.text !== 'string' || typeof entry.sender !== 'string') {
        return;
      }
      removeEmptyState();
      addMessage(entry.text, entry.sender, {
        timestamp: entry.timestamp,
      });
    });
    return true;
  } catch {
    localStorage.removeItem(TRANSCRIPT_KEY);
    return false;
  }
}

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  sendMessage();
});

resetButton.addEventListener('click', resetChat);

messageInput.addEventListener('input', autoresizeTextarea);
messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

showEmptyState();
if (!restoreTranscript()) {
  addMessage(
    'Welcome to Browz Concierge. Ask about availability, bookings, consultations, or payment links to begin.',
    'agent',
  );
}
autoresizeTextarea();
