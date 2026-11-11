import type { Metadata } from 'next';
import { Provider } from '@/components/provider';
import { Shell } from '@/components/shell';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'Bazaar — Good finds, great people', template: '%s | Bazaar' },
  description:
    'Discover thoughtful essentials from independent stores. Shop home, technology, fashion and everyday favourites in Bangladesh.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Provider>
          <Shell>{children}</Shell>
        </Provider>
      </body>
    </html>
  );
}
