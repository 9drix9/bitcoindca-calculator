import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ShieldAlert,
  Wrench,
  ListChecks,
  Scale,
  BookOpen,
  ArrowRight,
  History,
} from 'lucide-react';

/**
 * Incident write-up: the Coldcard seed-generation flaw disclosed 30 July 2026.
 * This page exists because /self-custody recommended the Coldcard until
 * 11 August 2026, and removing a recommendation without saying why would be
 * the opposite of what this site is for.
 *
 * The exploit was still active and Coinkite's post-mortem still pending when
 * this was written. Update LAST_UPDATED (and the sitemap/JSON-LD dates) when
 * the facts change.
 */
const LAST_UPDATED = '11 August 2026';

type Source = { label: string; url: string };

/** Every source cited on this page, fetched and checked on the date above. */
const SRC = {
  advisory: { label: 'Coinkite, Coldcard security advisory (30 July 2026)', url: 'https://blog.coinkite.com/coldcard-mk3-seed-generation-warning/' },
  thn: { label: 'The Hacker News, Coldcard flaw linked to $70M theft in 41 minutes (1 Aug 2026)', url: 'https://thehackernews.com/2026/08/coldcard-hardware-wallet-flaw-linked-to.html' },
  trm: { label: 'TRM Labs, inside the $116M Coldcard hack (5 Aug 2026)', url: 'https://www.trmlabs.com/resources/blog/the-largest-hardware-wallet-exploit-of-2026-inside-the-usd-116-million-coldcard-hack' },
  coindesk: { label: 'CoinDesk, Coldcard urges users to move bitcoin as exploit continues (4 Aug 2026)', url: 'https://www.coindesk.com/tech/2026/08/04/coldcard-urges-users-to-move-bitcoin-as-active-wallet-exploit-continues' },
  bloomberg: { label: 'Bloomberg, Coinkite declines to estimate losses (6 Aug 2026)', url: 'https://www.bloomberg.com/news/articles/2026-08-06/hacked-bitcoin-wallet-maker-declines-to-estimate-amount-lost' },
} as const satisfies Record<string, Source>;

const citeLink = 'text-amber-700 dark:text-amber-400 hover:underline';

function Src({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={citeLink}>
      {children}
    </a>
  );
}

function Cite({ items }: { items: readonly Source[] }) {
  return (
    <p className="mt-2 text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
      <span className="font-semibold">{items.length > 1 ? 'Sources' : 'Source'}:</span>{' '}
      {items.map((s, i) => (
        <span key={s.url}>
          {i > 0 && ' · '}
          <Src href={s.url}>{s.label}</Src>
        </span>
      ))}
    </p>
  );
}

export const metadata: Metadata = {
  title: 'The Coldcard Seed Flaw: What Happened and What to Do',
  description:
    'A plain-English explanation of the July 2026 Coldcard seed-generation flaw: which firmware versions are affected, why updating alone does not fix it, what Coinkite says to do, and why this site removed its Coldcard recommendation.',
  keywords: ['coldcard hack', 'coldcard vulnerability 2026', 'coldcard seed flaw', 'coinkite security advisory', 'is my coldcard safe', 'coldcard exploit what to do'],
  openGraph: {
    title: 'The Coldcard Seed Flaw: What Happened and What to Do',
    description:
      'Which Coldcard seeds are affected, why a firmware update alone does not fix them, and what to do now — with every claim dated and sourced.',
    url: '/coldcard',
    type: 'article',
    siteName: 'Bitcoin DCA Calculator',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Coldcard Seed Flaw: What Happened and What to Do',
    description: 'Which seeds are affected, why updating alone does not fix them, and what to do now.',
    creator: '@9drix9',
  },
  alternates: {
    canonical: '/coldcard',
  },
};

const cardClass = 'bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700';
const cardTitle = 'text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2';
const cardBody = 'text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed';
const sectionIcon = 'w-6 h-6 sm:w-8 sm:h-8 text-amber-600 dark:text-amber-500 shrink-0';
const sectionHeading = 'text-xl sm:text-3xl font-bold text-slate-900 dark:text-white';
const prose = 'text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed';

/**
 * Affected ranges, taken from Coinkite's advisory rather than press summaries.
 * What matters is the firmware the seed was GENERATED on, not what is
 * installed today.
 */
const AFFECTED: { model: string; range: string }[] = [
  { model: 'Mk2 and Mk3', range: 'Seeds generated on firmware 4.0.1 through 4.1.9 (March 2021 onward)' },
  { model: 'Mk4 and Mk5', range: 'Seeds generated on firmware before 5.6.0 (Edge releases before 6.6.0X)' },
  { model: 'Q', range: 'Seeds generated on firmware before 1.5.0Q (Edge releases before 6.6.0QX)' },
];

const SAFE: string[] = [
  'Seeds created with at least 50 fair, independent, private dice rolls — Coinkite says it does not consider these at risk from this bug alone',
  'Seeds generated on Mk2/Mk3 firmware before 4.0.1 (before March 2021), per the advisory’s affected ranges',
  'TAPSIGNER, OPENDIME and SATSCARD, which Coinkite says run different codebases',
  'Seeds generated on another device or in other software and merely imported into the Coldcard — the advisory does not address these directly, but they are unaffected by construction, because the flaw is in on-device seed generation',
];

const STEPS: { step: number; title: string; description: string }[] = [
  {
    step: 1,
    title: 'Assume your seed is affected until you can prove otherwise',
    description:
      'If your seed was generated on a Coldcard at any point since March 2021 and you did not use 50+ dice rolls, treat it as compromised now. Do not wait to see whether your address gets swept. The thefts ran in waves, and being missed in one wave means nothing about the next.',
  },
  {
    step: 2,
    title: 'Update the firmware, then generate a completely new seed',
    description:
      'Coinkite has published fixed firmware for every affected model and release track; its advisory lists the exact upgrade path for each. But the update only fixes how future seeds are made. It cannot add randomness to a seed that never had it, which is why Coinkite’s own advisory says to generate a new seed on the updated device. A new seed on a different vendor’s device is also a perfectly good answer.',
  },
  {
    step: 3,
    title: 'Send a test amount to the new wallet first',
    description:
      'Same discipline as any migration: send a small amount to the new wallet, verify the address on the device screen, wait for it to confirm, then move the rest. Coinkite’s advisory says the same.',
  },
  {
    step: 4,
    title: 'Move everything, then never use the old seed again',
    description:
      'Empty the old wallet completely, including any wallets protected by a passphrase on the same seed. Coinkite calls a strong passphrase an independent barrier, but still says to migrate — once the seed words themselves can be reconstructed, everything rests on the passphrase alone, and ordinary passphrases fall to brute force. The old seed is burned. Once you have confirmed a zero balance everywhere that seed was ever used — every account, every passphrase wallet — destroy the old backups so nobody mistakes them for live ones later.',
  },
  {
    step: 5,
    title: 'Expect the phishing wave that follows every incident',
    description:
      'Incidents like this are immediately followed by fake "migration tools", fake support agents, and fake advisory emails aimed at exactly the people scrambling to respond. The rule does not change: no legitimate wallet, support agent, or migration process will ever need your recovery phrase. Type it into a hardware wallet you are deliberately restoring, or into nothing.',
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'I updated my Coldcard firmware. Am I safe now?',
    a: 'Not if your seed was generated on the old firmware. The update fixes how new seeds are generated; it does nothing for a seed that already exists. If your seed was created on affected firmware, you need to generate a new seed on the patched device and move your funds to it. That is Coinkite’s own guidance, not ours.',
  },
  {
    q: 'My Coldcard is air-gapped and has never touched a computer. Does that protect me?',
    a: 'No, and this is the uncomfortable part. The flaw is in the seed itself: it was generated with far less randomness than it should have been, so attackers can reconstruct affected seeds by brute force on their own hardware, without ever contacting your device. The air gap protects a good seed from a bad computer. It cannot protect a weak seed from arithmetic.',
  },
  {
    q: 'I used dice rolls when I set up my Coldcard. Am I affected?',
    a: 'Coinkite says a seed built with at least 50 fair, independent, private dice rolls is not at risk from this bug alone. Fewer rolls than that, or rolls you are not sure about, and the honest answer is to migrate anyway. The cost of an unnecessary migration is an afternoon and a transaction fee. The cost of the other mistake is everything in the wallet.',
  },
  {
    q: 'Does this mean hardware wallets are pointless?',
    a: 'No. The lesson is narrower and more useful: a hardware wallet moves trust from your computer to the device vendor, and vendors can fail too. The mitigations that already existed are the ones that worked here — supplying your own entropy with dice rolls, and multisig across devices from different vendors, so no single vendor’s bug can reach the threshold. What empties most wallets is still lost backups and phishing, not firmware bugs. But firmware bugs are no longer hypothetical, and pretending otherwise would be marketing.',
  },
];

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://btcdollarcostaverage.com' },
    { '@type': 'ListItem', position: 2, name: 'The Coldcard Seed Flaw', item: 'https://btcdollarcostaverage.com/coldcard' },
  ],
};

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'The Coldcard Seed Flaw: What Happened and What to Do',
  description:
    'A plain-English explanation of the July 2026 Coldcard seed-generation flaw: which seeds are affected, why updating alone does not fix them, and what to do now.',
  author: {
    '@type': 'Person',
    '@id': 'https://btcdollarcostaverage.com/author#person',
    name: 'drix',
    url: 'https://btcdollarcostaverage.com/author',
  },
  publisher: {
    '@type': 'Organization',
    name: 'Bitcoin DCA Calculator',
    url: 'https://btcdollarcostaverage.com',
  },
  mainEntityOfPage: {
    '@type': 'WebPage',
    '@id': 'https://btcdollarcostaverage.com/coldcard',
  },
  datePublished: '2026-08-11',
  // Static date. Update when the content changes, and keep it in sync with sitemap.ts.
  dateModified: '2026-08-11',
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

export default function ColdcardPage() {
  return (
    <div className="measure max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10 sm:space-y-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* Hero */}
      <section className="text-center max-w-3xl mx-auto space-y-4 sm:space-y-5">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs sm:text-sm font-medium">
          <ShieldAlert className="w-4 h-4" />
          Security incident &middot; disclosed 30 July 2026
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white text-balance">
          The Coldcard Seed Flaw: <span className="text-amber-700 dark:text-amber-400">What Happened, and What to Do</span>
        </h1>
        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
          For five years, one of the most respected Bitcoin hardware wallets generated seeds with far less randomness
          than it was supposed to. In late July 2026, someone started using that fact to drain wallets. This page
          explains what happened in plain English, whether your seed is affected, and what to do about it.
        </p>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
          By{' '}
          <Link href="/author" className={`${citeLink} font-medium`}>drix</Link>
          {' '}&middot; Last updated {LAST_UPDATED}. The exploit was still active and Coinkite&apos;s post-mortem still
          pending on that date; this page will be updated as the facts settle.
        </p>
      </section>

      {/* TL;DR */}
      <section className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 p-5 sm:p-6 rounded-2xl space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
          <h2 className="text-base sm:text-lg font-bold text-red-700 dark:text-red-400">If you own a Coldcard, the short version</h2>
        </div>
        <ul className="space-y-2 text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed list-disc pl-5">
          <li>
            If your seed was <strong>generated on a Coldcard since March 2021</strong>, treat it as compromised —
            regardless of what firmware the device runs today, and regardless of whether anything has been stolen yet.
          </li>
          <li>
            <strong>Updating the firmware alone does not fix it.</strong> The update fixes future seeds. Your existing
            seed keeps whatever randomness it was born with.
          </li>
          <li>
            Coinkite&apos;s advisory: update, <strong>generate a brand-new seed</strong>, send a test transaction, then
            move everything. The old seed is burned.
          </li>
          <li>
            Seeds made with <strong>50+ dice rolls</strong> and the TAPSIGNER / OPENDIME / SATSCARD are not affected,
            per Coinkite. Seeds generated elsewhere and merely imported are unaffected by construction — the flaw is
            in on-device seed generation.
          </li>
        </ul>
        <Cite items={[SRC.advisory]} />
      </section>

      {/* What happened */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <History className={sectionIcon} />
          <h2 className={sectionHeading}>What Happened</h2>
        </div>
        <div className={`${prose} space-y-4`}>
          <p>
            On 30 July 2026, Coinkite published a security advisory: a flaw in how Coldcard devices generated seed
            phrases meant that seeds created on affected firmware had far less randomness than the 128 bits users were
            promised. The same day, wallets started being drained. The weakness let attackers reconstruct affected
            seeds by brute force and sweep the coins, in bulk, without ever touching a device — and the speed and scale
            of the first sweep suggest the work of reconstructing seeds had begun well before the advisory was public,
            though nobody has published who found the flaw first.
          </p>
          <div className="grid sm:grid-cols-3 gap-3 sm:gap-4">
            <div className={cardClass}>
              <div className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 inline-block mb-2 tabular-nums">March 2021</div>
              <p className={cardBody}>
                The flaw ships in firmware 4.0.1 for the Mk2 and Mk3. A build change quietly routes seed generation
                away from the chip&apos;s hardware random number generator and into a predictable software fallback. It
                carries forward into the Mk4, Mk5 and Q, and sits unnoticed for five years.
              </p>
            </div>
            <div className={cardClass}>
              <div className="text-xs font-mono px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 inline-block mb-2 tabular-nums">30 July 2026</div>
              <p className={cardBody}>
                Coinkite publishes its advisory, and the first large theft wave runs the same day — security reporting
                describes over a thousand addresses drained in under an hour. Emergency firmware for every affected
                model and release track ships the next day, 31 July. Coinkite urges users to migrate immediately.
              </p>
            </div>
            <div className={cardClass}>
              <div className="text-xs font-mono px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 inline-block mb-2 tabular-nums">Early August 2026</div>
              <p className={cardBody}>
                Sweeps continue in waves. By 5 August, Galaxy Research&apos;s tally stood at roughly 1,816 BTC — about
                $116 million — across more than 5,200 addresses, and was still described as preliminary. Coinkite has
                declined to publish its own loss estimate.
              </p>
            </div>
          </div>
          <p>
            The running totals differ from tracker to tracker and from day to day, which is itself worth knowing: at the
            time of writing nobody, including Coinkite, can state the full size of this. What is not in dispute is the
            mechanism, the affected firmware ranges, and what owners need to do.
          </p>
          <Cite items={[SRC.advisory, SRC.thn, SRC.trm, SRC.coindesk, SRC.bloomberg]} />
        </div>
      </section>

      {/* The flaw in plain English */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <Wrench className={sectionIcon} />
          <h2 className={sectionHeading}>The Flaw, in Plain English</h2>
        </div>
        <div className={`${prose} space-y-4`}>
          <p>
            A seed phrase is nothing more than a very large random number written as words. Its entire security rests
            on that number being drawn from a space so large that guessing is hopeless — 128 bits of randomness, a
            number with 39 digits. Hardware wallets carry a dedicated hardware random number generator for exactly
            this job.
          </p>
          <p>
            According to the root-cause analysis published by Block and summarized in security reporting, a March 2021
            build change meant the Coldcard firmware stopped using that hardware generator for seeds. The build
            configuration asked whether the hardware-randomness setting <em>existed</em> rather than whether it was
            switched <em>on</em>, and so the code silently fell back to a software generator seeded from predictable
            values — the chip&apos;s serial number and its internal timers. Coinkite&apos;s own estimates, as reported
            by The Hacker News, put the effective randomness at roughly 40 bits on Mk3-era devices and roughly 72 bits
            on the Mk4, Mk5 and Q, instead of the 128 promised. Block deliberately declined to reduce it to a single
            practical figure.
          </p>
          <p>
            Forty bits is a search a well-resourced attacker finishes. Seventy-two bits is a vastly harder search, and
            it is not public how far the attackers got against the newer models — but it is still far below what was
            promised, and Coinkite&apos;s advisory treats every affected model the same way: migrate. Because the
            weakness lives in the seed itself, none of the Coldcard&apos;s celebrated defenses apply: the air gap, the
            secure elements, the PIN — all of them protect the device, and the attacker never needs the device. They
            reconstruct the seed on their own hardware, derive the addresses, and sweep whatever is there.
          </p>
          <p>
            Two details make this stark. The flaw was introduced by accident and sat in <em>published</em> source code
            for five years — Coldcard&apos;s firmware is source-available, and nobody caught it. And the public learned
            of it the worst way possible: the advisory and the first mass theft landed on the same day.
          </p>
          <Cite items={[SRC.thn, SRC.advisory]} />
        </div>
      </section>

      {/* Am I affected */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <ListChecks className={sectionIcon} />
          <h2 className={sectionHeading}>Which Seeds Are Affected</h2>
        </div>
        <div className={`${prose} space-y-4`}>
          <p>
            The single question that matters: <strong className="text-slate-800 dark:text-slate-200">what firmware was
            running when your seed was generated?</strong> Not what is installed now. Per Coinkite&apos;s advisory:
          </p>
          <div className="space-y-3">
            {AFFECTED.map((row) => (
              <div key={row.model} className={`${cardClass} flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4`}>
                <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base sm:w-32 shrink-0">{row.model}</span>
                <span className={cardBody}>{row.range}</span>
              </div>
            ))}
          </div>
          <p>
            If you cannot remember which firmware the device was on when you set it up — and almost nobody can — the
            date is the practical test. A seed created on a Coldcard <strong className="text-slate-800 dark:text-slate-200">from
            March 2021 until the patched releases of July 2026</strong> should be treated as affected.
          </p>
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 p-4 sm:p-5 rounded-xl">
            <h3 className="text-sm sm:text-base font-bold text-emerald-700 dark:text-emerald-400 mb-2">Not affected</h3>
            <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed list-disc pl-5">
              {SAFE.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <Cite items={[SRC.advisory]} />
        </div>
      </section>

      {/* What to do */}
      <section className="space-y-4">
        <div className="text-center space-y-2">
          <h2 className={sectionHeading}>What to Do Now</h2>
          <p className={prose}>
            This mirrors Coinkite&apos;s own advisory, with the habits this site already teaches applied to the
            migration.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {STEPS.map((s) => (
            <div key={s.step} className="bg-white dark:bg-slate-800 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-700 relative">
              <div className="absolute -top-3 -left-2 w-8 h-8 rounded-full bg-amber-500 text-slate-950 text-sm font-bold flex items-center justify-center shadow-sm tabular-nums">
                {s.step}
              </div>
              <h3 className="font-bold text-sm sm:text-base text-slate-800 dark:text-white mt-2 mb-2">{s.title}</h3>
              <p className={cardBody}>{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What this changes */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <Scale className={sectionIcon} />
          <h2 className={sectionHeading}>What This Changes, and What It Does Not</h2>
        </div>
        <div className={`${prose} space-y-4`}>
          <p>
            Until 11 August 2026, our <Link href="/self-custody" className={citeLink}>self-custody guide</Link>{' '}
            recommended the Coldcard. The link was never an affiliate link, so no revenue rode on the recommendation —
            but the recommendation was ours, and we are not going to pretend it never existed. We removed it while the
            exploit is active and the post-mortem is pending, and we will reassess when Coinkite publishes its full
            account. Nobody outside Coinkite caught the flaw, and that includes us: it sat for five years in code
            anyone could read, and the signals everyone relied on — published source code, a long track record, a
            security-obsessed reputation — all pointed the right way the whole time.
          </p>
          <p>
            That is precisely the lesson. Choosing a hardware wallet moves trust from your computer to a vendor, and no
            amount of reputation reduces that trust to zero. The defenses that actually contained this flaw existed
            before it was found, and they are the unglamorous ones:
          </p>
          <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
            <div className={cardClass}>
              <h3 className={cardTitle}>Supply your own randomness</h3>
              <p className={cardBody}>
                Coldcard users who built their seeds from 50+ fair, independent, private dice rolls are the ones
                Coinkite says it does not consider at risk from this bug alone. Dice-roll randomness exists for
                exactly this failure: it removes the vendor&apos;s random number generator from the list of things you
                have to trust.
              </p>
            </div>
            <div className={cardClass}>
              <h3 className={cardTitle}>Multisig across vendors</h3>
              <p className={cardBody}>
                A 2-of-3 wallet with keys on devices from different manufacturers survives any single vendor&apos;s
                catastrophic bug, because one reconstructed seed is still one signature short. This incident is the
                strongest real-world argument for that setup to date.
              </p>
            </div>
          </div>
          <p>
            And what it does not change: the boring hierarchy of how bitcoin is actually lost. Vendor firmware bugs of
            this severity have now happened once at scale. Lost backups, phishing, and seeds typed into websites happen
            every single day, and they do not pause while the news cycle runs. The{' '}
            <Link href="/self-custody" className={citeLink}>habits that defend against those</Link> — tested backups,
            on-device verification, buying direct — are unchanged, and they still matter more than which box you buy.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="space-y-4">
        <h2 className={`${sectionHeading} text-center`}>Common Questions</h2>
        <div className="space-y-2.5">
          {FAQ.map((item) => (
            <details key={item.q} className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 transition-shadow hover:shadow-sm">
              <summary className="flex items-center justify-between cursor-pointer p-4 list-none [&::-webkit-details-marker]:hidden">
                <h3 className="font-semibold text-sm sm:text-base text-slate-800 dark:text-slate-200 pr-4">{item.q}</h3>
                <ArrowRight className="w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 group-open:rotate-90 shrink-0" />
              </summary>
              <div className="px-4 pb-4 -mt-1">
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.a}</p>
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Sources */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <BookOpen className={sectionIcon} />
          <h2 className={sectionHeading}>Sources</h2>
        </div>
        <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Firmware ranges and required actions are cited to Coinkite&apos;s own advisory. Technical root-cause
            details come from the security reporting on Block&apos;s analysis; the effective-randomness estimates are
            Coinkite&apos;s, as reported there. Loss figures are attributed to the named tracker with the date of the
            count, because they were still moving when this page was written. Where a claim is our inference rather
            than a source&apos;s statement, it is marked as such in place.
          </p>
          <ul className="space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            {Object.values(SRC).map((s) => (
              <li key={s.url} className="flex items-start gap-2">
                <span className="text-amber-700 dark:text-amber-500 mt-0.5 shrink-0">&bull;</span>
                <Src href={s.url}>{s.label}</Src>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800">
            <strong className="text-slate-700 dark:text-slate-300">Last updated:</strong> {LAST_UPDATED}. If you own an
            affected device, Coinkite&apos;s advisory — not this page — is the authoritative source for your model&apos;s
            exact upgrade path.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="border-t border-slate-200 dark:border-slate-800 pt-6 sm:pt-8">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[11px] sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            <strong>Disclaimer:</strong> This page is educational and is not financial or security advice. It summarizes
            an incident that was still developing on the date above; verify current guidance against Coinkite&apos;s own
            advisory before acting. This site&apos;s Coldcard links were never affiliate links. Our hardware wallet
            comparison, including its affiliate disclosures, is on the{' '}
            <Link href="/self-custody" className={citeLink}>self-custody guide</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
