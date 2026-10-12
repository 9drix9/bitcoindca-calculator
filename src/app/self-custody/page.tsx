import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Shield,
  AlertTriangle,
  Key,
  Lock,
  CheckCircle2,
  ExternalLink,
  ArrowRight,
  Scale,
  Eye,
  Layers,
  Users,
  Send,
  ShieldAlert,
  BookOpen,
} from 'lucide-react';
import { WalletImage } from '@/components/WalletImage';

/** Date the factual claims on this page were last checked against their sources. */
const LAST_REVIEWED = '12 October 2026';

/**
 * Date the prices were read off each manufacturer's own US-dollar store. Kept
 * apart from LAST_REVIEWED because prices go stale fastest: re-check them
 * without having to re-verify the whole page, and never the other way round.
 */
const PRICES_CHECKED = '12 October 2026';

/**
 * Date of the provisional note on the Ledger reseller investigation. That
 * story was three days old when this was written. The note keeps its own date
 * so a later page review cannot make it look fresher than it is: read the
 * newest posts from @Ledger and @Ledger_Support in full and rewrite the note
 * against them before touching this.
 */
const LEDGER_NOTE_AS_OF = '12 October 2026';

/** A single external reference. `label` is what the reader sees inline. */
type Source = { label: string; url: string };

/**
 * Every source cited on this page. Each URL was fetched and checked against the
 * claim it supports on the date in LAST_REVIEWED. Vendor pages are cited only
 * for claims about that vendor's own product; incidents are cited to the
 * regulator, the affected company, or the security reporting, not to a blog.
 * The one exception is research a vendor has not answered in public, which is
 * cited to the researchers' own write-up and labelled as their account.
 */
const SRC = {
  bip39: { label: 'BIP-39 specification', url: 'https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki' },
  bip39Words: { label: 'BIP-39 English word list', url: 'https://github.com/bitcoin/bips/blob/master/bip-0039/english.txt' },
  bip32: { label: 'BIP-32 (hierarchical deterministic wallets)', url: 'https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki' },
  bip84: { label: 'BIP-84 (native SegWit derivation)', url: 'https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki' },
  bip341: { label: 'BIP-341 (Taproot)', url: 'https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki' },
  mtgox: { label: 'TechCrunch, Mt. Gox bankruptcy filing (2014)', url: 'https://techcrunch.com/2014/02/28/mt-gox-files-for-bankruptcy' },
  mtgoxFound: { label: 'CNBC, Mt. Gox finds 200,000 bitcoins in an old wallet (March 2014)', url: 'https://www.cnbc.com/2014/03/20/mtgox-says-it-found-200000-bitcoins-in-forgotten-wallet.html' },
  quadriga: { label: 'Ontario Securities Commission, QuadrigaCX review', url: 'https://www.osc.ca/quadrigacxreport/' },
  ftx: { label: 'CFTC press release 8638-22 (FTX/Alameda)', url: 'https://www.cftc.gov/PressRoom/PressReleases/8638-22' },
  celsius: { label: 'FTC, Celsius Network settlement (2023)', url: 'https://www.ftc.gov/news-events/news/press-releases/2023/07/ftc-reaches-settlement-crypto-platform-celsius-network-charges-former-executives-duping-consumers' },
  // Chainalysis published this in June 2020 and has taken the post down: the
  // original blog URL now 301s to the blog index, so the figure is cited to the
  // reporting that quotes it rather than to a dead link.
  lostCoins: { label: 'Decrypt, reporting the June 2020 Chainalysis dormancy estimate', url: 'https://decrypt.co/37171/lost-bitcoin-3-7-million-bitcoin-are-probably-gone-forever' },
  wrench: { label: 'Lopp, known physical bitcoin attacks', url: 'https://github.com/jlopp/physical-bitcoin-attacks' },
  fakeLedgers: { label: 'BleepingComputer, tampered Ledger devices mailed (2021)', url: 'https://www.bleepingcomputer.com/news/cryptocurrency/criminals-are-mailing-altered-ledger-devices-to-steal-cryptocurrency/' },
  ledger2020: { label: 'Ledger, July 2020 breach disclosure', url: 'https://www.ledger.com/addressing-the-july-2020-e-commerce-and-marketing-data-breach' },
  ledger2020Ceo: { label: 'Ledger CEO update, 272,000 records', url: 'https://www.ledger.com/message-ledgers-ceo-data-leak' },
  ledger2026: { label: 'BleepingComputer, Ledger / Global-e breach (Jan 2026)', url: 'https://www.bleepingcomputer.com/news/security/ledger-customers-impacted-by-third-party-global-e-data-breach/' },
  ledgerRecover: { label: 'CoinDesk, Ledger Recover postponed (2023)', url: 'https://www.coindesk.com/business/2023/05/23/crypto-wallet-provider-ledger-postpones-release-of-key-recovery-service-after-public-criticism' },
  ledgerRecoverLaunch: { label: 'Cointelegraph, Ledger Recover launches (24 Oct 2023)', url: 'https://cointelegraph.com/news/ledger-cloud-private-key-recovery' },
  ledgerBulletins: { label: 'Ledger Donjon, Ledger security bulletins', url: 'https://donjon.ledger.com/lsb/' },
  // The reseller investigation. Ledger's own statements are long posts on X, and
  // X's embed preview shows only the opening of each. The guidance to buyers is in
  // the closing paragraphs, so read the whole post. Cointelegraph's 9 October piece
  // carries the first, narrower guidance and what Ledger told the outlet directly;
  // CoinDesk quotes the 11 October guidance word for word.
  ledgerReseller: { label: 'Cointelegraph, Ledger investigates losses tied to a reseller (9 Oct 2026)', url: 'https://cointelegraph.com/news/ledger-investigates-fund-losses-linked-to-southeast-asian-reseller-warns-users' },
  ledgerImplant: { label: 'Cointelegraph, Ledger confirms unauthorized hardware implant (11 Oct 2026)', url: 'https://cointelegraph.com/news/ledger-confirms-unauthorized-hardware-implant-losses-may-exceed-86m' },
  ledgerImplantPost: { label: 'Ledger Support, situation update (10 Oct 2026)', url: 'https://x.com/Ledger_Support/status/2108968264055345381' },
  ledgerUpdatePost: { label: 'Ledger, 72-hour update on the reseller incident (11 Oct 2026)', url: 'https://x.com/Ledger/status/2109331538072494364' },
  ledgerUpdateCoindesk: { label: 'CoinDesk, Ledger update and its guidance to CryptoBilis buyers (12 Oct 2026)', url: 'https://www.coindesk.com/tech/2026/10/12/ledger-says-unauthorized-implant-found-in-at-least-one-device-sold-by-cryptobilis' },
  ledgerLosses: { label: 'Bitquery, on-chain count of the CryptoBilis thefts (updated 12 Oct 2026)', url: 'https://www.bitquery.io/investigations/ledger-cryptobilis-hack' },
  // Unconfirmed by Ledger. The magazine piece is the independent report of the
  // first device; the second is cited to the buyer's own post, as his account.
  ledgerEurope: { label: 'Cointelegraph Magazine, tampered Ledger reported in Europe (11 Oct 2026)', url: 'https://cointelegraph.com/magazine/ledger-attack-spreads-to-eu-ai-finds-18-trillion-xrp-bug-hodlers-digest' },
  ledgerEuropeSecond: { label: 'The European buyer\'s own account of a second device, on X (12 Oct 2026)', url: 'https://x.com/0xJohannes_/status/2109634513957527974' },
  ledgerGenuine: { label: 'Ledger Donjon, what the Genuine Check verifies', url: 'https://donjon.ledger.com/threat-model/device-genuineness/' },
  trezorSafe3: { label: 'Trezor, Ledger Donjon Safe 3 evaluation', url: 'https://trezor.io/vulnerability/donjon-s-trezor-safe-3-evaluation' },
  trezorTropic: { label: 'Trezor, TROPIC01 disclosure', url: 'https://trezor.io/learn/security-privacy/how-trezor-keeps-you-safe/tropic-01-chip-vulnerability-disclosure-what-happened' },
  trezorSecurity: { label: 'Trezor, security portal and resolved vulnerabilities', url: 'https://trezor.io/security' },
  trezorMailchimp: { label: 'Trezor, details of the Mailchimp data breach (14 Apr 2022)', url: 'https://blog.trezor.io/details-of-the-mailchimp-data-breach-a06872caa1fd' },
  trezorLeak: { label: 'BleepingComputer, Trezor support-portal breach (2024)', url: 'https://www.bleepingcomputer.com/news/security/trezor-support-site-breach-exposes-personal-data-of-66-000-customers/' },
  trezorShipMonk: { label: 'Trezor, ShipMonk shipping-provider breach (13 Aug 2026, updated 4 Sep)', url: 'https://trezor.io/blog/news/recent-customer-data-exposed-in-shipping-provider-incident' },
  trezorBrevo: { label: 'Trezor, Brevo email-provider incident (10 Sep 2026, updated 17 Sep)', url: 'https://trezor.io/blog/news/security-incident-at-brevo-our-third-party-email-provider' },
  trezorMultiShare: { label: 'Trezor, Multi-share Backup on Trezor', url: 'https://trezor.io/guides/backups-recovery/advanced-wallets/multi-share-backup-on-trezor' },
  trezorOne: { label: 'Trezor Model One', url: 'https://trezor.io/trezor-model-one' },
  trezorCompare: { label: 'Trezor, model comparison', url: 'https://trezor.io/compare' },
  jadeRepo: { label: 'Blockstream Jade firmware', url: 'https://github.com/Blockstream/Jade' },
  jadeOracle: { label: 'Blockstream blind PIN server', url: 'https://github.com/Blockstream/blind_pin_server' },
  jadeDisclosure: { label: 'Blockstream, Jade security disclosure (16 Dec 2025)', url: 'https://blog.blockstream.com/jade-security-disclosure/' },
  liquidIncident: { label: 'Blockstream, Liquid Network security incident assessment (23 Sep 2026)', url: 'https://blog.blockstream.com/liquid-network-security-incident-assessment/' },
  bitbox: { label: 'BitBox02 firmware (dual-chip design)', url: 'https://github.com/BitBoxSwiss/bitbox02-firmware' },
  bitboxCompare: { label: 'BitBox, BitBox02 and BitBox02 Nova compared', url: 'https://bitbox.swiss/bitbox02/' },
  bitboxDixence: { label: 'BitBox, Dixence security update (17 Aug 2026)', url: 'https://blog.bitbox.swiss/en/bitbox-08-2026-dixence-update/' },
  coldcardAdvisory: { label: 'Coinkite, Coldcard security advisory (30 July 2026)', url: 'https://blog.coinkite.com/coldcard-mk3-seed-generation-warning/' },
  coldcardStatus: { label: 'Coinkite, current Coldcard security status (verified 1 Oct 2026)', url: 'https://coldcard.com/security/status' },
  coldcardThn: { label: 'The Hacker News, Coldcard seed flaw and thefts (Aug 2026)', url: 'https://thehackernews.com/2026/08/coldcard-hardware-wallet-flaw-linked-to.html' },
  coldcardGalaxy: { label: 'Cointelegraph, Galaxy tally of 1,789 BTC from 8,865 addresses (25 Aug 2026)', url: 'https://cointelegraph.com/news/coldcard-hack-galaxy-btc-lost-87-unmoved' },
  seedsigner: { label: 'SeedSigner project', url: 'https://github.com/SeedSigner/seedsigner' },
  cypherock: { label: 'Cypherock X1 firmware', url: 'https://github.com/Cypherock/x1_wallet_firmware' },
  cypherockSe: { label: 'Cypherock docs, open source with secure elements', url: 'https://docs.cypherock.com/cypherock-x1-features/open-source-with-secure-elements' },
  darknavyCypherock: { label: 'DARKNAVY, how and why we hacked the Cypherock hardware wallet (21 Nov 2025)', url: 'https://www.darknavy.org/blog/how_and_why_we_hacked_cypherock_hardware_wallet_the_full_story/' },
} as const satisfies Record<string, Source>;

// Underlined, not colour alone: these links sit inside running text, where amber
// against slate is about 1.5:1 and a hover underline never shows on a phone.
const citeLink = 'text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-300';
// The "On this page" rows stand alone in a labelled nav, so position marks them.
const navLink = 'text-amber-700 dark:text-amber-400 hover:underline';

/**
 * Unobtrusive inline external link used for citations in prose. `className` is
 * for the one place a citation stands alone as a row, the Sources list, where
 * it has to be a full-height tap target on a phone.
 */
function Src({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className ? `${citeLink} ${className}` : citeLink}>
      {children}
    </a>
  );
}

/** Compact "Source: …" footer attached to a card, threat entry, or FAQ answer. */
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
  title: 'Self-Custody: How to Hold Bitcoin Without Losing It',
  description: 'An honest guide to Bitcoin self-custody: what a seed phrase really is, how people lose coins, verifying addresses on-device, testing your recovery, passphrases, multisig, inheritance planning, and a current hardware wallet comparison.',
  keywords: ['bitcoin self custody', 'hardware wallet guide', 'seed phrase backup', 'bip39 recovery phrase', 'bitcoin multisig', 'bitcoin inheritance planning', 'passphrase 25th word', 'best bitcoin hardware wallet 2026'],
  openGraph: {
    title: 'Self-Custody: How to Hold Bitcoin Without Losing It',
    description: 'Self-custody removes exchange risk and hands you operational risk. Here is how to take it on properly: seed phrases, backups, threat models, inheritance, and which device to buy.',
    url: '/self-custody',
    type: 'article',
    siteName: 'Bitcoin DCA Calculator',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Self-Custody: How to Hold Bitcoin Without Losing It',
    description: 'Self-custody removes exchange risk and hands you operational risk. Here is how to take it on properly.',
    creator: '@9drix9',
  },
  alternates: {
    canonical: '/self-custody',
  },
};

const EXCHANGE_FAILURES: { name: string; year: string; lost: string; description: string; sources: readonly Source[] }[] = [
  {
    name: 'Mt. Gox',
    year: '2014',
    lost: '850,000 BTC',
    description: 'The largest Bitcoin exchange of its era filed for bankruptcy in Tokyo. It cited 850,000 missing bitcoin, 750,000 of them belonging to customers, worth about $477M at the time. Around 200,000 were found a week later in an old-format wallet. Creditors waited more than a decade for partial repayment.',
    sources: [SRC.mtgox, SRC.mtgoxFound],
  },
  {
    name: 'QuadrigaCX',
    year: '2019',
    // The OSC report states every amount in Canadian dollars. The other three
    // cards are US dollars, so the currency has to be on the figure itself.
    lost: 'C$169M+',
    description: 'The popular story is that the founder died holding the only keys. The Ontario Securities Commission investigated and found something worse. Gerald Cotten had been trading away client assets for years, in what staff described as a Ponzi scheme, and clients lost at least C$169 million (the regulator reports in Canadian dollars). Sole control of the keys made the fraud possible. It was not itself the cause.',
    sources: [SRC.quadriga],
  },
  {
    name: 'FTX',
    year: '2022',
    lost: '$8B+',
    description: 'A top-three exchange collapsed in days after customer assets were routinely held and commingled at an affiliated trading firm. The CFTC put the loss at over $8 billion in customer deposits. Balances shown in the app did not correspond to coins that existed.',
    sources: [SRC.ftx],
  },
  {
    name: 'Celsius',
    year: '2022',
    lost: '$4.7B',
    description: 'A yield platform froze withdrawals and filed for bankruptcy. The FTC entered a $4.7 billion judgment, suspended so the estate could return what remained. Depositors became unsecured creditors and have since recovered a substantial fraction, over years, through the bankruptcy.',
    sources: [SRC.celsius],
  },
];

const THREATS: { rank: string; title: string; detail: string; fix: string; sources?: readonly Source[] }[] = [
  {
    rank: '1',
    title: 'Your own mistakes and lost backups',
    detail: 'By a wide margin the biggest cause of permanent loss. Words copied down wrong. Words stored somewhere that later flooded or burned. Words thrown out during a house move, or never tested in the first place. Nobody attacked these people. Nobody can count lost coins directly either. The usual proxy is coins that have not moved in five years or more, and a June 2020 Chainalysis report put that bucket at roughly 3.7 million BTC. Read it as an upper bound that includes patient holders, not a loss count. Analysts using other rules reach very different totals, and Chainalysis has not published an update we could find.',
    fix: 'Test your recovery before you fund the wallet. Keep two backups in two places.',
    sources: [SRC.lostCoins],
  },
  {
    rank: '2',
    title: 'Phishing and impersonation',
    detail: 'Fake wallet apps in the app stores. Sponsored search ads pointing at cloned wallet sites. "Support agents" who appear within minutes of you posting a problem publicly. Fake airdrops and forced "migrations". Hardware wallet customer lists have leaked repeatedly: Ledger in 2020 and again in January 2026; Trezor\'s support portal in 2024 and, in August 2026, its shipping provider, which exposed names, emails, phone numbers and delivery addresses. Leaks like these feed targeted letters, calls and emails aimed at people known to hold crypto. In September 2026 a fake security alert even went out from Trezor\'s own newsletter account after its email provider was breached.',
    fix: 'Nobody who contacts you will ever need your recovery phrase: no support agent, exchange, wallet company or airdrop, however genuine the sender address looks. The only place it goes is a hardware wallet you are restoring yourself.',
    sources: [SRC.ledger2020Ceo, SRC.ledger2026, SRC.trezorLeak, SRC.trezorShipMonk, SRC.trezorBrevo],
  },
  {
    rank: '3',
    title: 'Address-swapping malware',
    detail: 'Clipboard hijackers and malicious browser extensions swap the Bitcoin address you copied for the attacker\'s. It looks right on your screen because the same malware rewrites what your browser displays. Once the transaction is broadcast, nobody can pull it back.',
    fix: 'Confirm every receive and send address on the hardware wallet\'s own screen, which the malware cannot touch.',
  },
  {
    rank: '4',
    title: 'Recovery phrase typed into a website or app',
    detail: 'The single most efficient theft in Bitcoin. A convincing "wallet validation", "sync tool", or "claim your fork coins" page collects twelve or twenty-four words. Within seconds it empties every account derived from them, including accounts you have not created yet.',
    fix: 'Your seed is entered on a hardware wallet, or on nothing at all.',
  },
  {
    rank: '5',
    title: 'Exchange or custodian failure',
    detail: 'The risk this page exists to address. It\'s real and it has repeated, but for an individual holder it is statistically less common than the four items above. Proof-of-reserves attestations show assets at a moment in time. They do not show liabilities, and they are not audits.',
    fix: 'Hold long-term savings in your own custody. Keep only what you are actively trading on an exchange.',
  },
  {
    rank: '6',
    title: 'Supply-chain tampering',
    detail: 'In 2021, criminals working from the leaked Ledger customer list mailed convincing "replacement" hardware wallets, in authentic-looking packaging with an explanatory letter, to real owners. The devices had a flash implant and shipped with instructions to enter the recovery phrase into a fake Ledger Live app. Second-hand and marketplace devices can also arrive pre-seeded, so the seller already holds the keys. And in October 2026 Ledger confirmed an unauthorized hardware implant inside a device bought through a reseller in Southeast Asia. That investigation is still open; the dated note in the wallet section below has what is known.',
    fix: 'Buy only direct from the manufacturer. Never use a device that arrives with a recovery phrase already printed or set. A device that generates its own phrase in front of you has passed one test, not all of them: it cannot show you tampering inside the case, which is why where you buy it matters most.',
    sources: [SRC.fakeLedgers, SRC.ledgerImplantPost, SRC.ledgerImplant],
  },
  {
    rank: '7',
    title: 'Physical coercion (the "$5 wrench attack")',
    detail: 'Rare in absolute terms but rising. One public tally collects verified incidents: robberies, home invasions, kidnappings and extortion aimed at known holders. It lists dozens per year, and materially more in 2025 than in 2024. Its maintainer notes the list is not comprehensive, since many attacks are never reported. Almost every victim was identifiable as a holder beforehand.',
    fix: 'Do not advertise holdings, online or in person. Consider a passphrase-protected wallet or multisig so no single person under duress can move everything.',
    sources: [SRC.wrench],
  },
];

type WalletColor = 'violet' | 'amber' | 'green' | 'cyan' | 'emerald' | 'slate';

interface Wallet {
  name: string;
  /** Anchor slug: the full card renders with id={`wallet-${slug}`} and the comparison table links to it. */
  slug: string;
  tagline: string;
  description: string;
  features: string[];
  price: string;
  lineup: string;
  /** The design trade-off: what this device asks you to accept. */
  caveat: string;
  /**
   * Security flaws and customer-data incidents the vendor, or the researchers
   * who found them, have published. Dated, and attributed sentence by sentence.
   * Every vendor with a disclosure in the last year or so gets one, affiliate
   * or not: listing them for some and not others would be a recommendation in
   * disguise. Kept apart from `caveat` so neither buries the other on a phone.
   */
  record?: string;
  href: string;
  color: WalletColor;
  image: string;
  bestFor: string;
  /** Short answers for the at-a-glance comparison table. */
  openSource: string;
  secureElement: string;
  airGap: string;
  affiliate: boolean;
  sources?: readonly Source[];
}

// Ordered roughly from most beginner-friendly to most specialist.
// Prices are US-dollar list prices read off each maker's own store on PRICES_CHECKED,
// and deliberately stated as approximations; vendors discount often. One currency
// throughout: the previous version mixed a euro figure into a dollar sentence.
const WALLETS: Wallet[] = [
  {
    name: 'Trezor',
    slug: 'trezor',
    tagline: 'Open-source, and the easiest to verify',
    description: 'SatoshiLabs shipped the Trezor Model One in 2014, the first hardware wallet of its kind. Its firmware has always been open-source and reproducibly built, so independent researchers can confirm the code on your device matches the published source. The current Safe line adds a certified secure element, and every model can run Bitcoin-only firmware that strips the altcoin code out entirely.',
    features: ['Open-source firmware with reproducible builds', 'EAL6+ secure element across the Safe line', 'Bitcoin-only firmware option on every model', 'Multi-share (Shamir) backup across the Safe line', 'Works with Trezor Suite, Sparrow, Electrum, and Nunchuk'],
    price: 'from ~$59',
    lineup: 'Safe 3 around $59, Safe 5 around $129, Safe 7 around $249. The older Model One and Model T are retired.',
    caveat: 'Ledger\'s Donjon research team has twice demonstrated laboratory attacks on Trezor silicon. First, a voltage glitch that bypassed Safe 3 supply-chain countermeasures, disclosed March 2025. Second, a laser fault-injection attack on the Safe 7\'s TROPIC01 secure element, disclosed 2026, after Donjon reported it to Tropic Square in January. Both need physical possession, decapsulation or desoldering, specialist lab equipment and expertise. Trezor says the TROPIC01 flaw compromises one of three independent secrets and does not by itself expose keys or funds. Neither attack has been seen in the wild. So the practical lesson is about tampered and second-hand devices, not about a device you bought direct and set up yourself.',
    record: 'Trezor lists the vulnerabilities it has fixed on its own security portal. Entries from 2026 include a Safe 7 pairing step that a computer could complete without the code shown on the device (reported in June) and Safe 7 authenticity proofs that were checked too loosely (reported in August); both are listed as resolved. Its customer data has leaked at least four times, each time through a supplier. In April 2022 attackers who had breached its newsletter provider Mailchimp took subscribers\' email addresses, and in some cases names and IP addresses, and used them for a phishing email. In January 2024 a support-ticket portal exposed names and email addresses of up to 66,000 people; Trezor said it did not believe postal addresses were taken. In August 2026 its shipping provider ShipMonk was breached, exposing names, emails, phone numbers and delivery addresses. Trezor counts 80,689 customers, including US orders from 2019 to 2021 that it says ShipMonk had confirmed were deleted. On 9 September 2026 its newsletter provider Brevo was breached: 347,149 email addresses were exported, and a fake "STM32 Entropy Vulnerability" alert, linking to an app that asked for the recovery phrase, went out from Trezor\'s own account. Trezor says its own systems and devices were not compromised in either 2026 incident.',
    href: 'https://affil.trezor.io/aff_c?offer_id=238&aff_id=36991',
    color: 'emerald',
    image: '/wallets/trezor.webp',
    bestFor: 'Best for: a first hardware wallet you can independently verify',
    openSource: 'Yes, reproducible builds',
    secureElement: 'Yes (EAL6+)',
    airGap: 'No (USB; Bluetooth on Safe 7)',
    affiliate: true,
    sources: [SRC.trezorOne, SRC.trezorCompare, SRC.trezorMultiShare, SRC.trezorSafe3, SRC.trezorTropic, SRC.trezorSecurity, SRC.trezorMailchimp, SRC.trezorLeak, SRC.trezorShipMonk, SRC.trezorBrevo],
  },
  {
    name: 'Blockstream Jade',
    slug: 'blockstream-jade',
    tagline: 'Bitcoin-focused and fully open',
    description: 'Built by Blockstream, Jade is fully open-source in both hardware and firmware. Jade Plus and Jade Core are the current models, and the original Jade, which Blockstream\'s store also calls the Jade Classic, is still sold. Core is the stripped-down one for a quick move off an exchange; Plus and Classic add a camera for QR signing. All three run the same open-source firmware and the same security model.',
    features: ['Fully open-source hardware and firmware', 'Bitcoin and Liquid; no altcoin code', 'Air-gapped QR signing on Plus and Classic; SD card support on Plus', 'USB-C and Bluetooth on every model; camera and battery on Plus and Classic, not Core', 'Pairs with the Blockstream app (formerly Green), Sparrow, Electrum, Nunchuk'],
    price: 'from ~$79',
    lineup: 'Jade Classic around $79 list (about $67 on the store\'s sale when checked), Jade Core around $99, Jade Plus around $149 in plastic or $169 in metal. Stock runs out regularly, so check availability.',
    caveat: 'Jade has no dedicated secure element chip. Instead it encrypts your key material and unlocks it through a handshake with a "blind oracle" PIN server. That server is blind to the PIN by design, and exists mainly to enforce a three-attempt limit. Blockstream runs one by default. The server is open source and Dockerized, so you can run your own. Signing still happens offline and the seed never leaves the device. But if you want zero third-party dependency in the unlock path, plan to self-host the oracle.',
    record: 'In December 2025 Blockstream disclosed a flaw, reported by the research group DARKNAVY, in firmware 1.0.24 to 1.0.36. A malformed request from malware on the connected phone or computer could crash an unlocked Jade and, in the worst case Blockstream describes, extract the key. It was reachable over USB or Bluetooth, not in QR mode. Blockstream fixed it in 1.0.37 and blocked downgrades in 1.0.38. It says it is not aware of the flaw being exploited or of any lost funds, and it advises against using Jade with web wallets. Separately, and not a flaw in the Jade itself: on 6 September 2026 an attacker used a bug in Elements, the Blockstream-built software the Liquid sidechain runs on, to withdraw about 4,000 BTC from Liquid\'s reserve. Blockstream\'s assessment of 23 September says 3,400 BTC had been returned, about 602 BTC was still outstanding, and withdrawals from Liquid to Bitcoin were still paused.',
    href: 'https://oshi.link/ETC6DL',
    color: 'green',
    image: '/wallets/blockstream-jade.webp',
    bestFor: 'Best for: open-source purists who want the hardware open as well as the firmware',
    openSource: 'Yes, hardware and firmware',
    secureElement: 'No (blind-oracle PIN server)',
    airGap: 'Optional (QR on Plus and Classic)',
    affiliate: true,
    sources: [SRC.jadeRepo, SRC.jadeOracle, SRC.jadeDisclosure, SRC.liquidIncident],
  },
  {
    name: 'Ledger',
    slug: 'ledger',
    tagline: 'The most polished software, with a real trade-off',
    description: 'Ledger has sold more hardware wallets than anyone, and its Ledger Wallet app (formerly Ledger Live) is the most approachable companion app in the category. Its secure element chips carry independent security certifications. The trade-off is transparency. The device operating system and the secure element firmware are both proprietary.',
    features: ['Certified secure element (CC EAL5+ / EAL6+)', 'The Ledger Wallet app (formerly Ledger Live) handles buy, send, receive, and staking', 'Bluetooth on every model except the Nano S Plus; NFC on Gen5, Flex and Stax', 'Very broad multi-asset support', 'Largest ecosystem of third-party integrations'],
    price: 'from ~$69',
    lineup: 'Nano S Plus around $69, Nano X around $99, Nano Gen5 around $179, Flex around $249, Stax around $399. The original Nano S reached end of support in 2025.',
    caveat: 'Two things to weigh honestly. First, you can\'t audit Ledger\'s device OS the way you can Trezor\'s, BitBox\'s, or Jade\'s. You are trusting the company\'s implementation. The "Ledger Recover" seed-backup service showed that what the firmware is capable of can change: it was announced in 2023, postponed that May after a public backlash, then launched that October as an optional paid subscription. Second, Ledger has leaked customer contact data at least twice. The 2020 e-commerce breach exposed about a million email addresses, and the dump published that December contained roughly 272,000 records with postal address, name and phone number. A breach at payment processor Global-e, disclosed in January 2026, exposed customers\' names and contact details again. No keys, credentials or funds were exposed in either case. But those lists have driven years of targeted phishing and tampered devices mailed to real customers. Treat every unsolicited Ledger message as fraudulent.',
    record: `As of ${LEDGER_NOTE_AS_OF} an investigation is open: on 10 October 2026 Ledger confirmed that a device bought through a reseller in Southeast Asia contained an unauthorized hardware implant, after customers of that reseller reported lost funds. Ledger says it has no indication its own systems were compromised. The dated note above this list has what is and is not known. Separately, Ledger publishes security bulletins for flaws in its own software. Four are dated June to August 2026: three about how transactions were reviewed or signed on the device, and one that could let a Monero secret key be recovered.`,
    href: 'https://shop.ledger.com/?r=ee186bc1f36d',
    color: 'amber',
    image: '/wallets/ledger.webp',
    bestFor: 'Best for: people who want the smoothest app and accept the closed-source trade-off',
    openSource: 'No (proprietary device OS)',
    secureElement: 'Yes (EAL5+/EAL6+)',
    airGap: 'No (USB/Bluetooth)',
    affiliate: true,
    sources: [SRC.ledger2020, SRC.ledger2020Ceo, SRC.ledger2026, SRC.ledgerRecover, SRC.ledgerRecoverLaunch, SRC.ledgerImplantPost, SRC.ledgerImplant, SRC.ledgerBulletins],
  },
  {
    name: 'BitBox02',
    slug: 'bitbox02',
    tagline: 'Swiss-made, minimal, quietly excellent',
    description: 'Shift Crypto builds the BitBox02 in Switzerland. A dual-chip design pairs an ATECC608B secure element with an ATSAMD51 microcontroller, so neither one alone can release your keys. The Bitcoin-only edition strips out every other coin and costs the same as the multi edition. The newer Nova adds a glass display plus iPhone and iPad support over Bluetooth.',
    features: ['Bitcoin-only edition at no extra cost', 'Open-source firmware, reproducible builds', 'Dual-chip security design', 'microSD backup, with recovery words you can also write down', 'Nova adds iPhone and iPad support over Bluetooth, and a glass display'],
    price: 'from ~$167',
    lineup: 'The BitBox02 is around $167 and the newer BitBox02 Nova around $196 on BitBox\'s US-dollar store, which says it covers taxes and tariffs on US orders. Bitcoin-only and multi editions are the same price.',
    caveat: 'The microSD backup is convenient. It is also a full copy of your seed sitting on a small piece of plastic that degrades and is easy to misplace. Treat it exactly as you would treat written words, and keep a durable written or metal copy too.',
    record: 'On 17 August 2026 BitBox disclosed three firmware issues found in its own audits, each of which it rated severe or potentially severe. A bootloader weakness could let an attacker who had first phished the owner install fake firmware on a BitBox02; it was fixed in firmware 9.26.2, and BitBox says the Nova is not affected. A memory-corruption bug affected the Multi edition when no wallet had been set up yet and the device was used with a malicious computer; BitBox says the Bitcoin-only edition does not contain the affected code. A Silent Payments bug could lock coins at an unintended address, though not steal them directly. The last two were fixed in 9.26.5. BitBox says it has no reports of exploitation or stolen funds, and that existing seeds are not affected.',
    href: 'https://shop.bitbox.swiss/?ref=pnuwdpiq',
    color: 'slate',
    image: '/wallets/bitbox.webp',
    bestFor: 'Best for: minimalists who want Bitcoin-only without the complexity tax',
    openSource: 'Yes, reproducible builds',
    secureElement: 'Yes (dual-chip)',
    airGap: 'No (USB; Bluetooth on Nova)',
    affiliate: true,
    sources: [SRC.bitbox, SRC.bitboxCompare, SRC.bitboxDixence],
  },
  {
    name: 'Cypherock X1',
    slug: 'cypherock-x1',
    tagline: 'Nothing to write down, five things to protect',
    description: 'Cypherock takes a different approach. Instead of one seed phrase on paper, it splits your key material into five shares using Shamir Secret Sharing. One share sits inside the X1 Vault, and one on each of four NFC cards. Any two shares reconstruct the wallet, so you can lose up to three components and still recover.',
    features: ['No written seed phrase required', 'Shamir 2-of-5 across the vault and four cards', 'EAL6+ secure elements in the four cards (the Vault uses a different chip)', 'Vault firmware is source-available (MIT + Commons Clause); the card code is proprietary', 'BIP-39 export available as an escape hatch'],
    price: '~$99-$129',
    lineup: 'X1 Basic, the Vault plus four cards, is $129 list and was $99 on the store\'s sale when checked. Standard is $209 list ($179 on sale) and Pro $299 list ($249 on sale). Replacement cards and cases are sold separately.',
    caveat: 'The threshold cuts both ways. Any two of the five shares reconstruct your keys, so two cards found together are as good as the whole wallet to a thief. That means the cards have to be geographically separated, which is more work than most people expect from a "no seed phrase" product. The scheme is also newer and less battle-tested than a plain BIP-39 backup. The firmware ships under an MIT grant with a Commons Clause attached, which withholds the right to sell the software, so it is source-available rather than open-source in the strict sense. It also covers the Vault only: Cypherock\'s own documentation says the card code is proprietary. The mitigating factor: you can export a standard BIP-39 phrase at any time and walk away to another vendor.',
    record: 'In November 2025 the security research group DARKNAVY published an attack it had demonstrated live at the GEEKCON 2025 conference. By chaining bugs in the Vault\'s firmware and its update checks, it loaded modified firmware that still passed Cypherock\'s own device-authenticity check. DARKNAVY presented it as a supply-chain attack: tampering with a device before its owner first sets it up. It also says the Vault\'s bootloader and the code that checks firmware updates are not published, and that the Vault\'s secure chip is used only for the authenticity check. We found no public response from Cypherock and could not confirm what has been fixed, so treat this as one research team\'s account.',
    href: 'https://cypherock.com/store/?ref=BTCDOLLARCOSTAVERAGE',
    color: 'violet',
    image: '/wallets/cypherock.webp',
    bestFor: 'Best for: people who distrust their ability to protect a single paper backup',
    openSource: 'Vault firmware only (Commons Clause)',
    secureElement: 'Cards (EAL6+); Vault uses ATECC608A',
    airGap: 'No (USB)',
    affiliate: true,
    sources: [SRC.cypherock, SRC.cypherockSe, SRC.darknavyCypherock],
  },
  {
    name: 'SeedSigner',
    slug: 'seedsigner',
    tagline: 'DIY, stateless, and holds nothing',
    description: 'SeedSigner is a community project rather than a product. You assemble it yourself from a Raspberry Pi Zero, a camera, and a small screen, then flash software you can verify byte-for-byte against the published source. It is stateless, meaning it stores no keys at all. You enter your seed words each time you sign and the device forgets them the moment it powers off. There is nothing on it to steal.',
    features: ['Around $50 in commodity parts', 'Stateless: stores no private keys, ever', 'Air-gapped by design: QR codes only, no cables', 'Reproducible builds since v0.7.0', 'Strong multisig and Sparrow/Nunchuk support'],
    price: '~$50 in parts',
    lineup: 'A DIY build. Parts costs move with Raspberry Pi availability; pre-assembled units from third parties exist but reintroduce supply-chain risk.',
    caveat: 'No company, no support line, no warranty, nobody to blame. Statelessness also means your seed backup comes out and gets used every time you sign, rather than staying sealed in a safe. In a home with other people in it, that is a real trade-off. Excellent as a multisig signer or a second device. A demanding choice as your only one.',
    href: 'https://seedsigner.com/',
    color: 'cyan',
    image: '/wallets/seedsigner.webp',
    bestFor: 'Best for: technical users, multisig signers, and maximum verifiability',
    openSource: 'Yes, reproducible builds',
    secureElement: 'No (stateless, stores nothing)',
    airGap: 'Yes (QR only)',
    affiliate: false,
    sources: [SRC.seedsigner],
  },
];

const STEPS = [
  {
    step: 1,
    title: 'Decide what belongs in self-custody',
    description: 'Move long-term savings, not trading balance. Start with an amount you would be annoyed but not devastated to lose, and live with the setup for a few weeks before moving the rest.',
  },
  {
    step: 2,
    title: 'Buy the device direct from the manufacturer',
    description: 'Never from a marketplace, a reseller, or second-hand. A genuine device arrives with no recovery phrase and generates one in front of you on first use, so anything that turns up pre-seeded is a theft in progress. That check is necessary, not sufficient: a device tampered with before it reached you can still generate its own phrase, which is why the place you buy it is the real protection.',
  },
  {
    step: 3,
    title: 'Set it up and write the recovery phrase by hand',
    description: 'Set a PIN, then write the words on the supplied card in order and in your own handwriting. No photos, no cloud, no password manager, no typing them anywhere. Record the wallet type or derivation path the device shows you, if it shows one.',
  },
  {
    step: 4,
    title: 'Wipe the device and restore from your backup',
    description: 'Almost everyone skips this step, and it is the whole point. Factory reset the device, restore it from the words you just wrote, and confirm the first receive address is identical. Only now do you know you have a backup rather than a hope.',
  },
  {
    step: 5,
    title: 'Send a small test amount and verify on the device screen',
    description: 'Generate a receive address, confirm it character-for-character on the hardware wallet\'s own display, and withdraw a small amount from your exchange. Wait for it to confirm and check the balance appears.',
  },
  {
    step: 6,
    title: 'Move the rest',
    description: 'Withdraw the remainder in one transaction, or a few, rather than many small ones. Bitcoin fees are charged per transaction size, not per amount, so a wallet full of tiny deposits costs more to spend later.',
  },
  {
    step: 7,
    title: 'Secure the backup, then write down where everything is',
    description: 'Get the words onto something fire- and water-resistant, and keep two copies in two separate places. Then leave a sealed note for the people who would have to find all of it without you there to explain it.',
  },
];

const FAQ: { q: string; a: string; sources?: readonly Source[] }[] = [
  {
    q: 'What if I lose my hardware wallet?',
    a: 'Nothing is stored on the device. Your coins live on the blockchain, and the device only holds the keys that authorize moving them. Buy a new wallet from any manufacturer, restore your recovery phrase, and your balance reappears. As long as it had a PIN and you still have your backup, the lost device is a brick to whoever finds it.',
    sources: [SRC.bip39, SRC.bip32],
  },
  {
    q: 'What if the company that made my wallet goes out of business?',
    a: 'Your recovery phrase follows BIP-39, an open standard implemented by every major wallet. You can restore it on a competitor\'s device or in free desktop software such as Sparrow or Electrum. You are never locked to a vendor. The one thing worth noting is the derivation path, defined by BIP-32 and the standards built on it. If a wallet does not auto-detect your accounts, you may need to tell it whether the original was native SegWit, Taproot, or legacy. That is why it is worth writing down.',
    sources: [SRC.bip39, SRC.bip32, SRC.bip84],
  },
  {
    q: 'What if my device breaks or stops turning on?',
    a: 'Same answer, and this is exactly why step four is to test your recovery before you fund anything. A dead device is an inconvenience that costs the price of a replacement. A dead device plus an untested backup is a permanent loss. The device is a replaceable tool. The seed is the money.',
  },
  {
    q: 'If someone finds my hardware wallet, can they take my Bitcoin?',
    a: 'Not from the PIN screen. Devices wipe themselves after a small number of wrong attempts. Laboratory attacks against stolen devices have been demonstrated, by Ledger\'s Donjon team against the Trezor Safe 3 microcontroller and the Safe 7\'s TROPIC01 chip. But those attacks need physical possession, decapsulation or desoldering, specialist equipment and expertise, and vendors dispute how far each one actually gets. If theft of the device is what worries you, a BIP-39 passphrase defeats every one of them, because the passphrase is not stored on the device at all.',
    sources: [SRC.trezorSafe3, SRC.trezorTropic, SRC.bip39],
  },
  {
    q: 'Do I need a passphrase?',
    a: 'Most people should not start with one. A BIP-39 passphrase is mixed into the seed derivation itself, so it creates an entirely separate wallet from the same words. That is powerful for plausible deniability and for defending a stolen device. But forgetting or mistyping it is unrecoverable, and there is no error message to warn you, because every passphrase produces a valid wallet. It is one of the more common ways experienced holders lose funds. Add one only once your basic backup discipline is solid, and back the passphrase up separately from the seed.',
    sources: [SRC.bip39],
  },
  {
    q: 'Is a phone wallet good enough?',
    a: 'For spending money and small balances, a reputable mobile wallet is a reasonable choice, and far better than an exchange. The limitation is that your phone is internet-connected and runs code you never audited, so a compromised phone can show you one address while signing another. A hardware wallet exists to give you a screen the phone cannot lie to. Rough guide: phone wallet for what you would carry as cash, hardware wallet for savings.',
  },
  {
    q: 'Is self-custody worth it for small amounts?',
    a: 'Not always, and pretending otherwise does beginners no favors. If you hold a few hundred dollars you are actively trading, a reputable exchange with a hardware security key on the account is a defensible choice. A badly executed self-custody setup loses money more reliably than a well-run exchange does. But the moment the balance becomes savings rather than a trading position, or crosses the point where losing it would hurt, self-custody is worth the effort. Devices on this page run from roughly $50 for a DIY build, or about $60 to $80 for an entry-level Trezor, Ledger, or Jade, up to $250-$400 for the high-end models.',
  },
  {
    q: 'What happens to my Bitcoin if I die?',
    a: 'Whatever you arranged in advance. For most holders that is nothing, and it is how bitcoin quietly disappears. Your heirs need to know the asset exists, where the device and backups are, and how to use them. None of that can go into a document that becomes public record during probate. Practical options: sealed instructions held by a lawyer, or splitting the information so no single document is enough. Another is a 2-of-3 multisig where a trusted party or a collaborative custody service holds one key.',
  },
  {
    q: 'Should I buy a discounted or second-hand hardware wallet?',
    a: 'No. Buy direct from the manufacturer, every time. Second-hand and marketplace devices can arrive already initialized with a seed the seller kept. In 2021, criminals mailed convincing tampered "replacement" devices, complete with an explanatory letter, to real customers whose addresses leaked in the Ledger breach. And in October 2026 Ledger confirmed an unauthorized hardware implant inside a device bought through a reseller. A genuine device never arrives with a recovery phrase already written down, but a device that generates its own can still have been opened on the way to you. The discount is not worth the question mark.',
    sources: [SRC.fakeLedgers, SRC.ledgerImplantPost, SRC.ledgerImplant],
  },
  {
    q: 'Can I be forced to hand over my Bitcoin?',
    a: 'Physically, yes. One public tally of verified physical attacks on holders lists dozens per year, and materially more in 2025 than in 2024. Most were aimed at people who were publicly identifiable as holding crypto. Its maintainer says the list is incomplete. The primary defense is not technical: do not discuss your holdings, online or in person. Beyond that, a passphrase wallet lets you surrender a decoy balance, and multisig with keys in separate locations means no one person in the room can move the funds.',
    sources: [SRC.wrench],
  },
];

// The badge is 10px text on its own tint. amber-700 and green-700 measured
// 4.54:1 and 4.50:1 there, right on the AA line, so those two use the 800 step.
const walletColorClasses: Record<WalletColor, {
  bg: string;
  border: string;
  badge: string;
  button: string;
  accent: string;
  check: string;
}> = {
  violet: {
    bg: 'bg-violet-50 dark:bg-violet-950/20',
    border: 'border-violet-200 dark:border-violet-800/50',
    badge: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400',
    button: 'bg-violet-600 hover:bg-violet-700',
    accent: 'text-violet-600 dark:text-violet-400',
    check: 'text-violet-600 dark:text-violet-500',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    border: 'border-amber-200 dark:border-amber-800/50',
    badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-400',
    button: 'bg-amber-700 hover:bg-amber-800',
    accent: 'text-amber-700 dark:text-amber-400',
    check: 'text-amber-600 dark:text-amber-500',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-950/20',
    border: 'border-green-200 dark:border-green-800/50',
    badge: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-400',
    button: 'bg-green-700 hover:bg-green-800',
    accent: 'text-green-700 dark:text-green-400',
    check: 'text-green-600 dark:text-green-500',
  },
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-950/20',
    border: 'border-cyan-200 dark:border-cyan-800/50',
    badge: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400',
    button: 'bg-cyan-700 hover:bg-cyan-800',
    accent: 'text-cyan-700 dark:text-cyan-400',
    check: 'text-cyan-600 dark:text-cyan-500',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/20',
    border: 'border-emerald-200 dark:border-emerald-800/50',
    badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400',
    button: 'bg-emerald-700 hover:bg-emerald-800',
    accent: 'text-gain',
    check: 'text-emerald-600 dark:text-emerald-500',
  },
  slate: {
    bg: 'bg-slate-50 dark:bg-slate-950/20',
    border: 'border-slate-200 dark:border-slate-800/50',
    badge: 'bg-slate-100 dark:bg-slate-900/40 text-slate-700 dark:text-slate-400',
    button: 'bg-slate-600 hover:bg-slate-700',
    accent: 'text-slate-600 dark:text-slate-400',
    check: 'text-slate-600 dark:text-slate-500',
  },
};

const walletFallbackEmoji: Record<WalletColor, string> = {
  violet: '\u{1F510}',
  amber: '\u{1F512}',
  cyan: '\u{1F331}',
  emerald: '\u{1F9F0}',
  slate: '\u{1F4E6}',
  green: '\u{1F6E1}️',
};

const cardClass = 'bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700';
const cardTitle = 'text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-2';
const cardBody = 'text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed';
const sectionIcon = 'w-6 h-6 sm:w-8 sm:h-8 text-amber-600 dark:text-amber-500 shrink-0';
const sectionHeading = 'text-xl sm:text-3xl font-bold text-slate-900 dark:text-white';
const prose = 'text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed';

/** In-page navigation. Each href must match a section id below. */
const TOC = [
  { href: '#the-trade', label: 'The trade you are making' },
  { href: '#worth-it-yet', label: 'Is it worth it yet?' },
  { href: '#exchange-failures', label: 'Exchange failures' },
  { href: '#how-coins-get-lost', label: 'How coins get lost' },
  { href: '#seed-phrases', label: 'What a seed phrase is' },
  { href: '#three-habits', label: 'The three habits' },
  { href: '#what-hardware-does', label: 'What hardware does' },
  { href: '#leaving-the-exchange', label: 'Leaving the exchange' },
  { href: '#beginner-path', label: 'The beginner path' },
  { href: '#passphrases-multisig', label: 'Passphrases and multisig' },
  { href: '#inheritance', label: 'Inheritance' },
  { href: '#wallets', label: 'Hardware wallet comparison' },
  { href: '#faq', label: 'Common questions' },
] as const;

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://btcdollarcostaverage.com" },
    { "@type": "ListItem", "position": 2, "name": "Self-Custody Guide", "item": "https://btcdollarcostaverage.com/self-custody" },
  ],
};

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Self-Custody: How to Hold Bitcoin Without Losing It",
  "description": "An honest guide to Bitcoin self-custody: seed phrases, on-device verification, tested backups, threat models, passphrases, multisig, inheritance planning, and a current hardware wallet comparison.",
  "author": {
    "@type": "Person",
    "@id": "https://btcdollarcostaverage.com/author#person",
    "name": "drix",
    "url": "https://btcdollarcostaverage.com/author"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Bitcoin DCA Calculator",
    "url": "https://btcdollarcostaverage.com"
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://btcdollarcostaverage.com/self-custody"
  },
  // First publication date, from the commit that added this page. It does not
  // move when the page is revised; dateModified is the one that does.
  "datePublished": "2026-02-04",
  // Static date. Update when the content changes, and keep it in sync with sitemap.ts.
  "dateModified": "2026-10-12",
};

const howToJsonLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to Set Up Bitcoin Self-Custody",
  "description": "A step-by-step guide to moving Bitcoin into your own custody with a hardware wallet, including testing your recovery before you fund the wallet.",
  "step": STEPS.map((s) => ({
    "@type": "HowToStep",
    "position": s.step,
    "name": s.title,
    "text": s.description,
  })),
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": FAQ.map((item) => ({
    "@type": "Question",
    "name": item.q,
    "acceptedAnswer": { "@type": "Answer", "text": item.a },
  })),
};

export default function SelfCustodyPage() {
  return (
    <div className="measure max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10 sm:space-y-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* Hero */}
      <section className="text-center max-w-3xl mx-auto space-y-4 sm:space-y-5">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs sm:text-sm font-medium">
          <Shield className="w-4 h-4" />
          The part of Bitcoin that goes wrong
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white text-balance">
          How to Hold Bitcoin <span className="text-amber-700 dark:text-amber-400">Without Losing It</span>
        </h1>
        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Self-custody doesn&apos;t remove risk. It moves it. You stop trusting an exchange to still be there next year,
          and you become the only thing standing between your savings and a mistake nobody can reverse. Usually that is
          the right trade. It only works if you take the second half of it seriously.
        </p>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
          Written for someone who has never done this, with the parts experienced holders get wrong marked clearly.
        </p>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
          By{' '}
          <Link href="/author" className={`${citeLink} font-medium`}>drix</Link>
          {' '}&middot; Last reviewed {LAST_REVIEWED}
        </p>
      </section>

      {/* On this page */}
      <nav
        aria-label="On this page"
        className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
          On this page
        </p>
        {/* Each link fills a 44px row. As bare text they were 15px tall on a
            22px pitch, in two columns: the wrong section was one thumb-width away. */}
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 text-xs sm:text-sm">
          {TOC.map((item) => (
            <li key={item.href}>
              <a href={item.href} className={`${navLink} flex min-h-11 items-center`}>{item.label}</a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Section 1: The trade you're making */}
      <section id="the-trade" className="space-y-4 scroll-mt-24">
        <div className="flex items-center gap-2 sm:gap-3">
          <Scale className={sectionIcon} />
          <h2 className={sectionHeading}>The Trade You Are Making</h2>
        </div>
        <div className={`${prose} space-y-4`}>
          <p>
            When you buy Bitcoin on an exchange, the exchange holds it. Your balance is a row in their database and a
            promise to pay. Self-custody replaces that promise with a private key only you control. That is what
            &ldquo;not your keys, not your coins&rdquo; means. It is true, and it is half a sentence. Both arrangements
            can fail. They fail differently.
          </p>

          <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-red-50 dark:bg-red-950/20 p-4 sm:p-5 rounded-xl border border-red-200 dark:border-red-800/50">
              <div className="text-red-700 dark:text-red-400 font-semibold text-sm sm:text-base mb-2">What you give up: counterparty risk</div>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                Insolvency, fraud, hacks, frozen withdrawals, account closures, and the chance that the coins backing
                your balance were quietly lent to someone else. None of it is hypothetical. None of it is something you
                can influence from the outside.
              </p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 p-4 sm:p-5 rounded-xl border border-amber-200 dark:border-amber-800/50">
              <div className="text-amber-700 dark:text-amber-400 font-semibold text-sm sm:text-base mb-2">What you take on: operational risk</div>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                Lost or destroyed backups, phishing, malware that rewrites addresses, a passphrase you cannot remember,
                theft, and the chance that nobody can recover any of it after you die. No support line. No password
                reset. Every one of these is something you can influence, and that is the point.
              </p>
            </div>
          </div>

          <div className="bg-slate-100 dark:bg-slate-900/50 border-l-4 border-amber-400 px-4 sm:px-6 py-3 sm:py-4 rounded-r-xl">
            <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
              <strong className="text-slate-800 dark:text-slate-200">Say the uncomfortable part plainly:</strong> a badly
              executed self-custody setup is more dangerous than a reputable exchange. Irreversibility cuts both ways.
              The same property that stops anyone from freezing your coins has a cost. A single mistyped word, a house
              fire, or one moment of trust in a fake support agent ends the story permanently. Almost everyone who loses
              bitcoin in self-custody loses it to themselves.
            </p>
          </div>

          <p>
            The rest of this page is about the second half of that trade. Get the habits right and self-custody becomes
            boring, which is what you want from money. Skip them and you have swapped a risk you understand for one you
            do not.
          </p>
        </div>
      </section>

      {/* Section 2: Is it worth it for you yet */}
      <section id="worth-it-yet" className="space-y-4 scroll-mt-24">
        <div className="flex items-center gap-2 sm:gap-3">
          <Users className={sectionIcon} />
          <h2 className={sectionHeading}>Is It Worth It For You Yet?</h2>
        </div>
        <div className={`${prose} space-y-4`}>
          <p>
            &ldquo;Everyone should self-custody everything immediately&rdquo; is dogma, not advice. A hundred dollars
            someone is actively trading is a different problem from savings that would change their life. The honest
            heuristic has nothing to do with a dollar threshold:
          </p>

          <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
            <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
              <strong className="text-slate-800 dark:text-slate-200">Ask two questions.</strong> Would losing this money
              materially change your life? And is this a position you are trading, or savings you intend to still hold in
              five years? If the answer is &ldquo;yes&rdquo; and &ldquo;savings&rdquo;, the exchange is the weak link.
              If it is &ldquo;no&rdquo; and &ldquo;trading&rdquo;, your effort is better spent on a hardware security key
              for the exchange account than on a wallet you will not maintain properly.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 sm:gap-4">
            <div className={cardClass}>
              <h3 className={cardTitle}>Small and active</h3>
              <p className={cardBody}>
                Money you are trading, or an amount you could rebuild in a few months. A reputable exchange with a
                hardware security key (not SMS) on the account is defensible. Turn on withdrawal allowlists. Do not skip
                self-custody out of laziness, but do not rush a bad setup either.
              </p>
            </div>
            <div className={cardClass}>
              <h3 className={cardTitle}>Real savings</h3>
              <p className={cardBody}>
                Meaningful money you intend to hold for years. One hardware wallet, a tested recovery, two durable
                backups in two locations. That is it. This is the case the rest of the page is written for, and it
                covers the large majority of holders.
              </p>
            </div>
            <div className={cardClass}>
              <h3 className={cardTitle}>Life-changing</h3>
              <p className={cardBody}>
                More than you could ever earn back. A single seed in a single place is now the risk, not the exchange.
                This is where 2-of-3 multisig, geographically separated keys, and written inheritance instructions stop
                being paranoid and start being proportionate.
              </p>
            </div>
          </div>

          <p>
            Whichever bracket you are in, move in stages. Withdraw an amount you would be annoyed but not devastated to
            lose. Live with the setup for a few weeks. Check that you can put your hands on the backup without hunting
            for it. Then move the rest. Nobody has ever regretted a slow migration.
          </p>
        </div>
      </section>

      {/* Section 3: Exchange failures */}
      <section id="exchange-failures" className="space-y-4 scroll-mt-24">
        <div className="flex items-center gap-2 sm:gap-3">
          <AlertTriangle className={sectionIcon} />
          <h2 className={sectionHeading}>Why Exchanges Are the Weak Link for Savings</h2>
        </div>
        <div className={`${prose} space-y-4`}>
          <p>
            The case against leaving savings on an exchange is not theoretical. Every one of these was, at the time, a
            reputable place that ordinary people trusted:
          </p>

          <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
            {EXCHANGE_FAILURES.map((event) => (
              <div key={event.name} className={cardClass}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">{event.name}</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 tabular-nums">{event.year}</span>
                </div>
                <div className="text-xs sm:text-sm font-semibold text-red-600 dark:text-red-400 mb-1.5">
                  {event.lost} lost
                </div>
                <p className={cardBody}>{event.description}</p>
                <Cite items={event.sources} />
              </div>
            ))}
          </div>

          <p>
            Two caveats, stated honestly. Proof-of-reserves attestations, which several exchanges now publish, show
            assets at a snapshot in time. They say nothing about liabilities, and they are not audits. Regulated custody
            in some jurisdictions is also safer than it was in 2022, which is why the answer for a trading balance is
            not automatically &ldquo;withdraw everything today&rdquo;. For savings, though, the pattern has repeated
            often enough that it does not need re-litigating.
          </p>
        </div>
      </section>

      {/* Section 4: Threat model */}
      <section id="how-coins-get-lost" className="space-y-4 scroll-mt-24">
        <div className="flex items-center gap-2 sm:gap-3">
          <ShieldAlert className={sectionIcon} />
          <h2 className={sectionHeading}>How People Lose Coins</h2>
        </div>
        <div className={`${prose} space-y-4`}>
          <p>
            This is the section most guides skip. It is also the one that will save you money. Ordered by how often
            each thing happens in the real world, not by how dramatic it sounds:
          </p>

          <div className="space-y-3">
            {THREATS.map((t) => (
              <div key={t.title} className={cardClass}>
                <div className="flex items-start gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center tabular-nums mt-0.5">
                    {t.rank}
                  </span>
                  <div className="min-w-0">
                    <h3 className={cardTitle}>{t.title}</h3>
                    <p className={cardBody}>{t.detail}</p>
                    <p className="mt-2 text-xs sm:text-sm text-emerald-700 dark:text-emerald-400 leading-relaxed">
                      <strong>What helps:</strong> {t.fix}
                    </p>
                    {t.sources && <Cite items={t.sources} />}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p>
            Notice the shape of that list. The exotic threats (chip-level attacks, quantum computers, protocol bugs)
            sit at the bottom, or do not appear at all. What empties wallets is mundane: a backup nobody tested, a link
            that looked official, an address nobody checked on the device screen. There is now one large counterexample,
            and honesty requires naming it: in July 2026 a five-year-old firmware bug in Coldcard&apos;s seed generation
            let attackers drain wallets at scale — the reason that device{' '}
            <Link href="/coldcard" className={citeLink}>no longer appears in the comparison below</Link>. Vendor bugs
            are real. They are also still far rarer than everything above this paragraph.
          </p>
        </div>
      </section>

      {/* Section 5: What a seed phrase is */}
      <section id="seed-phrases" className="space-y-4 scroll-mt-24">
        <div className="flex items-center gap-2 sm:gap-3">
          <Key className={sectionIcon} />
          <h2 className={sectionHeading}>What a Seed Phrase Really Is</h2>
        </div>
        <div className={`${prose} space-y-4`}>
          <p>
            Almost every wallet you will encounter follows a standard called{' '}
            <Src href={SRC.bip39.url}>BIP-39</Src>. Your device generates a large random number, then encodes it as 12 or
            24 words, each one an index into a fixed list of <Src href={SRC.bip39Words.url}>2,048 words</Src>. Those words
            are not a password to an account. They <em>are</em> the number, written in a form a human can copy without
            error. Every private key and every address your wallet will ever produce is{' '}
            <Src href={SRC.bip32.url}>derived from it mathematically</Src>.
          </p>

          <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
            <div className={cardClass}>
              <h3 className={cardTitle}>The device is a tool. The seed is the money.</h3>
              <p className={cardBody}>
                A hardware wallet is a calculator with a screen and a locked drawer. Smash it, lose it, or leave it in a
                drawer for a decade and nothing is lost, because the seed regenerates every key it ever held. Lose the
                seed while the device still works and you are on a countdown to the day it stops working.
              </p>
            </div>
            <div className={cardClass}>
              <h3 className={cardTitle}>You are not locked to a vendor</h3>
              <p className={cardBody}>
                Any BIP-39-compatible wallet can restore your seed: a competitor&apos;s hardware, or free software like
                Sparrow or Electrum. This is why &ldquo;what if the company disappears&rdquo; has such a boring answer.
                Write down the wallet type or derivation path your device shows (usually native SegWit or Taproot) so a
                new wallet finds the right accounts straight away.
              </p>
              <Cite items={[SRC.bip39, SRC.bip84, SRC.bip341]} />
            </div>
            <div className={cardClass}>
              <h3 className={cardTitle}>12 words or 24?</h3>
              <p className={cardBody}>
                BIP-39 allows 128 to 256 bits of entropy, which is where 12 and 24 words come from. Both sit far beyond
                any conceivable brute-force search, so the difference is theoretical. Choose whichever you will back up
                accurately and store properly. That is the variable that decides how this ends.
              </p>
              <Cite items={[SRC.bip39]} />
            </div>
            <div className={cardClass}>
              <h3 className={cardTitle}>The built-in checksum</h3>
              <p className={cardBody}>
                The final word carries a checksum, the first ENT/32 bits of the SHA-256 hash of the entropy. That is why
                a wallet rejects a phrase with a mistyped word instead of silently opening an empty one. The spec is
                candid that it is short: it catches most random errors, not all of them, and it does nothing about lost
                words. If a restore is rejected, check your spelling against the official word list before assuming the
                worst.
              </p>
              <Cite items={[SRC.bip39, SRC.bip39Words]} />
            </div>
          </div>

          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 p-4 sm:p-5 rounded-xl">
            <h3 className="text-sm sm:text-base font-bold text-red-700 dark:text-red-400 mb-2">Where a seed phrase must never go</h3>
            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              Not a photo. Not iCloud, Google Drive, or any synced folder. Not a note in a password manager. Not an
              email or a message to yourself. Not a text file. Not typed into any website, browser extension, or app
              other than a hardware wallet you are deliberately restoring. Anything connected to the internet should be
              treated as already read by someone else.
            </p>
            <p className="mt-2 text-xs sm:text-sm font-semibold text-red-700 dark:text-red-400 leading-relaxed">
              No legitimate exchange, support agent, wallet company, giveaway, or airdrop has ever needed your recovery
              phrase. Anyone who asks for it is stealing from you, without exception.
            </p>
          </div>
        </div>
      </section>

      {/* Section 6: The three habits */}
      <section id="three-habits" className="space-y-4 scroll-mt-24">
        <div className="flex items-center gap-2 sm:gap-3">
          <Eye className={sectionIcon} />
          <h2 className={sectionHeading}>The Three Habits That Matter Most</h2>
        </div>
        <div className={`${prose} space-y-4`}>
          <p>
            If you remember nothing else from this page, remember these three. They cost a few minutes each and they
            prevent most real-world losses.
          </p>

          <div className="space-y-3">
            <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-2xl border-l-4 border-amber-400 border-y border-r border-slate-200 dark:border-slate-700">
              <h3 className={cardTitle}>1. Verify on the device screen, every time</h3>
              <p className={cardBody}>
                This is the highest-value habit in self-custody. Malware and malicious browser extensions swap Bitcoin
                addresses in your clipboard and rewrite what your browser shows you, so the address on your monitor can
                be a lie. The hardware wallet&apos;s own screen is the one display an attacker on your computer cannot
                reach. That small screen is the entire reason the device exists.
              </p>
              <p className={`${cardBody} mt-2`}>
                When receiving, generate the address in your wallet software and confirm it on the device before you
                paste it anywhere. When sending, read the destination address <em>and</em> the amount off the device
                screen before you approve. Compare the first six and the last six characters, not just the first four.
                Address-generating malware brute-forces matching prefixes.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-2xl border-l-4 border-amber-400 border-y border-r border-slate-200 dark:border-slate-700">
              <h3 className={cardTitle}>2. Test your recovery before you fund the wallet</h3>
              <p className={cardBody}>
                Set the device up. Write the words down. Then factory-reset the device, restore it from the words you
                wrote, and confirm the first receive address matches exactly what it showed before. Only then send any
                bitcoin to it.
              </p>
              <p className={`${cardBody} mt-2`}>
                Almost nobody does this, and it is the whole difference between having a backup and having a hope. A
                backup you have never restored is an untested assumption about your handwriting, your word order, and
                where you put the card. Ten minutes now, or a discovery in five years that you cannot undo.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-2xl border-l-4 border-amber-400 border-y border-r border-slate-200 dark:border-slate-700">
              <h3 className={cardTitle}>3. Back it up on something that survives your house</h3>
              <p className={cardBody}>
                Paper is fine against forgetting. It is useless against fire, flood, and time. Stamped or engraved metal
                backup plates exist because house fires and burst pipes are more common than hackers, and they cost a
                fraction of what they protect.
              </p>
              <p className={`${cardBody} mt-2`}>
                Keep at least two copies in two separate places. Two drawers in the same house do not count. A trusted
                relative, a workplace safe, a bank box: all reasonable. A copy that is awkward to reach is not a
                problem, because you should almost never need it. Do not label it &ldquo;Bitcoin&rdquo;. And never split
                a seed across locations by cutting it in half. The halves weaken each other far more than people
                assume, so if you want split backups, use a scheme built for it, such as Shamir or multisig.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 7: What a hardware wallet does */}
      <section id="what-hardware-does" className="space-y-4 scroll-mt-24">
        <div className="flex items-center gap-2 sm:gap-3">
          <Lock className={sectionIcon} />
          <h2 className={sectionHeading}>What a Hardware Wallet Does and Does Not Do</h2>
        </div>
        <div className={`${prose} space-y-4`}>
          <p>
            A hardware wallet is a small purpose-built computer that holds your keys and refuses to hand them over.
            When you send bitcoin, your regular computer builds an unsigned transaction, the device signs it internally,
            and only the signature comes back. The key itself never touches an internet-connected machine.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
            <div className={cardClass}>
              <h3 className={cardTitle}>It does: keep keys off your computer</h3>
              <p className={cardBody}>
                Even a fully compromised laptop cannot extract keys from the device. Malware can propose a malicious
                transaction, but it cannot sign one.
              </p>
            </div>
            <div className={cardClass}>
              <h3 className={cardTitle}>It does: give you a trusted display</h3>
              <p className={cardBody}>
                The device screen shows what you are really signing. It is the defense against address-swapping
                malware, and it works only if you read it.
              </p>
            </div>
            <div className={cardClass}>
              <h3 className={cardTitle}>It does not: protect a leaked seed</h3>
              <p className={cardBody}>
                If your recovery phrase is photographed, typed into a website, or stored in the cloud, the device is
                irrelevant. Whoever has the words has the coins.
              </p>
            </div>
            <div className={cardClass}>
              <h3 className={cardTitle}>It does not: stop you approving a bad transaction</h3>
              <p className={cardBody}>
                Confirm a payment to an attacker&apos;s address and the device does its job perfectly. The money is
                gone. Hardware protects keys. Nothing protects a rushed confirmation.
              </p>
            </div>
          </div>
          <p>
            One more thing worth knowing: a &ldquo;secure element&rdquo; is a tamper-resistant chip built to resist
            physical extraction of secrets. Most devices use one. Blockstream Jade deliberately does not, using an
            open-source alternative instead. Secure elements raise the cost of an attack on a <em>stolen</em> device.
            They do nothing about phishing, malware, or a lost backup, which is where the losses are.
          </p>
        </div>
      </section>

      {/* Section 8: Moving off the exchange */}
      <section id="leaving-the-exchange" className="space-y-4 scroll-mt-24">
        <div className="flex items-center gap-2 sm:gap-3">
          <Send className={sectionIcon} />
          <h2 className={sectionHeading}>Moving Coins Off an Exchange</h2>
        </div>
        <div className={`${prose} space-y-4`}>
          <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
            <div className={cardClass}>
              <h3 className={cardTitle}>Always send a test amount first</h3>
              <p className={cardBody}>
                Withdraw a small amount, wait for it to confirm, and check it appears in your wallet. One network fee
                buys you a check on every category of setup error, before the rest of your money is at stake. If your
                exchange offers a withdrawal allowlist, add the address there once it is proven.
              </p>
            </div>
            <div className={cardClass}>
              <h3 className={cardTitle}>Fees are per byte, not per amount</h3>
              <p className={cardBody}>
                Bitcoin fees are priced by transaction size in bytes, not by value. Sending $10 and sending $10,000
                cost the same. So dozens of tiny withdrawals leave you with a wallet full of small pieces that are
                expensive to spend later. Batch the migration into a few larger withdrawals instead.
              </p>
            </div>
            <div className={cardClass}>
              <h3 className={cardTitle}>Address formats</h3>
              <p className={cardBody}>
                Addresses starting <code className="font-mono text-[11px]">bc1q</code> are native SegWit and universally
                supported. <code className="font-mono text-[11px]">bc1p</code> is Taproot, which{' '}
                <Src href={SRC.bip341.url}>activated at block 709,632</Src> in November 2021: cheaper and more private,
                though a small number of exchanges still cannot send to it. If a withdrawal is rejected as an invalid
                address, ask your wallet for a SegWit address instead. Same seed, same wallet, same money.
              </p>
            </div>
            <div className={cardClass}>
              <h3 className={cardTitle}>Confirm the address on the device</h3>
              <p className={cardBody}>
                Before pasting a receive address into the exchange, display it on the hardware wallet and compare it
                character by character. This is the step that defeats clipboard malware. It is also the step people
                skip, because the address &ldquo;looks fine&rdquo; on screen.
              </p>
            </div>
          </div>
          <p>
            Withdrawals are usually cheapest when the network is quiet, typically weekends and off-peak hours. If you
            are dollar-cost averaging, consolidating a month or a quarter of purchases into one withdrawal beats
            withdrawing after every buy. You can model how the fee drag affects results in
            the <Link href="/" className={citeLink}>calculator</Link>, and the{' '}
            <Link href="/methodology" className={citeLink}>methodology page</Link>{' '}
            explains how fees are handled there.
          </p>
        </div>
      </section>

      {/* Section 9: Beginner path steps */}
      <section id="beginner-path" className="space-y-4 scroll-mt-24">
        <div className="text-center space-y-2">
          <h2 className={sectionHeading}>The Beginner Path, Step by Step</h2>
          <p className={prose}>
            Seven steps. Step four is the one that separates people who have a backup from people who think they do.
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

      {/* Section 10: Advanced */}
      <section id="passphrases-multisig" className="space-y-4 scroll-mt-24">
        <div className="flex items-center gap-2 sm:gap-3">
          <Layers className={sectionIcon} />
          <h2 className={sectionHeading}>Beyond the Basics: Passphrases and Multisig</h2>
        </div>
        <div className={`${prose} space-y-4`}>
          <div className="bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-amber-400 px-4 sm:px-6 py-3 sm:py-4 rounded-r-xl">
            <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
              <strong className="text-slate-800 dark:text-slate-200">Not beginner material.</strong> Both of these
              improve security once you understand them. Both have also destroyed real savings when adopted too early.
              Get a single wallet with a tested backup working first, and live with it for a while.
            </p>
          </div>

          <div className={cardClass}>
            <h3 className={cardTitle}>The passphrase (the &ldquo;25th word&rdquo;)</h3>
            <p className={cardBody}>
              A BIP-39 passphrase is an extra secret you type in addition to your seed words. It does not unlock your
              wallet. In the spec it is appended to the string &ldquo;mnemonic&rdquo; and used as the PBKDF2 salt. So the
              same words derive an entirely <em>different</em> seed, and therefore a different wallet. Change one
              character and you get a different wallet again. Your seed words alone still open a valid wallet, just not
              the one holding your money. That is where the plausible-deniability use comes from: a small decoy balance
              on the seed-only wallet, the real balance behind the passphrase.
            </p>
            <Cite items={[SRC.bip39]} />
            <p className={`${cardBody} mt-2`}>
              It is also the strongest defense against a stolen device. The passphrase is never stored on the device, so
              even a successful laboratory extraction of the seed yields the decoy.
            </p>
            <p className="mt-2 text-xs sm:text-sm text-red-600 dark:text-red-400 leading-relaxed">
              <strong>The blunt warning:</strong> there is no wrong-passphrase error. Mistype it and you see an empty
              wallet, which people reliably mistake for their coins being stolen. Forget it and the money is gone. No
              recourse, no exceptions. This is one of the most common ways experienced holders lose funds. Back the
              passphrase up in writing, separately from the seed, and make sure someone you trust can find both if you
              cannot.
            </p>
          </div>

          <div className={cardClass}>
            <h3 className={cardTitle}>Multisig (2-of-3)</h3>
            <p className={cardBody}>
              A multisig wallet needs signatures from several keys before coins can move. The common setup is 2-of-3:
              three separate keys exist, any two can sign. Lose one key and you lose nothing. A thief who compromises
              one key gets nothing. It removes the single point of failure every single-seed setup has, which makes it
              the standard answer once one seed in one place is the thing keeping you awake.
            </p>
            <p className={`${cardBody} mt-2`}>
              Sensible practice: use devices from different manufacturers so one vendor&apos;s flaw cannot take out two
              keys at once. Store the keys in separate locations. And consider a collaborative custody service that
              holds one of the three, so a professional can help your heirs.
            </p>
            <p className="mt-2 text-xs sm:text-sm text-amber-700 dark:text-amber-400 leading-relaxed">
              <strong>The complexity you must not skip:</strong> a multisig wallet is not recoverable from seed phrases
              alone. You also need the wallet descriptor, the file listing all the extended public keys (xpubs) and the
              signing policy. Lose that and you can hold all three seeds and still never reconstruct the wallet. Back
              the descriptor up alongside every key, in every location, and rehearse a full recovery on a fresh machine
              before you trust it with real money. Free software such as Sparrow or Nunchuk handles this well.
            </p>
          </div>
        </div>
      </section>

      {/* Section 11: Inheritance */}
      <section id="inheritance" className="space-y-4 scroll-mt-24">
        <div className="flex items-center gap-2 sm:gap-3">
          <Users className={sectionIcon} />
          <h2 className={sectionHeading}>If You Died Tonight, Could Anyone Recover This?</h2>
        </div>
        <div className={`${prose} space-y-4`}>
          <p>
            This is the most neglected topic in Bitcoin and one of the largest causes of permanent loss. The failure is
            not exotic. Someone dies, the family knows there was &ldquo;some Bitcoin&rdquo;, and nobody knows what a seed
            phrase is or that the metal plate in the safe is not a novelty. QuadrigaCX is the famous version of this
            story, though the{' '}
            <Src href={SRC.quadriga.url}>OSC investigation found fraud underneath it</Src>, not just a dead man&apos;s
            keys. The version that happens quietly, to individuals, never makes the news.
          </p>
          <p className="font-medium text-slate-700 dark:text-slate-300">
            &ldquo;My family will figure it out&rdquo; has destroyed a lot of bitcoin. They will not figure it out. They
            do not know what they are looking at.
          </p>

          <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
            <div className={cardClass}>
              <h3 className={cardTitle}>Separate the &ldquo;where&rdquo; from the &ldquo;what&rdquo;</h3>
              <p className={cardBody}>
                Write a plain-English document. Say that the asset exists and roughly how much. Name the wallet software
                to install and the device model. Say where the device and each backup physically are, and who to call
                for help. It should contain no seed words. This document can be far less protected than the seed itself,
                because on its own it opens nothing.
              </p>
            </div>
            <div className={cardClass}>
              <h3 className={cardTitle}>Never put the seed in your will</h3>
              <p className={cardBody}>
                In many jurisdictions a will becomes public record during probate, and plenty of people read it long
                before then. Reference the existence of the asset and the location of sealed instructions: a
                lawyer&apos;s sealed envelope, a safe deposit box, an executor&apos;s package. Keep the secret material
                outside the document itself.
              </p>
            </div>
            <div className={cardClass}>
              <h3 className={cardTitle}>Multisig is the cleanest answer</h3>
              <p className={cardBody}>
                Hold two keys yourself and give the third to a trusted person or a collaborative custody service. No
                single party can steal it, and your heirs can recover it with professional help after your death. It
                also removes the awkward problem of an inheritance document that is itself a theft target.
              </p>
            </div>
            <div className={cardClass}>
              <h3 className={cardTitle}>Rehearse it</h3>
              <p className={cardBody}>
                Have the person who would really be doing this walk through a recovery with a trivial amount, with you
                in the room but not touching anything. Twenty minutes will show you what your instructions left out. An
                inheritance plan nobody has tested is exactly as reliable as a backup nobody has restored.
              </p>
            </div>
          </div>

          <p>
            One more practical point. Tell at least one person the asset exists, because every mitigation above assumes
            somebody eventually goes looking. Perfect operational security that nobody survives you knowing about is
            indistinguishable from having burned the money.
          </p>
        </div>
      </section>

      {/* Hardware Wallet Recommendations */}
      <section className="space-y-6 scroll-mt-24" id="wallets">
        <div className="text-center space-y-2">
          <h2 className={sectionHeading}>Hardware Wallets Worth Buying</h2>
          <p className={prose}>
            Ordered roughly from most beginner-friendly to most specialist. Every one is a reasonable choice, and the
            differences between them matter far less than whether you test your backup. The trade-offs are still real,
            so each entry carries its caveat and its security record as well as its pitch.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Prices are in US dollars, read off each manufacturer&apos;s own store on {PRICES_CHECKED} and stated as
            approximations; vendors discount frequently, so confirm current pricing on the manufacturer&apos;s site.
            Links marked <strong className="text-slate-600 dark:text-slate-300">(affiliate)</strong> support this project at no extra cost to you.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 border-l-4 border-red-500 border-y border-r border-slate-200 dark:border-slate-700 p-4 sm:p-5 rounded-r-xl">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 mb-1">
                Removed from this list &middot; August 2026
              </p>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <strong className="text-slate-800 dark:text-slate-200">Coldcard.</strong> Until 11 August 2026 this page
                recommended Coinkite&apos;s Coldcard. On 30 July 2026 Coinkite disclosed that a firmware flaw introduced
                in March 2021 had weakened seed generation on its devices, and attackers spent the following week
                draining affected wallets — roughly 1,800 BTC, about $115 million at the prices when the coins were
                taken, by Galaxy Research&apos;s late-August tally. Patched firmware exists, but it cannot repair an
                existing seed: anyone whose seed was generated on affected firmware must create a new wallet and move
                everything. We removed the recommendation twelve days after that disclosure, and it stays off this
                list: when last verified on 1 October 2026, Coinkite&apos;s status page said its detailed technical
                post-mortem was still in preparation. If you own a Coldcard, read{' '}
                <Link href="/coldcard" className="font-semibold text-red-700 dark:text-red-400 underline hover:no-underline">
                  our full write-up: what happened, which seeds are affected, and what to do now
                </Link>.
              </p>
              <Cite items={[SRC.coldcardAdvisory, SRC.coldcardGalaxy, SRC.coldcardStatus, SRC.coldcardThn]} />
            </div>
          </div>
        </div>

        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 p-4 sm:p-5 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            <strong className="text-red-700 dark:text-red-400">Buy direct from the manufacturer, every time.</strong>{' '}
            Not Amazon, not eBay, not a reseller, not second-hand, however good the discount looks. Tampered devices
            are a documented attack: in 2021 criminals used the leaked Ledger customer list to{' '}
            <Src href={SRC.fakeLedgers.url}>mail convincing counterfeit &ldquo;replacements&rdquo; to real customers</Src>,
            and in October 2026 Ledger confirmed a hardware implant in a device sold through a reseller (the note
            below). A device that arrives with a recovery phrase already written down is compromised. One that
            generates its own in front of you has passed a necessary test, not a sufficient one. The same order also
            puts your name and address on a customer list, and those lists have leaked at both Ledger and Trezor. Give
            the order as little as you can: a separate email address and, where you can, a P.O. box, which is{' '}
            <Src href={SRC.trezorShipMonk.url}>Trezor&apos;s own advice to its customers</Src>.
          </p>
        </div>

        {/* Provisional. Everything here is attributed and dated, because the investigation
            was days old when it was written; see LEDGER_NOTE_AS_OF before editing. */}
        <div
          id="ledger-reseller-note"
          className="bg-white dark:bg-slate-800 border-l-4 border-amber-500 border-y border-r border-slate-200 dark:border-slate-700 p-4 sm:p-5 rounded-r-xl scroll-mt-24"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Developing &middot; as of {LEDGER_NOTE_AS_OF}
              </p>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <strong className="text-slate-800 dark:text-slate-200">Ledger devices sold by one reseller.</strong> On
                9 October 2026 Ledger said it was investigating reports of lost funds from customers in Southeast Asia
                who had bought devices from a reseller called CryptoBilis, and that it had asked the reseller to pause
                sales. Cointelegraph reports that CryptoBilis was listed as an authorized Ledger reseller. On 10
                October Ledger confirmed that one affected customer&apos;s device contained an unauthorized hardware
                implant, and said it had no indication that its own infrastructure, systems or services had been
                compromised. On 11 October it described the number of affected devices as limited.
              </p>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                Ledger&apos;s guidance, as last stated in its update of 11 October: &ldquo;For CryptoBilis buyers: do
                not initialize unused devices. If already set up, move to a new seed on a device from Ledger.&rdquo; A
                seed is the recovery phrase. Its first statement, on 9 October, was narrower: it covered only
                purchases in the previous 90 days and said to &ldquo;consider moving&rdquo; assets. We found no newer
                guidance from Ledger on {LEDGER_NOTE_AS_OF}.
              </p>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                What is not known: Ledger has confirmed no loss figure and has not said how the implant worked.
                Outside estimates rose from above $72 million on 9 October to $102 million across 324 wallets in
                Bitquery&apos;s count on 12 October, and it has not been established that the implant explains every
                loss.
              </p>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                Other sellers are an open question. On 11 October a buyer in Europe published photographs that he
                said show added wiring inside a Ledger bought about two weeks earlier from a large electronics chain;
                he reported no funds taken. On 12 October he said a second, bought that day at another branch, was
                altered the same way, and that he was sending it to Ledger. We found no statement from Ledger
                confirming or denying either. Its 11 October update says all confirmed cases tied to the 9 October
                thefts involve the one reseller, and that its own systems and direct sales channels are unaffected:
                what it has confirmed so far, not a guarantee.
              </p>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                Ledger&apos;s own security documentation says its Genuine Check &ldquo;cannot detect unauthorized
                physical modifications to the hardware, such as spying implants, if the original Secure Element
                remains intact&rdquo;. This note is provisional and will be rewritten when Ledger publishes its
                findings.
              </p>
              <Cite items={[SRC.ledgerReseller, SRC.ledgerImplantPost, SRC.ledgerUpdatePost, SRC.ledgerUpdateCoindesk, SRC.ledgerLosses, SRC.ledgerEurope, SRC.ledgerEuropeSecond, SRC.ledgerGenuine]} />
            </div>
          </div>
        </div>

        {/* At-a-glance comparison, rendered from the same WALLETS data as the full cards below. */}
        <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">The Short Version</h3>
          {/* slate-600, not slate-500: on this slate-100 panel slate-500 is 4.35:1 and
              fails AA at this size. Same for the header row below. */}
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Approximate US-dollar prices, checked {PRICES_CHECKED}. Tap a name to jump to the full write-up, which
            carries the caveats this table is too small for.
          </p>
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <table className="w-full text-xs sm:text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th scope="col" className="pb-2 pr-3 font-medium">Wallet</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Price</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Open source</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Secure element</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Air-gapped</th>
                  <th scope="col" className="pb-2 font-medium">Best for</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 dark:text-slate-300 align-top">
                {WALLETS.map((w) => (
                  <tr key={w.name} className="border-t border-slate-200 dark:border-slate-700/50">
                    <td className="py-2 pr-3 font-medium">
                      {/* 44px tall on a phone and on any touch screen, where the other cells
                          already wrap the row past that. items-start keeps the name on the
                          first text line. min-w-11 is for the one-word names: "Trezor" and
                          "Ledger" are 37px and 40px of text, narrower than a thumb. The column
                          is already wider than 44px (its longest name sets it), so nothing moves. */}
                      <a href={`#wallet-${w.slug}`} className={`${citeLink} inline-flex items-start max-sm:min-h-11 max-sm:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11`}>{w.name}</a>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{w.price}</td>
                    <td className="py-2 pr-3">{w.openSource}</td>
                    <td className="py-2 pr-3">{w.secureElement}</td>
                    <td className="py-2 pr-3">{w.airGap}</td>
                    <td className="py-2">{w.bestFor.replace(/^Best for: /, '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          {WALLETS.map((wallet) => {
            const colors = walletColorClasses[wallet.color];
            return (
              <div
                key={wallet.name}
                id={`wallet-${wallet.slug}`}
                className={`${colors.bg} border ${colors.border} rounded-2xl overflow-hidden scroll-mt-24`}
              >
                <div className="p-5 sm:p-8">
                  <div className="flex flex-col sm:flex-row gap-5 sm:gap-8">
                    {/* Product image */}
                    <div className="shrink-0 flex justify-center sm:justify-start">
                      <div className="w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden">
                        <WalletImage
                          src={wallet.image}
                          alt={wallet.name}
                          fallbackEmoji={walletFallbackEmoji[wallet.color]}
                        />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 space-y-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{wallet.name}</h3>
                          <span className={`text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>{wallet.price}</span>
                        </div>
                        <p className={`text-sm font-medium ${colors.accent}`}>{wallet.tagline}</p>
                      </div>

                      <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                        {wallet.description}
                      </p>

                      <div className="space-y-1.5">
                        {wallet.features.map((feature) => (
                          <div key={feature} className="flex items-start gap-2">
                            <CheckCircle2 className={`w-4 h-4 ${colors.check} shrink-0 mt-0.5`} />
                            <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">{feature}</span>
                          </div>
                        ))}
                      </div>

                      <div className="bg-white/70 dark:bg-slate-900/40 rounded-lg p-3 space-y-2 border border-slate-200/70 dark:border-slate-700/60">
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                          <strong className="text-slate-700 dark:text-slate-300">Lineup and pricing:</strong> {wallet.lineup}
                        </p>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                          <strong className="text-slate-700 dark:text-slate-300">Know this too:</strong> {wallet.caveat}
                        </p>
                        {wallet.record && (
                          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                            <strong className="text-slate-700 dark:text-slate-300">Security record:</strong> {wallet.record}
                          </p>
                        )}
                      </div>

                      {wallet.sources && <Cite items={wallet.sources} />}

                      <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 italic">
                        {wallet.bestFor}
                      </div>

                      <a
                        href={wallet.href}
                        target="_blank"
                        rel={wallet.affiliate ? 'noopener noreferrer sponsored' : 'noopener noreferrer'}
                        className={`inline-flex min-h-11 items-center gap-2 px-5 py-2.5 rounded-xl text-sm sm:text-base font-semibold text-white ${colors.button} transition-colors shadow-sm`}
                      >
                        {wallet.affiliate ? `Shop ${wallet.name} (affiliate)` : `Visit ${wallet.name}`}
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 text-center italic">
          Affiliate disclosure: the Trezor, Blockstream Jade, Ledger, BitBox02, and Cypherock links are affiliate links.
          We may earn a commission at no extra cost to you, and it helps keep this calculator free. The SeedSigner link
          is not an affiliate link. Affiliate status did not decide what appears here or what is said about it — the
          Coldcard, removed above, was never an affiliate link either. It came off because a flaw in its own firmware
          weakened seeds wherever the device was bought. Ledger stays, with the dated note above, because what Ledger
          has confirmed so far is an unauthorized implant in a device sold through a reseller. That is our reading of
          an open investigation, and we will look at it again when Ledger publishes its findings. Note that the
          caveats above are attached to the affiliate products too.
        </p>
      </section>

      {/* Common Concerns */}
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
                {item.sources && <Cite items={item.sources} />}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="text-center bg-slate-100 dark:bg-slate-900/50 p-6 sm:p-10 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
          Do the Boring Version Properly
        </h2>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          One device bought direct. One recovery you have tested. Two backups in two places, and every address checked
          on the device screen. That covers almost every way this goes wrong.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a href="#wallets" className="inline-flex min-h-11 items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-xl text-sm sm:text-base transition-colors">
            Compare Hardware Wallets
          </a>
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-2xl text-sm sm:text-base transition-colors hover:bg-slate-50 dark:hover:bg-slate-700">
            Open the Calculator
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          New to all of this? Start with{' '}
          <Link href="/why-bitcoin" className={citeLink}>where Bitcoin&apos;s value comes from</Link>, or read the{' '}
          <Link href="/methodology" className={citeLink}>methodology</Link>{' '}
          behind the calculator.
        </p>
      </section>

      {/* Sources */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <BookOpen className={sectionIcon} />
          <h2 className={sectionHeading}>Sources</h2>
        </div>
        <div className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Standards claims are cited to the BIP itself. Incidents are cited to the regulator, the affected company&apos;s
            own disclosure, or the security reporting, not to a summary of a summary. Where a vendor has not answered
            a piece of research in public, the researchers&apos; own write-up is cited and labelled as their account.
            Product claims are cited to the vendor&apos;s published source code where one exists, which is also the
            point of preferring wallets that publish it. Where a number could not be traced, it was softened or removed.
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
            <strong className="text-slate-700 dark:text-slate-300">Last reviewed:</strong> {LAST_REVIEWED}. Prices, product
            lineups and vulnerability disclosures change faster than this page does. Check the manufacturer&apos;s own site
            before buying, and their security advisory page before assuming a device is unaffected by anything above.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="border-t border-slate-200 dark:border-slate-800 pt-6 sm:pt-8">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[11px] sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            <strong>Disclaimer:</strong> This page is educational and is not financial, legal, or security advice. Some
            links are affiliate links (Trezor, Blockstream Jade, Ledger, BitBox02, Cypherock); if you buy through them
            we may earn a commission at no additional cost to you. Prices, product lineups, and security disclosures
            change, so verify current details with the manufacturer before purchasing. Inheritance and estate
            arrangements vary by jurisdiction; consult a qualified professional. This site may also display ads; see{' '}
            <a href="/about#ads-and-analytics" className={citeLink}>/about</a> for full disclosure.
          </p>
        </div>
      </section>

    </div>
  );
}
