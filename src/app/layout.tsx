import type { ReactNode } from "react";

export const metadata = {
  title: "Pet Shop SaaS",
  description: "Gestão completa para pet shops",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
