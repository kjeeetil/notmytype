export const metadata = { title: 'Torfinns Touch-Trainer' };
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'ui-sans-serif, system-ui' }}>{children}</body>
    </html>
  );
}
