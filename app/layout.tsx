import type { Metadata } from 'next';
import './globals.css';
import rootClasses from '@/content/tailwind-root.json';
import { NavigationBoundary } from '@/components/navigation-boundary';
export const metadata: Metadata = {
  title: 'BIZ Nest - Subscribe to Life | Goa, India',
  description: 'Business with a Nest! Co-working, workation, meeting rooms and virtual offices in Goa.',
  icons: { icon: '/assets/img/fav-icon.png', apple: '/assets/img/fav-icon.png' },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${rootClasses.html} tw:[&_*]:box-border tw:[&_*::before]:box-border tw:[&_*::after]:box-border tw:[&_:focus-visible]:[outline:3px_solid_#ffc732] tw:[&_:focus-visible]:[outline-offset:4px]`}><head>
    <link rel="preload" href="/assets/fonts/Belleza-Regular.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
  </head><body className={rootClasses.body}><NavigationBoundary>{children}</NavigationBoundary></body></html>;
}
