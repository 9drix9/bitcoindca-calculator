import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, ClipboardCheck, Minus, ShieldAlert, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';

/**
 * Every competitor claim on this page was verified by loading the site in a
 * real browser on this date. If you re-verify, update the date AND the
 * observations together — a stale claim about someone else's product is worse
 * than no claim.
 */
const LAST_CHECKED = '11 August 2026';
const LAST_CHECKED_ISO = '2026-08-11';

const BASE_URL = 'https://btcdollarcostaverage.com';

const TITLE = 'Bitcoin DCA Calculator Alternatives, Compared Honestly';
const DESCRIPTION =
    'Every Bitcoin DCA calculator we could find, loaded in a browser on the same day: dcaBTC, costavg, CryptoDCA, dca-cc. What worked, what did not, and a feature table you can verify yourself.';

export const metadata: Metadata = {
    // Root layout template appends "| Bitcoin DCA Calculator".
    title: TITLE,
    description: DESCRIPTION,
    keywords: [
        'dcabtc alternative',
        'dca-cc alternative',
        'bitcoin dca calculator comparison',
        'best bitcoin dca calculator',
        'costavg alternative',
        'crypto dca calculator comparison',
    ],
    alternates: {
        canonical: '/alternatives',
    },
    openGraph: {
        images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
        title: TITLE,
        description: DESCRIPTION,
        url: '/alternatives',
        type: 'website',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        images: ['/opengraph-image'],
        card: 'summary_large_image',
        title: TITLE,
        description: DESCRIPTION,
        creator: '@9drix9',
    },
};

// ── JSON-LD ───────────────────────────────────────────────────────────────────

const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
        { '@type': 'ListItem', position: 2, name: 'Alternatives', item: `${BASE_URL}/alternatives` },
    ],
};

const webPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${BASE_URL}/alternatives#webpage`,
    url: `${BASE_URL}/alternatives`,
    name: TITLE,
    description: DESCRIPTION,
    isPartOf: { '@id': `${BASE_URL}/#website` },
    dateModified: LAST_CHECKED_ISO,
    inLanguage: 'en-US',
};

const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Bitcoin DCA calculator alternatives compared',
    description: 'Bitcoin dollar-cost-averaging calculators compared feature by feature, each one verified in a browser on the stated date.',
    numberOfItems: 4,
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Bitcoin DCA Calculator (this site)', url: BASE_URL },
        { '@type': 'ListItem', position: 2, name: 'dcaBTC', url: 'https://dcabtc.com' },
        { '@type': 'ListItem', position: 3, name: 'costavg', url: 'https://costavg.com' },
        { '@type': 'ListItem', position: 4, name: 'CryptoDCA', url: 'https://cryptodca.io' },
    ],
};

// ── The comparison table ──────────────────────────────────────────────────────

/**
 * yes  = we saw the feature working in a browser on LAST_CHECKED.
 * no   = we could not find the feature. It may exist somewhere we didn't look.
 * na   = we could not verify either way (see the numbered note on the cell).
 */
type MarkKind = 'yes' | 'no' | 'na';

interface Cell {
    mark?: MarkKind;
    /** Short text shown instead of (or after) the mark. */
    text?: string;
    /** Footnote number rendered as a superscript. */
    sup?: string;
}

interface FeatureRow {
    kind: 'row';
    feature: string;
    us: Cell;
    dcabtc: Cell;
    costavg: Cell;
    cryptodca: Cell;
}

interface GroupRow {
    kind: 'group';
    label: string;
}

const TABLE: (FeatureRow | GroupRow)[] = [
    {
        kind: 'row',
        feature: `Working when we checked (${LAST_CHECKED})`,
        us: { mark: 'yes' },
        dcabtc: { text: 'Loads, but results showed $NaN', sup: '1' },
        costavg: { mark: 'yes' },
        cryptodca: { mark: 'yes' },
    },
    { kind: 'group', label: 'Data' },
    {
        kind: 'row',
        feature: 'Bitcoin price history',
        us: { text: 'From 18 Aug 2010' },
        dcabtc: { text: 'Start dates up to 9 years back' },
        costavg: { text: 'From 17 Jul 2010' },
        cryptodca: { text: 'Custom range; earliest date not stated' },
    },
    {
        kind: 'row',
        feature: 'Data sources documented',
        us: { mark: 'yes', text: 'Methodology page' },
        dcabtc: { mark: 'no' },
        costavg: { mark: 'no' },
        cryptodca: { mark: 'no' },
    },
    {
        kind: 'row',
        feature: 'Buy frequencies',
        us: { text: 'Daily, weekly, bi-weekly, monthly' },
        dcabtc: { text: 'Daily, weekly, bi-weekly, monthly' },
        costavg: { text: 'Weekly, monthly, yearly' },
        cryptodca: { text: 'Weekly, monthly (the options we used)' },
    },
    {
        kind: 'row',
        feature: 'Exchange fees modeled',
        us: { text: 'Any custom %' },
        dcabtc: { mark: 'no' },
        costavg: { text: 'Four presets (0% to 0.5%)' },
        cryptodca: { mark: 'no' },
    },
    { kind: 'group', label: 'Result metrics' },
    {
        kind: 'row',
        feature: 'Return on investment (ROI)',
        us: { mark: 'yes' },
        dcabtc: { mark: 'na', sup: '1' },
        costavg: { mark: 'yes' },
        cryptodca: { mark: 'yes' },
    },
    {
        kind: 'row',
        feature: 'Annualized return (XIRR)',
        us: { mark: 'yes' },
        dcabtc: { mark: 'no' },
        costavg: { mark: 'no' },
        cryptodca: { mark: 'no' },
    },
    {
        kind: 'row',
        feature: 'Max drawdown',
        us: { mark: 'yes' },
        dcabtc: { mark: 'no' },
        costavg: { mark: 'no' },
        cryptodca: { mark: 'no' },
    },
    { kind: 'group', label: 'Comparisons' },
    {
        kind: 'row',
        feature: 'DCA vs lump sum',
        us: { mark: 'yes' },
        dcabtc: { mark: 'no' },
        costavg: { mark: 'yes' },
        cryptodca: { mark: 'yes' },
    },
    {
        kind: 'row',
        feature: 'vs S&P 500',
        us: { mark: 'yes', text: 'Total return, dividends reinvested' },
        dcabtc: { mark: 'na', sup: '2' },
        costavg: { mark: 'no' },
        cryptodca: { text: 'Toggle, USD only' },
    },
    {
        kind: 'row',
        feature: 'vs gold',
        us: { mark: 'yes' },
        dcabtc: { mark: 'na', sup: '2' },
        costavg: { mark: 'no' },
        cryptodca: { mark: 'no' },
    },
    {
        kind: 'row',
        feature: 'Inflation-adjusted (CPI)',
        us: { mark: 'yes' },
        dcabtc: { mark: 'no' },
        costavg: { mark: 'no' },
        cryptodca: { mark: 'no' },
    },
    {
        kind: 'row',
        feature: 'vs savings account',
        us: { mark: 'yes', text: 'Adjustable APY' },
        dcabtc: { mark: 'no' },
        costavg: { mark: 'no' },
        cryptodca: { text: 'Cash line at 0% interest' },
    },
    { kind: 'group', label: 'Sharing & integration' },
    {
        kind: 'row',
        feature: 'CSV export',
        us: { mark: 'yes' },
        dcabtc: { mark: 'no' },
        costavg: { mark: 'no' },
        cryptodca: { mark: 'no' },
    },
    {
        kind: 'row',
        feature: 'Share your result',
        us: { text: 'Link + share-card image' },
        dcabtc: { text: 'Link + prefilled tweet' },
        costavg: { mark: 'no' },
        cryptodca: { text: 'Settings link' },
    },
    {
        kind: 'row',
        feature: 'Embeddable widget',
        us: { mark: 'yes' },
        dcabtc: { mark: 'no' },
        costavg: { mark: 'no' },
        cryptodca: { mark: 'no' },
    },
    {
        kind: 'row',
        feature: 'Open source',
        us: { text: 'MIT, on GitHub' },
        dcabtc: { mark: 'no' },
        costavg: { mark: 'no' },
        cryptodca: { mark: 'no' },
    },
    {
        kind: 'row',
        feature: 'Developer API',
        us: { mark: 'yes', text: 'Docs at /developers' },
        dcabtc: { mark: 'no' },
        costavg: { mark: 'no' },
        cryptodca: { mark: 'no' },
    },
    { kind: 'group', label: 'The deal' },
    {
        kind: 'row',
        feature: 'Account required',
        us: { text: 'Never' },
        dcabtc: { text: 'No' },
        costavg: { text: 'No' },
        cryptodca: { text: 'Optional login' },
    },
    {
        kind: 'row',
        feature: 'How it pays for itself',
        us: { text: 'One labeled ad + disclosed affiliates' },
        dcabtc: { text: 'eToro affiliate button' },
        costavg: { text: 'Donations + one banner' },
        cryptodca: { text: 'Bitvavo affiliate promo' },
    },
    {
        kind: 'row',
        feature: 'Price',
        us: { text: 'Free' },
        dcabtc: { text: 'Free' },
        costavg: { text: 'Free' },
        cryptodca: { text: 'Free' },
    },
];

const FOOTNOTES: { sup: string; text: string }[] = [
    {
        sup: '1',
        text: `dcaBTC's inputs and page loaded normally, but on the default scenario every result value rendered as "$NaN" when we checked on ${LAST_CHECKED}, so anything that depends on its results could not be verified. This may be a temporary outage.`,
    },
    {
        sup: '2',
        text: 'dcaBTC has a "Compare to other assets?" toggle, but with results not rendering we could not see which assets it covers or whether it works.',
    },
];

// ── Small render helpers ──────────────────────────────────────────────────────

function Mark({ kind }: { kind: MarkKind }) {
    if (kind === 'yes') {
        return (
            <span className="inline-flex items-center justify-center">
                <Check className="w-4 h-4 text-green-600 dark:text-green-400" aria-hidden="true" />
                <span className="sr-only">Yes</span>
            </span>
        );
    }
    if (kind === 'no') {
        return (
            <span className="inline-flex items-center justify-center">
                <X className="w-4 h-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                <span className="sr-only">Not found</span>
            </span>
        );
    }
    return (
        <span className="inline-flex items-center justify-center">
            <Minus className="w-4 h-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <span className="sr-only">Could not verify</span>
        </span>
    );
}

function CellContent({ cell }: { cell: Cell }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            {cell.mark && <Mark kind={cell.mark} />}
            {cell.text && <span>{cell.text}</span>}
            {cell.sup && <sup className="text-amber-700 dark:text-amber-400 font-semibold">{cell.sup}</sup>}
        </span>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AlternativesPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
            />
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 sm:space-y-12">

                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li>
                            <Link href="/" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                                Home
                            </Link>
                        </li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Alternatives</li>
                    </ol>
                </nav>

                {/* Hero */}
                <header className="space-y-3 sm:space-y-4 max-w-3xl">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white text-balance">
                        Bitcoin DCA calculators, <span className="text-amber-700 dark:text-amber-400">compared honestly</span>
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                        If you searched for a dcaBTC or dca-cc alternative, you probably just want a backtesting tool
                        that works and shows its numbers. On {LAST_CHECKED} we loaded every Bitcoin DCA calculator we
                        could find and wrote down what each one actually did, including the things this site does worse.
                        Every claim below is dated, and every one is something you can check yourself in a browser tab.
                    </p>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                        By{' '}
                        <Link href="/author" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                            Ricky Thach
                        </Link>
                        {' '}&middot; Last checked {LAST_CHECKED}
                    </p>
                </header>

                {/* The table */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        Feature by feature
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                        A <Check className="inline w-3.5 h-3.5 text-green-600 dark:text-green-400" aria-label="check mark" /> means
                        we saw it working. An <X className="inline w-3.5 h-3.5 text-slate-400 dark:text-slate-500" aria-label="x mark" /> means
                        we could not find the feature, which is not proof it doesn&apos;t exist somewhere we didn&apos;t look.
                        A <Minus className="inline w-3.5 h-3.5 text-slate-400 dark:text-slate-500" aria-label="dash" /> means
                        we could not verify either way.
                    </p>
                    <Card className="p-4 sm:p-6">
                        <div className="overflow-x-auto -mx-2 sm:mx-0">
                            <table className="w-full text-xs sm:text-sm min-w-[720px]">
                                <thead>
                                    <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                        <th scope="col" className="pb-2 pr-3 font-medium">Feature</th>
                                        <th scope="col" className="pb-2 px-3 font-semibold text-amber-700 dark:text-amber-400">This site</th>
                                        <th scope="col" className="pb-2 px-3 font-medium">dcaBTC</th>
                                        <th scope="col" className="pb-2 px-3 font-medium">costavg</th>
                                        <th scope="col" className="pb-2 px-3 font-medium">CryptoDCA</th>
                                    </tr>
                                </thead>
                                <tbody className="text-slate-700 dark:text-slate-300">
                                    {TABLE.map((row, i) =>
                                        row.kind === 'group' ? (
                                            <tr key={`group-${i}`}>
                                                <th
                                                    scope="colgroup"
                                                    colSpan={5}
                                                    className="pt-4 pb-1.5 pr-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                                                >
                                                    {row.label}
                                                </th>
                                            </tr>
                                        ) : (
                                            <tr key={row.feature} className="border-t border-slate-200 dark:border-slate-700/50 align-top">
                                                <th scope="row" className="py-2.5 pr-3 font-medium text-left text-slate-800 dark:text-slate-200">
                                                    {row.feature}
                                                </th>
                                                <td className="py-2.5 px-3 bg-amber-50/60 dark:bg-amber-500/5">
                                                    <CellContent cell={row.us} />
                                                </td>
                                                <td className="py-2.5 px-3"><CellContent cell={row.dcabtc} /></td>
                                                <td className="py-2.5 px-3"><CellContent cell={row.costavg} /></td>
                                                <td className="py-2.5 px-3"><CellContent cell={row.cryptodca} /></td>
                                            </tr>
                                        )
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-4 space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-3">
                            {FOOTNOTES.map((note) => (
                                <p key={note.sup} className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                    <sup className="text-amber-700 dark:text-amber-400 font-semibold">{note.sup}</sup>{' '}
                                    {note.text}
                                </p>
                            ))}
                            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                Spotted a mistake, or a feature we missed? Tell us on the{' '}
                                <Link href="/contact" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">contact page</Link>{' '}
                                and we&apos;ll correct it.
                            </p>
                        </div>
                    </Card>
                </section>

                {/* Credit where due */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        What each one does well
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                        <Card className="p-5">
                            <h3 className="font-bold text-slate-900 dark:text-white mb-2">dcaBTC</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                The tool that made Bitcoin-only DCA backtesting popular, with a genuinely clean
                                interface and some of the better plain-English DCA guides anywhere. When we checked
                                on {LAST_CHECKED} its results panel wasn&apos;t rendering numbers, which is the main
                                reason this page exists. If that gets fixed, it&apos;s a fine simple tool.{' '}
                                <Link href="/alternatives/dcabtc" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                    Full dcaBTC comparison
                                </Link>.
                            </p>
                        </Card>
                        <Card className="p-5">
                            <h3 className="font-bold text-slate-900 dark:text-white mb-2">costavg</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                A no-nonsense multi-coin calculator that worked flawlessly when we tested it, with
                                live prices that matched Kraken to the dollar. Credit where due: its BTC/USD history
                                starts 17 July 2010, about a month earlier than ours. If you want Litecoin or Monero
                                backtests, it has them and we don&apos;t.
                            </p>
                        </Card>
                        <Card className="p-5">
                            <h3 className="font-bold text-slate-900 dark:text-white mb-2">CryptoDCA</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                Covers ten or more coins with a tidy per-purchase table, a lump-sum toggle, an S&amp;P
                                 500 comparison for USD plans, and translations into several languages. If you DCA
                                into more than Bitcoin and want one tool for all of it, this is the strongest of the
                                three.
                            </p>
                        </Card>
                    </div>
                </section>

                {/* The two we couldn't compare */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        Two more we checked but couldn&apos;t compare
                    </h2>
                    <Card className="p-5 sm:p-6">
                        <div className="space-y-4">
                            <div className="flex items-start gap-3">
                                <ShieldAlert className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" aria-hidden="true" />
                                <div>
                                    <h3 className="font-semibold text-slate-800 dark:text-white">dca-cc.com</h3>
                                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                        A well-liked open-source DCA calculator that many people still search for. When we
                                        visited on {LAST_CHECKED}, the domain returned a bare &quot;404: NOT_FOUND&quot; error with
                                        no calculator behind it. If you came here looking for a dca-cc alternative, everything
                                        it did — custom date ranges, lump-sum comparison, shareable links — works on{' '}
                                        <Link href="/" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">this site&apos;s calculator</Link>,
                                        which is also open source.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
                                <ShieldAlert className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" aria-hidden="true" />
                                <div>
                                    <h3 className="font-semibold text-slate-800 dark:text-white">bitcoindollarcostaverage.com</h3>
                                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                        Its HTTPS certificate expired on 15 July 2026, so when we checked on {LAST_CHECKED} browsers
                                        showed a security warning instead of the site. The tool behind the warning may still work,
                                        but we don&apos;t recommend clicking through certificate warnings on any financial site, and
                                        we couldn&apos;t fairly review it without doing so. We&apos;ll re-check and update this note
                                        if the certificate is renewed.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </Card>
                </section>

                {/* How we compared */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        How we compared
                    </h2>
                    <Card className="p-5 sm:p-6">
                        <div className="flex items-start gap-3">
                            <ClipboardCheck className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" aria-hidden="true" />
                            <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                <p>
                                    On <strong className="text-slate-800 dark:text-slate-200">{LAST_CHECKED}</strong> we loaded
                                    each site in an ordinary browser and, where the tool allowed it, ran the same backtest:
                                    $50 a week for five years, or the closest settings the tool offered. We read the results
                                    off the screen and wrote down exactly what rendered, including the things that didn&apos;t work.
                                </p>
                                <p>
                                    We are obviously not neutral — this is our calculator — which is why the table only
                                    contains claims you can re-check yourself in a few minutes, and why every negative claim
                                    carries the date we observed it. Competitors ship fixes, and a broken site today can be
                                    a good site next month.
                                </p>
                                <p>
                                    If anything here is wrong or out of date, use the{' '}
                                    <Link href="/contact" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">contact page</Link>.
                                    Under our{' '}
                                    <Link href="/author#corrections-policy" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">corrections policy</Link>,
                                    confirmed errors on this page jump the queue.
                                </p>
                            </div>
                        </div>
                    </Card>
                </section>

                {/* CTA */}
                <Card celebrated className="p-6 sm:p-10 text-center">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                        Run the same test on this site
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 max-w-xl mx-auto leading-relaxed">
                        The $50-a-week preset is one click on the calculator. You get the BTC accumulated, average
                        cost, ROI, annualized return, and max drawdown — with fees modeled and{' '}
                        <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">every formula and data source written out</Link>.
                        No account, no email.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                        >
                            Open the DCA calculator
                            <ArrowRight className="w-4 h-4" aria-hidden="true" />
                        </Link>
                        <Link
                            href="/developers"
                            className="inline-flex items-center gap-2 border border-slate-300 dark:border-slate-700 hover:border-amber-500/50 text-slate-700 dark:text-slate-200 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                        >
                            Developer API docs
                        </Link>
                    </div>
                </Card>

                {/* Related */}
                <section className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                        Elsewhere on the site
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                        {[
                            { href: '/alternatives/dcabtc', label: 'dcaBTC alternative, in depth', sub: 'Setting-by-setting migration guide' },
                            { href: '/methodology', label: 'Methodology', sub: 'Every data source and formula we use' },
                            { href: '/embed-guide', label: 'Embed the calculator', sub: 'Put the widget on your own site' },
                        ].map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 hover:border-amber-500/50 transition-colors"
                            >
                                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">{link.label}</span>
                                <span className="block mt-0.5 text-xs text-slate-500 dark:text-slate-400">{link.sub}</span>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* Disclaimer */}
                <p className="border-t border-slate-200 dark:border-slate-800 pt-6 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Not financial advice. All tools on this page, ours included, are educational simulations; past
                    performance does not guarantee future results. dcaBTC, costavg, CryptoDCA, and dca-cc are
                    independent products with no affiliation to this site.
                </p>

            </div>
        </>
    );
}
