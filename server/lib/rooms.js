import { b64url } from "./stats.js";
import { pickPassage } from "./passages.js";
import { COUNTDOWN_MS, MAX_ROOM_PLAYERS } from "./constants.js";

export class RoomStore {
  constructor({ countdownMs = COUNTDOWN_MS, maxPlayers = MAX_ROOM_PLAYERS } = {}) {
    this.countdownMs = countdownMs;
    this.maxPlayers = maxPlayers;
    this.rooms = new Map();
  }

  ensureJoinableRoom(lastPassage) {
    const available = [...this.rooms.values()].find(
      (room) => !room.startedAt && room.players.size < this.maxPlayers
    );
    return available ?? this.createRoom(lastPassage);
  }

  createRoom(lastPassage) {
    const id = Math.random().toString(36).slice(2, 8);
    const passage = pickPassage(lastPassage);
    const room = {
      id,
      passage,
      passageHash: b64url(passage),
      players: new Map(),
      startedAt: undefined,
      countdownAt: undefined
    };
    this.rooms.set(id, room);
    return room;
  }

  addPlayer(room, { id, handle }) {
    const player = { id, handle, progress: 0, wpm: 0, acc: 100 };
    room.players.set(id, player);
    return player;
  }

  removePlayer(room, playerId) {
    if (!room?.players) return false;
    const removed = room.players.delete(playerId);
    if (room.players.size === 0) {
      this.rooms.delete(room.id);
    }
    return removed;
  }

  scheduleCountdown(room, callback) {
    if (room.countdownAt) return;
    room.countdownAt = Date.now() + this.countdownMs;
    setTimeout(() => {
      room.startedAt = Date.now();
      callback(room);
    }, this.countdownMs);
  }
}
