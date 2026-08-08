import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, FileSpreadsheet, Layers, Scale, ScrollText } from 'lucide-react';
import { Card } from '@/components/ui/Card';

const BASE_URL = 'https://btcdollarcostaverage.com';
const PAGE_URL = `${BASE_URL}/bitcoin-dca-tax`;

const TITLE = 'Bitcoin DCA and Taxes: Tax Lots, Cost Basis, FIFO vs HIFO';
const DESCRIPTION =
    'Dollar-cost averaging into Bitcoin creates a separate tax lot for every purchase, each with its own cost basis and its own holding clock. What a lot is, what FIFO, LIFO, HIFO and specific identification mean, and why record-keeping is the real burden. General education, not tax advice.';

export const metadata: Metadata = {
    title: 'Bitcoin DCA and Taxes: Tax Lots & Cost Basis',
    description: DESCRIPTION,
    keywords: [
        'bitcoin dca taxes',
        'bitcoin cost basis fifo hifo',
        'bitcoin tax lots',
        'crypto cost basis methods',
        'specific identification bitcoin',
        'dca record keeping crypto',
    ],
    alternates: { canonical: '/bitcoin-dca-tax' },
    openGraph: {
        title: TITLE,
        description: DESCRIPTION,
        type: 'article',
        siteName: 'Bitcoin DCA Calculator',
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: TITLE,
        description: DESCRIPTION,
        creator: '@9drix9',
    },
};

// ── Lot arithmetic (plain multiplication, shown so the reader can check it) ─────

const CADENCES = [
    { label: 'Daily', perYear: 365 },
    { label: 'Weekly', perYear: 52 },
    { label: 'Every two weeks', perYear: 26 },
    { label: 'Monthly', perYear: 12 },
] as const;

const LOT_YEARS = [1, 3, 5, 10] as const;

const fmtInt = (n: number): string => n.toLocaleString('en-US');

// ── Illustrative disposal example ──────────────────────────────────────────────
// Deliberately round, invented numbers. These are NOT market prices and are not
// presented as any real historical figure — they exist to make the arithmetic of
// each accounting method visible in one screen.

interface Lot {
    id: string;
    bought: string;
    btc: number;
    price: number;
}

const EXAMPLE_LOTS: Lot[] = [
    { id: 'A', bought: 'Bought first (oldest)', btc: 0.01, price: 20_000 },
    { id: 'B', bought: 'Bought second', btc: 0.01, price: 60_000 },
    { id: 'C', bought: 'Bought third (newest)', btc: 0.01, price: 40_000 },
];

const EXAMPLE_SALE_BTC = 0.01;
const EXAMPLE_SALE_PRICE = 80_000;
const EXAMPLE_PROCEEDS = EXAMPLE_SALE_BTC * EXAMPLE_SALE_PRICE;

const lotBasis = (lot: Lot): number => lot.btc * lot.price;

const METHODS = [
    {
        name: 'FIFO',
        expand: 'First in, first out',
        lot: EXAMPLE_LOTS[0],
        note: 'The oldest lot is used up first. Often the default when no other method is chosen or documented.',
    },
    {
        name: 'LIFO',
        expand: 'Last in, first out',
        lot: EXAMPLE_LOTS[2],
        note: 'The newest lot goes first. Whether it is permitted at all depends on your jurisdiction.',
    },
    {
        name: 'HIFO',
        expand: 'Highest in, first out',
        lot: EXAMPLE_LOTS[1],
        note: 'The most expensive lot goes first, which minimises the gain on this disposal. It is normally a specific-identification strategy rather than a method in its own right.',
    },
] as const;

// ── JSON-LD ────────────────────────────────────────────────────────────────────

const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
        { '@type': 'ListItem', position: 2, name: 'Bitcoin DCA and Taxes', item: PAGE_URL },
    ],
};

const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
        {
            '@type': 'Question',
            name: 'What is a tax lot in Bitcoin?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'A tax lot is one acquisition of Bitcoin, recorded with the amount acquired, what you paid for it including fees, and the date you acquired it. Bitcoin itself is fungible, but for accounting purposes each purchase stays a distinct parcel with its own cost basis and its own acquisition date until you dispose of it. This is general educational information and not tax advice; rules differ by country.',
            },
        },
        {
            '@type': 'Question',
            name: 'How many tax lots does dollar-cost averaging create?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'One per purchase. Buying weekly for three years creates 52 x 3 = 156 lots. Buying daily for three years creates roughly 1,095. Every one of those lots carries its own cost basis and its own holding-period clock, which is why DCA generates far more record-keeping than a single lump-sum purchase.',
            },
        },
        {
            '@type': 'Question',
            name: 'What is the difference between FIFO, LIFO and HIFO?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'They are ordering rules that decide which lots a disposal is matched against. FIFO uses the oldest lots first, LIFO the newest first, and HIFO the highest-cost lots first. Because each lot has a different cost basis, the choice changes the realised gain or loss on the same sale, and it also changes which acquisition dates are used, which can change whether the gain counts as short-term or long-term. Which methods are permitted, and what documentation they require, varies by jurisdiction. Consult a qualified tax professional where you live.',
            },
        },
        {
            '@type': 'Question',
            name: 'Is moving Bitcoin to my own wallet a taxable disposal?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Transferring coins between wallets you control is generally treated as a movement rather than a disposal in most frameworks, because you have not parted with the asset. But it is exactly the kind of question where local rules and your own circumstances matter, and it is also the moment where lot records most often get lost, because exchanges cannot see the cost basis of coins that arrive from outside. Keep the records and ask a professional in your jurisdiction.',
            },
        },
        {
            '@type': 'Question',
            name: 'Does the Bitcoin DCA Calculator produce a tax report?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'No. The calculator simulates a hypothetical purchase schedule and can export that simulation as CSV, with one row per simulated buy: date, price, amount invested, BTC bought, and running totals. That is a useful shape for understanding how lots accumulate, but it is not a record of your actual trades, it does not track disposals, and it is not a tax report. Use your exchange records and, where appropriate, dedicated tax software or a professional.',
            },
        },
    ],
};

// ── Page ───────────────────────────────────────────────────────────────────────

function SectionHeading({ icon, children }: { icon: ReactNode; children: ReactNode }) {
    return (
        <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-amber-700 dark:text-amber-400 shrink-0" aria-hidden="true">{icon}</span>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{children}</h2>
        </div>
    );
}

export default function BitcoinDcaTaxPage() {
    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 sm:space-y-12">

                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li><Link href="/" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Home</Link></li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Bitcoin DCA and Taxes</li>
                    </ol>
                </nav>

                {/* Heading + lead */}
                <header className="space-y-3">
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white text-balance">
                        Bitcoin DCA and taxes: tax lots and cost basis
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                        Dollar-cost averaging has one consequence almost nobody mentions when they recommend it: every
                        single purchase becomes its own tax lot, with its own cost basis and its own holding-period
                        clock. Buy weekly for three years and you are not holding &quot;some Bitcoin&quot;. You are
                        holding 156 separate parcels that an accountant has to be able to tell apart. This page explains
                        the concepts so the paperwork stops being a surprise.
                    </p>
                </header>

                {/* Disclaimer — top */}
                <Card className="p-5 sm:p-6 border-amber-500/30 dark:border-amber-500/25">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                        <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                            <p>
                                <strong className="font-semibold text-slate-900 dark:text-white">This is general educational information, not tax advice.</strong>{' '}
                                Tax treatment of Bitcoin differs enormously between countries, changes over time, and
                                depends on facts specific to you. Nothing here states a rate, a threshold, a filing
                                requirement or a country&apos;s rules as fact, because we are not in a position to.
                            </p>
                            <p>
                                Everything below is framed as a <em>concept</em>: vocabulary and mechanics that help you
                                understand your own situation and have a shorter, cheaper conversation with someone
                                qualified. Before you act on any of it, consult a tax professional licensed in your own
                                jurisdiction.
                            </p>
                        </div>
                    </div>
                </Card>

                {/* 1. What a tax lot is */}
                <section className="space-y-4">
                    <SectionHeading icon={<Layers className="w-6 h-6 sm:w-7 sm:h-7" />}>What a tax lot is</SectionHeading>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                        <p>
                            A <strong className="font-semibold text-slate-800 dark:text-slate-100">tax lot</strong> is a
                            single acquisition of an asset, recorded as three things: how much you acquired, what it
                            cost you, and when you acquired it. That cost &mdash; usually the purchase price plus the
                            fees you paid to acquire it &mdash; is the lot&apos;s{' '}
                            <strong className="font-semibold text-slate-800 dark:text-slate-100">cost basis</strong>.
                        </p>
                        <p>
                            The confusing part is that Bitcoin is fungible in every practical sense. The satoshis you
                            bought in 2019 are indistinguishable from the ones you bought last Tuesday, and your wallet
                            shows one balance. Accounting does not care. For tax purposes each purchase stays a separate
                            parcel with its own history until you dispose of it, and the parcels are only merged on
                            paper if a rule in your jurisdiction says they should be (some countries do use pooled or
                            averaged basis instead of individual lots &mdash; another reason local rules matter).
                        </p>
                        <p>
                            Each lot also carries its own{' '}
                            <strong className="font-semibold text-slate-800 dark:text-slate-100">holding period</strong>:
                            the clock that starts on the day you acquired it. Many tax systems treat gains differently
                            depending on how long the specific parcel was held. The clock belongs to the lot, not to
                            your account, so a stack built by DCA contains lots at every possible stage of that clock
                            simultaneously.
                        </p>
                    </div>
                </section>

                {/* 2. Why DCA multiplies lots */}
                <section className="space-y-4">
                    <SectionHeading icon={<ScrollText className="w-6 h-6 sm:w-7 sm:h-7" />}>Why DCA multiplies the paperwork</SectionHeading>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                        <p>
                            A lump-sum buyer creates one lot. A DCA buyer creates one per purchase, forever. The
                            arithmetic is trivial and the result is not:
                        </p>
                    </div>

                    <Card className="p-4 sm:p-6">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[420px] text-xs sm:text-sm tabular-nums">
                                <caption className="sr-only">
                                    Number of tax lots created by a recurring Bitcoin purchase schedule, by cadence and
                                    number of years. Each figure is purchases per year multiplied by the number of years.
                                </caption>
                                <thead>
                                    <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                        <th scope="col" className="py-2 pr-4 font-medium">Buying cadence</th>
                                        {LOT_YEARS.map((years) => (
                                            <th key={years} scope="col" className="py-2 pr-4 font-medium text-right whitespace-nowrap">
                                                {years} year{years === 1 ? '' : 's'}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="text-slate-700 dark:text-slate-300">
                                    {CADENCES.map((cadence) => (
                                        <tr key={cadence.label} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                            <th scope="row" className="py-2 pr-4 font-medium text-left text-slate-800 dark:text-slate-100 whitespace-nowrap">
                                                {cadence.label}
                                            </th>
                                            {LOT_YEARS.map((years) => (
                                                <td key={years} className="py-2 pr-4 text-right">
                                                    {fmtInt(cadence.perYear * years)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                            Purchases per year times years. Daily figures ignore leap days. Each purchase is one lot.
                        </p>
                    </Card>

                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                        <p>
                            Weekly buying for three years is the headline case: <strong className="font-semibold text-slate-800 dark:text-slate-100">52 &times; 3 = 156 lots</strong>.
                            One hundred and fifty-six acquisition dates, 156 cost bases, 156 independent holding clocks.
                            If you ever sell, gift, spend or swap even a fraction of that stack, something has to decide
                            which of those 156 parcels the disposal came out of &mdash; and that decision changes the
                            number you report.
                        </p>
                        <p>
                            None of this makes DCA a bad idea. It makes DCA an idea with an administrative cost that is
                            worth knowing about on day one, when setting up a folder and a spreadsheet takes ten
                            minutes, rather than in year four when you are trying to reconstruct three exchanges&apos;
                            worth of history from memory.
                        </p>
                    </div>
                </section>

                {/* 3. What a disposal is */}
                <section className="space-y-4">
                    <SectionHeading icon={<Scale className="w-6 h-6 sm:w-7 sm:h-7" />}>What counts as a disposal</SectionHeading>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                        <p>
                            A <strong className="font-semibold text-slate-800 dark:text-slate-100">disposal</strong> is
                            the event that turns an unrealised paper gain into a realised one that the accounting has to
                            deal with. Buying and holding generally does not do that; parting with the asset generally
                            does. The concept most people get wrong is how many everyday actions count as parting with
                            it. Depending on the jurisdiction, the list commonly includes:
                        </p>
                        <ul className="space-y-2 ml-1">
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>Selling Bitcoin for fiat currency.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>Trading Bitcoin for another crypto asset &mdash; often a disposal of the Bitcoin even though no fiat was involved.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>Spending Bitcoin on goods or services. Buying a coffee can be a disposal of a fraction of a lot.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>Gifting or donating, in some frameworks and not others.</span>
                            </li>
                        </ul>
                        <p>
                            Moving coins between wallets you control is usually a transfer rather than a disposal,
                            because you have not given anything up. It is still the single most common place cost-basis
                            records get destroyed: the receiving platform has no idea what those coins cost you, so if
                            you did not keep the record yourself, nobody has it. Whether any of the above applies to you
                            is a question for a professional where you live &mdash; the point here is only that
                            &quot;disposal&quot; is broader than &quot;sold for cash&quot;.
                        </p>
                    </div>
                </section>

                {/* 4. The methods */}
                <section className="space-y-4">
                    <SectionHeading icon={<Layers className="w-6 h-6 sm:w-7 sm:h-7" />}>FIFO, LIFO, HIFO and specific identification</SectionHeading>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                        <p>
                            When you dispose of part of a stack made of many lots, something must decide which lots the
                            disposal is matched against. These four names are just the answers to that question. They
                            are accounting conventions, not tax strategies in themselves, and{' '}
                            <strong className="font-semibold text-slate-800 dark:text-slate-100">which of them you are permitted to use, and what you must document to use it, depends entirely on your jurisdiction.</strong>
                        </p>
                        <ul className="space-y-3 ml-1">
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>
                                    <strong className="font-semibold text-slate-800 dark:text-slate-100">FIFO (first in, first out).</strong>{' '}
                                    The oldest lots leave first. Simple, predictable, and in a rising market it tends to
                                    match your cheapest coins against the sale &mdash; the largest gain, but also the
                                    longest holding period.
                                </span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>
                                    <strong className="font-semibold text-slate-800 dark:text-slate-100">LIFO (last in, first out).</strong>{' '}
                                    The newest lots leave first, so the coins you just bought are the ones considered
                                    sold. Not permitted everywhere.
                                </span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>
                                    <strong className="font-semibold text-slate-800 dark:text-slate-100">HIFO (highest in, first out).</strong>{' '}
                                    The most expensive lots leave first, which minimises the gain on that disposal. It is
                                    usually not a standalone method but a way of applying specific identification, with
                                    the documentation burden that implies.
                                </span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>
                                    <strong className="font-semibold text-slate-800 dark:text-slate-100">Specific identification.</strong>{' '}
                                    You nominate exactly which lots the disposal came from. It is the most flexible
                                    approach and the most demanding: it generally requires contemporaneous records
                                    identifying the specific units, and it is the reason lot-level record-keeping is
                                    worth doing even if you never intend to use it.
                                </span>
                            </li>
                        </ul>
                    </div>

                    {/* Worked example */}
                    <Card className="p-4 sm:p-6 space-y-4">
                        <div>
                            <h3 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                                The same sale, three answers
                            </h3>
                            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                Round, made-up numbers chosen to make the arithmetic obvious. These are not market
                                prices and not a recommendation of any method.
                            </p>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[420px] text-xs sm:text-sm tabular-nums">
                                <caption className="sr-only">Three illustrative tax lots, each 0.01 BTC, bought at different prices.</caption>
                                <thead>
                                    <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                        <th scope="col" className="py-2 pr-4 font-medium">Lot</th>
                                        <th scope="col" className="py-2 pr-4 font-medium">Order acquired</th>
                                        <th scope="col" className="py-2 pr-4 font-medium text-right">Amount</th>
                                        <th scope="col" className="py-2 pr-4 font-medium text-right">Price paid</th>
                                        <th scope="col" className="py-2 font-medium text-right">Cost basis</th>
                                    </tr>
                                </thead>
                                <tbody className="text-slate-700 dark:text-slate-300">
                                    {EXAMPLE_LOTS.map((lot) => (
                                        <tr key={lot.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                            <th scope="row" className="py-2 pr-4 font-medium text-left text-slate-800 dark:text-slate-100">Lot {lot.id}</th>
                                            <td className="py-2 pr-4">{lot.bought}</td>
                                            <td className="py-2 pr-4 text-right">{lot.btc} BTC</td>
                                            <td className="py-2 pr-4 text-right">${fmtInt(lot.price)}</td>
                                            <td className="py-2 text-right">${fmtInt(lotBasis(lot))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                            Now you sell <strong className="font-semibold text-slate-800 dark:text-slate-100">{EXAMPLE_SALE_BTC} BTC</strong> at{' '}
                            <strong className="font-semibold text-slate-800 dark:text-slate-100">${fmtInt(EXAMPLE_SALE_PRICE)}</strong>, for proceeds of{' '}
                            <strong className="font-semibold text-slate-800 dark:text-slate-100">${fmtInt(EXAMPLE_PROCEEDS)}</strong>.
                            One sale, one amount of Bitcoin, one price. The realised gain depends entirely on which lot
                            the accounting says it came from:
                        </p>

                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[460px] text-xs sm:text-sm tabular-nums">
                                <caption className="sr-only">Realised gain on the same illustrative sale under FIFO, LIFO and HIFO.</caption>
                                <thead>
                                    <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                        <th scope="col" className="py-2 pr-4 font-medium">Method</th>
                                        <th scope="col" className="py-2 pr-4 font-medium">Lot used</th>
                                        <th scope="col" className="py-2 pr-4 font-medium text-right">Basis</th>
                                        <th scope="col" className="py-2 font-medium text-right">Realised gain</th>
                                    </tr>
                                </thead>
                                <tbody className="text-slate-700 dark:text-slate-300">
                                    {METHODS.map((method) => (
                                        <tr key={method.name} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                            <th scope="row" className="py-2 pr-4 text-left font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">
                                                {method.name}
                                                <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">{method.expand}</span>
                                            </th>
                                            <td className="py-2 pr-4">Lot {method.lot.id}</td>
                                            <td className="py-2 pr-4 text-right">${fmtInt(lotBasis(method.lot))}</td>
                                            <td className="py-2 text-right font-semibold">${fmtInt(EXAMPLE_PROCEEDS - lotBasis(method.lot))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <ul className="space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                            {METHODS.map((method) => (
                                <li key={method.name} className="flex items-start gap-2">
                                    <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                    <span><strong className="font-semibold text-slate-800 dark:text-slate-100">{method.name}:</strong> {method.note}</span>
                                </li>
                            ))}
                        </ul>

                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                            Notice the second-order effect. The highest-cost lot here happens to be the middle one by
                            date, so HIFO does not reliably shorten or lengthen your holding period — that depends
                            entirely on where your expensive buys happen to sit in time. Whether a shorter or longer
                            holding period helps or hurts depends on how your jurisdiction treats them, and a smaller
                            gain today is not automatically the better outcome. Which is, again, a question for a
                            professional and not for a web page.
                        </p>
                    </Card>
                </section>

                {/* 5. Record keeping */}
                <section className="space-y-4">
                    <SectionHeading icon={<ScrollText className="w-6 h-6 sm:w-7 sm:h-7" />}>Record-keeping is the real burden</SectionHeading>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                        <p>
                            Choosing a method takes an afternoon. Being able to <em>evidence</em> it takes years of
                            discipline, and that is the part DCA makes harder. A lump-sum buyer needs one receipt. A
                            weekly buyer needs a complete, unbroken chain of hundreds of them, surviving every exchange
                            they ever used.
                        </p>
                        <p>The failure modes are boringly predictable:</p>
                        <ul className="space-y-2 ml-1">
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span><strong className="font-semibold text-slate-800 dark:text-slate-100">The exchange shut down,</strong> or you closed the account, and the export went with it. Export your history on a schedule, not when you need it.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span><strong className="font-semibold text-slate-800 dark:text-slate-100">You withdrew to self-custody</strong> and the basis did not follow. The blockchain records the movement, not what you paid.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span><strong className="font-semibold text-slate-800 dark:text-slate-100">Fees were left out of the basis.</strong> Acquisition fees are commonly part of what a lot cost you; dropping them overstates gains on every one of your lots at once.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span><strong className="font-semibold text-slate-800 dark:text-slate-100">You bought in one currency and report in another.</strong> The value at the time of each acquisition is what matters; converting everything at today&apos;s exchange rate is a different, wrong number.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span><strong className="font-semibold text-slate-800 dark:text-slate-100">Small spends went unrecorded.</strong> Paying for something in Bitcoin is easy to forget and, in many frameworks, is a disposal like any other.</span>
                            </li>
                        </ul>
                        <p>
                            The practical version of all this is unglamorous: keep a running ledger with one row per
                            acquisition &mdash; date, amount of BTC, price, fee, total cost, and where it happened &mdash;
                            plus one row per disposal, and back it up somewhere that is not the exchange. Do that from
                            the first buy and the eventual conversation with a professional is short. Start it in year
                            four and it is archaeology.
                        </p>
                    </div>
                </section>

                {/* 6. CSV export */}
                <section className="space-y-4">
                    <SectionHeading icon={<FileSpreadsheet className="w-6 h-6 sm:w-7 sm:h-7" />}>How this site&apos;s CSV export fits in</SectionHeading>
                    <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                        <p>
                            The calculator on the homepage can export its purchase-by-purchase breakdown as CSV. It is
                            genuinely useful for seeing the lot structure of a schedule before you commit to it &mdash;
                            open the file and every simulated buy is a row, which is exactly the shape a lot ledger
                            takes. The columns are:
                        </p>
                    </div>

                    <Card className="p-4 sm:p-6">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[480px] text-xs sm:text-sm">
                                <caption className="sr-only">Columns in the CSV export produced by the Bitcoin DCA Calculator.</caption>
                                <thead>
                                    <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                        <th scope="col" className="py-2 pr-4 font-medium">Column</th>
                                        <th scope="col" className="py-2 font-medium">What it holds</th>
                                    </tr>
                                </thead>
                                <tbody className="text-slate-700 dark:text-slate-300">
                                    {[
                                        ['Date', 'The purchase date as yyyy-MM-dd, in UTC.'],
                                        ['BTC Price', 'The simulated price for that day, to two decimal places, in your selected display currency.'],
                                        ['Amount Invested', 'The amount put in on that date — the gross contribution, before any fee percentage is applied.'],
                                        ['BTC Bought', 'The Bitcoin acquired by that single purchase, to eight decimal places. This is the size of the lot.'],
                                        ['Cumulative Invested', 'Running total invested up to and including that row.'],
                                        ['Cumulative BTC', 'Running total of Bitcoin held after that row.'],
                                        ['Portfolio Value', 'Cumulative BTC valued at that row’s price.'],
                                    ].map(([col, desc]) => (
                                        <tr key={col} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0 align-top">
                                            <th scope="row" className="py-2 pr-4 text-left font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">{col}</th>
                                            <td className="py-2">{desc}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            The currency columns are labelled with whichever display currency you have selected. The
                            file is written with a UTF-8 byte-order mark so spreadsheets read the encoding correctly.
                        </p>
                    </Card>

                    <div className="space-y-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">What the export is not:</p>
                        <ul className="space-y-2 ml-1">
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>It is a <strong className="font-semibold text-slate-800 dark:text-slate-100">simulation of a hypothetical schedule</strong>, not a record of trades you actually made. Your real basis comes from your real exchange records.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>There are <strong className="font-semibold text-slate-800 dark:text-slate-100">no disposals in it.</strong> It only ever accumulates, so it cannot tell you a realised gain under any method.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>There is <strong className="font-semibold text-slate-800 dark:text-slate-100">no separate fee column.</strong> The fee percentage reduces the Bitcoin acquired rather than appearing as its own line, so the file does not show the fee component of a lot&apos;s cost.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>Non-USD figures are converted at <strong className="font-semibold text-slate-800 dark:text-slate-100">current exchange rates, not the rate on each historical date</strong>. That is fine for getting a feel for the numbers and wrong for anything resembling a tax record.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-700 dark:text-amber-400 font-bold mt-0.5 shrink-0">&bull;</span>
                                <span>It is <strong className="font-semibold text-slate-800 dark:text-slate-100">not a tax report</strong>, and this site does not produce one.</span>
                            </li>
                        </ul>
                        <p>
                            If you want to see the average cost of a set of purchases worked out rather than the lot
                            structure, the{' '}
                            <Link href="/calculators/bitcoin-cost-basis" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                Bitcoin cost basis calculator
                            </Link>{' '}
                            does that directly. It is the same caveat there: an average across purchases is a useful
                            summary number, and it is not the same thing as the per-lot basis your accounting needs.
                        </p>
                    </div>
                </section>

                {/* CTA */}
                <Card celebrated className="p-6 sm:p-10 text-center">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-3">
                        See the lots your schedule would create
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 max-w-xl mx-auto">
                        Run a schedule in the calculator, open the purchase breakdown, and export it. Every row is one
                        lot. It is the quickest way to understand what you are signing up to administratively before
                        you set up a recurring buy.
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                    >
                        Open the calculator
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </Card>

                {/* FAQ (visible, mirrors the FAQPage JSON-LD) */}
                <section className="space-y-4">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Common questions
                    </h2>
                    <div className="space-y-3">
                        {faqJsonLd.mainEntity.map((item) => (
                            <Card key={item.name} className="p-4 sm:p-5">
                                <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">{item.name}</h3>
                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                    {item.acceptedAnswer.text}
                                </p>
                            </Card>
                        ))}
                    </div>
                </section>

                {/* Related */}
                <section className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Keep reading
                    </h2>
                    <ul className="grid sm:grid-cols-2 gap-2 sm:gap-3">
                        <li>
                            <Link
                                href="/calculators/bitcoin-cost-basis"
                                className="block rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                            >
                                <span className="font-medium">Bitcoin cost basis calculator</span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Work out the average cost of a set of purchases.</span>
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/"
                                className="block rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                            >
                                <span className="font-medium">The DCA calculator</span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Backtest a schedule and export the purchase-by-purchase breakdown.</span>
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/self-custody"
                                className="block rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                            >
                                <span className="font-medium">Self-custody</span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Where withdrawals happen, and where basis records tend to go missing.</span>
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/methodology"
                                className="block rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                            >
                                <span className="font-medium">Methodology</span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">What the calculator models, and the fact that taxes are not among it.</span>
                            </Link>
                        </li>
                    </ul>
                </section>

                {/* Disclaimer — closing */}
                <div className="border-t border-slate-200 dark:border-slate-800 pt-6 space-y-3">
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        <strong className="font-semibold text-slate-800 dark:text-slate-100">Once more, plainly:</strong>{' '}
                        this page is general educational information about accounting concepts. It is not tax advice,
                        legal advice or financial advice. Tax rules for Bitcoin differ by country, differ by your
                        personal circumstances, and change. Nothing here should be relied on for filing anything.
                        Consult a qualified tax professional in your own jurisdiction before making decisions about
                        cost-basis methods, disposals or reporting.
                    </p>
                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Not financial advice. Bitcoin is volatile and you can lose money. Past performance does not
                        guarantee future results.
                    </p>
                </div>

            </div>
        </>
    );
}
