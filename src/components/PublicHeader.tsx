import Image from 'next/image';
import Link from 'next/link';

/**
 * Shared simple header for public marketing/content pages — logo linking home, no NavBar (that's
 * for authenticated pages and takes a session prop). Matches the header markup already used
 * verbatim on /privacy, /terms, /refund-policy.
 */
export default function PublicHeader() {
  return (
    <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <Link href="/" className="flex items-center" aria-label="ClinicPlus Companion home">
        <Image
          src="/logo-wide.png"
          alt="ClinicPlus Companion"
          width={1942}
          height={809}
          priority
          className="h-10 w-auto"
        />
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/features" className="text-gray-700 hover:text-gray-900 transition-colors">
          Features
        </Link>
        <Link href="/solutions" className="text-gray-700 hover:text-gray-900 transition-colors">
          Solutions
        </Link>
        <Link href="/resources" className="text-gray-700 hover:text-gray-900 transition-colors">
          Resources
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-pill border border-gold-400/40 bg-gradient-to-b from-red-500 to-red-600 px-4 py-2 font-medium text-white shadow-md shadow-red-500/15 transition-[transform,box-shadow] duration-150 hover:scale-[1.02] hover:shadow-premium active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:scale-100"
        >
          Log in
        </Link>
      </nav>
    </header>
  );
}
