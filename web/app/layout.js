export const metadata = { title: 'Pecan Brand Alignment Test' };
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'ui-sans-serif, system-ui' }}>
        <RuntimeEnvScript />
        <style
          // Global styles for typing cues, keyboard, and heatmap
          dangerouslySetInnerHTML={{
            __html: `
:root{
  --finger-pinkie-left:#ef4444; /* red */
  --finger-ring-left:#f97316;   /* orange */
  --finger-middle-left:#eab308; /* amber */
  --finger-index-left:#22c55e;  /* green */
  --finger-thumb:#14b8a6;       /* teal */
  --finger-index-right:#3b82f6; /* blue */
  --finger-middle-right:#8b5cf6;/* violet */
  --finger-ring-right:#ec4899;  /* pink */
  --finger-pinkie-right:#94a3b8;/* slate */
  --key-bg: rgba(255,255,255,0.06);
  --key-border: rgba(255,255,255,0.18);
  --key-active: rgba(34,197,94,0.35);
}

@keyframes shakeX{0%,100%{transform:translateX(0)}20%{transform:translateX(-2px)}40%{transform:translateX(2px)}60%{transform:translateX(-2px)}80%{transform:translateX(2px)}}
.shake{display:inline-block;animation:shakeX 160ms ease-in-out 1}

.kbd{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--key-border);border-radius:6px;background:var(--key-bg);padding:6px 8px;min-width:28px;min-height:28px;color:#e2e8f0;font-size:12px;user-select:none}
.kbd.hl{outline:2px solid var(--key-active);outline-offset:1px}
.kbd-row{display:flex;gap:6px;margin-top:6px}
.kbd-col{display:flex;flex-direction:column;gap:6px}
.kbd-legend{font-size:11px;color:#94a3b8;margin-top:4px}

.next-spot{background:rgba(59,130,246,0.14)}
.next-ghost{border-bottom:2px dotted rgba(148,163,184,0.6)}

.heatmap-veil{position:fixed;inset:0;background:rgba(2,6,23,0.72);backdrop-filter:blur(2px);z-index:40;display:flex;align-items:center;justify-content:center}
.heatmap-card{width:min(760px,92vw);max-height:82vh;overflow:auto;border:1px solid rgba(255,255,255,0.18);border-radius:12px;background:rgba(8,8,12,0.8);padding:16px}
.heatmap-title{margin:0 0 8px 0;color:#e2e8f0;font-weight:600}
.heatmap-note{font-size:12px;color:#94a3b8;margin-bottom:10px}
.heatmap-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
.combo-wrap{margin-top:12px;padding:12px;border:1px solid rgba(148,163,184,0.35);border-radius:12px;background:rgba(15,23,42,0.35)}
.combo-head{display:flex;align-items:center;justify-content:space-between;font-size:14px;color:#cbd5f5;margin-bottom:8px;font-weight:600}
.combo-bar{position:relative;width:100%;height:12px;border-radius:999px;background:rgba(15,23,42,0.6);overflow:hidden;border:1px solid rgba(148,163,184,0.3)}
.combo-fill{position:absolute;inset:0;width:0%;background:linear-gradient(90deg,#38bdf8,#22d3ee,#f97316);transition:width 160ms ease;border-radius:999px;box-shadow:0 0 12px rgba(56,189,248,0.6)}
.combo-tick{position:absolute;top:-3px;width:2px;height:18px;background:rgba(248,250,252,0.4)}
.combo-caption{margin-top:6px;font-size:12px;color:#94a3b8}
.caret-glow-1{text-shadow:0 0 6px rgba(56,189,248,0.95),0 0 12px rgba(14,165,233,0.7)}
.caret-glow-2{text-shadow:0 0 6px rgba(56,189,248,0.95),0 0 16px rgba(14,165,233,0.75),0 0 24px rgba(244,114,182,0.6)}
.caret-glow-3{text-shadow:0 0 10px rgba(249,115,22,0.95),0 0 20px rgba(234,179,8,0.8),0 0 32px rgba(59,130,246,0.6)}
.toggle-control{display:flex;align-items:center;gap:8px;font-size:13px;color:#e2e8f0;font-weight:600}
.toggle{position:relative;width:46px;height:24px;border-radius:999px;border:1px solid rgba(148,163,184,0.3);background:rgba(51,65,85,0.4);cursor:pointer;transition:background 160ms ease,border 160ms ease}
.toggle-thumb{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(15,23,42,0.35);transition:transform 160ms ease}
.toggle.on{background:linear-gradient(135deg,#22c55e,#16a34a);border-color:rgba(34,197,94,0.8)}
.toggle.on .toggle-thumb{transform:translateX(22px)}
.toggle-control small{color:#94a3b8;font-weight:400}
`
          }}
        />
        {children}
      </body>
    </html>
  );
}

function RuntimeEnvScript() {
  // Read at runtime so Cloud Run env vars injected at deploy time are respected
  const nextPublicSocket = process.env["NEXT_PUBLIC_SOCKET_URL"] || process.env["SOCKET_URL"] || "";
  const runtimeEnv = {
    NEXT_PUBLIC_SOCKET_URL: nextPublicSocket
  };
  const envJson = JSON.stringify(runtimeEnv).replace(/</g, "\\u003c");
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.__ENV = Object.assign({}, window.__ENV || {}, ${envJson});`
      }}
    />
  );
}
