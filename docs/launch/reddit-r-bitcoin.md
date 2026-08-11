# Reddit drafts

> **Status: DRAFT — do not post until the pre-launch checklist (docs/launch/checklist.md) is done.**
> One authentic post per subreddit, spaced days apart. Read each sub's self-promotion rules first.
> Reply to every comment honestly, including the hostile ones. Never ask anyone to upvote.

---

## r/Bitcoin post

**Suggested title:**
`I open-sourced a Bitcoin DCA backtester: real daily data back to $0.07 in 2010, XIRR, drawdown, and a published methodology. Tear it apart.`

**Body:**

If you've ever argued about whether DCA beats lump sum, or what buying $50/week since the 2017 top actually did, this might save you a spreadsheet: https://btcdollarcostaverage.com

What it does:

- Backtests any DCA schedule (daily/weekly/bi-weekly/monthly) with your fee percentage, back to August 2010 at ~$0.07
- Real prices only. Pre-2015 comes from a blockchain.info daily snapshot; 2015+ from exchange candles. If a date has no known price, it refuses to invent one
- XIRR (annualized, money-weighted), max drawdown, and the historical win rate of comparable windows since 2010
- Compares against S&P 500 *total* return (dividends reinvested, not the index level most sites use), gold, and CPI
- Lump sum vs DCA across every start month since 2010, a start-date heatmap, and FIRE / drawdown / cost-basis tools
- Sats-first mode, CSV export, works installed as an app

What it doesn't do: predict prices, model taxes or spreads, or rank "the best day of the week to buy". I actually built that last page, found the weekday spread was start-date noise from a handful of 2010 penny-price buys, and the page now says exactly that instead of crowning a winner.

No accounts, no email, nothing to sign up for. Analytics are cookieless and aggregate; the only Google tag is conversion measurement and it loads only if you accept the consent banner — decline and it never loads. Your cost-basis entries stay in your browser.

It's MIT licensed: https://github.com/9drix9/bitcoindca-calculator — and every formula and data source is documented at /methodology. If you find a number that's wrong, I want to know. That's the whole point of open-sourcing it.

---

## r/BitcoinBeginners variant (shorter, posted separately, days later)

**Suggested title:**
`Free tool to see what a weekly Bitcoin buy since any date would be worth today (no signup, open source)`

**Body:**

I made a free calculator that answers the question most beginners ask first: "what if I'd been buying $25 a week since X?"

https://btcdollarcostaverage.com

- Pick an amount, a schedule, and a start date; it shows what you'd have, using real historical prices back to 2010
- It includes exchange fees, shows the worst drops you'd have sat through (not just the gains), and shows how often a plan like yours ended in profit historically
- Plain-English explanations of every number, and a /methodology page that lists what the tool can't tell you
- No account, no email, nothing to install

One honest warning that the site itself repeats: past results don't predict anything. The tool shows history; what Bitcoin does next is not in the data.

It's open source (MIT), so anyone can check the math: https://github.com/9drix9/bitcoindca-calculator

---

## Comment-reply cheat sheet

Honest answers to the predictable questions. Use your own words; these are the facts.

**"Where does the data come from?"**
Aug 2010 – Jul 2015: a static snapshot of blockchain.info's daily market price series, bundled into the repo (`src/data/btcHistorical.ts`) because that history no longer changes. 2015 onward: Coinbase daily candles, or Kraken weekly closes interpolated to daily (the default, and the interpolation is disclosed on the site). Comparisons: Yahoo Finance (^SP500TR, GC=F), FRED for CPI, ECB reference rates for currency display. Every source and cache window is listed at /methodology.

**"Why should I trust your numbers?"**
Don't trust, verify — the code is MIT on GitHub, the math lives in one pure, tested TypeScript file (`src/utils/dca.ts`), and /methodology documents every formula including the limitations (no taxes, no spreads, one price per day, interpolated default series). If you find an error, file an issue; wrong numbers get fixed, not defended.

**"Does it shill anything?"**
It never recommends buying Bitcoin, and it deliberately shows losing scenarios (drawdowns, losing projection paths, the windows where lump sum beat DCA and vice versa). Full disclosure on how it's funded: a few cookieless ad slots from A-ADS (a Bitcoin ad network — no cookies, no profile, no cross-site tracking), some labeled affiliate links, one clearly-marked sponsored section for GoMining on the mining page that leads with warnings rather than an endorsement, and donation addresses. No paid rankings, and the fee-comparison numbers are sourced, not sponsored.

**"Why no altcoins?"**
Scope, mostly honestly held: it's a Bitcoin site and the /about page says "no shitcoin products, ever". Practically, the data problem is also real — reliable long-run daily history exists for BTC in a way it doesn't for most of the 2014–2017 altcoin era, and this site's whole premise is refusing to fabricate prices. Forking it for another asset is allowed by the license; that fork just won't be this site.

**"Is it tracking me?"**
No accounts, no email, no fingerprinting. Vercel Analytics runs cookieless and aggregate (page views, referrers, coarse geography). A Google Ads conversion tag exists to measure the site's own ads and loads only after you accept the consent banner; declining means it never loads, and consent can be withdrawn from the footer. Cost-basis entries and preferences live in localStorage and never reach the server. Details at /privacy.

**"Kraken data is interpolated? So the numbers are fake?"**
The default Kraken series is weekly closes linearly filled to daily, which smooths intra-week volatility — that's an estimate between two real closes, not a fabricated price, and the site says so rather than hiding it. Switch the source to Coinbase for real daily candles from 2015 onward. Pages whose conclusions depend on daily structure (like the weekday study) detect which series they actually got and disclose it.

**"DCA is suboptimal, lump sum wins."**
Historically true more often than not, and the site says so — /lump-sum-vs-dca runs every start month since 2010 and shows lump sum winning most windows, along with the worst windows where it badly lost. "Better on average" and "better for you" are different questions, and most people never have the lump sum in the first place.

**"Why did you build this / what's the catch?"**
There's no catch to find: no signup funnel, no newsletter, no token. The site covers costs with the cookieless ads, affiliate links, and donations disclosed above. The code being MIT means anyone can self-host it without any of that.

**If someone finds a real error:**
Say thank you, confirm it publicly, fix it, and link the commit. That response is worth more than the launch post.
