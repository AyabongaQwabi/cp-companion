import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "@/components/ui/MotionProvider";
import { SITE_URL, SITE_NAME } from "@/lib/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: "Employee roster and appointment booking add-on for ClinicPlus clients",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: "Employee roster and appointment booking add-on for ClinicPlus clients",
    images: [
      {
        url: "/logo-wide.png",
        width: 1942,
        height: 809,
        alt: SITE_NAME,
      },
      {
        url: "/hero.jpg",
        width: 600,
        height: 338,
        alt: "ClinicPlus Companion dashboard preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: "Employee roster and appointment booking add-on for ClinicPlus clients",
    images: ["/hero.jpg"],
  },
};

// Organization + WebSite JSON-LD, applied site-wide from the root layout so every page
// (not just home) carries the same entity graph — see SEO-STRATEGY.md §5.
const ORGANIZATION_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'ClinicPlus',
  url: SITE_URL,
  description:
    'ClinicPlus provides occupational health medicals and screening from clinics in Hendrina and Churchill, South Africa.',
  areaServed: 'ZA',
  logo: `${SITE_URL}/logo-square.png`,
};

const WEBSITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: 'en-ZA',
  image: `${SITE_URL}/hero.jpg`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }}
        />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
