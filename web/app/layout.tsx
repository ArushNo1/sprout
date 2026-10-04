import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Sprout', template: '%s · Sprout' },
  description: 'Your knowledge garden: concept maps and study games from Sprout.',
};
export const viewport: Viewport = { themeColor: '#f4eadf' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="site">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="site-leaf site-leaf--a" src="/leaf.png" alt="" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="site-leaf site-leaf--b" src="/leaf.png" alt="" aria-hidden="true" />
          {children}
        </div>
      </body>
    </html>
  );
}
