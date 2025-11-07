import http from "http";
import { Server } from "socket.io";
import { b64url, computeWPM, computeAcc } from "./lib/stats.js";

const port = process.env.PORT || 8080;

const passages = [
  "Fast foxes jump over lazy dogs in midnight races.",
  "Neon lights flicker softly while keyboards clack in rhythm.",
  "Typing swiftly trains the mind to think before the fingers move."
];

// Very permissive CORS for demo; tighten in prod
const server = http.createServer((req, res) => {
  // health check endpoint
  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("typing-race server ok\n");
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET","POST"]
  }
});

// In-memory rooms (replace with Redis later)
const rooms = new Map();

function createRoom() {
  const id = Math.random().toString(36).slice(2, 8);
  const passage = passages[Math.floor(Math.random() * passages.length)];
  const state = { id, passage, passageHash: b64url(passage), players: new Map(), startedAt: undefined, countdownAt: undefined };
  rooms.set(id, state);
  return state;
}

io.on("connection", (socket) => {
  let currentRoom = null;
  let totals = { correct: 0, total: 0 };

  socket.on("quick:match", () => {
    let room = [...rooms.values()].find(r => !r.startedAt && (r.players.size < 8));
    if (!room) room = createRoom();
    currentRoom = room;

    const p = { id: socket.id, handle: `Guest-${socket.id.slice(0,4)}`, progress: 0, wpm: 0, acc: 100 };
    room.players.set(socket.id, p);
    socket.join(room.id);

    io.to(room.id).emit("room:state", {
      roomId: room.id,
      players: [...room.players.values()],
      countdownMs: room.countdownAt ? Math.max(0, room.countdownAt - Date.now()) : null,
      passageLen: room.passage.length,
      passage: room.passage
    });

    if (!room.countdownAt) {
      room.countdownAt = Date.now() + 5000;
      setTimeout(() => {
        room.startedAt = Date.now();
        io.to(room.id).emit("race:start", { raceId: room.id, passageHash: room.passageHash, passage: room.passage, startedAt: room.startedAt });
      }, 5000);
    }
  });

  socket.on("race:keystroke", (msg) => {
    if (!currentRoom || !currentRoom.startedAt) return;
    const room = currentRoom;
    const player = room.players.get(socket.id);
    if (!player) return;

    totals.total += 1;
    if (msg.correct) {
      totals.correct += 1;
      const nextIndex = player.progress;
      if (room.passage[nextIndex] === msg.key) {
        player.progress = nextIndex + 1;
      }
    }
    player.wpm = computeWPM(player.progress, room.startedAt);
    player.acc = computeAcc(totals.correct, totals.total);

    io.to(room.id).emit("race:progress", {
      userId: player.id, progressChars: player.progress, wpm: player.wpm, acc: player.acc
    });

    if (player.progress >= room.passage.length) {
      const leaderboard = [...room.players.values()]
        .sort((a,b)=>b.wpm-a.wpm)
        .map(p=>({ userId:p.id, wpm:p.wpm, acc:p.acc, finishedMs: Date.now() - room.startedAt }));
      io.to(room.id).emit("race:finish", { leaderboard });
    }
  });

  socket.on("disconnect", () => {
    if (currentRoom) {
      currentRoom.players.delete(socket.id);
      io.to(currentRoom.id).emit("room:state", {
        roomId: currentRoom.id,
        players: [...currentRoom.players.values()],
        countdownMs: currentRoom.countdownAt ? Math.max(0, currentRoom.countdownAt - Date.now()) : null,
        passageLen: currentRoom.passage.length,
        passage: currentRoom.passage
      });
    }
  });
});

server.listen(port, () => {
  console.log(`Realtime server on :${port}`);
});
