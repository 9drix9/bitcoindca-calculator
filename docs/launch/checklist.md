# Pre-launch checklist

Work through this top to bottom before posting anything. The drafts in this folder
assume every box is checked.

## Product verification (claims in the drafts must be true on launch day)

- [ ] **/developers API is live.** Open https://btcdollarcostaverage.com/developers in a private window, call each documented endpoint, and confirm the docs match reality. If it is not live: pick Show HN title option 2 or 3, delete the API paragraph from the HN body, and remove the API line from README.md.
- [ ] **README screenshots.** Take 2–3 screenshots (calculator with a completed backtest, start-date heatmap, embed or share card), put them in `docs/screenshots/`, and replace the placeholder section in README.md. Delete the `OWNER TODO` comment while you're in there.
- [ ] **Consent flow works end to end.** In a fresh private window: banner appears; "Essential Only" → confirm no Google tag ever loads (Network tab, filter `googletagmanager`) and no cookie is set; accept → tag loads and a `_gcl_au` cookie and a `_gcl_ls` localStorage entry appear; withdraw from the footer control → banner returns, a denied consent update is pushed, and both of those are gone. This is claimed in the Reddit post and on /privacy, so it has to be literally true.
- [ ] **/privacy is literally true on the deployed build.** It makes dated claims, so re-run the checks behind them and only then move `CHECKED_ON` in `src/app/privacy/page.tsx`:
  - Open `/?amount=1234` with the Network tab open. The POST to `/_vercel/insights/view` must carry an address with nothing after the path: no `amount`, no dates. Same for `/_vercel/speed-insights/vitals` after you switch tabs.
  - In DevTools, Application, Cache Storage: load `/?amount=1234` and reload it once (in a fresh profile the first load only installs the worker and stores nothing). The pages cache must then hold `/` with no query string. After opening a `/share?...` link it must hold no entry for that link. /privacy says which pages are stored with their settings (the FIRE and drawdown calculators), that a shared link is never stored, and that the rest are stored under their path alone.
  - On the home page with the Network tab open, the requests to `/api/live/ticker` and `/api/live/sidebar` must have no query string, no `Referer` header and no `Cookie` header. /privacy says they carry no page address and no cookies.
  - Open the home page in Chrome from a typed address and do not scroll. Count the requests to `acceptable.a-ads.com`. /privacy says the frames do not wait to be scrolled to and that Chrome requested every one on a direct visit; the check behind that sentence was run on the build before this release, so run it again on the deployed one and reword if Chrome now waits.
  - `curl -sD- 'https://acceptable.a-ads.com/2426249/?size=Adaptive'` must show no `Set-Cookie` header and no `<script>` tag, and still load its font from `fonts.googleapis.com`. If any of the three has changed, rewrite the A-ADS paragraph before launch.
  - After "Accept All", the Google requests go to the hosts /privacy lists. If a new host appears, add it.
  - Ad slots are still on the home page only. /privacy says so with a date.
- [ ] **A shared link's preview reaches apps that read only the page head.** `curl -s -A 'Amethyst/1.05.1' 'https://btcdollarcostaverage.com/share?amount=75&frequency=weekly&startDate=2022-05-05&fee=0.3'` must show `og:title` before `</head>`. The fix only takes effect in the Vercel build.
- [ ] **Dated notes are still current.** /self-custody carries a Ledger note dated 12 October 2026 (`LEDGER_NOTE_AS_OF`). If the release ships on a later UTC day, re-read Ledger's own channels first, then move the date.
- [ ] **/api/health is all green.** Every provider up. If one is degraded, know why before launch day — HN will find the broken widget within minutes.
- [ ] **Spot-check the numbers quoted in the drafts.** Open /best-day-to-buy-bitcoin and confirm the figures still match the HN draft: seven plans "about 6%" apart, "about 64%" of each plan's bitcoin from its first ten buys, and a week-by-week gap of "about a quarter of one percent" (0.24% when read on 2026-10-12) over "about 585 weeks" that is inside the margin of error. Open /lump-sum-vs-dca and confirm it still shows lump sum winning most windows (claimed in the Reddit cheat sheet).
- [ ] **Two claims in the drafts are about other sites and nobody has checked them.** "Most DCA calculators quietly backfill missing history" (HN body) and "not the index level most sites use" (r/Bitcoin body). Check each against real examples you can name if asked, or cut it.
- [ ] **`npm test` and `npm run build` pass on main.** Deploy the exact commit you tested.
- [ ] **GitHub repo is presentable.** Description and topics set, homepage set to https://btcdollarcostaverage.com, LICENSE visible, no stray files in the root, issues enabled so "file an issue" in the drafts isn't an empty promise. When checked on 2026-10-12 the repo had no description and no topics, and its homepage field pointed at bitcoindca-calculator.vercel.app.
- [ ] **Mobile pass.** A large share of Reddit traffic is mobile. Load the homepage and one calculator on a real phone.

## Timing

- [ ] **HN: weekday morning, US time.** Tuesday–Thursday, roughly 8–11am Eastern, is the conventional window; avoid US holidays and days dominated by a huge news story. If the post doesn't take off, HN allows a repost after some days — do not delete-and-repost the same day.
- [ ] **Do not cross-post the same day.** HN first. Reddit posts go out on later days, and the two subreddits on different days from each other. Simultaneous posts everywhere reads as a campaign, splits your attention, and means you can't apply feedback from one audience before facing the next.
- [ ] **Only launch on a day you can be present.** Block half a day. The first two hours of comments decide how the thread goes.

## Conduct (this part is the launch)

- [ ] **Engage every comment honestly.** Answer the hostile ones with the most care. If someone finds a real bug or a wrong number: thank them publicly, confirm it, fix it, link the commit in a reply. That thread becomes your best marketing.
- [ ] **Do not astroturf. At all.** One authentic post per venue, from your own account, in your own voice. No asking friends, group chats, or anyone else to upvote or comment — HN's voting-ring detection kills submissions for this, and Reddit bans for it. No sockpuppets, no fake "wow great tool" comments, no reposting from alt accounts. If a post flops, let it flop; the site and repo remain.
- [ ] **Disclose that it's your project** in every post and comment where it isn't obvious. "I built this" is the strongest opening line you have anyway.
- [ ] **Don't promise what isn't built.** If someone asks for a feature, "good idea, filed an issue" beats "coming soon".

## After launch

- [ ] Watch /api/health during the traffic spike; upstream rate limits are the most likely failure.
- [ ] Triage GitHub issues that arrive from the threads within a day or two while goodwill is fresh.
- [ ] Note real corrections on the /methodology changelog — the site's credibility ratchet only works if it keeps ratcheting.
