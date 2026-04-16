import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@vitalflow/ui/styles";

export const metadata: Metadata = {
  title: { default: "VitalFlow", template: "%s · VitalFlow" },
  description: "Clinical, administrative, and patient experiences, unified.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
