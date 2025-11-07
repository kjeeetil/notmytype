export const metadata = { title: 'Torfinns Touch-Trainer' };

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
  const runtimeEnv = {
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL || ""
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
