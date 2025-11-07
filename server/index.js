import http from "http";
import { Server } from "socket.io";
import { b64url, computeWPM, computeAcc } from "./lib/stats.js";

const port = process.env.PORT || 8080;

const passages = [
  "Pecan Energies advocates for Africa to harness its resources sustainably within a just energy transition for the continent.",
  "Building on a USD 200 million investment, Africa Finance Corporation acquired Pecan Energies to develop Ghana's offshore resources responsibly.",
  "Our ambition is to diversify over time and consolidate as a Pan-African energy leader focused on sustainable development and empowered communities.",
  "The company blends Pan-African and Scandinavian values where sustainability, localisation, empowerment and giving back are a way of doing business.",
  "Our offices are located in Accra, Ghana and Oslo, Norway to keep us close to partners across continents.",
  "With AFC's knowhow and our in-house expertise we are positioned to deliver projects on time, with quality and within cost.",
  "AFC has invested over USD 1 billion in upstream oil and gas across Africa since 2007, backing sustainable resource development.",
  "Our operating model is integrated, flexible and efficient with a commitment to empower communities beyond local content obligations.",
  "We hold a 50 percent interest in the Deepwater Tano Cape Three Points block spanning roughly 2,010 square kilometres offshore Ghana.",
  "Pecan Energies is committed to building up the Ghanaian oil and gas industry through training, industrial development and job creation.",
  "We aim to mature subsurface resources efficiently, safely and reliably to unlock prosperity for Ghana and beyond.",
  "Our values are value creating, ambitious, respectful and transparent, guiding every decision we make.",
  "The DWT/CTP block contains about 550 million barrels of recoverable oil equivalents plus a significant exploration portfolio.",
  "The exceptional Pecan oil field contains more than 1,100 million barrels located in ultra-deep waters up to 2,700 meters.",
  "We operate with a flexible, agile structure built on alliances with suppliers to keep incentives aligned and collaborative."
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

function pickPassage(exclude) {
  const options = passages.filter((p) => p !== exclude);
  const pool = options.length ? options : passages;
  return pool[Math.floor(Math.random() * pool.length)];
}

function createRoom(lastPassage) {
  const id = Math.random().toString(36).slice(2, 8);
  const passage = pickPassage(lastPassage);
  const state = {
    id,
    passage,
    passageHash: b64url(passage),
    players: new Map(),
    startedAt: undefined,
    countdownAt: undefined
  };
  rooms.set(id, state);
  return state;
}

function emitRoomState(room) {
  io.to(room.id).emit("room:state", {
    roomId: room.id,
    players: [...room.players.values()],
    countdownMs: room.countdownAt ? Math.max(0, room.countdownAt - Date.now()) : null,
    passageLen: room.passage.length,
    passage: room.passage
  });
}

io.on("connection", (socket) => {
  let currentRoom = null;
  let totals = { correct: 0, total: 0 };
  let lastPassage = null;

  socket.on("quick:match", () => {
    if (currentRoom) {
      const prev = currentRoom;
      prev.players.delete(socket.id);
      socket.leave(prev.id);
      emitRoomState(prev);
      if (prev.players.size === 0) rooms.delete(prev.id);
    }
    totals = { correct: 0, total: 0 };

    let room = [...rooms.values()].find(r => !r.startedAt && (r.players.size < 8));
    if (!room) room = createRoom(lastPassage);
    currentRoom = room;
    lastPassage = room.passage;

    const p = { id: socket.id, handle: `Guest-${socket.id.slice(0,4)}`, progress: 0, wpm: 0, acc: 100 };
    room.players.set(socket.id, p);
    socket.join(room.id);

    emitRoomState(room);

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
      emitRoomState(currentRoom);
      if (currentRoom.players.size === 0) rooms.delete(currentRoom.id);
    }
  });
});

server.listen(port, () => {
  console.log(`Realtime server on :${port}`);
});
