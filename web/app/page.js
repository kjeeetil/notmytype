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
  const [scores, setScores] = useState([]);

  const inputRef = useRef(null);
  const pendingMatchRef = useRef(true);
  const [socket, setSocket] = useState(null);
  const fallbackTimerRef = useRef(null);
  const passageRef = useRef("");
  const awaitingNextRef = useRef(false);
  const [passagesCompleted, setPassagesCompleted] = useState(0);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [pendingScore, setPendingScore] = useState(null);
  const [playerName, setPlayerName] = useState("");

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
    setEvents((prev) => [...prev]);
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
    const stored = localStorage.getItem("scores");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setScores(parsed);
      } catch { /* ignore */ }
    }
  }, []);
  useEffect(() => {
    localStorage.setItem("scores", JSON.stringify(scores.slice(0, 10)));
  }, [scores]);

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
  const [lastMetrics, setLastMetrics] = useState(() => metrics);
  useEffect(() => {
    const hasSignal = metrics.floatingCpm > 0 || metrics.minuteCpm > 0 || metrics.series.some(p => p.value > 0);
    if (!loadingPassage && !awaitingNext) {
      setLastMetrics(metrics);
    } else if (hasSignal) {
      setLastMetrics(metrics);
    }
  }, [metrics, loadingPassage, awaitingNext]);
  const effectiveMetrics = (!awaitingNext && !loadingPassage) ? metrics : lastMetrics;
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
      const filtered = prev.filter((evt) => evt.time >= time - MAX_HISTORY_MS);
      const headroom = filtered.reduce((sum, evt) => sum + evt.count, 0);
      const trimmedDelta = Math.max(0, Math.min(delta, passage.length - cursor));
      return [...filtered, { time, count: trimmedDelta, cumulative: headroom + trimmedDelta }];
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

    setPassagesCompleted((prev) => prev + 1);
    const completed = passagesCompleted + 1;
    if (completed >= 3) {
      const totalChars = events.reduce((sum, evt) => sum + evt.count, 0);
      const durationMs = events.length ? now - events[0].time : 1;
      const avgCpm = durationMs > 0 ? (totalChars / durationMs) * 60000 : 0;
      setPendingScore(Math.round(avgCpm));
      setShowNamePrompt(true);
      setPassagesCompleted(0);
      setAwaitingNext(false);
      setLoadingPassage(false);
      setPassage("");
      return;
    }

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

  const submitScore = (name) => {
    if (pendingScore === null) return;
    const entry = {
      name: name || "Anonymous",
      score: pendingScore,
      timestamp: Date.now()
    };
    setScores((prev) => [entry, ...prev].slice(0, 10));
    setPendingScore(null);
    setShowNamePrompt(false);
    setPlayerName(name);
    setAwaitingNext(false);
    setLoadingPassage(false);
    setPassage("");
    queueMatchRequest();
  };

  return (
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden", background: "#000" }}>
      <Starfield speed={effectiveMetrics.minuteCpm} />
      <main style={{ position: "relative", zIndex: 1, maxWidth: 720, margin: "40px auto", padding: 16, color: "#f8fafc" }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 12 }}>Torfinns Touch-Trainer</h1>
      <div style={{ border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: 16, background: "rgba(0,0,0,0.5)" }}>
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
            background: awaitingNext ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.05)",
            color: "#f8fafc",
            boxSizing: "border-box"
          }}
        />
      </div>

      <StatsPanel
        floating={effectiveMetrics.floatingCpm}
        peak={peakCpm}
        bestMinute={bestMinuteCpm}
        series={effectiveMetrics.series}
      />
      <Scoreboard scores={scores} />

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
              <div style={{ height: 8, background: "rgba(255,255,255,0.2)", borderRadius: 8 }}>
                <div style={{ width: `${progress}%`, height: 8, background: "#f8fafc", borderRadius: 8 }} />
              </div>
            </div>
          );
        })}
      </div>

      {countdownMs !== null && countdownMs > 0 && (
        <div style={{ marginTop: 12, fontSize: 14 }}>Race starts in {Math.ceil(countdownMs/1000)}s</div>
      )}
    </main>
    </div>
  );
}

function computeMetrics(events, now) {
  const aligned = events.reduce((acc, evt) => {
    const last = acc[acc.length - 1];
    if (last && Math.abs(last.time - evt.time) < 5) {
      last.count += evt.count;
      last.cumulative += evt.count;
    } else {
      acc.push({ ...evt });
    }
    return acc;
  }, []);
  const floatingCpm = windowAverage(aligned, now, WINDOW_FLOAT_MS);
  const minuteCpm = windowAverage(aligned, now, WINDOW_MINUTE_MS);
  return {
    floatingCpm,
    minuteCpm,
    series: generateSeries(aligned, now)
  };
}

function windowAverage(events, endTime, windowMs) {
  if (windowMs <= 0 || !events.length) return 0;
  const start = endTime - windowMs;
  let sum = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const evt = events[i];
    if (evt.time < start) break;
    if (evt.time <= endTime) sum += evt.count;
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
    <section style={{ marginTop: 24, padding: 16, border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, background: "rgba(8,8,12,0.6)" }}>
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
      <div style={{ fontSize: 12, color: "rgba(248,250,252,0.6)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: "#f8fafc" }}>{value}</div>
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
      style={{ width: "100%", marginTop: 16, background: "rgba(15,23,42,0.6)", borderRadius: 12 }}
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

function Scoreboard({ scores }) {
  if (!scores.length) return null;
  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, background: "rgba(3,7,18,0.7)" }}>
      <h2 style={{ marginBottom: 12, fontSize: 18, fontWeight: 600 }}>Recent Runs</h2>
      <div style={{ display: "grid", rowGap: 8 }}>
        {scores.slice(0, 10).map((entry, idx) => (
          <div key={`${entry.name}-${entry.timestamp}-${idx}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
            <span style={{ color: "#e2e8f0" }}>{entry.name || "Anonymous"}</span>
            <span style={{ color: "#f8fafc", fontWeight: 600 }}>{entry.score} cpm</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Starfield({ speed }) {
  const canvasRef = useRef(null);
  const speedRef = useRef(speed);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    const depth = 1200;
    const starCount = 500;
    const stars = [];

    const resetStar = (star, initial = false) => {
      star.x = (Math.random() * 2 - 1) * width;
      star.y = (Math.random() * 2 - 1) * height;
      star.z = initial ? Math.random() * depth : depth;
    };

    for (let i = 0; i < starCount; i++) {
      stars.push({ x: 0, y: 0, z: 0 });
      resetStar(stars[i], true);
    }

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const project = (star) => {
      const perspective = width / 2;
      const scale = perspective / (star.z || 1);
      return {
        x: star.x * scale + width / 2,
        y: star.y * scale + height / 2
      };
    };

    let animationFrame;
    const render = () => {
      const cpm = speedRef.current || 0;
      const normalized = Math.min(cpm / 400, 2);
      const hyperspace = normalized >= 1;
      const starSpeed = 4 + normalized * 12;
      ctx.fillStyle = hyperspace ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.85)";
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = hyperspace ? 2 : 1;
      ctx.globalAlpha = hyperspace ? 0.9 : 0.7;

      for (const star of stars) {
        const prevZ = star.z;
        star.z -= starSpeed;
        if (star.z <= 5) {
          resetStar(star);
          continue;
        }
        const prev = project({ ...star, z: prevZ });
        const curr = project(star);

        if (
          curr.x < 0 || curr.x > width ||
          curr.y < 0 || curr.y > height
        ) {
          resetStar(star);
          continue;
        }

        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }

      animationFrame = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
        background: "black"
      }}
    />
  );
}
