"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const WINDOW_FLOAT_MS = 10_000;
const WINDOW_MINUTE_MS = 60_000;
const MAX_HISTORY_MS = 5 * 60_000;
const CHART_STEP_MS = 5_000;
const FALLBACK_PASSAGES = [
  "Pecan Energies advocates for Africa to harness its resources sustainably within a just energy transition for the continent.",
  "Building on a USD 200 million investment, Africa Finance Corporation acquired Pecan Energies to develop Ghana's offshore resources responsibly.",
  "Our ambition is to diversify over time and consolidate as a Pan-African energy leader focused on sustainable development and empowered communities.",
  "The company blends Pan-African and Scandinavian values where sustainability, localisation, empowerment and giving back are a way of doing business.",
  "Our operating model is integrated, flexible and efficient with a commitment to empower communities beyond local content obligations."
];

export default function Page() {
  const [players, setPlayers] = useState([]);
  const [countdownMs, setCountdownMs] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [cursor, setCursor] = useState(0);
  const [typed, setTyped] = useState("");
  const [passage, setPassage] = useState("");
  const [loadingPassage, setLoadingPassage] = useState(true);
  const [awaitingNext, setAwaitingNext] = useState(false);
  const [events, setEvents] = useState([]);
  const [peakCpm, setPeakCpm] = useState(0);
  const [bestMinuteCpm, setBestMinuteCpm] = useState(0);
  const [now, setNow] = useState(Date.now());
  const completionRef = useRef(false);

  const inputRef = useRef(null);
  const pendingMatchRef = useRef(true);
  const [socket, setSocket] = useState(null);
  const fallbackTimerRef = useRef(null);
  const passageRef = useRef("");
  const awaitingNextRef = useRef(false);

  const startFallbackRace = useCallback(() => {
    const fallback = pickFallbackPassage();
    setPassage(fallback);
    setLoadingPassage(false);
    setAwaitingNext(false);
    setCountdownMs(null);
    setStartedAt(Date.now());
    setPlayers([]);
    setCursor(0);
    setTyped("");
    setEvents([]);
    setPeakCpm(0);
    setBestMinuteCpm(0);
    completionRef.current = false;
  }, []);
  useEffect(() => {
    passageRef.current = passage;
  }, [passage]);
  useEffect(() => {
    awaitingNextRef.current = awaitingNext;
  }, [awaitingNext]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8081";
    const s = io(url, { transports: ["websocket"], reconnection: true });
    setSocket(s);

    const handleConnectionIssue = () => {
      pendingMatchRef.current = true;
      if (passageRef.current && !awaitingNextRef.current) {
        return;
      }
      startFallbackRace();
    };

    s.on("room:state", (msg) => {
      setPlayers(msg.players || []);
      setCountdownMs(msg.countdownMs ?? null);
      if (msg.passage) {
        setPassage(msg.passage);
        setLoadingPassage(false);
        completionRef.current = false;
        setAwaitingNext(false);
      }
    });
    s.on("race:start", (msg) => {
      setStartedAt(msg.startedAt);
      if (msg.passage) {
        setPassage(msg.passage);
        setLoadingPassage(false);
      }
      completionRef.current = false;
      setCursor(0);
      setTyped("");
      setAwaitingNext(false);
      setEvents([]);
      setPeakCpm(0);
      setBestMinuteCpm(0);
      inputRef.current?.focus();
    });
    s.on("race:progress", (msg) => {
      setPlayers(prev => prev.map(p => p.id === msg.userId ? { ...p, progress: msg.progressChars, wpm: msg.wpm, acc: msg.acc } : p));
    });
    s.on("connect_error", handleConnectionIssue);
    s.on("disconnect", () => {
      if (!navigator.onLine) handleConnectionIssue();
    });
    return () => { s.close(); };
  }, [startFallbackRace]);

  useEffect(() => {
    if (!socket) return;
    const maybeRequestMatch = () => {
      if (pendingMatchRef.current) {
        socket.emit("quick:match");
        pendingMatchRef.current = false;
      }
    };
    socket.on("connect", maybeRequestMatch);
    maybeRequestMatch();
    return () => {
      socket.off("connect", maybeRequestMatch);
    };
  }, [socket]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
    }
    if (!loadingPassage || passage.length) return;
    fallbackTimerRef.current = setTimeout(() => {
      startFallbackRace();
      pendingMatchRef.current = true;
    }, 4000);
    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, [loadingPassage, passage.length, startFallbackRace]);

  const metrics = useMemo(() => computeMetrics(events, now), [events, now]);
  const decoratedPassage = useMemo(() => {
    return passage.split("").map((ch, idx) => {
      const typedChar = typed[idx];
      const isCorrect = idx < cursor;
      const isError = Boolean(typedChar && typedChar !== ch && idx >= cursor);
      const isCurrent = !isError && idx === cursor;
      return { ch, isCorrect, isError, isCurrent };
    });
  }, [passage, typed, cursor]);

  useEffect(() => {
    setPeakCpm((prev) => Math.max(prev, metrics.floatingCpm));
    setBestMinuteCpm((prev) => Math.max(prev, metrics.minuteCpm));
  }, [metrics.floatingCpm, metrics.minuteCpm]);

  const registerProgress = useCallback((delta) => {
    if (delta <= 0) return;
    const time = Date.now();
    setEvents((prev) => {
      const next = [...prev, { time, count: delta }]
        .filter((evt) => evt.time >= time - MAX_HISTORY_MS);
      return next;
    });
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
    if (!passage.length) {
      setTyped("");
      setCursor(0);
      return;
    }
    const limit = passage.length || undefined;
    const value = typeof limit === "number" ? e.target.value.slice(0, limit) : e.target.value;
    setTyped(value);
    let correctCount = 0;
    while (correctCount < value.length && passage[correctCount] === value[correctCount]) {
      correctCount += 1;
    }
    const delta = Math.max(0, correctCount - cursor);
    if (delta > 0) registerProgress(delta);
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

  const queueMatchRequest = useCallback(() => {
    pendingMatchRef.current = true;
    if (socket?.connected) {
      socket.emit("quick:match");
      pendingMatchRef.current = false;
    }
  }, [socket]);

  function handleCompletion() {
    completionRef.current = true;
    setTyped("");
    setCursor(0);
    setStartedAt(null);
    setCountdownMs(null);
    setPlayers([]);
    setEvents([]);
    setPeakCpm(0);
    setBestMinuteCpm(0);

    if (socket?.connected) {
      setAwaitingNext(true);
      setPassage("");
      setLoadingPassage(true);
      queueMatchRequest();
    } else {
      startFallbackRace();
      queueMatchRequest();
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 12 }}>Torfinns Touch-Trainer</h1>
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <p style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 18, lineHeight: 1.6, minHeight: 48 }}>
          {loadingPassage ? (
            <span style={{ color: "#9ca3af" }}>Loading passage...</span>
          ) : (
            decoratedPassage.map((token, i) => (
              <span
                key={i}
                style={{
                  fontWeight: token.isCorrect ? 700 : 400,
                  color: token.isError ? "#dc2626" : token.isCorrect ? "#0f766e" : "#1f2937",
                  backgroundColor: token.isError ? "rgba(220,38,38,0.15)" : "transparent",
                  textDecoration: token.isCurrent ? "underline" : "none",
                  textDecorationThickness: token.isCurrent ? "3px" : undefined,
                  textDecorationColor: token.isCurrent ? "#0f172a" : undefined,
                  transition: "color 120ms ease, font-weight 120ms ease, background-color 120ms ease"
                }}
              >
                {token.ch}
              </span>
            ))
          )}
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
            background: awaitingNext ? "#f3f4f6" : "#fff",
            boxSizing: "border-box"
          }}
        />
      </div>

      <StatsPanel
        floating={metrics.floatingCpm}
        peak={peakCpm}
        bestMinute={bestMinuteCpm}
        series={metrics.series}
      />

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

function computeMetrics(events, now) {
  if (!events.length) {
    return {
      floatingCpm: 0,
      minuteCpm: 0,
      series: generateSeries([], now)
    };
  }
  const floatingCpm = windowAverage(events, now, WINDOW_FLOAT_MS);
  const minuteCpm = windowAverage(events, now, WINDOW_MINUTE_MS);
  return {
    floatingCpm,
    minuteCpm,
    series: generateSeries(events, now)
  };
}

function windowAverage(events, endTime, windowMs) {
  if (windowMs <= 0) return 0;
  const start = endTime - windowMs;
  let sum = 0;
  for (const evt of events) {
    if (evt.time > endTime) break;
    if (evt.time >= start) {
      sum += evt.count;
    }
  }
  if (sum === 0) return 0;
  return (sum / windowMs) * 60000;
}

function generateSeries(events, now) {
  const points = [];
  const steps = Math.floor(WINDOW_MINUTE_MS / CHART_STEP_MS);
  for (let i = steps; i >= 0; i--) {
    const t = now - i * CHART_STEP_MS;
    points.push({
      time: t,
      value: windowAverage(events, t, WINDOW_FLOAT_MS)
    });
  }
  return points;
}

function StatsPanel({ floating, peak, bestMinute, series }) {
  const fmt = (value) => `${value.toFixed(0)} cpm`;
  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <Stat label="Floating avg (10s)" value={fmt(floating)} />
        <Stat label="Peak avg (10s)" value={fmt(peak)} />
        <Stat label="Best sustained (60s)" value={fmt(bestMinute)} />
      </div>
      <Chart series={series} />
    </section>
  );
}

function pickFallbackPassage() {
  const idx = Math.floor(Math.random() * FALLBACK_PASSAGES.length);
  return FALLBACK_PASSAGES[idx] || "Pecan Energies unlocks sustainable prosperity for Ghana and beyond.";
}

function Stat({ label, value }) {
  return (
    <div style={{ flex: "1 1 160px" }}>
      <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function Chart({ series }) {
  if (!series.length) {
    return <div style={{ marginTop: 16, color: "#9ca3af" }}>Start typing to see stats…</div>;
  }
  const width = 600;
  const height = 140;
  const maxValue = Math.max(120, ...series.map((p) => p.value));
  const pts = series.map((point, idx) => {
    const x = (idx / (series.length - 1 || 1)) * width;
    const y = height - (point.value / maxValue) * height;
    return `${x},${Number.isFinite(y) ? y : height}`;
  }).join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", marginTop: 16, background: "#f8fafc", borderRadius: 12 }}
    >
      <polyline fill="none" stroke="#0f766e" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={pts} />
      <polygon
        fill="rgba(14,116,144,0.15)"
        stroke="none"
        points={`${pts} ${width},${height} 0,${height}`}
      />
    </svg>
  );
}
