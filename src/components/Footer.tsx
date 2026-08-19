import Image from 'next/image';
import Link from 'next/link';

const FOOTER_LINKS = {
  Product: [
    { label: 'Roster', href: '/roster' },
    { label: 'Employee Groups', href: '/roster/groups' },
    { label: 'Insights', href: '/insights' },
    { label: 'Finances', href: '/finances' },
  ],
  Learn: [
    { label: 'Features', href: '/features' },
    { label: 'Solutions', href: '/solutions' },
    { label: 'Resources', href: '/resources' },
    { label: 'FAQ', href: '/resources/faq' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Refund Policy', href: '/refund-policy' },
  ],
};

export default function Footer() {
  return (
    <footer className="mt-auto">
      <div className="h-px bg-gradient-to-r from-transparent via-gold-400/60 to-transparent" />
      <div className="px-6 py-12 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 sm:col-span-1">
            <Image
              src="/logo-wide.png"
              alt="ClinicPlus Companion"
              width={1942}
              height={809}
              className="h-10 w-auto"
            />
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              A standalone, credit-based account-management companion for ClinicPlus clients.
            </p>
          </div>
          {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
            <div key={heading}>
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-3">
                {heading}
              </h3>
              <ul className="space-y-2">
                {links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-gray-500 hover:text-red-500 transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-3">
              Support
            </h3>
            <p className="text-sm text-gray-500">
              Contact your ClinicPlus account manager for help with Companion.
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-400 border-t border-gray-200 pt-6">
          © {new Date().getFullYear()} Namoota Technology (Pty) Ltd. Not affiliated with or operated by ClinicPlus.
        </p>
      </div>
    </footer>
  );
}
