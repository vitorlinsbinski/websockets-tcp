# Atividade 2 — Sockets (TCP Unicast via WebSocket)

Projeto didático para a disciplina **Introdução a Redes**.

Ele simula uma comunicação **TCP unicast (ponto-a-ponto)** entre **1 servidor** e **múltiplos clientes**, exibindo na tela eventos típicos do TCP (ex.: _SYN_, _SYN-ACK_, _ACK_, _FIN_) e o envio/recebimento de mensagens.

Na prática, a troca de mensagens é feita por **WebSocket** (biblioteca `ws`) e a aplicação entrega duas páginas web:

- **Painel do Servidor**: lista clientes conectados, abre uma “sessão” por cliente, envia mensagens unicast e pode desconectar clientes.
- **Painel do Cliente**: conecta informando nome/IP/porta, mostra o “estado TCP” e permite enviar mensagens ao servidor.

## Requisitos

- Node.js (recomendado: versão LTS)
- npm (vem junto com o Node)

## Como executar

1. Instale as dependências:

```bash
npm install
```

2. Inicie o servidor:

```bash
node index.js
```

3. Abra no navegador:

- Servidor: http://localhost:3000/server
- Cliente: http://localhost:3000/client

> Dica: abra **uma aba** com o painel do servidor e **várias abas** com o painel do cliente (cada aba representa um cliente).

## Como usar

### 1) Painel do servidor

1. Acesse http://localhost:3000/server
2. Quando clientes conectarem, eles aparecerão na lista à esquerda.
3. Clique em um cliente para abrir a sessão e:
   - Enviar mensagens (unicast) para o cliente selecionado
   - Desconectar o cliente selecionado

### 2) Painel do cliente

1. Acesse http://localhost:3000/client
2. Informe um **nome** e confirme IP/porta (por padrão `localhost:3000`).
3. Clique em **INICIAR CONEXÃO TCP**.
4. Após conectar (_ESTABLISHED_), envie mensagens para o servidor.
5. Use **DESCONECTAR** para encerrar a sessão (simulação de fechamento TCP).

## Portas e rotas

- HTTP: `3000`
- WebSocket (relay): `ws://<host>:3000/ws`
- Rotas:
   - `/server` ou `/` → UI do servidor
   - `/client` → UI do cliente
   - `/client_ui/*` e `/server_ui/*` → arquivos estáticos

Observação: cada cliente recebe uma porta “atribuída” apenas para exibição na interface (começando em `50000`).

## Estrutura do projeto

- `index.js`: servidor HTTP + WebSocket, roteamento, registro de clientes e relay de mensagens
- `client_ui/`: interface web do cliente
- `server_ui/`: interface web do servidor
