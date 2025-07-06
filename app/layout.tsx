import './globals.css'; // Keep this line to import global styles
import type { Metadata } from 'next'; // Keep this line for Next.js metadata type

// REMOVED: Specific font imports that were causing the "Unknown font" error.
// import { GeistSans } from 'geist/font/sans'; // This line is GONE
// import { GeistMono } from 'geist/font/mono'; // This line is GONE

export const metadata: Metadata = {
  title: 'AI Bot Blocker Checker',
  description: 'Upload a CSV of URLs to see if they block common AI crawlers.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // REMOVED: The className attribute that was applying the problematic fonts.
    // It should now just be <html lang="en">
    <html lang="en"> 
      {/* REMOVED: Any font classes from the body tag */}
      <body /*className={GeistSans.variable}*/>{children}</body> 
    </html>
  );
}