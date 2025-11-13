"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CONTACT_NOTES, CONTACT_LOOP_DURATION } from "../lib/contact-melody";
import { PASSAGES } from "../lib/passages";

const WINDOW_FLOAT_MS = 10_000;
const WINDOW_MINUTE_MS = 60_000;
const WINDOW_RESPONSIVE_MS = 5_000;
const MAX_HISTORY_MS = 5 * 60_000;
const CHART_STEP_MS = 5_000;
const CONTACT_MELODY_NOTES = Array.isArray(CONTACT_NOTES) ? CONTACT_NOTES : [];
const CONTACT_MELODY_DURATION = typeof CONTACT_LOOP_DURATION === "number" && CONTACT_LOOP_DURATION > 0
  ? CONTACT_LOOP_DURATION
  : (CONTACT_MELODY_NOTES.length ? CONTACT_MELODY_NOTES[CONTACT_MELODY_NOTES.length - 1].start : 8);
const CONTACT_SPEED_MIN = 0.275;
const CONTACT_SPEED_MAX = 1.4;
const AUDIO_TICK_INTERVAL_MS = 30;
const SPEED_ADJUST_TAU = 6; // seconds needed for gradual acceleration/deceleration
const CONTACT_INSTRUMENTS = {
  0: { waveform: "sawtooth", gain: 0.38, attack: 0.03, release: 0.5, filter: { type: "lowpass", frequency: 520, q: 0.8 } },
  1: { waveform: "triangle", gain: 0.28, attack: 0.018, release: 0.38, filter: { type: "lowpass", frequency: 1200, q: 1.1 } },
  2: { waveform: "square", gain: 0.24, attack: 0.012, release: 0.28, filter: { type: "bandpass", frequency: 1600, q: 3.5 } }
};
const DEFAULT_CONTACT_INSTRUMENT = { waveform: "triangle", gain: 0.26, attack: 0.015, release: 0.32 };
const MAX_BATCHED_INPUT = 6;
const MIN_MS_PER_CHAR = 35;

export default function Page() {
  const cpmHistoryRef = useRef([]);
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
  const [scoreError, setScoreError] = useState(null);
  const [scoreSubmitError, setScoreSubmitError] = useState(null);
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);

  const inputRef = useRef(null);
  const passageTimerRef = useRef(null);
  const [passagesCompleted, setPassagesCompleted] = useState(0);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [pendingScore, setPendingScore] = useState(null);
  const [playerName, setPlayerName] = useState("");
  const scoreInputRef = useRef(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioInitPending, setAudioInitPending] = useState(false);
  const audioEngineRef = useRef(null);
  const mountedRef = useRef(true);
  const [sessionStats, setSessionStats] = useState({ chars: 0, startMs: null });
  const [antiCheatWarning, setAntiCheatWarning] = useState("");
  const lastProgressTimeRef = useRef(null);
  const blockClipboardInteraction = useCallback((event) => {
    event.preventDefault();
    setAntiCheatWarning("Clipboard actions are disabled — please type each character manually.");
    return false;
  }, []);

  const startPassageRace = useCallback(() => {
    const nextPassage = pickPassage();
    setPassage(nextPassage);
    setLoadingPassage(false);
    setAwaitingNext(false);
    setStartedAt(Date.now());
    setCursor(0);
    setTyped("");
    setEvents((prev) => [...prev]);
    setAntiCheatWarning("");
    completionRef.current = false;
  }, []);
  useEffect(() => {
    startPassageRace();
  }, [startPassageRace]);


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
    return () => {
      mountedRef.current = false;
      audioEngineRef.current?.stop();
    };
  }, []);
  useEffect(() => {
    if (!audioEnabled) {
      audioEngineRef.current?.stop();
    }
  }, [audioEnabled]);
  const handleToggleAudio = useCallback(async () => {
    if (audioEnabled) {
      setAudioEnabled(false);
      setAudioInitPending(false);
      audioEngineRef.current?.stop();
      return;
    }
    if (audioInitPending) {
      return;
    }
    if (!audioEngineRef.current) {
      audioEngineRef.current = createBeatEngine();
    }
    setAudioInitPending(true);
    try {
      await audioEngineRef.current.start();
      if (mountedRef.current) {
        setAudioEnabled(true);
      }
    } catch (err) {
      console.warn("Failed to start audio engine", err);
      audioEngineRef.current?.stop();
      if (audioEngineRef.current?.unsupported === true) {
        audioEngineRef.current = createSilentBeatEngine(err?.message || "Audio engine unavailable");
      }
      if (mountedRef.current) {
        setAudioEnabled(false);
      }
    } finally {
      if (mountedRef.current) {
        setAudioInitPending(false);
      }
    }
  }, [audioEnabled, audioInitPending]);

  useEffect(() => {
    if (passageTimerRef.current) {
      clearTimeout(passageTimerRef.current);
    }
    if (!loadingPassage || passage.length) return;
    passageTimerRef.current = setTimeout(() => {
      startPassageRace();
    }, 4000);
    return () => {
      if (passageTimerRef.current) {
        clearTimeout(passageTimerRef.current);
        passageTimerRef.current = null;
      }
    };
  }, [loadingPassage, passage.length, startPassageRace]);
  const refreshScores = useCallback(async () => {
    try {
      const res = await fetch("/api/scores", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch scores");
      const data = await res.json();
      if (data && Array.isArray(data.scores)) {
        setScores(data.scores);
      }
      setScoreError(null);
    } catch (err) {
      setScoreError(err?.message || "Unable to load scores");
    }
  }, []);

  useEffect(() => {
    refreshScores();
    const id = setInterval(refreshScores, 30000);
    return () => clearInterval(id);
  }, [refreshScores]);

  const metrics = useMemo(() => computeMetrics(events, now), [events, now]);
  const [lastMetrics, setLastMetrics] = useState(() => metrics);
  useEffect(() => {
    const hasSignal = metrics.floatingCpm > 0 || metrics.minuteCpm > 0 || metrics.responsiveCpm > 0 || metrics.series.some(p => p.value > 0);
    if (!loadingPassage && !awaitingNext) {
      setLastMetrics(metrics);
    } else if (hasSignal) {
      setLastMetrics(metrics);
    }
  }, [metrics, loadingPassage, awaitingNext]);
  const effectiveMetrics = (!awaitingNext && !loadingPassage) ? metrics : lastMetrics;

  useEffect(() => {
    const engine = audioEngineRef.current;
    const responsiveCpm = Math.max(0, effectiveMetrics.responsiveCpm || 0);
    const now = Date.now();
    const windowMs = 15000;
    const history = cpmHistoryRef.current;
    history.push({ time: now, value: responsiveCpm });
    while (history.length && now - history[0].time > windowMs) {
      history.shift();
    }
    const averageCpm = history.length ? history.reduce((sum, entry) => sum + entry.value, 0) / history.length : 0;
    const normalized = Math.min(1, averageCpm / 320);
    const range = CONTACT_SPEED_MAX - CONTACT_SPEED_MIN;
    const targetSpeed = CONTACT_SPEED_MIN + normalized * range;
    if (engine) {
      engine.setSpeed(targetSpeed);
    }
  }, [effectiveMetrics.responsiveCpm]);
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
    lastProgressTimeRef.current = time;
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

  const isSuspiciousInput = (delta, now) => {
    if (delta <= 0) return false;
    if (delta >= MAX_BATCHED_INPUT) return true;
    const lastTime = lastProgressTimeRef.current;
    if (!lastTime || delta <= 1) return false;
    const elapsed = now - lastTime;
    return elapsed < delta * MIN_MS_PER_CHAR;
  };

  function onChange(e) {
    if (!passage.length) {
      setTyped("");
      setCursor(0);
      return;
    }
    const limit = passage.length || undefined;
    const value = typeof limit === "number" ? e.target.value.slice(0, limit) : e.target.value;
    const now = Date.now();
    let correctCount = 0;
    while (correctCount < value.length && passage[correctCount] === value[correctCount]) {
      correctCount += 1;
    }
    const delta = Math.max(0, correctCount - cursor);
    if (isSuspiciousInput(delta, now)) {
      setAntiCheatWarning("Copy/paste is blocked; keep typing each character manually.");
      if (inputRef.current) {
        inputRef.current.value = typed;
        inputRef.current.setSelectionRange(cursor, cursor);
      }
      return;
    }
    if (antiCheatWarning) {
      setAntiCheatWarning("");
    }
    setTyped(value);
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

  function handleCompletion() {
    completionRef.current = true;
    setTyped("");
    setCursor(0);
    setStartedAt(null);
    setPassagesCompleted((prev) => {
      const completed = prev + 1;
      if (completed >= 3) {
        const { chars, startMs } = sessionStats;
        const durationMs = startMs ? Math.max(1, Date.now() - startMs) : 1;
        const avgCpm = durationMs > 0 ? (chars / durationMs) * 60000 : 0;
        setPendingScore(Math.round(avgCpm));
        setScoreSubmitError(null);
        setShowNamePrompt(true);
        setAwaitingNext(true);
        setLoadingPassage(true);
        setPassage("");
        return 0;
      }
      startPassageRace();
      return completed;
    });
  }

  const resetAfterScore = useCallback(() => {
    setSessionStats({ chars: 0, startMs: null });
    setEvents([]);
    setPeakCpm(0);
    setBestMinuteCpm(0);
    setPassagesCompleted(0);
    completionRef.current = false;
    setAntiCheatWarning("");
    startPassageRace();
  }, [startPassageRace]);

  const submitScore = useCallback(async (name) => {
    if (pendingScore === null || isSubmittingScore) return;
    const payload = {
      name: name || "Anonymous",
      score: pendingScore
    };
    setIsSubmittingScore(true);
    setScoreSubmitError(null);
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody?.error || "Failed to save score");
      }
      const data = await res.json();
      if (data && Array.isArray(data.scores)) {
        setScores(data.scores);
      }
      setScoreError(null);
      setPendingScore(null);
      setShowNamePrompt(false);
      setPlayerName(name);
      resetAfterScore();
      refreshScores();
    } catch (err) {
      setScoreSubmitError(err?.message || "Unable to save score");
    } finally {
      setIsSubmittingScore(false);
    }
  }, [pendingScore, isSubmittingScore, resetAfterScore, refreshScores]);

  return (
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden", background: "#000" }}>
      <Starfield speed={effectiveMetrics.responsiveCpm} />
      <main style={{ position: "relative", zIndex: 1, maxWidth: 720, margin: "40px auto", padding: 16, color: "#f8fafc" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Pecan Brand Alignment Test</h1>
        <button
          onClick={handleToggleAudio}
          disabled={audioInitPending && !audioEnabled}
          style={{
            marginLeft: "auto",
            padding: "8px 16px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.3)",
            background: audioEnabled ? "rgba(34,197,94,0.2)" : "transparent",
            color: "#f8fafc",
            fontWeight: 600,
            cursor: audioInitPending && !audioEnabled ? "wait" : "pointer",
            opacity: audioInitPending && !audioEnabled ? 0.65 : 1
          }}
        >
          {audioEnabled ? "Music Off" : audioInitPending ? "Starting…" : "Music On"}
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
          onChange={onChange}
          onPaste={blockClipboardInteraction}
          onCopy={blockClipboardInteraction}
          onCut={blockClipboardInteraction}
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
        {antiCheatWarning && (
          <div style={{ marginTop: 8, fontSize: 14, color: "#f87171" }} role="status">
            {antiCheatWarning}
          </div>
        )}
      </div>

      <StatsPanel
        floating={effectiveMetrics.floatingCpm}
        peak={peakCpm}
        bestMinute={bestMinuteCpm}
        series={effectiveMetrics.series}
      />
      <Scoreboard scores={scores} error={scoreError} />

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
            setScoreSubmitError(null);
            resetAfterScore();
          }}
          submitting={isSubmittingScore}
          error={scoreSubmitError}
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
  const responsiveCpm = windowAverage(aligned, now, WINDOW_RESPONSIVE_MS);
  return {
    floatingCpm,
    minuteCpm,
    responsiveCpm,
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

function pickPassage() {
  const idx = Math.floor(Math.random() * PASSAGES.length);
  return PASSAGES[idx] || "Pecan Energies unlocks sustainable prosperity for Ghana and beyond.";
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

function Scoreboard({ scores, error }) {
  const prepared = (Array.isArray(scores) ? scores : [])
    .map((entry, idx) => {
      if (!entry || typeof entry !== "object") return null;
      const rawScore =
        typeof entry.score === "number"
          ? entry.score
          : typeof entry.score === "string"
          ? Number(entry.score)
          : typeof entry.cpm === "number"
          ? entry.cpm
          : typeof entry.wpm === "number"
          ? entry.wpm
          : typeof entry.value === "number"
          ? entry.value
          : NaN;
      if (!Number.isFinite(rawScore) || rawScore <= 0) {
        return null;
      }
      return {
        name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : "Anonymous",
        score: Math.round(rawScore),
        timestamp: typeof entry.timestamp === "number" ? entry.timestamp : idx,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, background: "rgba(3,7,18,0.7)" }}>
      <h2 style={{ marginBottom: 12, fontSize: 18, fontWeight: 600 }}>High Scores</h2>
      {error && (
        <div style={{ color: "#fca5a5", marginBottom: 8, fontSize: 13 }}>{error}</div>
      )}
      {prepared.length === 0 ? (
        <div style={{ color: "#94a3b8" }}>Complete three passages to record your score.</div>
      ) : (
        <div style={{ display: "grid", rowGap: 8 }}>
          {prepared.map((entry, idx) => (
            <div key={`${entry.name}-${entry.timestamp}-${idx}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span style={{ color: "#e2e8f0" }}>{entry.name}</span>
              <span style={{ color: "#f8fafc", fontWeight: 600 }}>{entry.score} cpm</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function NamePrompt({ inputRef, pendingScore, playerName, setPlayerName, onSubmit, onSkip, submitting, error }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}>
      <div style={{ background: "#0f172a", borderRadius: 16, padding: 24, width: "min(90vw, 420px)", color: "#f8fafc", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        <h2 style={{ marginBottom: 8, fontSize: 22, fontWeight: 600 }}>Great run!</h2>
        <p style={{ marginBottom: 16, color: "#cbd5f5" }}>Average speed: <strong>{pendingScore ?? 0} cpm</strong></p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (submitting) return;
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
          {error && (
            <p style={{ color: "#fca5a5", fontSize: 13, marginTop: 0, marginBottom: 12 }}>{error}</p>
          )}
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="submit"
              disabled={submitting}
              style={{
                flex: 1,
                padding: 10,
                border: "none",
                borderRadius: 8,
                background: submitting ? "#38bdf8" : "#0ea5e9",
                color: "#fff",
                fontWeight: 600,
                opacity: submitting ? 0.7 : 1,
                cursor: submitting ? "wait" : "pointer"
              }}
            >
              {submitting ? "Saving…" : "Save score"}
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

function createBeatEngine() {
  if (typeof window === "undefined") {
    return createSilentBeatEngine("Audio unavailable during server render");
  }

  let AudioContextCtor = window.AudioContext || window.webkitAudioContext || null;
  let loadAudioContextPromise = null;

  const ensureAudioContextCtor = async () => {
    if (AudioContextCtor) {
      return AudioContextCtor;
    }
    if (!loadAudioContextPromise) {
      loadAudioContextPromise = (async () => {
        try {
          const mod = await import("standardized-audio-context");
          if (typeof mod.isSupported === "function") {
            try {
              const supported = await mod.isSupported();
              if (!supported) {
                console.warn("Standardized AudioContext reports unsupported environment");
                return null;
              }
            } catch (err) {
              console.warn("Failed to verify audio context support", err);
            }
          }
          const candidates = [
            mod.AudioContext,
            mod.MinimalAudioContext,
            mod?.default?.AudioContext,
            mod?.default
          ];
          const ctor = candidates.find((candidate) => typeof candidate === "function") || null;
          if (ctor) {
            AudioContextCtor = ctor;
            if (typeof window.AudioContext !== "function") {
              window.AudioContext = ctor;
            }
            if (typeof window.webkitAudioContext !== "function") {
              window.webkitAudioContext = ctor;
            }
            return AudioContextCtor;
          }
        } catch (error) {
          console.warn("Failed to dynamically import standardized-audio-context", error);
        }
        return null;
      })();
    }
    return loadAudioContextPromise;
  };

  class BeatEngineImpl {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.isPlaying = false;
      this.timer = null;
      this.currentSpeed = CONTACT_SPEED_MIN;
      this.targetSpeed = CONTACT_SPEED_MIN;
      this.startPromise = null;
      this.shouldPlay = false;
      this.unsupported = false;
      this.supported = true;
      this.contactNotes = CONTACT_MELODY_NOTES;
      this.contactLoopDuration = CONTACT_MELODY_DURATION || 8;
      this.contactLoopAnchor = 0;
      this.contactNoteIndex = 0;
      this.lastTickTime = null;
    }

    resetContactLoop(anchorTime = 0) {
      this.contactLoopAnchor = anchorTime;
      this.contactNoteIndex = 0;
      this.lastTickTime = null;
    }

    async ensureContext() {
      if (this.unsupported) {
        throw new Error("Audio context unavailable");
      }
      if (this.ctx) return;
      const ctor = await ensureAudioContextCtor();
      if (!ctor) {
        this.unsupported = true;
        this.supported = false;
        throw new Error("Web Audio API not supported");
      }
      try {
        this.ctx = new ctor();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.4;
        this.masterGain.connect(this.ctx.destination);
      } catch (err) {
        this.ctx = null;
        this.masterGain = null;
        this.unsupported = true;
        this.supported = false;
        throw err;
      }
    }

    async start() {
      try {
        await this.ensureContext();
      } catch (err) {
        return Promise.reject(err);
      }
      if (!this.ctx) return;
      if (this.ctx.state === "closed") {
        this.ctx = null;
        this.masterGain = null;
        try {
          await this.ensureContext();
        } catch (err) {
          return Promise.reject(err);
        }
      }
      if (!this.ctx) return;
      this.shouldPlay = true;
      if (this.isPlaying) {
        if (this.ctx.state === "suspended") {
          await this.ctx.resume();
        }
        return;
      }
      if (this.startPromise) {
        await this.startPromise;
        return;
      }
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      const resumePromise = this.ctx.state !== "running" ? this.ctx.resume() : Promise.resolve();
      this.startPromise = resumePromise.then(() => {
        if (!this.shouldPlay) {
          return;
        }
        if (this.isPlaying) {
          return;
        }
        this.isPlaying = true;
        this.resetContactLoop(this.ctx?.currentTime || 0);
        this.scheduleLoop();
      }).finally(() => {
        this.startPromise = null;
      });
      return this.startPromise;
    }

    stop() {
      this.shouldPlay = false;
      this.isPlaying = false;
      this.resetContactLoop();
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      if (this.ctx && this.ctx.state !== "closed") {
        this.ctx.suspend();
      }
    }

    setSpeed(multiplier) {
      const clamped = this.clampSpeed(multiplier);
      this.targetSpeed = clamped;
      if (!this.isPlaying) {
        this.currentSpeed = clamped;
      }
    }

    clampSpeed(value) {
      const numeric = typeof value === "number" && Number.isFinite(value) ? value : CONTACT_SPEED_MIN;
      return Math.min(CONTACT_SPEED_MAX, Math.max(CONTACT_SPEED_MIN, numeric));
    }

    scheduleLoop() {
      if (!this.isPlaying) return;
      this.timer = setTimeout(() => {
        this.tick();
        this.scheduleLoop();
      }, AUDIO_TICK_INTERVAL_MS);
    }

    tick() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      if (this.lastTickTime === null) {
        this.lastTickTime = now;
      }
      const delta = now - this.lastTickTime;
      this.lastTickTime = now;
      this.updateCurrentSpeed(delta);
      this.scheduleContactMelody();
    }

    updateCurrentSpeed(deltaSeconds) {
      const tau = SPEED_ADJUST_TAU;
      const alpha = 1 - Math.exp(-Math.max(0, deltaSeconds) / (tau || 1));
      this.currentSpeed += (this.targetSpeed - this.currentSpeed) * alpha;
      this.currentSpeed = this.clampSpeed(this.currentSpeed);
    }

    scheduleContactMelody() {
      if (!this.ctx || !this.contactNotes.length || !this.isPlaying) return;
      if (!this.contactLoopAnchor) {
        this.resetContactLoop(this.ctx.currentTime);
      }
      const now = this.ctx.currentTime;
      const tempoFactor = this.currentSpeed || CONTACT_SPEED_MIN;
      const loopDuration = this.contactLoopDuration / tempoFactor;
      while (now - this.contactLoopAnchor >= loopDuration) {
        this.contactLoopAnchor += loopDuration;
        this.contactNoteIndex = 0;
      }
      const normalizedTempo = Math.min(
        1,
        Math.max(0, (tempoFactor - CONTACT_SPEED_MIN) / (CONTACT_SPEED_MAX - CONTACT_SPEED_MIN))
      );
      const lookahead = 0.45 + (1 - normalizedTempo) * 0.35;
      let guard = 0;
      while (guard < this.contactNotes.length) {
        const note = this.contactNotes[this.contactNoteIndex];
        if (!note) break;
        const scheduledStart = this.contactLoopAnchor + note.start / tempoFactor;
        if (scheduledStart > now + lookahead) {
          break;
        }
        const durationScale = Math.max(1, tempoFactor);
        const scaledDuration = Math.max(0.08, note.duration / durationScale);
        this.triggerContactNote(note, scheduledStart, scaledDuration);
        this.contactNoteIndex += 1;
        if (this.contactNoteIndex >= this.contactNotes.length) {
          this.contactNoteIndex = 0;
          this.contactLoopAnchor += loopDuration;
        }
        guard += 1;
      }
    }

    triggerContactNote(note, startTime, duration) {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const instrument = CONTACT_INSTRUMENTS[note.channel] || DEFAULT_CONTACT_INSTRUMENT;
      osc.type = instrument.waveform || "triangle";
      const freq = midiToFrequency(note.note);
      osc.frequency.setValueAtTime(freq, startTime);

      if (instrument.filter && typeof this.ctx.createBiquadFilter === "function") {
        const filter = this.ctx.createBiquadFilter();
        filter.type = instrument.filter.type || "lowpass";
        if (instrument.filter.frequency) {
          filter.frequency.setValueAtTime(instrument.filter.frequency, startTime);
        }
        if (instrument.filter.q) {
          filter.Q.setValueAtTime(instrument.filter.q, startTime);
        }
        osc.connect(filter);
        filter.connect(gain);
      } else {
        osc.connect(gain);
      }

      const velocity = Math.min(1, Math.max(0.12, note.velocity / 127));
      const attack = instrument.attack ?? 0.015;
      const release = Math.max(instrument.release ?? 0.3, duration * 0.9);
      const peak = (instrument.gain ?? 0.25) * velocity;

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(peak, startTime + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + release);

      gain.connect(this.masterGain);
      osc.start(startTime);
      osc.stop(startTime + release + 0.05);
    }

  }

  return new BeatEngineImpl();
}

const MIDI_A4 = 69;
const A4_FREQUENCY = 440;

function midiToFrequency(noteNumber) {
  if (!Number.isFinite(noteNumber)) {
    return A4_FREQUENCY;
  }
  return A4_FREQUENCY * Math.pow(2, (noteNumber - MIDI_A4) / 12);
}

function createSilentBeatEngine(message) {
  return {
    supported: false,
    unsupported: true,
    start() {
      return Promise.reject(new Error(message || "Audio engine unavailable"));
    },
    stop() {},
    setSpeed() {}
  };
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
    if (!ctx) {
      console.warn("Canvas 2D context unavailable; starfield disabled");
      return () => {};
    }
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
