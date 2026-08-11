# Show HN draft

> **Status: DRAFT — do not post until the pre-launch checklist (docs/launch/checklist.md) is done.**
> Owner posts this personally. One post, no vote soliciting, reply to every comment.

## Title options (pick one)

1. `Show HN: Open-source Bitcoin DCA backtester with real 2010+ data and a free API`
2. `Show HN: A Bitcoin DCA backtester that refuses to fabricate prices`
3. `Show HN: Backtest Bitcoin DCA against real data back to $0.07 (open source)`

*Note on option 1: only use it if the /developers API is live and verified. Options 2 and 3 work either way.*

## URL

`https://btcdollarcostaverage.com` (repo: `https://github.com/9drix9/bitcoindca-calculator`)

## Body

I built a Bitcoin dollar-cost-averaging backtester and open-sourced it (MIT). You pick an amount, a schedule, and a date range; it tells you what you'd have, with money-weighted annualized return (XIRR), max drawdown, and comparisons against S&P 500 total return, gold, and CPI. Simulations go back to August 2010, when Bitcoin was about $0.07. No accounts, no email, and it never predicts a price.

The interesting problems turned out to be data honesty rather than math.

**Refusing to fabricate prices.** Most DCA calculators quietly backfill missing history. The engine here returns "no price" for any date before the first known bar, and no price means no purchase. The alternative sounds harmless until you try it: pricing a 2009 start date at the earliest known bar (2010-08-18, ~$0.07) buys 18 months of Bitcoin that never traded at that price and conjures billions out of a few thousand dollars. Pre-exchange history (Aug 2010 to Jul 2015) is a bundled static snapshot of real blockchain.info daily closes, stitched to meet Coinbase's first BTC-USD daily candle (2015-07-20) with no gap. An earlier version had a 19-day fabricated seam between the two; closing it with real closes was one of those fixes nobody would ever have noticed and I'm glad I made anyway.

**The "best day to buy" page is my favorite failure.** I ran seven identical weekly schedules, one per weekday, over the full history, and got a ~6% spread between the best and worst weekday. Publishable! Except the ranking wasn't measuring weekdays. Seven weekdays can't share a start date, so the seven schedules necessarily start on seven consecutive days in August 2010, and about 64% of every schedule's final BTC comes from its first ten buys, made when Bitcoin was quoted in whole cents. At $0.06 vs $0.07, one cent of rounding is a 16.7% swing — bigger than the entire spread I was reporting. The column was ranking start dates wearing a weekday costume. The page still exists, but it now computes and publishes that concentration figure next to the table and tells you the spread is noise, because the honest answer to "which weekday is best" is that the data can't tell you.

**Other things that were harder than expected:**

- *UTC bucketing.* Exchange candles are UTC-aligned. Doing schedule math in local time shifts every purchase date by a day for anyone west of Greenwich, and "today" computed locally made the default view label money already spent as "Projected". Every date in the app now goes through one UTC helper module.
- *XIRR terminal-flow dating.* XIRR is Newton's method with a bisection fallback, which is the easy part. The subtle bug: when the live spot quote fails, the portfolio is valued at the last known bar, and the terminal cash flow has to be dated at that bar too. Dating it "today" annualizes over days that contributed no price movement.
- *A Next.js caching footgun.* Nine pages declared `revalidate = 86400` and told readers their figures refresh daily. They actually regenerated every 60 seconds, because Next lowers a route's revalidation to the smallest revalidate of any fetch it makes, and the shared price fetch declared 60. If you use ISR with shared data fetchers, check your build output, not your route config.

The default Kraken series is weekly closes interpolated to daily, and the site says so; pages whose conclusions depend on real daily structure detect which series they actually received and disclose it. The full methodology, including limitations (no taxes, no spreads, one price per day), is at /methodology.

There's also a free JSON API (/developers) exposing the same price history and DCA math the site uses, and an embeddable result-card iframe that loads no third-party scripts.

Feedback I'd genuinely value: holes in the methodology, XIRR edge cases I haven't hit, better sources for 2010–2013 daily prices, and whether the API shape is useful for anything you'd actually build.

<!-- OWNER NOTES, not part of the post:
- The ~6%, ~64%, first-ten-buys, and 16.7% figures were exact at the time of the
  fix (commit d954bf5: 6.22% spread, 64% from first 10 buys, $1,000 of $83,300).
  The page recomputes daily, so the post says "about". Before posting, open
  /best-day-to-buy-bitcoin and sanity-check the current numbers still match the
  ballpark.
- Delete the API paragraph if /developers is not live on launch day.
- HN convention: text posts for Show HN can include the URL in the text; if you
  submit as a link post, put this body in the first comment. -->
