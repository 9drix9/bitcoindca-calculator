# Pre-launch checklist

Work through this top to bottom before posting anything. The drafts in this folder
assume every box is checked.

## Product verification (claims in the drafts must be true on launch day)

- [ ] **/developers API is live.** Open https://btcdollarcostaverage.com/developers in a private window, call each documented endpoint, and confirm the docs match reality. If it is not live: pick Show HN title option 2 or 3, delete the API paragraph from the HN body, and remove the API line from README.md.
- [ ] **README screenshots.** Take 2–3 screenshots (calculator with a completed backtest, start-date heatmap, embed or share card), put them in `docs/screenshots/`, and replace the placeholder section in README.md. Delete the `OWNER TODO` comments while you're in there.
- [ ] **Consent flow works end to end.** In a fresh private window: banner appears; "Essential Only" → confirm no Google tag ever loads (Network tab, filter `googletagmanager`); accept → tag loads; withdraw from the footer control → banner returns and a denied consent update is pushed. This is claimed in the Reddit post and on /privacy, so it has to be literally true.
- [ ] **/api/health is all green.** Every provider up. If one is degraded, know why before launch day — HN will find the broken widget within minutes.
- [ ] **Spot-check the numbers quoted in the drafts.** Open /best-day-to-buy-bitcoin and confirm the spread and concentration figures still match the "about 6% / about 64%" ballpark in the HN draft. Open /lump-sum-vs-dca and confirm it still shows lump sum winning most windows (claimed in the Reddit cheat sheet).
- [ ] **`npm test` and `npm run build` pass on main.** Deploy the exact commit you tested.
- [ ] **GitHub repo is presentable.** Description and topics set, LICENSE visible, no stray files in the root (there is an untracked screenshot PNG in the working tree right now), issues enabled so "file an issue" in the drafts isn't an empty promise.
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
