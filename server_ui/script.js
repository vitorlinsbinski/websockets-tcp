const clients = new Map();
const chatLogs = new Map();
let selectedId = null;
let ws = null;

const COLORS = [
   '#3b82f6',
   '#22d3ee',
   '#a855f7',
   '#f59e0b',
   '#ec4899',
   '#10b981',
   '#ef4444',
   '#f97316',
];
let colorIdx = 0;

function connect() {
   const proto = location.protocol === 'https:' ? 'wss' : 'ws';
   ws = new WebSocket(`${proto}://${location.host}/ws`);

   ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'server_ui_connect' }));
      setWsStatus(true);
   };

   ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      handle(msg);
   };

   ws.onclose = () => {
      setWsStatus(false);
      setTimeout(connect, 2000);
   };
   ws.onerror = () => ws.close();
}

function setWsStatus(on) {
   document.getElementById('wsDot').style.background = on
      ? 'var(--green)'
      : 'var(--red)';
   document.getElementById('wsLabel').textContent = on
      ? 'conectado ao relay'
      : 'reconectando...';
   document.getElementById('wsLabel').style.color = on
      ? 'var(--green)'
      : 'var(--red)';
}

function handle(msg) {
   if (msg.type === 'client_list') {
      msg.clients.forEach(addClient);
      renderList();
      return;
   }
   if (msg.type === 'client_joined') {
      addClient(msg);
      renderList();
      toast(`SYN-ACK · ${msg.name}`);
      return;
   }
   if (msg.type === 'client_left') {
      const c = clients.get(msg.id);
      if (c) {
         pushLog(msg.id, 'sys', 'Cliente desconectado');
         clients.delete(msg.id);
         if (selectedId === msg.id) {
            selectedId = null;
            showWelcome();
         }
         renderList();
         toast(`FIN · ${c.name}`);
      }
      return;
   }
   if (msg.type === 'client_message') {
      pushLog(msg.clientId, 'recv', msg.text, msg.clientName);
      if (selectedId === msg.clientId) renderLog(selectedId);
      else {
         const c = clients.get(msg.clientId);
         if (c) {
            c.unread = (c.unread || 0) + 1;
            renderList();
         }
      }
      return;
   }
   if (msg.type === 'sys') {
      // Show in current log or as floating toast
      if (selectedId) pushLog(selectedId, 'sys', msg.msg);
      if (selectedId) renderLog(selectedId);
      else appendGlobalSys(msg.msg);
      return;
   }
}

function addClient(c) {
   if (!clients.has(c.id)) {
      c.color = COLORS[colorIdx++ % COLORS.length];
      c.unread = 0;
      clients.set(c.id, c);
      chatLogs.set(c.id, []);
      pushLog(c.id, 'tcp', 'Handshake TCP 3-way concluído — ESTABLISHED');
      pushLog(c.id, 'sys', `Bem-vindo ao servidor, ${c.name}!`);
   }
}

function pushLog(clientId, type, msg, sender) {
   if (!chatLogs.has(clientId)) chatLogs.set(clientId, []);
   chatLogs.get(clientId).push({ type, msg, sender, time: t() });
}

function renderLog(clientId) {
   const la = document.getElementById('logArea');
   la.innerHTML = `<div class="log-div">— sessão com ${clients.get(clientId)?.name || '?'} —</div>`;
   (chatLogs.get(clientId) || []).forEach((e) => la.appendChild(makeEntry(e)));
   la.scrollTop = la.scrollHeight;
}

function makeEntry(e) {
   const d = document.createElement('div');
   d.className = 'log-entry';
   const cls =
      {
         sent: 'tag-sent',
         recv: 'tag-recv',
         sys: 'tag-sys',
         tcp: 'tag-tcp',
         err: 'tag-err',
      }[e.type] || 'tag-sys';
   const lbl =
      {
         sent: 'ENVIADO',
         recv: 'RECEBIDO',
         sys: 'SISTEMA',
         tcp: 'TCP',
         err: 'ERRO',
      }[e.type] || 'SYS';
   d.innerHTML = `<span class="lt">${e.time}</span><span class="ltag ${cls}">${lbl}</span><span class="lc">${e.sender ? `<strong>${esc(e.sender)}:</strong> ` : ''}${esc(e.msg)}</span>`;
   return d;
}

function renderList() {
   const list = document.getElementById('clientList');
   document.getElementById('ccount').textContent = clients.size;
   const noC = document.getElementById('noClients');
   if (clients.size === 0) {
      list.innerHTML = '';
      list.appendChild(noC);
      noC.style.display = '';
      return;
   }
   noC.style.display = 'none';
   list.innerHTML = '';
   clients.forEach((c) => {
      const d = document.createElement('div');
      d.className = 'client-item' + (c.id === selectedId ? ' active' : '');
      d.id = `ci-${c.id}`;
      d.onclick = () => selectClient(c.id);
      d.innerHTML = `
      <div class="cavatar" style="background:${alpha(c.color, 0.15)};color:${c.color};border:1px solid ${alpha(c.color, 0.35)}">${ini(c.name)}</div>
      <div class="cinfo">
        <div class="cn">${esc(c.name)}</div>
        <div class="cm">${c.ip}:${c.port}</div>
      </div>
      <div class="online-dot"></div>
      ${c.unread ? `<div class="ubadge">${c.unread}</div>` : ''}
    `;
      list.appendChild(d);
   });
}

function selectClient(id) {
   selectedId = id;
   const c = clients.get(id);
   if (!c) return;
   c.unread = 0;

   document.getElementById('chatAv').textContent = ini(c.name);
   document.getElementById('chatAv').style.cssText =
      `background:${alpha(c.color, 0.15)};color:${c.color};border:1px solid ${alpha(c.color, 0.4)};width:38px;height:38px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:13px;font-weight:700;`;
   document.getElementById('chatName').textContent = c.name;
   document.getElementById('chatMeta').textContent =
      `${c.ip}:${c.port} · conectado às ${c.connectedAt}`;
   document.getElementById('chip').textContent =
      `PARA: ${c.name.toUpperCase()}`;
   document.getElementById('btnSend').disabled = false;
   document.getElementById('msgInput').placeholder =
      `Mensagem unicast para ${c.name}...`;

   document.getElementById('welcomeView').style.display = 'none';
   const cv = document.getElementById('chatView');
   cv.style.display = 'flex';

   renderLog(id);
   renderList();
}

function showWelcome() {
   document.getElementById('welcomeView').style.display = 'flex';
   document.getElementById('chatView').style.display = 'none';
}

function sendMsg() {
   const input = document.getElementById('msgInput');
   const text = input.value.trim();
   if (!text || !selectedId) return;
   const c = clients.get(selectedId);
   if (!c) return;

   ws.send(
      JSON.stringify({ type: 'server_to_client', targetId: selectedId, text }),
   );
   pushLog(selectedId, 'sent', text, 'Servidor');
   renderLog(selectedId);
   toast(`DATA → ${c.name}`);

   input.value = '';
   input.style.height = 'auto';
}

function disconnectClient() {
   if (!selectedId) return;
   const c = clients.get(selectedId);
   if (!c || !confirm(`Desconectar ${c.name}?`)) return;
   // Server-side drop: client's WS will close → handleDisconnect fires
   ws.send(JSON.stringify({ type: 'disconnect_client', targetId: selectedId }));
}

function t() {
   return new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
   });
}
function ini(n) {
   return n
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
}
function esc(s) {
   return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
}
function alpha(hex, a) {
   const r = parseInt(hex.slice(1, 3), 16),
      g = parseInt(hex.slice(3, 5), 16),
      b = parseInt(hex.slice(5, 7), 16);
   return `rgba(${r},${g},${b},${a})`;
}
function toast(label) {
   document.querySelectorAll('.toast').forEach((e) => e.remove());
   const el = document.createElement('div');
   el.className = 'toast';
   el.textContent = `TCP PKT ▶ ${label}`;
   document.body.appendChild(el);
   setTimeout(() => el.remove(), 2500);
}

connect();
