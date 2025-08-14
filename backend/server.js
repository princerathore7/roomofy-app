// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

// -------------------
// CONFIG (HARDCODED for Render free plan)
// -------------------
const APP_PORT = process.env.PORT || 5001;
const PLATFORM_FEE_PERCENT = 0.20;
const BOARD_SIZE = 8;
const WIN_LENGTH = 3;
const JWT_SECRET = 'supersecretkey';
const ALLOWED_ORIGINS = [
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'https://spiffy-eclair-f0f49f.netlify.app',
  'https://roomofy.netlify.app',
  'https://roomofy-app-1.onrender.com'
];

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname + '/public'));

// -------- helpers --------
function uid(len = 8) {
  return 'id_' + Math.random().toString(36).slice(2, 2 + len);
}

// -------- in-memory stores --------
const users = new Map();
const socketsByUser = new Map();
const wallets = new Map();
const tournaments = new Map();
const rooms = new Map();
const authUsers = new Map();

const ADMIN_ID = 'ADMIN';
wallets.set(ADMIN_ID, { balance: 0, txs: [] });

// -------- wallet helpers --------
function ensureWallet(userId) {
  if (!wallets.has(userId)) {
    wallets.set(userId, {
      balance: 500,
      txs: [{ type: 'credit', amount: 500, reason: 'Init', date: new Date() }]
    });
  }
  return wallets.get(userId);
}

function addTx(userId, type, amount, reason) {
  const w = ensureWallet(userId);
  w.txs.push({ type, amount, reason, date: new Date() });
}

function credit(userId, amount, reason) {
  const w = ensureWallet(userId);
  w.balance += Number(amount);
  addTx(userId, 'credit', Number(amount), reason);
  return w.balance;
}

function debit(userId, amount, reason) {
  const w = ensureWallet(userId);
  if (w.balance < amount) return { ok: false, balance: w.balance };
  w.balance -= Number(amount);
  addTx(userId, 'debit', Number(amount), reason);
  return { ok: true, balance: w.balance };
}

// -------- win check --------
function checkWin(board, r, c, mark) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of dirs) {
    let cnt = 1;
    for (let s=1; s<WIN_LENGTH; s++) {
      const rr = r + dr*s, cc = c + dc*s;
      if (rr<0||rr>=BOARD_SIZE||cc<0||cc>=BOARD_SIZE) break;
      if (board[rr][cc] === mark) cnt++; else break;
    }
    for (let s=1; s<WIN_LENGTH; s++) {
      const rr = r - dr*s, cc = c - dc*s;
      if (rr<0||rr>=BOARD_SIZE||cc<0||cc>=BOARD_SIZE) break;
      if (board[rr][cc] === mark) cnt++; else break;
    }
    if (cnt >= WIN_LENGTH) return true;
  }
  return false;
}

// -------- AUTH routes --------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'Username and password required' });

    if (authUsers.has(username))
      return res.status(400).json({ message: 'Username already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uid(8);

    authUsers.set(username, { userId, username, passwordHash });
    ensureWallet(userId);

    const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId, username });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = authUsers.get(username);
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.userId, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId: user.userId, username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// -------- TOURNAMENT routes --------
app.post('/api/tournaments/create', (req, res) => {
  const { title, entryFee, maxPlayers } = req.body;
  if (!title || !entryFee) return res.status(400).json({ error: 'Missing fields' });
  const id = uid(8);
  const t = {
    id,
    title,
    entryFee: Number(entryFee),
    maxPlayers: Number(maxPlayers || 2),
    players: [],
    sockets: [],
    status: 'open',
    createdAt: new Date()
  };
  tournaments.set(id, t);
  res.json({ success: true, tournament: t });
});

app.get('/api/tournaments', (req, res) => {
  const list = Array.from(tournaments.values()).map(t => ({
    id: t.id,
    title: t.title,
    entryFee: t.entryFee,
    maxPlayers: t.maxPlayers,
    playersCount: t.players.length,
    status: t.status
  }));
  res.json({ success: true, tournaments: list });
});

// -------- WALLET routes --------
app.get('/api/wallet', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  const w = ensureWallet(userId);
  res.json({ success: true, balance: w.balance, txs: w.txs.slice().reverse() });
});

app.post('/api/wallet/add', (req, res) => {
  const { userId, amount } = req.body || {};
  if (!userId || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid userId/amount' });
  const bal = credit(userId, Number(amount), 'Wallet top-up');
  res.json({ success: true, balance: bal });
});

app.post('/api/wallet/deduct', (req, res) => {
  const { userId, amount } = req.body || {};
  if (!userId || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid userId/amount' });
  const d = debit(userId, Number(amount), 'Manual deduct');
  if (!d.ok) return res.status(400).json({ error: 'Insufficient balance' });
  res.json({ success: true, balance: d.balance });
});

app.post('/api/wallet/add-dummy', (req, res) => {
  const { userId, amount } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  const amt = Number(amount || 10000);
  const bal = credit(userId, amt, 'Dummy add');
  res.json({ success: true, balance: bal });
});

// -------- SOCKET.IO --------
function startMatchFromTournament(t) {
  if (!t || t.players.length < 2) return;
  const p1sock = t.sockets[0];
  const p2sock = t.sockets[1];
  const p1user = t.players[0];
  const p2user = t.players[1];

  const roomId = uid(8);
  const board = Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => null));

  const room = {
    roomId,
    tournamentId: t.id,
    player1: { socketId: p1sock, userId: p1user },
    player2: { socketId: p2sock, userId: p2user },
    board,
    turn: 'X',
    bet: t.entryFee,
    status: 'playing'
  };
  rooms.set(roomId, room);

  try { io.sockets.sockets.get(p1sock)?.join(roomId); } catch {}
  try { io.sockets.sockets.get(p2sock)?.join(roomId); } catch {}

  io.to(p1sock).emit('matchFound', { roomId, side: 'X', opponent: p2user, bet: room.bet });
  io.to(p2sock).emit('matchFound', { roomId, side: 'O', opponent: p1user, bet: room.bet });
  io.to(roomId).emit('boardUpdate', { board: room.board, turn: room.turn });
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('register', (payload, cb) => {
    const name = payload?.name || ('Player_' + Math.floor(Math.random() * 1000));
    const userId = payload?.userId || uid(8);
    users.set(socket.id, { id: userId, name });
    socketsByUser.set(userId, socket.id);
    const w = ensureWallet(userId);
    cb && cb({ ok: true, userId, name, balance: w.balance });
  });

  socket.on('getWallet', (cb) => {
    const u = users.get(socket.id);
    if (!u) return cb && cb({ ok: false, error: 'not-registered' });
    const w = ensureWallet(u.id);
    cb && cb({ ok: true, balance: w.balance, txs: w.txs.slice().reverse() });
  });

  socket.on('makeMove', ({ roomId, r, c }) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('errorMsg', 'room-not-found');

    const u = users.get(socket.id);
    if (!u) return socket.emit('errorMsg', 'not-registered');

    const myMark = (room.player1.userId === u.id) ? 'X' : (room.player2.userId === u.id ? 'O' : null);
    if (!myMark) return socket.emit('errorMsg', 'not-in-room');
    if (room.turn !== myMark) return socket.emit('errorMsg', 'not-your-turn');
    if (r<0||r>=BOARD_SIZE||c<0||c>=BOARD_SIZE) return socket.emit('errorMsg','out-of-bounds');
    if (room.board[r][c] !== null) return socket.emit('errorMsg', 'cell-taken');

    room.board[r][c] = myMark;
    const won = checkWin(room.board, r, c, myMark);
    room.turn = (myMark === 'X') ? 'O' : 'X';
    io.to(roomId).emit('boardUpdate', { board: room.board, turn: room.turn });

    if (won) {
      room.status = 'finished';
      const totalPool = room.bet * 2;
      const platformFee = Math.round(totalPool * PLATFORM_FEE_PERCENT);
      const winnerShare = totalPool - platformFee;

      const winnerId = u.id;
      credit(winnerId, winnerShare, `Won ${room.roomId}`);
      credit(ADMIN_ID, platformFee, `Platform fee ${room.roomId}`);

      io.to(roomId).emit('gameOver', { winnerId, winnerShare, platformFee });
      io.to(roomId).socketsLeave(roomId);
      rooms.delete(roomId);
    } else {
      const empty = room.board.some(row => row.some(cell => cell === null));
      if (!empty) {
        room.status = 'finished';
        credit(room.player1.userId, room.bet, `Refund ${room.roomId}`);
        credit(room.player2.userId, room.bet, `Refund ${room.roomId}`);
        io.to(roomId).emit('gameOver', { draw: true });
        io.to(roomId).socketsLeave(roomId);
        rooms.delete(roomId);
      }
    }
  });

  socket.on('disconnect', () => {
    const u = users.get(socket.id);
    if (u) socketsByUser.delete(u.id);
    users.delete(socket.id);
    for (const t of tournaments.values()) {
      const idx = t.sockets.indexOf(socket.id);
      if (idx !== -1) {
        t.sockets.splice(idx, 1);
        t.players.splice(idx, 1);
        t.status = 'open';
      }
    }
  });
});

// start server
server.listen(APP_PORT, () => {
  console.log(`✅ Server running at http://localhost:${APP_PORT}`);
});
