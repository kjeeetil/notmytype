"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

export default function Page() {
  const [players, setPlayers] = useState([]);
  const [countdownMs, setCountdownMs] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [cursor, setCursor] = useState(0);
  const [typed, setTyped] = useState("");
  const [passage, setPassage] = useState("Loading passage…");
  const [awaitingNext, setAwaitingNext] = useState(false);
  const completionRef = useRef(false);

  const inputRef = useRef(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8081";
    const s = io(url, { transports: ["websocket"] });
    setSocket(s);
    s.emit("quick:match");
    s.on("room:state", (msg) => {
      setPlayers(msg.players || []);
      setCountdownMs(msg.countdownMs);
      if (msg.passage) {
        setPassage(msg.passage);
        completionRef.current = false;
        setAwaitingNext(false);
      }
    });
    s.on("race:start", (msg) => {
      setStartedAt(msg.startedAt);
      if (msg.passage) setPassage(msg.passage);
      completionRef.current = false;
      setCursor(0);
      setTyped("");
      setAwaitingNext(false);
      inputRef.current?.focus();
    });
    s.on("race:progress", (msg) => {
      setPlayers(prev => prev.map(p => p.id === msg.userId ? { ...p, progress: msg.progressChars, wpm: msg.wpm, acc: msg.acc } : p));
    });
    return () => { s.close(); };
  }, []);

  function onKey(e) {
    if (!socket || startedAt === null || !passage.length) return;
    const expected = passage[cursor] ?? "";
    const key = e.key.length === 1 ? e.key : (e.key === " " ? " " : "");
    if (!key) return;
    const correct = key === expected;
    socket.emit("race:keystroke", { t: Date.now(), key, correct });
  }

  function onChange(e) {
    const limit = passage.length || undefined;
    const value = typeof limit === "number" ? e.target.value.slice(0, limit) : e.target.value;
    setTyped(value);
    let correctCount = 0;
    while (correctCount < value.length && passage[correctCount] === value[correctCount]) {
      correctCount += 1;
    }
    setCursor(correctCount);
    if (
      !completionRef.current &&
      passage.length > 0 &&
      correctCount === passage.length &&
      value.length === passage.length
    ) {
      handleCompletion();
    }
  }

  function handleCompletion() {
    completionRef.current = true;
    setTyped("");
    setCursor(0);
    setStartedAt(null);
    setCountdownMs(null);
    setPlayers([]);
    setAwaitingNext(true);
    socket?.emit("quick:match");
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 12 }}>Typing Race</h1>
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <p style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 18, lineHeight: 1.6 }}>
          {passage.split("").map((ch, i) => (
            <span
              key={i}
              style={{
                fontWeight: i < cursor ? 700 : 400,
                color: i < cursor ? "#0f766e" : "#1f2937",
                textDecoration: i === cursor ? "underline" : "none",
                textDecorationThickness: i === cursor ? "3px" : undefined,
                textDecorationColor: "#0f172a",
                transition: "color 120ms ease, font-weight 120ms ease"
              }}
            >
              {ch}
            </span>
          ))}
        </p>
        <input
          ref={inputRef}
          onKeyDown={onKey}
          onChange={onChange}
          value={typed}
          placeholder={
            awaitingNext
              ? "Loading next passage…"
              : startedAt
              ? "Type here…"
              : "Waiting to start…"
          }
          disabled={awaitingNext}
          spellCheck="false"
          autoComplete="off"
          style={{
            width: "100%",
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ccc",
            outline: "none",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            background: awaitingNext ? "#f3f4f6" : "#fff"
          }}
        />
      </div>

      <div style={{ marginTop: 24 }}>
        {(players || []).map((p) => {
          const denominator = passage.length || 1;
          const progress = Math.min(100, ((p.progress || 0) / denominator) * 100);
          return (
            <div key={p.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>{p.handle || p.id}</span>
                <span>{p.wpm ?? 0} WPM • {p.acc ?? 100}%</span>
              </div>
              <div style={{ height: 8, background: "#eee", borderRadius: 8 }}>
                <div style={{ width: `${progress}%`, height: 8, background: "#000", borderRadius: 8 }} />
              </div>
            </div>
          );
        })}
      </div>

      {countdownMs !== null && countdownMs > 0 && (
        <div style={{ marginTop: 12, fontSize: 14 }}>Race starts in {Math.ceil(countdownMs/1000)}s</div>
      )}
    </main>
  );
}
