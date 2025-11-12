export const metadata = { title: 'Torfinns Touch-Trainer' };
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'ui-sans-serif, system-ui' }}>
        <RuntimeEnvScript />
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
