let ws = null;
let myId = null;
let myName = null;
let connected = false;

function connectToServer() {
   const name = document.getElementById('clientName').value.trim();
   const ip = document.getElementById('serverIP').value.trim() || 'localhost';
   const port = document.getElementById('serverPort').value.trim() || '3000';

   if (!name) {
      showError('Informe seu nome antes de conectar.');
      document.getElementById('clientName').focus();
      return;
   }

   document.getElementById('btnConnect').disabled = true;
   document.getElementById('btnConnect').textContent = '⏳ CONECTANDO...';

   const proto = location.protocol === 'https:' ? 'wss' : 'ws';
   const wsUrl = `${proto}://${ip}:${port}/ws`;

   try {
      ws = new WebSocket(wsUrl);
   } catch (e) {
      showError(`Erro ao criar WebSocket: ${e.message}`);
      resetBtn();
      return;
   }

   ws.onopen = () => {
      ws.send(
         JSON.stringify({ type: 'client_connect', name, serverPort: port }),
      );
      log('tcp', `Enviando SYN para ${ip}:${port}...`);
      log('tcp', 'Aguardando SYN-ACK do servidor...');
   };

   ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      handle(msg, ip, port);
   };

   ws.onclose = () => {
      if (!connected) {
         showError(
            `Não foi possível conectar ao servidor em ${ip}:${port}.<br>Verifique se o servidor está rodando.`,
         );
         resetBtn();
         return;
      }
      connected = false;
      log('tcp', 'Conexão encerrada pelo servidor (FIN)');
      log('sys', 'ESTADO: CLOSED — reconecte para nova sessão');
      document.getElementById('tcpState').textContent = 'CLOSED';
      document.getElementById('tcpState').style.color = 'var(--red)';
      document.getElementById('btnSend').disabled = true;
      toast('FIN · CLOSED');
   };

   ws.onerror = () => {};
}

function handle(msg, serverIP, serverPort) {
   if (msg.type === 'connected') {
      connected = true;
      myId = msg.id;
      myName = msg.name;

      // Update UI
      const ini = myName
         .split(' ')
         .map((w) => w[0])
         .join('')
         .toUpperCase()
         .slice(0, 2);
      document.getElementById('myAv').textContent = ini;
      document.getElementById('myName').textContent = myName;
      document.getElementById('myMeta').textContent =
         `ID do cliente: #${myId} · conectado às ${msg.connectedAt}`;
      document.getElementById('localSocket').textContent =
         `${msg.ip}:${msg.assignedPort}`;
      document.getElementById('remoteSocket').textContent =
         `${serverIP}:${serverPort}`;

      document.getElementById('connectPanel').style.display = 'none';
      document.getElementById('chatView').style.display = 'flex';

      log('tcp', 'SYN-ACK recebido do servidor — enviando ACK');
      log('tcp', `Handshake 3-way concluído — ESTABLISHED`);
      log(
         'sys',
         `Registrado no servidor como "${myName}" | Socket: ${msg.ip}:${msg.assignedPort}`,
      );
      log('sys', `Aguardando mensagens unicast do servidor...`);
      toast(`ACK · ESTABLISHED`);

      document.getElementById('msgInput').focus();
      return;
   }

   if (msg.type === 'message') {
      log('recv', msg.text, msg.from);
      toast(`DATA ← Servidor`);
      return;
   }
}

function sendMsg() {
   const input = document.getElementById('msgInput');
   const text = input.value.trim();
   if (!text || !ws || ws.readyState !== 1) return;

   ws.send(JSON.stringify({ type: 'client_to_server', text }));
   log('sent', text, myName);
   toast(`DATA → Servidor`);

   input.value = '';
   input.style.height = 'auto';
}

function disconnect() {
   if (!confirm('Encerrar conexão TCP com o servidor?')) return;
   log('tcp', 'Enviando FIN para o servidor...');
   log('sys', 'Encerrando conexão — 4-way handshake (FIN/FIN-ACK)');
   ws && ws.close();
   document.getElementById('tcpState').textContent = 'FIN_WAIT';
   document.getElementById('tcpState').style.color = 'var(--amber)';
}

function log(type, msg, sender) {
   const la = document.getElementById('logArea');
   if (!la) return;
   const d = document.createElement('div');
   d.className = 'log-entry';
   const cls =
      {
         sent: 'tag-sent',
         recv: 'tag-recv',
         sys: 'tag-sys',
         tcp: 'tag-tcp',
         err: 'tag-err',
      }[type] || 'tag-sys';
   const lbl =
      {
         sent: 'ENVIADO',
         recv: 'RECEBIDO',
         sys: 'SISTEMA',
         tcp: 'TCP',
         err: 'ERRO',
      }[type] || 'SYS';
   const time = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
   });
   d.innerHTML = `<span class="lt">${time}</span><span class="ltag ${cls}">${lbl}</span><span class="lc">${sender ? `<strong>${esc(sender)}:</strong> ` : ''}${esc(msg)}</span>`;
   la.appendChild(d);
   la.scrollTop = la.scrollHeight;
}

function showError(msg) {
   const el = document.getElementById('connError');
   el.innerHTML = msg;
   el.style.display = 'block';
}
function resetBtn() {
   document.getElementById('btnConnect').disabled = false;
   document.getElementById('btnConnect').textContent = '▶ INICIAR CONEXÃO TCP';
}
function esc(s) {
   return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
}
function toast(label) {
   document.querySelectorAll('.toast').forEach((e) => e.remove());
   const el = document.createElement('div');
   el.className = 'toast';
   el.textContent = `TCP PKT ▶ ${label}`;
   document.body.appendChild(el);
   setTimeout(() => el.remove(), 2500);
}

document.addEventListener('keydown', (e) => {
   if (e.key === 'Enter' && !connected) connectToServer();
});
