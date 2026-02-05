import type { Metadata } from 'next';
import Link from 'next/link';
import { Shield, AlertTriangle, Key, Lock, CheckCircle2, ExternalLink, ArrowRight } from 'lucide-react';
import { WalletImage } from '@/components/WalletImage';

export const metadata: Metadata = {
  title: 'Why Self-Custody Matters | Bitcoin DCA Calculator',
  description: 'Learn why self-custody is essential for Bitcoin holders. Understand hardware wallets, the risks of exchanges, and how to secure your Bitcoin with Cypherock, Ledger, Blockstream Jade, Coldcard, and SeedSigner.',
  openGraph: {
    title: 'Why Self-Custody Matters | Protect Your Bitcoin',
    description: 'Not your keys, not your coins. Learn how to properly secure your Bitcoin with hardware wallets.',
    type: 'article',
  },
  alternates: {
    canonical: '/self-custody',
  },
};

const EXCHANGE_FAILURES = [
  { name: 'Mt. Gox', year: '2014', lost: '850,000 BTC', description: 'The largest Bitcoin exchange at the time collapsed after a hack. Users waited over a decade to receive partial recovery.' },
  { name: 'QuadrigaCX', year: '2019', lost: '$190M', description: 'The founder died with the only passwords to the exchange wallets. All customer funds were permanently locked.' },
  { name: 'FTX', year: '2022', lost: '$8B+', description: 'One of the world\'s largest crypto exchanges collapsed overnight due to fraud. Millions of users lost access to their funds.' },
  { name: 'Celsius', year: '2022', lost: '$4.7B', description: 'The lending platform froze all withdrawals, then filed for bankruptcy. Users couldn\'t access their own Bitcoin.' },
];

const WALLETS = [
  {
    name: 'SeedSigner',
    tagline: 'DIY, stateless & air-gapped',
    description: 'SeedSigner is a completely open-source, do-it-yourself Bitcoin signing device built from off-the-shelf parts (Raspberry Pi Zero, camera, and screen). It\'s stateless — it never stores your keys, so there\'s nothing to steal if someone finds it. Perfect for the DIY-minded Bitcoiner who wants full transparency.',
    features: ['100% open-source hardware & software', 'Stateless — never stores private keys', 'Air-gapped via QR codes only', 'Build it yourself from commodity parts', 'Bitcoin-only, no unnecessary features'],
    price: '~$50 (DIY build)',
    href: 'https://seedsigner.com/',
    color: 'cyan',
    image: '/wallets/seedsigner.png',
    bestFor: 'Best for: DIY enthusiasts & maximum transparency',
    affiliate: false,
  },
  {
    name: 'Coldcard',
    tagline: 'Maximum security, Bitcoin only',
    description: 'Coldcard is built exclusively for Bitcoin and is trusted by some of the most security-conscious Bitcoiners in the world. It supports fully air-gapped operation via MicroSD card, so it never needs to connect to a computer. Made in Canada with a dual secure element design.',
    features: ['Bitcoin-only (no altcoin distractions)', 'Fully air-gapped via MicroSD', 'Dual secure element chips', 'Open-source firmware', 'Advanced features: multisig, BIP-85, seed XOR'],
    price: 'From $157.94',
    href: 'https://coldcard.com/',
    color: 'blue',
    image: '/wallets/coldcard.png',
    bestFor: 'Best for: Security maximalists & advanced users',
    affiliate: false,
  },
  {
    name: 'Blockstream Jade',
    tagline: 'Air-gapped & open-source',
    description: 'Built by the team behind Bitcoin\'s Liquid Network, Jade offers a fully air-gapped signing experience via camera-based QR codes. It\'s fully open-source, so anyone can audit the code. One of the most affordable ways to start self-custody.',
    features: ['Fully open-source hardware & software', 'Air-gapped via QR codes (no cables needed)', 'Camera for QR-based signing', 'Built-in battery & Bluetooth', 'Bitcoin & Liquid Network support'],
    price: 'From $64.99',
    href: 'https://store.blockstream.com/?code=kRIZlFIlEIHU',
    color: 'green',
    image: '/wallets/blockstream-jade.png',
    bestFor: 'Best for: Privacy & open-source advocates',
    affiliate: true,
  },
  {
    name: 'Ledger',
    tagline: 'The most popular hardware wallet',
    description: 'Ledger devices have secured millions of users worldwide. With Ledger Live, you can manage your Bitcoin, check your balance, and send transactions all from a single app. Their secure element chip is certified by independent security labs.',
    features: ['Certified secure element (CC EAL5+)', 'Bluetooth (Nano X) or USB', 'Ledger Live companion app', 'Supports 5,500+ assets', 'Large ecosystem & community'],
    price: 'From $79',
    href: 'https://shop.ledger.com/?r=ee186bc1f36d',
    color: 'amber',
    image: '/wallets/ledger.png',
    bestFor: 'Best for: Beginners & mobile users',
    affiliate: true,
  },
  {
    name: 'Cypherock X1',
    tagline: 'No single point of failure',
    description: 'Cypherock uses Shamir Secret Sharing to split your private key across 4 tamper-proof cards and the device itself. Even if you lose one card, your Bitcoin is safe. No seed phrase to write down or worry about.',
    features: ['No seed phrase backup needed', 'Shamir Secret Sharing across 4 cards', 'Open-source firmware', 'Supports 9,000+ assets', 'EAL6+ secure element'],
    price: 'From $99',
    href: 'https://www.cypherock.com/ref?wt_coupon=9drix910',
    color: 'violet',
    image: '/wallets/cypherock.png',
    bestFor: 'Best for: Eliminating single points of failure',
    affiliate: true,
  },
];

const STEPS = [
  {
    step: 1,
    title: 'Choose a hardware wallet',
    description: 'Pick one from our recommendations below. All five are reputable, well-reviewed, and purpose-built for securing Bitcoin.',
  },
  {
    step: 2,
    title: 'Set up your device',
    description: 'Follow the manufacturer\'s instructions. The device will generate a private key that never leaves the hardware. Write down your recovery phrase (if applicable) and store it somewhere safe offline.',
  },
  {
    step: 3,
    title: 'Transfer your Bitcoin',
    description: 'Send a small test amount first. Once confirmed, transfer the rest of your Bitcoin from the exchange to your wallet address. Always double-check the address.',
  },
  {
    step: 4,
    title: 'Secure your backup',
    description: 'Store your recovery phrase in a fireproof, waterproof location. Consider a metal backup plate. Never store it digitally, never take a photo of it, and never share it with anyone.',
  },
];

const walletColorClasses = {
  violet: {
    bg: 'bg-violet-50 dark:bg-violet-950/20',
    border: 'border-violet-200 dark:border-violet-800/50',
    badge: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400',
    button: 'bg-violet-600 hover:bg-violet-700',
    accent: 'text-violet-600 dark:text-violet-400',
    check: 'text-violet-500',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    border: 'border-amber-200 dark:border-amber-800/50',
    badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
    button: 'bg-amber-600 hover:bg-amber-700',
    accent: 'text-amber-600 dark:text-amber-400',
    check: 'text-amber-500',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-950/20',
    border: 'border-green-200 dark:border-green-800/50',
    badge: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
    button: 'bg-green-600 hover:bg-green-700',
    accent: 'text-green-600 dark:text-green-400',
    check: 'text-green-500',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    border: 'border-blue-200 dark:border-blue-800/50',
    badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
    button: 'bg-blue-600 hover:bg-blue-700',
    accent: 'text-blue-600 dark:text-blue-400',
    check: 'text-blue-500',
  },
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-950/20',
    border: 'border-cyan-200 dark:border-cyan-800/50',
    badge: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400',
    button: 'bg-cyan-600 hover:bg-cyan-700',
    accent: 'text-cyan-600 dark:text-cyan-400',
    check: 'text-cyan-500',
  },
};

export default function SelfCustodyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12 sm:space-y-16">

      {/* Hero */}
      <section className="text-center space-y-4 sm:space-y-5">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs sm:text-sm font-medium">
          <Shield className="w-4 h-4" />
          Essential Knowledge for Every Bitcoiner
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight text-balance">
          Why <span className="text-amber-500">Self-Custody</span> Matters
        </h1>
        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
          When you buy Bitcoin on an exchange, the exchange holds your Bitcoin for you. Self-custody means <strong>you</strong> hold the keys. Here&apos;s why that matters and how to do it safely.
        </p>
      </section>

      {/* What is Self-Custody */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <Key className="w-7 h-7 text-amber-500 shrink-0" />
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">What Is Self-Custody?</h2>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
          <div className="bg-red-50 dark:bg-red-950/20 p-5 sm:p-6 rounded-xl border border-red-200 dark:border-red-800/50">
            <div className="text-red-600 dark:text-red-400 font-semibold text-sm sm:text-base mb-2">Without Self-Custody</div>
            <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed mb-3">
              Your Bitcoin sits in the exchange&apos;s wallet. You have an <em>IOU</em> &mdash; a promise that they&apos;ll give it back when you ask. If the exchange gets hacked, goes bankrupt, or freezes withdrawals, you may lose everything.
            </p>
            <div className="text-xs sm:text-sm text-red-600 dark:text-red-400 font-medium">
              Think of it like keeping all your cash in someone else&apos;s safe. They have the combination, not you.
            </div>
          </div>

          <div className="bg-green-50 dark:bg-green-950/20 p-5 sm:p-6 rounded-xl border border-green-200 dark:border-green-800/50">
            <div className="text-green-600 dark:text-green-400 font-semibold text-sm sm:text-base mb-2">With Self-Custody</div>
            <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed mb-3">
              Your Bitcoin is controlled by a <strong>private key</strong> that only you hold. No company, government, or hacker can move your Bitcoin without your key. You are your own bank.
            </p>
            <div className="text-xs sm:text-sm text-green-600 dark:text-green-400 font-medium">
              Think of it like keeping your cash in your own safe at home. Only you know the combination.
            </div>
          </div>
        </div>

        {/* Not your keys callout */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-6 sm:p-8 rounded-2xl text-center">
          <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold mb-2">
            &ldquo;Not your keys, not your coins.&rdquo;
          </div>
          <p className="text-sm sm:text-base text-white/80 max-w-xl mx-auto">
            This is the most important principle in Bitcoin. If you don&apos;t control the private keys, you don&apos;t truly own the Bitcoin. It&apos;s that simple.
          </p>
        </div>
      </section>

      {/* Exchange Failures */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-7 h-7 text-red-500 shrink-0" />
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">What Can Go Wrong?</h2>
        </div>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          These aren&apos;t hypothetical risks. Billions of dollars have been lost because people trusted exchanges with their Bitcoin:
        </p>

        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
          {EXCHANGE_FAILURES.map((event) => (
            <div key={event.name} className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">{event.name}</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">{event.year}</span>
              </div>
              <div className="text-xs sm:text-sm font-semibold text-red-600 dark:text-red-400 mb-1.5">
                {event.lost} lost
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{event.description}</p>
            </div>
          ))}
        </div>

        <div className="bg-slate-100 dark:bg-slate-800/50 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
          <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 font-medium">
            All of these losses could have been prevented with self-custody.
          </p>
        </div>
      </section>

      {/* What is a Hardware Wallet */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <Lock className="w-7 h-7 text-amber-500 shrink-0" />
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">What Is a Hardware Wallet?</h2>
        </div>

        <div className="text-sm sm:text-base text-slate-600 dark:text-slate-300 space-y-4 leading-relaxed">
          <p>
            A <strong className="text-slate-800 dark:text-slate-200">hardware wallet</strong> is a small physical device &mdash; about the size of a USB stick &mdash; that stores your Bitcoin private keys completely offline.
          </p>
          <p>
            Even if your computer is infected with malware, a hacker <em>cannot</em> steal your Bitcoin because the private keys never leave the device. When you want to send Bitcoin, the hardware wallet signs the transaction internally and only sends the signed result back to your computer.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="font-semibold text-sm sm:text-base text-slate-800 dark:text-white">Offline Security</h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Your keys are stored on the device, never exposed to the internet</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="font-semibold text-sm sm:text-base text-slate-800 dark:text-white">Easy to Use</h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Modern wallets have simple companion apps. No technical skills needed.</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Key className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="font-semibold text-sm sm:text-base text-slate-800 dark:text-white">Recoverable</h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Lost your device? Your recovery phrase lets you restore your Bitcoin on a new one.</p>
          </div>
        </div>
      </section>

      {/* Hardware Wallet Recommendations */}
      <section className="space-y-6" id="wallets">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Recommended Hardware Wallets</h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">
            These are some of the most trusted hardware wallets in the Bitcoin community.
          </p>
        </div>

        <div className="space-y-6">
          {WALLETS.map((wallet) => {
            const colors = walletColorClasses[wallet.color as keyof typeof walletColorClasses];
            return (
              <div
                key={wallet.name}
                className={`${colors.bg} border ${colors.border} rounded-2xl overflow-hidden`}
              >
                <div className="p-5 sm:p-8">
                  <div className="flex flex-col sm:flex-row gap-5 sm:gap-8">
                    {/* Product image */}
                    <div className="shrink-0 flex justify-center sm:justify-start">
                      <div className="w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden">
                        <WalletImage
                          src={wallet.image}
                          alt={wallet.name}
                          fallbackEmoji={
                            wallet.color === 'violet' ? '\u{1F510}' :
                            wallet.color === 'amber' ? '\u{1F512}' :
                            wallet.color === 'blue' ? '\u{2744}\uFE0F' :
                            wallet.color === 'cyan' ? '\u{1F331}' :
                            '\u{1F6E1}\uFE0F'
                          }
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

                      <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 italic">
                        {wallet.bestFor}
                      </div>

                      <a
                        href={wallet.href}
                        target="_blank"
                        rel={wallet.affiliate ? 'noopener noreferrer sponsored' : 'noopener noreferrer'}
                        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm sm:text-base font-semibold text-white ${colors.button} transition-colors shadow-sm`}
                      >
                        {wallet.affiliate ? `Shop ${wallet.name}` : `Visit ${wallet.name}`}
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
          Affiliate disclosure: Some links above are affiliate links (Cypherock, Ledger, Blockstream Jade). We may earn a commission at no extra cost to you. This helps support the development of this free calculator. Coldcard and SeedSigner links are not affiliate links.
        </p>
      </section>

      {/* Getting Started Steps */}
      <section className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Getting Started in 4 Steps</h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">
            Self-custody might sound intimidating, but it&apos;s simpler than you think.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {STEPS.map((s) => (
            <div key={s.step} className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-800 relative">
              <div className="absolute -top-3 -left-2 w-8 h-8 rounded-full bg-amber-500 text-white text-sm font-bold flex items-center justify-center shadow-sm">
                {s.step}
              </div>
              <h3 className="font-bold text-sm sm:text-base text-slate-800 dark:text-white mt-2 mb-2">{s.title}</h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Common Concerns */}
      <section className="space-y-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white text-center">Common Concerns</h2>
        <div className="space-y-3">
          {[
            {
              q: 'What if I lose my hardware wallet?',
              a: 'Your Bitcoin isn\'t stored "on" the device. It\'s on the blockchain. The device just holds your private key. As long as you have your recovery phrase backed up, you can restore your wallet on a brand new device. The lost device is useless to anyone without your PIN.',
            },
            {
              q: 'What if the hardware wallet company goes out of business?',
              a: 'Your recovery phrase follows an open standard (BIP-39). You can restore your keys on any compatible wallet from any manufacturer. You\'re never locked in to one company.',
            },
            {
              q: 'Is self-custody worth it for small amounts?',
              a: 'A common rule of thumb: if you hold more Bitcoin than you\'d be comfortable losing, move it to self-custody. For many people, that threshold is around $500-$1,000. Hardware wallets cost $65-$100, which is a small price for peace of mind.',
            },
            {
              q: 'Can\'t I just use a software wallet on my phone?',
              a: 'Software wallets (like BlueWallet or Sparrow) are better than leaving Bitcoin on an exchange, but your phone is connected to the internet and can be compromised. A hardware wallet keeps your keys completely offline, which is the gold standard for security.',
            },
          ].map((item) => (
            <details key={item.q} className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 transition-shadow hover:shadow-sm">
              <summary className="flex items-center justify-between cursor-pointer p-4 sm:p-5 list-none [&::-webkit-details-marker]:hidden">
                <h3 className="font-semibold text-sm sm:text-base text-slate-800 dark:text-slate-200 pr-4">{item.q}</h3>
                <ArrowRight className="w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 group-open:rotate-90 shrink-0" />
              </summary>
              <div className="px-4 sm:px-5 pb-4 sm:pb-5 -mt-1">
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.a}</p>
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-700 text-white p-6 sm:p-10 rounded-2xl text-center space-y-4">
        <h2 className="text-xl sm:text-3xl font-bold">Ready to Secure Your Bitcoin?</h2>
        <p className="text-sm sm:text-base text-slate-300 max-w-lg mx-auto">
          Don&apos;t wait until the next exchange collapse. Take control of your Bitcoin today.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a href="#wallets" className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl text-sm sm:text-base transition-colors">
            View Hardware Wallets
          </a>
          <Link href="/" className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl text-sm sm:text-base transition-colors">
            Calculate Your DCA
          </Link>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="border-t border-slate-200 dark:border-slate-800 pt-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[11px] sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            <strong>Disclaimer:</strong> Some links on this page are affiliate links (Cypherock, Ledger, Blockstream Jade). If you purchase through those links, we may earn a commission at no additional cost to you. This page is for educational purposes only and does not constitute financial advice. Always do your own research before purchasing any hardware wallet or making investment decisions.
          </p>
        </div>
      </section>

    </div>
  );
}
