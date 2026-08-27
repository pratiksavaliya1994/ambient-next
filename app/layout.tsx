import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { InstallPrompt } from "@/components/pwa/install-prompt"
import { ServiceWorkerRegister } from "@/components/pwa/sw-register"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: { default: "Ambient", template: "%s · Ambient" },
  description: "Tool request and pickup workflow for Ambient Flooring",
  appleWebApp: { capable: true, title: "Ambient", statusBarStyle: "black-translucent" },
}

export const viewport: Viewport = {
  themeColor: "#f0c14b",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable)}
    >
      <body>
        <ThemeProvider>
          {children}
          <ServiceWorkerRegister />
          <InstallPrompt />
        </ThemeProvider>
      </body>
    </html>
  )
}
