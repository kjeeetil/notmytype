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
