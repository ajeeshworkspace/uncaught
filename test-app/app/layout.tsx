'use client';

import { UncaughtProvider } from '@uncaught/react';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <UncaughtProvider
          projectKey="test-project"
          transport="local"
          debug={true}
          showDialog={true}
        >
          {children}
        </UncaughtProvider>
      </body>
    </html>
  );
}
