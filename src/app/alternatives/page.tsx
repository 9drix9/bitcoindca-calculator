import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, ClipboardCheck, Minus, ShieldAlert, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';

/**
 * Every competitor claim on this page was verified by loading the site in a
 * real browser on this date. If you re-verify, update the date AND the
 * observations together — a stale claim about someone else's product is worse
 * than no claim.
 *
 * On this date all five sites were reloaded (dcabtc.com, costavg.com,
 * cryptodca.io, dca-cc.com, bitcoindollarcostaverage.com) and every cell was
 * read again. Two things to re-test first next time, because both can change
 * without notice:
 *  - cryptodca.io's certificate had expired two days earlier, so its column was
 *    read with the browser warning bypassed (footnote 3). Once it is renewed,
 *    delete that footnote and the notes that point at it; do not re-date them.
 *  - dcaBTC's $NaN depends on the plan's dates (footnote 1), and its "N years
 *    ago" presets slide past the gap as time passes.
 */
const LAST_CHECKED = '12 October 2026';
const LAST_CHECKED_ISO = '2026-10-12';

const BASE_URL = 'https://btcdollarcostaverage.com';

const TITLE = 'Bitcoin DCA Calculator Alternatives, Compared Honestly';
const DESCRIPTION =
    'dcaBTC, costavg, CryptoDCA and dca-cc, each opened in a browser on the same day: what worked, what did not, and a dated feature table.';

export const metadata: Metadata = {
    // TITLE already carries the brand, so it opts out of the root layout's
    // "%s | Bitcoin DCA Calculator" template instead of printing it twice.
    title: { absolute: TITLE },
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
 *        No cell uses it after the 12 October 2026 check, so the legend above
 *        the table no longer explains the dash. Put that sentence back if one
 *        does again.
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
        dcabtc: { text: 'Loads, but its default plan showed $NaN', sup: '1' },
        costavg: { mark: 'yes' },
        cryptodca: { text: 'Certificate expired; browsers showed a warning', sup: '3' },
    },
    { kind: 'group', label: 'Data' },
    {
        kind: 'row',
        feature: 'Bitcoin price history',
        us: { text: 'From 18 Aug 2010' },
        dcabtc: { text: 'Built-in table, 17 Jul 2010 to 3 May 2025', sup: '1' },
        costavg: { text: 'From 17 Jul 2010' },
        cryptodca: { text: 'Custom range; a 2010 start gave rows from May 2013' },
    },
    {
        kind: 'row',
        feature: 'Assets you can backtest',
        us: { text: 'Bitcoin only' },
        dcabtc: { text: 'Bitcoin only' },
        costavg: { text: '8 coins, gold, S&P 500' },
        cryptodca: { text: '14 coins' },
    },
    {
        kind: 'row',
        feature: 'Data sources documented',
        us: { mark: 'yes', text: 'Methodology page' },
        dcabtc: { mark: 'no' },
        costavg: { mark: 'yes', text: 'One footer line' },
        // "Data provider: Coingecko.com", on the Imprint page its footer links
        // to. Nothing on the calculator page itself names a source.
        cryptodca: { mark: 'yes', text: 'One line on its Imprint page' },
    },
    {
        kind: 'row',
        feature: 'Buy frequencies',
        us: { text: 'Daily, weekly, bi-weekly, monthly' },
        dcabtc: { text: 'Daily, weekly, bi-weekly, monthly' },
        costavg: { text: 'Daily, weekly, bi-weekly, monthly, quarterly, yearly' },
        cryptodca: { text: 'Daily, weekly, bi-weekly, monthly' },
    },
    {
        kind: 'row',
        feature: 'Exchange fees modeled',
        // The calculator's two fee fields ("Fee (%)" and "Flat fee per buy") and
        // the preset buttons beside them.
        us: { text: 'Custom %, flat fee per buy, exchange presets' },
        dcabtc: { mark: 'no' },
        costavg: { text: 'Presets 0% to 1.49%, custom %, flat fee per buy' },
        cryptodca: { mark: 'no' },
    },
    { kind: 'group', label: 'Result metrics' },
    {
        kind: 'row',
        feature: 'Return on investment (ROI)',
        us: { mark: 'yes' },
        dcabtc: { mark: 'yes', text: 'On plans that render', sup: '1' },
        costavg: { mark: 'yes' },
        cryptodca: { mark: 'yes' },
    },
    {
        kind: 'row',
        feature: 'Annualized return (XIRR)',
        us: { mark: 'yes' },
        dcabtc: { mark: 'no' },
        costavg: { mark: 'yes' },
        cryptodca: { mark: 'no' },
    },
    {
        kind: 'row',
        feature: 'Max drawdown',
        us: { mark: 'yes' },
        dcabtc: { mark: 'no' },
        costavg: { mark: 'yes' },
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
        dcabtc: { mark: 'no', text: 'Dow Jones instead', sup: '2' },
        costavg: { mark: 'yes', text: 'Price and total return' },
        cryptodca: { text: 'Toggle, USD only; line collapsed from Feb 2026', sup: '4' },
    },
    {
        kind: 'row',
        feature: 'vs gold',
        us: { mark: 'yes' },
        dcabtc: { mark: 'yes', sup: '2' },
        costavg: { mark: 'yes' },
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
        costavg: { mark: 'yes' },
        cryptodca: { mark: 'no' },
    },
    {
        kind: 'row',
        feature: 'Share your result',
        us: { text: 'Link + share-card image' },
        dcabtc: { text: 'Link + prefilled tweet' },
        costavg: { text: 'Settings link, X and Reddit buttons, PNG' },
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
        // The "3" is the number of AdSlot renders on the home page (one in
        // app/page.tsx, two in DcaCalculator). Recount if a slot is ever added
        // or removed: this cell sits next to the same claim about competitors.
        us: { text: 'Labeled ads (3 on the home page), disclosed affiliates, BTC donations' },
        dcabtc: { text: 'eToro affiliate button' },
        costavg: { text: 'Ads (Coinzilla, Google AdSense), after cookie consent' },
        cryptodca: { text: 'Affiliate links (Bitvavo promo, exchange list)' },
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
        text: `dcaBTC's page and inputs loaded normally on ${LAST_CHECKED}, but its default plan ($10 a week for 3 years) showed "$NaN" for every result value. dcaBTC does not fetch prices while you use it: its Bitcoin history is a fixed table inside the page's own code. We read that table: on that date it ran from 17 July 2010 to 3 May 2025 and had no prices for 12 September to 12 October 2024. Every plan we tried with a purchase inside that gap showed $NaN. Plans that avoided it showed numbers, with every day after 3 May 2025 priced at the 3 May 2025 value, so a plan starting later than that showed 0.00% change.`,
    },
    {
        sup: '2',
        text: `dcaBTC's "Compare to other assets?" toggle adds gold and the Dow Jones Industrial Average, not the S&P 500. dcaBTC shows the toggle only on screens at least 768 pixels wide, which leaves out most phones. Both rendered on ${LAST_CHECKED}, including on the default plan where the Bitcoin figures showed $NaN.`,
    },
    {
        sup: '3',
        text: `CryptoDCA's HTTPS certificate expired on 10 October 2026, so on ${LAST_CHECKED} browsers stopped at a security warning instead of loading the site. The site behind the warning was still running. To keep this column current we loaded it with the warning bypassed and typed in nothing but calculator settings; every CryptoDCA cell describes what we saw that way. We are not suggesting you click through the warning yourself.`,
    },
    {
        sup: '4',
        text: `On ${LAST_CHECKED} CryptoDCA's S&P 500 line fell to almost zero part-way through our five-year test. The index values its page loaded were 1 for every day from 26 February 2026 onward, so the comparison could not be read for 2026. Earlier dates drew normally.`,
    },
];

// ── Small render helpers ──────────────────────────────────────────────────────

// A breadcrumb link is one short word, about 15px tall as text on a phone. The
// padding makes it a 44px touch target, and the negative margins hand the same
// space back so the row sits exactly where it did.
const crumbLink =
    'inline-flex min-h-11 items-center -my-3.5 px-1.5 -mx-1.5 hover:text-amber-700 dark:hover:text-amber-400 transition-colors';
// Links inside a sentence are underlined: colour alone does not mark a link.
const textLink =
    'text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-300 font-medium';
// The feature column of the comparison table, which scrolls sideways on a phone.
// It keeps its place, on the card's own background so the columns pass under it.
// z-10 because the footnote numbers are positioned (<sup> is, in Tailwind's
// reset) and would otherwise be painted on top of it as they pass.
const stickyCell = 'sticky left-0 z-10 bg-white dark:bg-slate-900';

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
                            <Link href="/" className={crumbLink}>
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
                        that works and shows its numbers. On {LAST_CHECKED} we visited five other Bitcoin DCA calculator
                        sites and wrote down what each one actually did, including the things this site does worse.
                        Every claim below is dated. Apart from the CryptoDCA column, which sits behind a browser
                        security warning (note 3), each one is something you can check yourself in a browser tab.
                        It is not a complete list: other sites publish DCA calculators too, and this page only covers
                        the ones it names.
                    </p>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                        By{' '}
                        <Link href="/author" className={textLink}>
                            drix
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
                        Text in a cell is what we read on the page, and a small number points to a note under the table.
                    </p>
                    <Card className="p-4 sm:p-6">
                        {/* `relative` keeps the sr-only "Yes" / "Not found" marks inside
                            this scroller. They are absolutely positioned, and with no
                            positioned ancestor they hung off the page itself: out in the
                            table's right-hand columns they made the whole document 623px
                            wide on a 390px phone. */}
                        <div
                            className="relative overflow-x-auto -mx-2 sm:mx-0"
                            tabIndex={0}
                            role="region"
                            aria-label="Feature comparison table"
                        >
                            <table className="w-full text-xs sm:text-sm min-w-[720px]">
                                <thead>
                                    <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                        <th scope="col" className={`${stickyCell} pb-2 pr-3 font-medium`}>Feature</th>
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
                                                    <span className="sticky left-0 inline-block">{row.label}</span>
                                                </th>
                                            </tr>
                                        ) : (
                                            <tr key={row.feature} className="border-t border-slate-200 dark:border-slate-700/50 align-top">
                                                <th scope="row" className={`${stickyCell} py-2.5 pr-3 font-medium text-left text-slate-800 dark:text-slate-200`}>
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
                                <Link href="/contact" className={textLink}>contact page</Link>{' '}
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
                                A Bitcoin-only backtester with a genuinely clean interface: a handful of controls on
                                one screen, long plain-English DCA guides underneath, and a toggle that adds gold and
                                the Dow Jones for comparison. On {LAST_CHECKED} its default plan showed $NaN, which is
                                the main reason this page exists. Plans that avoid the gap in its built-in price table
                                still showed numbers; note 1 under the table has the details.{' '}
                                <Link href="/alternatives/dcabtc" className={textLink}>
                                    Full dcaBTC comparison
                                </Link>.
                            </p>
                        </Card>
                        <Card className="p-5">
                            <h3 className="font-bold text-slate-900 dark:text-white mb-2">costavg</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                On {LAST_CHECKED} it ran our $50-a-week, five-year test cleanly and showed XIRR, max
                                drawdown, a lump-sum comparison, gold and S&amp;P 500 lines, and CSV and PNG downloads.
                                It also does things this site doesn&apos;t: quarterly and yearly schedules, backtests
                                for Ethereum, Solana, XRP, Tron, Litecoin, Monero, Cardano, gold and the S&amp;P 500,
                                a page that splits one contribution across several assets, and a BTC/USD history that
                                starts 17 July 2010, about a month earlier than ours.
                            </p>
                        </Card>
                        <Card className="p-5">
                            <h3 className="font-bold text-slate-900 dark:text-white mb-2">CryptoDCA</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                It covered the most coins of the three (14 on {LAST_CHECKED}) and the most interface
                                languages (English, German, Spanish, Turkish and French), with a tidy per-purchase
                                table and a lump-sum toggle. Two things to know as of that date: its HTTPS certificate
                                had expired two days earlier, so browsers showed a security warning before the site
                                (note 3), and its S&amp;P 500 line collapsed from late February 2026 (note 4).
                                We&apos;ll update both notes when either changes.
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
                                        An open-source DCA and lump-sum calculator whose{' '}
                                        <a
                                            href="https://github.com/vladanpaunovic/dca-crypto"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={textLink}
                                        >
                                            MIT-licensed code
                                        </a>{' '}
                                        is still public on GitHub. When we visited on {LAST_CHECKED}, dca-cc.com returned its
                                        host&apos;s &quot;404 DEPLOYMENT_NOT_FOUND&quot; error page with no calculator behind it, and the www address
                                        its GitHub page links to stopped at a certificate that expired in November 2024. If
                                        you came here looking for a dca-cc alternative,{' '}
                                        <Link href="/" className={textLink}>this site&apos;s calculator</Link>{' '}
                                        is open source too, and it covers custom date ranges, a lump-sum comparison and
                                        shareable links.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
                                <ShieldAlert className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" aria-hidden="true" />
                                <div>
                                    <h3 className="font-semibold text-slate-800 dark:text-white">bitcoindollarcostaverage.com</h3>
                                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                        Its HTTPS certificate expired on 15 July 2026 and had not been renewed when we checked
                                        on {LAST_CHECKED}, so browsers showed a security warning instead of the site. It was
                                        already expired the first time we looked, in August. Unlike CryptoDCA, we have never
                                        seen it load normally and have not looked behind the warning, so it has no column in
                                        the table. We&apos;ll re-check and update this note if the certificate is renewed.
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
                                    One exception to &quot;ordinary browser&quot;: CryptoDCA&apos;s certificate had expired two
                                    days before the check, so an ordinary browser stopped at a warning. We read its column
                                    with that warning bypassed, as note 3 under the table says.
                                </p>
                                <p>
                                    We are obviously not neutral — this is our calculator — which is why the table holds
                                    only what we observed ourselves, and why every negative claim carries the date we
                                    observed it. Competitors ship fixes, and a broken site today can be a good site next
                                    month.
                                </p>
                                <p>
                                    If anything here is wrong or out of date, use the{' '}
                                    <Link href="/contact" className={textLink}>contact page</Link>.
                                    Under our{' '}
                                    <Link href="/author#corrections-policy" className={textLink}>corrections policy</Link>,
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
                        Set $50, weekly and a five-year range on the calculator. You get the BTC accumulated, average
                        cost, ROI, annualized return, and max drawdown — with fees modeled and{' '}
                        <Link href="/methodology" className={textLink}>every formula and data source written out</Link>.
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
                    performance does not guarantee future results. dcaBTC, costavg, CryptoDCA, dca-cc and
                    bitcoindollarcostaverage.com are independent products with no affiliation to this site. That last
                    one is a different site from this one, btcdollarcostaverage.com, despite the similar name.
                </p>

            </div>
        </>
    );
}
