import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "ServiceVoice · Better service starts with you",
    template: "%s · ServiceVoice",
  },
  description:
    "Find organizations, share your service experience, and report problems privately to the organization and its assigned assessor.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* ColorZilla and similar extensions can inject body attributes before hydration. */}
      <body suppressHydrationWarning>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
