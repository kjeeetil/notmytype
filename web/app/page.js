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
const DEFAULT_SOCKET_URL = "http://localhost:8081";

function getSocketBaseUrl() {
  let runtimeValue;
  if (typeof window !== "undefined" && window.__ENV && window.__ENV.NEXT_PUBLIC_SOCKET_URL) {
    runtimeValue = window.__ENV.NEXT_PUBLIC_SOCKET_URL;
  }
  const candidate = runtimeValue || process.env.NEXT_PUBLIC_SOCKET_URL || DEFAULT_SOCKET_URL;
  return candidate.replace(/\/$/, "");
}

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
  const scoreInputRef = useRef(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioEngineRef = useRef(null);
  const [sessionStats, setSessionStats] = useState({ chars: 0, startMs: null });

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
    const url = getSocketBaseUrl();
    const s = io(url, { transports: ["websocket"], reconnection: true });
    setSocket(s);

    const handleConnectionIssue = () => {
      pendingMatchRef.current = true;
      if (passageRef.current && !awaitingNextRef.current) {
        return;
      }
      startFallbackRace();
    };

    s.on("scores:update", (list = []) => {
      setScores(Array.isArray(list) ? list : []);
    });
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
    if (showNamePrompt) {
      setTimeout(() => {
        scoreInputRef.current?.focus();
      }, 50);
    }
  }, [showNamePrompt]);
  useEffect(() => {
    if (!audioEnabled) {
      audioEngineRef.current?.stop();
      return;
    }
    if (!audioEngineRef.current) {
      audioEngineRef.current = new BeatEngine();
    }
    audioEngineRef.current.start();
    return () => {
      audioEngineRef.current?.stop();
    };
  }, [audioEnabled]);
  useEffect(() => {
    const engine = audioEngineRef.current;
    if (engine) {
      engine.setSpeed(Math.min(1.5, (effectiveMetrics.minuteCpm || 0) / 300));
    }
  }, [effectiveMetrics.minuteCpm]);

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
  useEffect(() => {
    const base = getSocketBaseUrl();
    const url = `${base}/scores`;
    fetch(url).then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      if (data && Array.isArray(data.scores)) {
        setScores(data.scores);
      }
    }).catch(() => {});
  }, []);

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
    const trimmedDelta = Math.max(0, Math.min(delta, passage.length - cursor));
    if (!trimmedDelta) return;
    setEvents((prev) => {
      const filtered = prev.filter((evt) => evt.time >= time - MAX_HISTORY_MS);
      const headroom = filtered.reduce((sum, evt) => sum + evt.count, 0);
      return [...filtered, { time, count: trimmedDelta, cumulative: headroom + trimmedDelta }];
    });
    setSessionStats((prev) => ({
      chars: prev.chars + trimmedDelta,
      startMs: prev.startMs ?? time
    }));
  }, [cursor, passage.length]);

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
      const { chars, startMs } = sessionStats;
      const durationMs = startMs ? Math.max(1, Date.now() - startMs) : 1;
      const avgCpm = durationMs > 0 ? (chars / durationMs) * 60000 : 0;
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
    if (socket?.connected) {
      socket.emit("score:submit", entry);
    }
    setPendingScore(null);
    setShowNamePrompt(false);
    setPlayerName(name);
    setSessionStats({ chars: 0, startMs: null });
    setEvents([]);
    setPeakCpm(0);
    setBestMinuteCpm(0);
    setPassage("");
    setAwaitingNext(true);
    setLoadingPassage(true);
    queueMatchRequest();
  };

  return (
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden", background: "#000" }}>
      <Starfield speed={effectiveMetrics.minuteCpm} />
      <main style={{ position: "relative", zIndex: 1, maxWidth: 720, margin: "40px auto", padding: 16, color: "#f8fafc" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Torfinns Touch-Trainer</h1>
        <button
          onClick={() => setAudioEnabled((prev) => !prev)}
          style={{
            marginLeft: "auto",
            padding: "8px 16px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.3)",
            background: audioEnabled ? "rgba(34,197,94,0.2)" : "transparent",
            color: "#f8fafc",
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          {audioEnabled ? "Mute Synth" : "Play Synth"}
        </button>
      </div>
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
                  color: token.isError ? "#f87171" : token.isCorrect ? "#14b8a6" : "#e2e8f0",
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
          disabled={awaitingNext || showNamePrompt}
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
      {showNamePrompt && (
        <NamePrompt
          inputRef={scoreInputRef}
          pendingScore={pendingScore}
          playerName={playerName}
          setPlayerName={setPlayerName}
          onSubmit={submitScore}
          onSkip={() => {
            setShowNamePrompt(false);
            setPendingScore(null);
            setSessionStats({ chars: 0, startMs: null });
            setPassagesCompleted(0);
            setEvents([]);
            setPeakCpm(0);
            setBestMinuteCpm(0);
            setPassage("");
            setAwaitingNext(true);
            setLoadingPassage(true);
            queueMatchRequest();
          }}
        />
      )}
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
  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, background: "rgba(3,7,18,0.7)" }}>
      <h2 style={{ marginBottom: 12, fontSize: 18, fontWeight: 600 }}>Recent Runs</h2>
      {scores.length === 0 ? (
        <div style={{ color: "#94a3b8" }}>Complete three passages to record your first score.</div>
      ) : (
        <div style={{ display: "grid", rowGap: 8 }}>
          {scores.slice(0, 10).map((entry, idx) => (
            <div key={`${entry.name}-${entry.timestamp}-${idx}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span style={{ color: "#e2e8f0" }}>{entry.name || "Anonymous"}</span>
              <span style={{ color: "#f8fafc", fontWeight: 600 }}>{entry.score} cpm</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function NamePrompt({ inputRef, pendingScore, playerName, setPlayerName, onSubmit, onSkip }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}>
      <div style={{ background: "#0f172a", borderRadius: 16, padding: 24, width: "min(90vw, 420px)", color: "#f8fafc", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        <h2 style={{ marginBottom: 8, fontSize: 22, fontWeight: 600 }}>Great run!</h2>
        <p style={{ marginBottom: 16, color: "#cbd5f5" }}>Average speed: <strong>{pendingScore ?? 0} cpm</strong></p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(playerName);
          }}
        >
          <label style={{ display: "block", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Enter your name
          </label>
          <input
            ref={inputRef}
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Anonymous"
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#f8fafc", marginBottom: 16 }}
          />
          <div style={{ display: "flex", gap: 12 }}>
            <button type="submit" style={{ flex: 1, padding: 10, border: "none", borderRadius: 8, background: "#0ea5e9", color: "#fff", fontWeight: 600 }}>
              Save score
            </button>
            <button type="button" onClick={onSkip} style={{ padding: 10, borderRadius: 8, border: "1px solid #64748b", background: "transparent", color: "#e2e8f0" }}>
              Skip
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

class BeatEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.isPlaying = false;
    this.timer = null;
    this.step = 0;
    this.speed = 0;
  }

  ensureContext() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.4;
    this.masterGain.connect(this.ctx.destination);
  }

  start() {
    this.ensureContext();
    this.ctx.resume();
    this.isPlaying = true;
    this.scheduleLoop();
  }

  stop() {
    this.isPlaying = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.suspend();
    }
  }

  setSpeed(multiplier) {
    this.speed = Math.max(0, multiplier);
    if (this.isPlaying) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.scheduleLoop();
    }
  }

  scheduleLoop() {
    if (!this.isPlaying) return;
    const tempo = 90 + this.speed * 120;
    const interval = (60 / tempo) * 1000 / 2; // eighth notes
    this.timer = setTimeout(() => {
      this.playStep();
      this.scheduleLoop();
    }, interval);
  }

  playStep() {
    if (!this.ctx) return;
    const step = this.step % 16;
    if (step % 4 === 0) this.playKick();
    if (step % 4 === 2) this.playSnare();
    this.playHat(step);
    if (this.speed > 1 && step % 8 === 4) this.playSynthStab();
    this.step += 1;
  }

  playKick() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.6 + this.speed * 0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  playSnare() {
    const bufferSize = this.ctx.sampleRate * 0.2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1200;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.3 + this.speed * 0.1;
    noise.connect(filter).connect(gain).connect(this.masterGain);
    noise.start();
    noise.stop(this.ctx.currentTime + 0.2);
  }

  playHat(step) {
    const bufferSize = this.ctx.sampleRate * 0.05;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    const accent = step % 2 === 0 ? 0.25 : 0.15;
    gain.gain.value = accent + this.speed * 0.05;
    noise.connect(gain).connect(this.masterGain);
    noise.start();
    noise.stop(this.ctx.currentTime + 0.1);
  }

  playSynthStab() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    const baseFreq = 220 + this.speed * 60;
    osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 2, this.ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);
  }
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
    const starCount = 700;
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
      const normalized = Math.min(cpm / 200, 2);
      const hyperspace = normalized >= 1;
      const rainbow = cpm >= 300;
      const starSpeed = 5 + normalized * 15;
      ctx.fillStyle = hyperspace ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.8)";
      ctx.fillRect(0, 0, width, height);

      ctx.lineWidth = hyperspace ? 2.6 : 1.2;
      ctx.globalAlpha = hyperspace ? 0.95 : 0.75;

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

        const hue = rainbow ? (Math.abs(star.x) + Math.abs(star.y)) % 360 : 0;
        ctx.strokeStyle = rainbow ? `hsl(${hue}, 90%, ${hyperspace ? 70 : 85}%)` : "#ffffff";

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
