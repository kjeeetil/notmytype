import http from "http";
import { Server } from "socket.io";
import { computeWPM, computeAcc } from "./lib/stats.js";
import { RoomStore } from "./lib/rooms.js";
import { createScoreboard } from "./lib/scoreboard.js";
import { COUNTDOWN_MS, MAX_RECENT_SCORES } from "./lib/constants.js";

const port = process.env.PORT || 8080;
const roomStore = new RoomStore({ countdownMs: COUNTDOWN_MS });
const scoreboard = createScoreboard({ maxEntries: MAX_RECENT_SCORES });

const server = http.createServer(handleHttpRequest);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  const session = createPlayerSession({ socket, io });
  session.register();
});

server.listen(port, () => {
  console.log(`Realtime server on :${port}`);
});

function handleHttpRequest(req, res) {
  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("typing-race server ok\n");
    return;
  }

  if (req.url === "/scores") {
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*"
    });
    res.end(JSON.stringify({ scores: scoreboard.list() }));
    return;
  }

  res.writeHead(404);
  res.end();
}

function createPlayerSession({ socket, io }) {
  const handle = `Guest-${socket.id.slice(0, 4)}`;
  let currentRoom = null;
  let totals = { correct: 0, total: 0 };
  let lastPassage = null;

  function emitRoomState(room) {
    io.to(room.id).emit("room:state", {
      roomId: room.id,
      players: [...room.players.values()],
      countdownMs: room.countdownAt ? Math.max(0, room.countdownAt - Date.now()) : null,
      passageLen: room.passage.length,
      passage: room.passage
    });
  }

  function leaveCurrentRoom() {
    if (!currentRoom) return;
    roomStore.removePlayer(currentRoom, socket.id);
    socket.leave(currentRoom.id);
    emitRoomState(currentRoom);
    currentRoom = null;
  }

  function joinQuickMatch() {
    leaveCurrentRoom();
    totals = { correct: 0, total: 0 };

    const room = roomStore.ensureJoinableRoom(lastPassage);
    currentRoom = room;
    lastPassage = room.passage;
    roomStore.addPlayer(room, { id: socket.id, handle });
    socket.join(room.id);
    emitRoomState(room);

    roomStore.scheduleCountdown(room, (activeRoom) => {
      io.to(activeRoom.id).emit("race:start", {
        raceId: activeRoom.id,
        passageHash: activeRoom.passageHash,
        passage: activeRoom.passage,
        startedAt: activeRoom.startedAt
      });
    });
  }

  function handleKeystroke(message = {}) {
    if (!currentRoom?.startedAt) return;
    const player = currentRoom.players.get(socket.id);
    if (!player) return;

    totals.total += 1;
    if (message.correct) {
      totals.correct += 1;
      const nextIndex = player.progress;
      if (currentRoom.passage[nextIndex] === message.key) {
        player.progress = nextIndex + 1;
      }
    }

    player.wpm = computeWPM(player.progress, currentRoom.startedAt);
    player.acc = computeAcc(totals.correct, totals.total);

    io.to(currentRoom.id).emit("race:progress", {
      userId: player.id,
      progressChars: player.progress,
      wpm: player.wpm,
      acc: player.acc
    });

    if (player.progress >= currentRoom.passage.length) {
      const leaderboard = [...currentRoom.players.values()]
        .sort((a, b) => b.wpm - a.wpm)
        .map((p) => ({
          userId: p.id,
          wpm: p.wpm,
          acc: p.acc,
          finishedMs: Date.now() - currentRoom.startedAt
        }));
      io.to(currentRoom.id).emit("race:finish", { leaderboard });
    }
  }

  function submitScore(payload = {}) {
    const { name, score } = payload;
    const numericScore = Number(score);
    if (!Number.isFinite(numericScore) || numericScore <= 0) return;

    const displayName = typeof name === "string" && name.trim()
      ? name.trim().slice(0, 32)
      : handle;

    const snapshot = scoreboard.record({
      name: displayName,
      score: Math.round(numericScore),
      timestamp: Date.now()
    });
    io.emit("scores:update", snapshot);
  }

  function disconnect() {
    leaveCurrentRoom();
  }

  return {
    register() {
      socket.emit("scores:update", scoreboard.list());
      socket.on("quick:match", joinQuickMatch);
      socket.on("race:keystroke", handleKeystroke);
      socket.on("score:submit", submitScore);
      socket.on("disconnect", disconnect);
    }
  };
}
