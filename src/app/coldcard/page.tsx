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
 * Two things were still open on LAST_UPDATED: Coinkite's detailed technical
 * post-mortem (its status page said "in preparation") and the final loss
 * total. Re-check both, and every URL in SRC, before moving the date. Update
 * LAST_UPDATED, the JSON-LD dateModified below and PAGE_DATES.coldcard in
 * sitemap.ts together.
 */
const LAST_UPDATED = '12 October 2026';

/**
 * `label` is the full reference, shown once in the Sources list at the foot.
 * `short` is what a citation under a section shows. The same sources are cited
 * section after section, and repeating each full reference there would add
 * about a seventh to the page's length on a phone.
 */
type Source = { label: string; short: string; url: string };

/** Every source cited on this page, fetched and checked on the date above. */
const SRC = {
  advisory: { label: 'Coinkite, Coldcard security advisory (30 July 2026, current-guidance note 14 Aug)', short: 'Coinkite advisory', url: 'https://blog.coinkite.com/coldcard-mk3-seed-generation-warning/' },
  deepDive: { label: 'Coinkite, technical deep dive into the entropy issue (30 July 2026)', short: 'Coinkite deep dive', url: 'https://blog.coinkite.com/entropy-technical-backgrounder/' },
  migrate: { label: 'Coinkite, migrate an affected Coldcard seed (last reviewed 30 Aug 2026)', short: 'Coinkite migration guide', url: 'https://coldcard.com/security/migrate' },
  status: { label: 'Coinkite, current Coldcard security status (verified 1 Oct 2026)', short: 'Coinkite status page', url: 'https://coldcard.com/security/status' },
  release561: { label: 'Coinkite, security update 5.6.1 / 1.5.1Q (20 Aug 2026)', short: 'Coinkite 5.6.1 release', url: 'https://blog.coinkite.com/coldcard-security-update-5.6.1-1.5.1q/' },
  block: { label: 'Block, predictable RNG fallback and 32-bit reseed in Coldcard firmware (30 July 2026)', short: 'Block analysis', url: 'https://engineering.block.xyz/blog/predictable-rng-fallback-and-32-bit-reseed-in-coldcard-firmware' },
  thn: { label: 'The Hacker News, Coldcard flaw linked to $70M theft in 41 minutes (1 Aug 2026)', short: 'The Hacker News', url: 'https://thehackernews.com/2026/08/coldcard-hardware-wallet-flaw-linked-to.html' },
  trm: { label: 'TRM Labs, inside the $116M Coldcard hack (5 Aug 2026)', short: 'TRM Labs', url: 'https://www.trmlabs.com/resources/blog/the-largest-hardware-wallet-exploit-of-2026-inside-the-usd-116-million-coldcard-hack' },
  coindesk: { label: 'CoinDesk, Coldcard urges users to move bitcoin as exploit continues (4 Aug 2026)', short: 'CoinDesk', url: 'https://www.coindesk.com/tech/2026/08/04/coldcard-urges-users-to-move-bitcoin-as-active-wallet-exploit-continues' },
  bloomberg: { label: 'Bloomberg, Coinkite declines to estimate losses (6 Aug 2026)', short: 'Bloomberg', url: 'https://www.bloomberg.com/news/articles/2026-08-06/hacked-bitcoin-wallet-maker-declines-to-estimate-amount-lost' },
  galaxyBrief: { label: 'Galaxy Research, weekly brief on the Coldcard thefts (7 Aug 2026)', short: 'Galaxy Research brief', url: 'https://www.galaxy.com/insights/research/coldcard-hardware-wallet-hack-bitcoin-resilience-ethereum-solana-inflation-proposals' },
  decryptAug: { label: 'Decrypt, Galaxy: thefts slow, none confirmed after 6 August (14 Aug 2026)', short: 'Decrypt, 14 Aug', url: 'https://decrypt.co/375656/coldcard-bitcoin-thefts-slow-losses-top-150-million' },
  cointelegraphAug: { label: 'Cointelegraph, Galaxy tally of 1,789 BTC from 8,865 addresses (25 Aug 2026)', short: 'Cointelegraph, 25 Aug', url: 'https://cointelegraph.com/news/coldcard-hack-galaxy-btc-lost-87-unmoved' },
  decryptSep: { label: 'Decrypt, Galaxy on the third-wave coins and an unconfirmed fourth wave (7 Sep 2026)', short: 'Decrypt, 7 Sep', url: 'https://decrypt.co/377537/coldcard-hacker-moves-7-7m-nearly-half-of-third-wave-bitcoin-haul' },
  cointelegraphSep: { label: 'Cointelegraph, white hats send 52 BTC to a recovery trust (22 Sep 2026)', short: 'Cointelegraph, 22 Sep', url: 'https://cointelegraph.com/news/white-hats-coldcard-btc-exploit-galaxy' },
  cointelegraphOct: { label: 'Cointelegraph, phishing link posted from Coldcard’s X account (11 Oct 2026)', short: 'Cointelegraph, 11 Oct', url: 'https://cointelegraph.com/news/coldcard-says-its-investigating-how-phishing-link-appeared-on-its-x-account' },
} as const satisfies Record<string, Source>;

// Underlined, not colour alone: these links sit inside running text, where amber
// against slate is about 1.5:1 and a hover underline never shows on a phone.
const citeLink = 'text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-300';
// The "On this page" rows stand alone in a labelled nav, so position marks them.
const navLink = 'text-amber-700 dark:text-amber-400 hover:underline';

/**
 * Inline external link used for citations in prose. `className` is for the one
 * place a citation stands alone as a row, the Sources list, where it has to be
 * a full-height tap target on a phone.
 */
function Src({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className ? `${citeLink} ${className}` : citeLink}>
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
          <Src href={s.url}>{s.short}</Src>
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
 * Affected ranges, taken from Coinkite's advisory rather than press summaries,
 * with one exception: the Mk2/Mk3 range starts at 4.0.0, not Coinkite's 4.0.1.
 * Block's analysis (SRC.block) puts 4.0.0 on the vulnerable path, and when two
 * primary sources disagree about whether a seed is safe, this page takes the
 * wider reading. What matters is the firmware the seed was GENERATED on, not
 * what is installed today.
 */
const AFFECTED: { model: string; range: string }[] = [
  {
    model: 'Mk2 and Mk3',
    range:
      'Seeds generated on firmware 4.0.0 through 4.1.9 (March 2021 onward). Coinkite’s advisory starts the range at 4.0.1; Block’s analysis puts 4.0.0, released 17 March 2021, on the same vulnerable path. The two differ, so treat 4.0.0 as affected.',
  },
  { model: 'Mk4 and Mk5', range: 'Seeds generated on firmware before 5.6.0 (Edge releases before 6.6.0X)' },
  { model: 'Q', range: 'Seeds generated on firmware before 1.5.0Q (Edge releases before 6.6.0QX)' },
];

/**
 * Each entry says whose statement it is. Nothing here may imply that a seed
 * made on Mk2/Mk3 firmware 4.0.0 is safe: Coinkite's advisory is silent on
 * versions before 4.0.1, and the only source that addresses them (Block) draws
 * the line at 3.2.2.
 */
const SAFE: string[] = [
  'Seeds made by adding at least 50 fair, independent dice rolls through the device’s Add Dice Rolls option, where the rolls stayed private and unrecorded and you use the final words shown after adding them. Coinkite says it does not consider these at risk from this bug alone. Fewer rolls, or any doubt about them, and its guidance is to migrate',
  'Seeds generated on a Mk2 or Mk3 running firmware 3.2.2 or earlier. Block’s analysis says those versions used the chip’s hardware random number generator directly, and places the original Mk1 outside the flaw as well. This is Block’s finding: Coinkite’s advisory does not address versions before 4.0.1',
  'TAPSIGNER, OPENDIME and SATSCARD, which Coinkite says run different codebases',
  'Seeds generated securely on another device or in other software and only imported into a Coldcard. Coinkite’s migration guide says such a seed “is not weakened merely because it was imported”, because the flaw is in on-device seed generation',
];

const STEPS: { step: number; title: string; description: string }[] = [
  {
    step: 1,
    title: 'Assume your seed is affected until you can prove otherwise',
    description:
      'If your seed was generated on a Coldcard at any point since March 2021, on firmware older than the fixed releases, and you did not add 50 or more private dice rolls, treat it as compromised now. Do not wait to see whether your address gets swept. The thefts ran in waves, and being missed in one wave means nothing about the next. Galaxy Research said on 13 August that it had confirmed no attacker activity after 6 August, and we have found no report of a later sweep, but an unmoved seed is exactly as weak as it was in July. Coinkite’s guide puts the rule simply: if you cannot establish how the seed was generated, migrate.',
  },
  {
    step: 2,
    title: 'Update the firmware, then generate a completely new seed',
    description:
      'Coinkite has published fixed firmware for every affected model and release track; its Security Status page lists the minimum fixed release for each (4.2.0 for the Mk2 and Mk3, 5.6.0 for the Mk4 and Mk5, 1.5.0Q for the Q, and 6.6.0X or 6.6.0QX on the separate Edge track) and the releases it currently recommends. Download it only from coldcard.com, and check the file’s SHA-256 hash and the signed signatures.txt before installing, as Coinkite’s guide instructs. The update only fixes how future seeds are made. It cannot add randomness to a seed that never had it, which is why Coinkite says to generate a new seed on the updated device, with New Wallet rather than by restoring or cloning the old one. Before you erase anything, confirm you can still recover the old wallet from its backup and note its wallet fingerprint: never destroy the only working copy. A new seed on a different vendor’s device is also a perfectly good answer.',
  },
  {
    step: 3,
    title: 'Send a test amount to the new wallet first',
    description:
      'Same discipline as any migration. Coinkite’s guide adds two checks before the first send: write down the new wallet’s fingerprint, then power the device off and on again and confirm the fingerprint and a receive address still match. Then send a small amount to the new wallet, verify the address on the device screen, wait for it to confirm, and only then move the rest.',
  },
  {
    step: 4,
    title: 'Move everything, then never use the old seed again',
    description:
      'Empty every wallet that hangs off the old seed: the base wallet, each account and address type you used, every passphrase wallet, any BIP-85 child wallets, and any multisig wallet the seed is a key in (the special cases below cover those). Coinkite calls a strong passphrase an independent barrier, but still says to migrate — once the seed words themselves can be reconstructed, everything rests on the passphrase alone, and ordinary passphrases fall to brute force. The old seed is burned. Keep its backup until every balance has arrived and confirmed, as Coinkite’s guide says. After that, retire it and mark or destroy the old backups so nobody mistakes them for live ones later.',
  },
  {
    step: 5,
    title: 'Expect the phishing wave that follows every incident',
    description:
      'Incidents like this are immediately followed by fake "migration tools", fake support agents, fake firmware downloads, fake "recovery" services, and fake advisory emails aimed at exactly the people scrambling to respond. A genuine-looking sender proves nothing: on 11 October 2026 Coldcard said an unauthorized phishing link had been posted from its own official X account and then deleted, and that its only official website is coldcard.com. The rule does not change: nobody who contacts you, and no migration tool or recovery service, will ever need your recovery phrase. Type it into a hardware wallet you are deliberately restoring, or into nothing.',
  },
];

/**
 * Cases the five steps do not spell out. Each one comes from Coinkite's
 * migration guide or status page unless it names Block.
 */
const SPECIAL_CASES: { title: string; body: string }[] = [
  {
    title: 'The same words on another device',
    body:
      'A seed made on an affected Coldcard stays weak wherever it goes. Coinkite’s guide says it “remains affected if it is later restored, imported, or cloned”, and that the Clone Coldcard feature is not a fix because it copies the existing seed. Load the old words only to sign the transfers out, and never into a website.',
  },
  {
    title: 'Multisig',
    body:
      'If one key in your multisig wallet was generated on an affected Coldcard, Coinkite’s guide says to replace it: create and verify a new multisig wallet with a new key in that seat, then move the funds across. If the affected keys are enough to meet the signing threshold on their own, the multisig gives no protection at all. Block makes the same point about setups built only from affected Coldcards.',
  },
  {
    title: 'BIP-85 child wallets',
    body:
      'A child wallet derived from an affected seed needs migrating too. Coinkite’s guide says to include every funded child, and to note its type and index first so you can still reach it. The same index under your new seed is a different wallet, so the coins have to be sent, not re-derived.',
  },
  {
    title: 'Mk2 and Mk3 owners',
    body:
      'Coinkite says firmware 4.2.0 is the final release for the Mk2 and Mk3 and can generate a sound replacement seed, so new hardware is not required to migrate. It recommends moving long-term custody to one of its current models. That is a vendor’s recommendation about its own products; any hardware wallet you trust will hold the new seed.',
  },
  {
    title: 'Paper wallets made on the device',
    body:
      'Block’s analysis lists other things the same generator produced on affected firmware, including the private key of a Coldcard-made paper wallet, unless it was made with the paper wallet’s Use Dice option. Block says such a key can be searched for the same way a seed can. Coinkite’s advisory does not cover paper wallets; if you hold coins on one, move them.',
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'I updated my Coldcard firmware. Am I safe now?',
    a: 'Not if your seed was generated on the old firmware. The update fixes how new seeds are generated; it does nothing for a seed that already exists. If your seed was created on affected firmware, you need to generate a new seed on the patched device and move your funds to it. That is Coinkite’s own guidance, not ours.',
  },
  {
    q: 'I restored my Coldcard seed onto a different wallet. Is it safe now?',
    a: 'No. The weakness is in the seed, so it travels with the words. Coinkite’s migration guide says a seed generated on an affected Coldcard “remains affected if it is later restored, imported, or cloned”, and Block’s analysis says the same about a seed exported to another wallet. Only a newly generated seed fixes it. The reverse also holds: Coinkite says a seed that was generated securely somewhere else is not weakened by having been imported into a Coldcard.',
  },
  {
    q: 'My Coldcard is air-gapped and has never touched a computer. Does that protect me?',
    a: 'No, and this is the uncomfortable part. The flaw is in the seed itself: it was generated with far less randomness than it should have been, so attackers can reconstruct affected seeds by brute force on their own hardware, without ever contacting your device. The air gap protects a good seed from a bad computer. It cannot protect a weak seed from arithmetic.',
  },
  {
    q: 'I used dice rolls when I set up my Coldcard. Am I affected?',
    a: 'Coinkite says a seed is not at risk from this bug alone if you added at least 50 fair, independent dice rolls through Add Dice Rolls, kept the rolls private and unrecorded, and use the final words the device showed after adding them. Fewer rolls than that, or rolls you are not sure about, and the honest answer is to migrate anyway. The cost of an unnecessary migration is an afternoon and a transaction fee. The cost of the other mistake is everything in the wallet.',
  },
  {
    q: 'One key in my multisig is a Coldcard. Do I need to do anything?',
    a: 'Yes, though how urgent it is depends on the setup. If only one key came from an affected Coldcard and the wallet needs two or more signatures, an attacker who rebuilds that one key is still short of the threshold. Coinkite’s migration guide still says to replace the affected key: create and verify a new multisig wallet with a new key in its place, then move the funds. If enough of the keys came from affected Coldcards to meet the threshold on their own, the multisig gives no protection, and the funds should be treated like any other affected wallet.',
  },
  {
    q: 'Does this mean hardware wallets are pointless?',
    a: 'No. The lesson is narrower and more useful: a hardware wallet moves trust from your computer to the device vendor, and vendors can fail too. The mitigations that already existed are the ones that worked here — supplying your own entropy with dice rolls, and multisig across devices from different vendors, so no single vendor’s bug can reach the threshold. What empties most wallets is still lost backups and phishing, not firmware bugs. But firmware bugs are no longer hypothetical, and pretending otherwise would be marketing.',
  },
];

/** In-page navigation. Each href must match a section id below. */
const TOC = [
  { href: '#what-happened', label: 'What happened' },
  { href: '#the-flaw', label: 'The flaw, in plain English' },
  { href: '#which-seeds', label: 'Which seeds are affected' },
  { href: '#what-to-do', label: 'What to do now' },
  { href: '#what-this-changes', label: 'What this changes' },
  { href: '#faq', label: 'Common questions' },
  { href: '#sources', label: 'Sources' },
] as const;

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
  // First publication date. It does not move when the page is revised.
  datePublished: '2026-08-11',
  // Static date. Update when the content changes, and keep it in sync with sitemap.ts.
  dateModified: '2026-10-12',
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
          than it was supposed to. In late July 2026, attackers started using that fact to drain wallets. This page
          explains what happened in plain English, whether your seed is affected, and what to do about it.
        </p>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
          By{' '}
          <Link href="/author" className={`${citeLink} font-medium`}>drix</Link>
          {' '}&middot; Last updated {LAST_UPDATED}. On that date Coinkite had shipped fixed firmware and a migration
          guide, and said its detailed technical post-mortem was still in preparation. A seed made on affected
          firmware stays exposed until its coins are moved.
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
            If your seed was <strong>generated on a Coldcard since March 2021</strong>, on firmware older than the
            fixed releases of 31 July 2026, treat it as compromised — regardless of what firmware the device runs
            today, and regardless of whether anything has been stolen yet.
          </li>
          <li>
            <strong>Updating the firmware alone does not fix it.</strong> The update fixes future seeds. Your existing
            seed keeps whatever randomness it was born with, and it stays weak if you restore or clone it onto another
            device.
          </li>
          <li>
            Coinkite&apos;s advisory: update, <strong>generate a brand-new seed</strong>, send a test transaction, then
            move everything. The old seed is burned.
          </li>
          <li>
            Seeds made with <strong>50+ private dice rolls</strong> added on the device, and the TAPSIGNER / OPENDIME /
            SATSCARD, are not affected, per Coinkite. Neither are seeds generated securely elsewhere and only imported
            into a Coldcard — the flaw is in on-device seed generation.
          </li>
        </ul>
        {/* The site's corrections policy (/author) is that fixes are made openly. This one
            changed which seeds the page called safe, so it is stated at the top, not buried. */}
        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed border-t border-red-200 dark:border-red-800/50 pt-3">
          <strong className="text-red-700 dark:text-red-400">Corrected 12 October 2026:</strong> an earlier version of
          this page listed Mk2 and Mk3 seeds generated on firmware &ldquo;before 4.0.1&rdquo; as not affected. Block&apos;s
          analysis puts firmware 4.0.0, released 17 March 2021, on the vulnerable path. If you set up a Mk2 or Mk3 on
          4.0.0, treat that seed as affected.{' '}
          <a href="#which-seeds" className={citeLink}>The details are below</a>.
        </p>
        <Cite items={[SRC.advisory, SRC.migrate, SRC.block]} />
      </section>

      {/* On this page. It sits below the short version so the urgent part stays first. */}
      <nav
        aria-label="On this page"
        className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
          On this page
        </p>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 text-xs sm:text-sm">
          {TOC.map((item) => (
            <li key={item.href}>
              <a href={item.href} className={`${navLink} flex min-h-11 items-center`}>{item.label}</a>
            </li>
          ))}
        </ul>
      </nav>

      {/* What happened */}
      <section id="what-happened" className="space-y-4 scroll-mt-24">
        <div className="flex items-center gap-2 sm:gap-3">
          <History className={sectionIcon} />
          <h2 className={sectionHeading}>What Happened</h2>
        </div>
        <div className={`${prose} space-y-4`}>
          <p>
            On 30 July 2026, attackers began emptying Coldcard wallets, and Coinkite published a security advisory the
            same day: a flaw in how Coldcard devices generated seed phrases meant that seeds created on affected
            firmware had far less randomness than the 128 bits users were promised. The weakness let attackers
            reconstruct affected seeds by brute force and sweep the coins, in bulk, without ever touching a device. The
            speed and scale of the first sweep suggest the work of reconstructing seeds had begun well before the
            advisory was public. Coinkite says it was unaware of the bug until that day, and nobody has published who
            found it first.
          </p>
          <div className="grid sm:grid-cols-3 gap-3 sm:gap-4">
            <div className={cardClass}>
              <div className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 inline-block mb-2 tabular-nums">17 March 2021</div>
              <p className={cardBody}>
                The flaw first ships in firmware 4.0.0 for the Mk2 and Mk3, by Block&apos;s analysis. A change in how
                the firmware was built leaves seed generation wired to a predictable software generator instead of the
                chip&apos;s hardware random number generator. It carries forward into the Mk4, Mk5 and Q, and sits
                unnoticed for five years.
              </p>
            </div>
            <div className={cardClass}>
              <div className="text-xs font-mono px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 inline-block mb-2 tabular-nums">30 July 2026</div>
              <p className={cardBody}>
                The first large theft wave runs, and Coinkite publishes its advisory the same day — security reporting
                describes over a thousand addresses drained in under an hour. Emergency firmware for every affected
                model and release track ships the next day, 31 July. Coinkite urges users to migrate immediately.
              </p>
            </div>
            <div className={cardClass}>
              <div className="text-xs font-mono px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 inline-block mb-2 tabular-nums">August to October 2026</div>
              <p className={cardBody}>
                Sweeps continue in waves until 6 August, the last confirmed attacker activity in Galaxy Research&apos;s
                tracking. By 24 August Galaxy counts 1,789 BTC taken from 8,865 addresses, about $115 million at the
                prices when the coins were taken. Coinkite ships three further standard firmware releases between
                20 August and 1 October.
              </p>
            </div>
          </div>
          <p>
            The totals differ from tracker to tracker and from day to day, and dollar figures move with the price of
            bitcoin, so the BTC count is the steadier measure. A figure of about 1,816 BTC across more than 5,200
            addresses, which TRM Labs attributed to Galaxy on 5 August, was described as preliminary at the time.
            Galaxy&apos;s count on 21 September was about 1,830 BTC across 9,162 addresses. It also flagged a
            suspected fourth wave in August that it had not confirmed, and we have found no later confirmation.
            Coinkite declined to give its own estimate in early August, and we have found none from it since.
          </p>
          <p>
            This was not one thief. Galaxy estimated in early August that at least 15 separate attackers were
            exploiting the flaw independently, and TRM Labs saw differences between the waves that pointed the same
            way. Nor was everything that moved stolen: Galaxy reported on 21 September that white-hat rescuers had
            swept about 52 BTC out of affected wallets ahead of the thieves and into a trust set up in Wyoming to
            return it to its owners. What is not in dispute is the mechanism and what owners need to do.
          </p>
          <Cite items={[SRC.advisory, SRC.deepDive, SRC.status, SRC.release561, SRC.block, SRC.thn, SRC.trm, SRC.coindesk, SRC.bloomberg, SRC.galaxyBrief, SRC.decryptAug, SRC.cointelegraphAug, SRC.decryptSep, SRC.cointelegraphSep]} />
        </div>
      </section>

      {/* The flaw in plain English */}
      <section id="the-flaw" className="space-y-4 scroll-mt-24">
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
            Coinkite&apos;s own technical account says the Coldcard was designed to use only that hardware generator
            for seeds. In March 2021 the firmware moved to a new cryptography library, and a mistake in how the pieces
            were built together left the seed code wired to a general-purpose software generator that comes with
            MicroPython, the language runtime the firmware is built on. A check that should have stopped the build
            asked whether the hardware-randomness setting <em>existed</em> rather than whether it was switched{' '}
            <em>on</em>, so the build went through. That software generator starts from values that are not secret:
            the chip&apos;s ID number and its internal timers. Coinkite is specific that the hardware generator
            never failed and nothing switched over while the device was running; the wrong code was linked in from the
            start. Block&apos;s independent analysis reaches the same root cause.
          </p>
          <p>
            Coinkite&apos;s preliminary estimates put the effective randomness at about 40 bits on the Mk2 and Mk3 and
            about 72 bits on the Mk4, Mk5 and Q, instead of the 128 promised, and it says those figures may change as
            its analysis continues. The newer models did better because, from the Mk4 on, values from the two
            secure-element chips were also mixed in. In Coinkite&apos;s words that &ldquo;partially reduced the impact
            on later models but did not restore the intended 128-bit security target&rdquo;. Block reads the newer
            models less generously. In its analysis, which it describes as its own opinion pending Coinkite&apos;s
            definitive report, only 32 bits of that secure-element input survive: about 4.3 billion possibilities once
            the device&apos;s other inputs are known. Block adds that its own loose upper bound of roughly 73 bits
            &ldquo;is not 73-bit cryptographic security&rdquo;, because the timer values are related to each other and
            may be easy to narrow down. It published no measured attack time.
          </p>
          <p>
            Forty bits is a search a well-resourced attacker finishes. How large the search is on the newer models
            depends on which of those readings is right, and the public record does not show how many Mk4, Mk5 or Q
            wallets were emptied: Coinkite&apos;s status page says that record &ldquo;does not support claiming that no
            Mk4/Mk5/Q wallet was robbed&rdquo;. Coinkite&apos;s guidance treats every affected model the same way:
            migrate. Because the weakness lives in the seed itself, the device&apos;s defenses never come into it. The
            air gap and the PIN protect the device, and the secure elements protect keys stored on it from someone
            holding it. None of them can repair a seed that was weak when it was made, and the attacker never needs
            the device. They reconstruct the seed on their own hardware, derive the addresses, and sweep whatever is
            there.
          </p>
          <p>
            Two details make this stark. The flaw was introduced by accident and sat in <em>published</em> source code
            for five years — Coldcard&apos;s firmware is source-available, and nobody caught it. And the public learned
            of it the worst way possible: the advisory and the first mass theft landed on the same day.
          </p>
          <Cite items={[SRC.deepDive, SRC.block, SRC.advisory, SRC.status]} />
        </div>
      </section>

      {/* Am I affected */}
      <section id="which-seeds" className="space-y-4 scroll-mt-24">
        <div className="flex items-center gap-2 sm:gap-3">
          <ListChecks className={sectionIcon} />
          <h2 className={sectionHeading}>Which Seeds Are Affected</h2>
        </div>
        <div className={`${prose} space-y-4`}>
          <p>
            The single question that matters: <strong className="text-slate-800 dark:text-slate-200">what firmware was
            running when your seed was generated?</strong> Not what is installed now. Per Coinkite&apos;s advisory,
            with one place where Block&apos;s analysis differs:
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
            March 2021 until the patched releases of July 2026</strong> should be treated as affected, and so should
            one created later on a device that had not yet been updated.
          </p>
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 p-4 sm:p-5 rounded-xl">
            <h3 className="text-sm sm:text-base font-bold text-emerald-700 dark:text-emerald-400 mb-2">Not affected</h3>
            <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed list-disc pl-5">
              {SAFE.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <Cite items={[SRC.advisory, SRC.migrate, SRC.block]} />
        </div>
      </section>

      {/* What to do */}
      <section id="what-to-do" className="space-y-4 scroll-mt-24">
        <div className="text-center space-y-2">
          <h2 className={sectionHeading}>What to Do Now</h2>
          <p className={prose}>
            This mirrors Coinkite&apos;s own advisory and migration guide, with the habits this site already teaches
            applied to the migration.
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
        <div className="space-y-3 pt-2">
          <h3 className="text-base sm:text-xl font-bold text-slate-900 dark:text-white">Special cases</h3>
          <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
            {SPECIAL_CASES.map((c) => (
              <div key={c.title} className={cardClass}>
                <h4 className={cardTitle}>{c.title}</h4>
                <p className={cardBody}>{c.body}</p>
              </div>
            ))}
          </div>
          <Cite items={[SRC.advisory, SRC.migrate, SRC.status, SRC.block, SRC.decryptAug, SRC.cointelegraphOct]} />
        </div>
      </section>

      {/* What this changes */}
      <section id="what-this-changes" className="space-y-4 scroll-mt-24">
        <div className="flex items-center gap-2 sm:gap-3">
          <Scale className={sectionIcon} />
          <h2 className={sectionHeading}>What This Changes, and What It Does Not</h2>
        </div>
        <div className={`${prose} space-y-4`}>
          <p>
            Until 11 August 2026, our <Link href="/self-custody" className={citeLink}>self-custody guide</Link>{' '}
            recommended the Coldcard. The link was never an affiliate link, so no revenue rode on the recommendation —
            but the recommendation was ours, and we are not going to pretend it never existed. We removed it twelve
            days after Coinkite&apos;s advisory, and it stays off the list today. Coinkite&apos;s status page, which it
            calls the living post-mortem for the incident, said when last verified on 1 October 2026 that a separate
            detailed technical post-mortem &ldquo;remains in preparation&rdquo;, and that the independent checks of
            its fix published so far are &ldquo;not a complete audit&rdquo;. We will look at this again when that
            post-mortem is published. Nobody caught the flaw before the attackers did, and that includes Coinkite,
            outside reviewers and us: it sat for five years in code anyone could read, and the signals everyone relied
            on — published source code, a long track record, a security-obsessed reputation — all pointed the right
            way the whole time.
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
                Coldcard users who added 50 or more fair, independent, private dice rolls when creating their seeds
                are the ones Coinkite says it does not consider at risk from this bug alone. Dice-roll randomness
                exists for exactly this failure: it removes the vendor&apos;s random number generator from the list of
                things you have to trust. Coinkite has since made it compulsory: from firmware 5.6.1 and 1.5.1Q, every
                new seed on its current models has to mix in dice rolls, coin flips or timed key presses from the user.
              </p>
            </div>
            <div className={cardClass}>
              <h3 className={cardTitle}>Multisig across vendors</h3>
              <p className={cardBody}>
                A 2-of-3 wallet with keys on devices from different manufacturers survives any single vendor&apos;s
                catastrophic bug, because one reconstructed seed is still one signature short. This incident is the
                strongest real-world argument for that setup to date. It is not a reason to sit still: a key that came
                from an affected Coldcard still needs replacing, and a multisig built entirely from affected Coldcards
                had no such protection.
              </p>
            </div>
          </div>
          <Cite items={[SRC.status, SRC.advisory, SRC.release561, SRC.block]} />
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
      <section id="faq" className="space-y-4 scroll-mt-24">
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
      <section id="sources" className="space-y-4 scroll-mt-24">
        <div className="flex items-center gap-2 sm:gap-3">
          <BookOpen className={sectionIcon} />
          <h2 className={sectionHeading}>Sources</h2>
        </div>
        <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Firmware ranges and required actions are cited to Coinkite&apos;s own advisory, migration guide and
            Security Status page, except the first affected Mk2/Mk3 version, where this page follows Block&apos;s
            wider reading. The root cause is described from Coinkite&apos;s technical deep dive and Block&apos;s
            analysis, and the randomness estimates are Coinkite&apos;s own, which it calls preliminary. Loss figures
            are attributed to the named tracker with the date of the count, because they moved for weeks and may
            move again. Where a claim is our inference rather than a source&apos;s statement, it is marked as such in
            place.
          </p>
          {/* On a phone, and on any touch screen, each source is a 44px row: as bare links
              they were 16px tall and 24px apart. For a mouse from sm up they are a compact list. */}
          <ul className="sm:space-y-1.5 pointer-coarse:space-y-0 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            {Object.values(SRC).map((s) => (
              <li key={s.url} className="flex items-center sm:items-start pointer-coarse:items-center gap-2">
                <span className="text-amber-700 dark:text-amber-500 sm:mt-0.5 pointer-coarse:mt-0 shrink-0">&bull;</span>
                <Src href={s.url} className="flex items-center max-sm:min-h-11 pointer-coarse:min-h-11">{s.label}</Src>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800">
            <strong className="text-slate-700 dark:text-slate-300">Last updated:</strong> {LAST_UPDATED}. If you own an
            affected device, Coinkite&apos;s advisory, migration guide and Security Status page — not this page — are
            the authoritative sources for your model&apos;s exact upgrade path.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="border-t border-slate-200 dark:border-slate-800 pt-6 sm:pt-8">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[11px] sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            <strong>Disclaimer:</strong> This page is educational and is not financial or security advice. It summarizes
            an incident whose technical post-mortem and final loss total were still open on the date above; verify
            current guidance against Coinkite&apos;s own advisory and Security Status page before acting. This
            site&apos;s Coldcard links were never affiliate links. Our hardware wallet comparison, including its
            affiliate disclosures, is on the{' '}
            <Link href="/self-custody" className={citeLink}>self-custody guide</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
