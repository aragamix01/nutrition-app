import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Thai_Looped, Mitr } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const mitr = Mitr({
  weight: ['400', '500', '600'],
  subsets: ['thai', 'latin'],
  variable: '--font-mitr',
  display: 'swap',
});

const plex = IBM_Plex_Sans_Thai_Looped({
  weight: ['400', '500', '600'],
  subsets: ['thai', 'latin'],
  variable: '--font-plex',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'กินอะไรดี',
  description: 'บันทึกอาหารและคำนวณสารอาหารส่วนตัว',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fffaf2' },
    { media: '(prefers-color-scheme: dark)', color: '#191714' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${mitr.variable} ${plex.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
