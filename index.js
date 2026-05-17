const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const HTTP_PORT = 3000;

const clients = new Map();
let serverUI = null;
let nextPort = 50000;

// Função auxiliar que indica o tipo de conteúdo do arquivo enviado pelo servidor ao navegador
function getMimeType(filePath) {
   const ext = path.extname(filePath).toLowerCase();
   const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
   };
   return types[ext] ?? 'application/octet-stream';
}

function sendWS(socket, obj) {
   if (socket && socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(obj));
   }
}

function toServer(obj) {
   sendWS(serverUI, obj);
}

function serveStaticFiles(urlPath, res) {
   // Verifica para qual diretório do servidor é a requisição do cliente
   const isClient = urlPath.startsWith('/client_ui/');
   const isServer = urlPath.startsWith('/server_ui/');

   if (isClient || isServer) {
      // Retorna o caminho base do diretório em relação à pasta raiz onde roda o servidor. Ex: /home/app/ + client_ui --> /home/app/client_ui
      const baseDir = path.join(
         __dirname,
         isClient ? 'client_ui' : 'server_ui',
      );
      // Pega o caminho relativo. Ex: /client_ui/style.css --> style.css
      const rel = urlPath.replace(isClient ? '/client_ui/' : '/server_ui/', '');
      // Junta o caminho base com o relativo para formar o caminho absoluto. Ex: /home/app/client_ui/style.css
      const abs = path.resolve(baseDir, rel);

      // Medida de segurança que evita salto de diretório
      if (!abs.startsWith(baseDir + path.sep)) {
         res.writeHead(403);
         res.end('Forbidden');
         return;
      }

      // Lê o arquivo do servidor e retorna ao usuário com o Content-Type adequado
      fs.readFile(abs, (err, data) => {
         if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
         }
         res.writeHead(200, { 'Content-Type': getMimeType(abs) });
         res.end(data);
      });
      return true;
   }

   return false;
}

// Inicia o servidor http para fornecer as páginas web
const httpServer = http.createServer((req, res) => {
   // Pega a url da requisição enviada pelo cliente, removendo tudo o que vem depois de '?'
   const urlPath = decodeURIComponent((req.url || '').split('?')[0]);

   // Serve arquivos estáticos mencionados no index.html
   if (serveStaticFiles(urlPath, res)) {
      return;
   }

   // Define as rotas disponíveis do servidor http
   const routes = {
      '/': path.join(__dirname, 'server_ui/index.html'),
      '/server': path.join(__dirname, 'server_ui/index.html'),
      '/client': path.join(__dirname, 'client_ui/index.html'),
   };

   // Pega o caminho do arquivo com base na rota recebida
   const file = routes[urlPath];

   // Se não existe o arquivo, retorna 404
   if (!file) {
      res.writeHead(404);
      res.end('Not found');
      return;
   }

   // Lê o arquivo index.html local e retorna ao cliente com Content-Type adequado
   fs.readFile(file, (err, data) => {
      if (err) {
         res.writeHead(500);
         res.end('Error');
         return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
   });
});

// Instancia a conexão WebSocket, passando o servidor web e o caminho que receberá as requisições
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// Recebe pedido de conexão do cliente
wss.on('connection', (socket, req) => {
   // Fica escutando no socket criado entre cliente e servidor esperando a mensagem chegar
   socket.on('message', (data) => {
      let msg;
      try {
         // Transforma a mensagem em JSON. Converte os bytes do Buffer interno em string
         msg = JSON.parse(data.toString());
      } catch {
         return;
      }
      handleMessage(socket, msg, req);
   });

   // Lida com desconexão e erros na comunicação via socket
   socket.on('close', () => handleDisconnect(socket));
   socket.on('error', () => handleDisconnect(socket));
});

// Lida com a troca de mensagens
function handleMessage(socket, msg, req) {
   // Verifica de quem está recebendo a mensagem pelo tipo
   const { type } = msg;

   if (type === 'server_ui_connect') {
      serverUI = socket;
      socket._role = 'server';

      sendWS(socket, {
         type: 'client_list',
         clients: [...clients.values()].map(
            ({ id, name, ip, port, connectedAt }) => ({
               id,
               name,
               ip,
               port,
               connectedAt,
            }),
         ),
      });

      toServer({
         type: 'sys',
         msg: `[SISTEMA] Interface do servidor conectada. ${clients.size} cliente(s) ativo(s).`,
      });
      return;
   }

   if (type === 'client_connect') {
      const id = crypto.randomBytes(4).toString('hex');
      const ip = (req?.socket?.remoteAddress || '127.0.0.1').replace(
         '::ffff:',
         '',
      );
      const port = nextPort++;
      const connectedAt = new Date().toLocaleTimeString('pt-BR');

      clients.set(id, {
         id,
         name: msg.name,
         ip,
         port,
         ws: socket,
         connectedAt,
      });
      socket._role = 'client';
      socket._clientId = id;

      sendWS(socket, {
         type: 'connected',
         id,
         name: msg.name,
         ip,
         serverPort: msg.serverPort || HTTP_PORT,
         assignedPort: port,
         connectedAt,
      });

      toServer({
         type: 'client_joined',
         id,
         name: msg.name,
         ip,
         port,
         connectedAt,
      });
      toServer({
         type: 'sys',
         msg: `[TCP] Handshake 3-way concluído — ${msg.name} conectado de ${ip}:${port}`,
      });
      toServer({
         type: 'sys',
         msg: `[SISTEMA] Cliente registrado: "${msg.name}" | Socket #${id}`,
      });
      return;
   }

   if (type === 'server_to_client') {
      const target = clients.get(msg.targetId);
      if (!target) return;

      sendWS(target.ws, {
         type: 'message',
         from: 'Servidor',
         text: msg.text,
         time: new Date().toLocaleTimeString('pt-BR'),
      });

      toServer({
         type: 'sys',
         msg: `[ENVIADO] → ${target.name} (${target.ip}:${target.port}): "${msg.text.slice(0, 60)}"`,
      });
      return;
   }

   if (type === 'client_to_server') {
      const client = clients.get(socket._clientId);
      if (!client) return;

      toServer({
         type: 'client_message',
         clientId: client.id,
         clientName: client.name,
         text: msg.text,
         time: new Date().toLocaleTimeString('pt-BR'),
      });

      toServer({
         type: 'sys',
         msg: `[RECEBIDO] ← ${client.name} (${client.ip}:${client.port}): "${msg.text.slice(0, 60)}"`,
      });
      return;
   }

   if (type === 'disconnect_client') {
      const target = clients.get(msg.targetId);
      if (!target) return;

      toServer({
         type: 'sys',
         msg: `[SISTEMA] Encerrando conexão com ${target.name} forçadamente...`,
      });

      target.ws.close();

      return;
   }
}

// Lida com a desconexão na comunicação via socket
function handleDisconnect(socket) {
   if (socket._role === 'client' && socket._clientId) {
      const client = clients.get(socket._clientId);
      if (client) {
         clients.delete(socket._clientId);
         toServer({ type: 'client_left', id: socket._clientId });
         toServer({
            type: 'sys',
            msg: `[TCP] FIN recebido — ${client.name} desconectado (${client.ip}:${client.port})`,
         });
      }
   }

   if (socket._role === 'server') {
      serverUI = null;
   }
}

httpServer.listen(HTTP_PORT, () => {
   console.log(`\n╔══════════════════════════════════════╗`);
   console.log(`║  TCP Chat Server — Unicast           ║`);
   console.log(`╠══════════════════════════════════════╣`);
   console.log(`║  Servidor : http://localhost:${HTTP_PORT}     ║`);
   console.log(`║  Cliente  : http://localhost:${HTTP_PORT}/client ║`);
   console.log(`╚══════════════════════════════════════╝\n`);
});
