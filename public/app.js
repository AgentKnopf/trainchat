// All DOM insertion uses textContent — never innerHTML
const messagesEl = document.getElementById('messages');
const myNameEl   = document.getElementById('my-name');
const roomSizeEl = document.getElementById('room-size');
const input      = document.getElementById('msg-input');
const sendBtn    = document.getElementById('send-btn');

let myName = null;
let pendingClaim = false;

const HISTORY_KEY = 'trainchat-messages';
const HISTORY_MAX = 300;

function storeMessage(from, text, ts) {
  let history;
  try {
    history = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]');
    if (!Array.isArray(history)) history = [];
  } catch { history = []; }
  history.push({ from, text, ts });
  if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
  try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* storage full — skip */ }
}

function replayHistory() {
  let history;
  try {
    history = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]');
    if (!Array.isArray(history) || history.length === 0) return;
  } catch { return; }

  const sep = document.createElement('div');
  sep.className = 'system-msg';
  sep.textContent = '— earlier messages —';
  messagesEl.appendChild(sep);

  for (const entry of history) {
    if (typeof entry.from === 'string' && typeof entry.text === 'string') {
      addMessage(entry.from, entry.text, entry.from === myName);
    }
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${proto}://${location.host}`);

ws.addEventListener('open', () => {
  addSystem('Connected — waiting for room info…');
  try {
    const saved = JSON.parse(sessionStorage.getItem('trainchat-name') ?? 'null');
    if (saved?.name && saved?.token) {
      pendingClaim = true;
      ws.send(JSON.stringify({ type: 'claim', name: saved.name, token: saved.token }));
    }
  } catch { /* corrupt sessionStorage — ignore */ }
});

ws.addEventListener('close', () => {
  setEnabled(false);
  addSystem('Disconnected. Refresh to reconnect.');
});

ws.addEventListener('error', () => {
  addSystem('Connection error.');
});

ws.addEventListener('message', (event) => {
  let msg;
  try { msg = JSON.parse(event.data); } catch { return; }

  if (msg.type === 'joined' && !myName) {
    // Own join confirmation (initial or after claim)
    myName = msg.name;
    myNameEl.textContent = msg.name;
    updateRoomSize(msg.roomSize);
    setEnabled(true);
    replayHistory();
    if (!pendingClaim) {
      addSystem(`You joined as ${msg.name}`);
      if (msg.token) {
        sessionStorage.setItem('trainchat-name', JSON.stringify({ name: msg.name, token: msg.token }));
      }
    }
    return;
  }

  if (msg.type === 'joined' && myName && msg.token) {
    // Claim succeeded — server confirmed our name with a fresh token
    pendingClaim = false;
    myName = msg.name;
    myNameEl.textContent = msg.name;
    updateRoomSize(msg.roomSize);
    replayHistory();
    addSystem(`You rejoined as ${msg.name}`);
    sessionStorage.setItem('trainchat-name', JSON.stringify({ name: msg.name, token: msg.token }));
    return;
  }

  if (msg.type === 'joined') {
    // Peer joined the room
    updateRoomSize(msg.roomSize);
    addSystem(`${msg.name} joined`);
    return;
  }

  if (msg.type === 'left') {
    updateRoomSize(msg.roomSize);
    addSystem(`${msg.name} left`);
    return;
  }

  if (msg.type === 'renamed') {
    addSystem(`${msg.from} is now ${msg.to}`);
    return;
  }

  if (msg.type === 'msg') {
    storeMessage(msg.from, msg.text, msg.ts);
    addMessage(msg.from, msg.text, msg.from === myName);
  }
});

function addMessage(from, text, isMe) {
  const div = document.createElement('div');
  div.className = isMe ? 'msg mine' : 'msg';

  const sender = document.createElement('div');
  sender.className = 'sender';
  sender.textContent = from; // textContent — safe

  const body = document.createElement('div');
  body.className = 'text';
  body.textContent = text; // textContent — safe

  div.appendChild(sender);
  div.appendChild(body);
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addSystem(text) {
  const div = document.createElement('div');
  div.className = 'system-msg';
  div.textContent = text; // textContent — safe
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateRoomSize(n) {
  roomSizeEl.textContent = n === 1 ? 'Just you here' : `${n} people here`;
}

function setEnabled(enabled) {
  input.disabled = !enabled;
  sendBtn.disabled = !enabled;
  if (enabled) input.focus();
}

function sendMessage() {
  const text = input.value.trim();
  if (!text || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'msg', text }));
  input.value = '';
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
