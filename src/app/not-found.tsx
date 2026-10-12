import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';

const TITLE = 'Page not found';
const DESCRIPTION = 'There is no page at this address on Bitcoin DCA Calculator.';

// No `robots` here: Next adds <meta name="robots" content="noindex"> to a
// not-found response itself, and a second tag would only repeat it.
export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    // The root layout's canonical and social tags describe the home page. An
    // unknown address is not a copy of it.
    alternates: { canonical: null },
    openGraph: {
        title: TITLE,
        description: DESCRIPTION,
        type: 'website',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        card: 'summary',
        title: TITLE,
        description: DESCRIPTION,
    },
};

// The calculator has the button; these are the tools and the guides.
const links = [
    { href: '/calculators', label: 'All calculators' },
    { href: '/dca', label: 'DCA scenarios' },
    { href: '/why-bitcoin', label: 'Why Bitcoin' },
    { href: '/self-custody', label: 'Self-custody guide' },
    { href: '/mining', label: 'Mining guide' },
    { href: '/methodology', label: 'Methodology & data' },
] as const;

export default function NotFound() {
    return (
        <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md space-y-6 text-center">
                <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto">
                    <Logo className="w-8 h-8 text-amber-700 dark:text-amber-400" />
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Page not found</h1>
                    <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                        There is no page at this address. The link may be old or mistyped.
                    </p>
                </div>

                <Link
                    href="/"
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-medium text-slate-950 transition-colors hover:bg-amber-400"
                >
                    Open the calculator
                </Link>

                <nav
                    aria-label="Other pages"
                    className="rounded-2xl border border-[var(--hairline)] bg-white p-2 text-left shadow-[var(--elev-1)] dark:bg-slate-900"
                >
                    <ul className="grid grid-cols-1 sm:grid-cols-2">
                        {links.map(({ href, label }) => (
                            <li key={href}>
                                <Link
                                    href={href}
                                    className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    {label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>
        </div>
    );
}
