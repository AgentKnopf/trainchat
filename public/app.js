// All DOM insertion uses textContent — never innerHTML
const messagesEl = document.getElementById('messages');
const myNameEl   = document.getElementById('my-name');
const roomSizeEl = document.getElementById('room-size');
const input      = document.getElementById('msg-input');
const sendBtn    = document.getElementById('send-btn');

let myName = null;

const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${proto}://${location.host}`);

ws.addEventListener('open', () => {
  addSystem('Connected — waiting for room info…');
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
    // Our own join confirmation
    myName = msg.name;
    myNameEl.textContent = msg.name;
    updateRoomSize(msg.roomSize);
    setEnabled(true);
    addSystem(`You joined as ${msg.name}`);
    return;
  }

  if (msg.type === 'joined') {
    updateRoomSize(msg.roomSize);
    addSystem(`${msg.name} joined`);
    return;
  }

  if (msg.type === 'left') {
    updateRoomSize(msg.roomSize);
    addSystem(`${msg.name} left`);
    return;
  }

  if (msg.type === 'msg') {
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
