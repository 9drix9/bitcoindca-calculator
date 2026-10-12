import { DEFAULT_PLAN } from '@/data/planDefaults';
import { DEFAULT_PRICE_PROVIDER } from '@/data/priceSources';

/**
 * Set on <html> from before first paint until the calculator has put a linked
 * plan on screen. globals.css hides `[data-plan-figure]` while it is there.
 */
export const PLAN_LINK_ATTR = 'data-plan-link';

/**
 * Inline <head> script. Runs before first paint, so it is plain ES5 in a string.
 *
 * The home page is prerendered for the default plan, and a link's settings are
 * only applied once the calculator has hydrated. Until then the HTML shows the
 * default plan's result under an address that asks for a different one: figures
 * for a plan nobody sent. This marks the document when that is about to happen,
 * and the calculator removes the mark when the linked plan is up.
 *
 * It marks only an address that asks for something the prerender does not
 * show. Campaign tags and the default plan's own settings are not that, and
 * hiding a result that is already right would blank the page for nothing.
 * Where it cannot tell (a value the calculator would reject, a default window
 * that rolled over at midnight) it marks: a result shown a moment late costs
 * less than a wrong one shown at all.
 *
 * The defaults are written into the string from the same constants the
 * prerender uses. The start date repeats utils/dates' defaultStartFor, which a
 * test holds it to; that function's floor at the first priced day is left out,
 * since it can only bind on a clock set before 2015.
 */
export const PLAN_LINK_BOOTSTRAP_SCRIPT = `
(function(){
  try {
    if (location.pathname !== '/') return;
    var query = location.search.replace(/^\\?/, '');
    if (!query) return;
    var now = new Date();
    var y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
    var iso = function(year, month, day){
      return year + '-' + (month < 9 ? '0' : '') + (month + 1) + '-' + (day < 10 ? '0' : '') + day;
    };
    var startYear = y - ${DEFAULT_PLAN.yearsBack};
    var daysInStartMonth = new Date(Date.UTC(startYear, m + 1, 0)).getUTCDate();
    var same = {
      amount: ${DEFAULT_PLAN.amount},
      fee: ${DEFAULT_PLAN.feePercentage},
      frequency: ${JSON.stringify(DEFAULT_PLAN.frequency)},
      mode: 'api',
      provider: ${JSON.stringify(DEFAULT_PRICE_PROVIDER)},
      currency: 'USD',
      startDate: iso(startYear, m, Math.min(d, daysInStartMonth)),
      endDate: iso(y, m, d)
    };
    var noDefault = { flat: 1, manualPrice: 1, startingBtc: 1, startingCost: 1, esc: 1 };
    var decode = function(s){
      try { return decodeURIComponent(s.replace(/\\+/g, ' ')); } catch (e) { return s; }
    };
    var pairs = query.split('&');
    for (var i = 0; i < pairs.length; i++) {
      var at = pairs[i].indexOf('=');
      var key = decode(at < 0 ? pairs[i] : pairs[i].slice(0, at));
      var value = at < 0 ? '' : decode(pairs[i].slice(at + 1));
      if (value === '') continue;
      var differs = false;
      if (noDefault.hasOwnProperty(key)) differs = true;
      else if (same.hasOwnProperty(key)) {
        differs = typeof same[key] === 'number' ? Number(value) !== same[key] : value !== same[key];
      }
      if (differs) {
        document.documentElement.setAttribute('${PLAN_LINK_ATTR}', '');
        return;
      }
    }
  } catch (e) {}
})();
`;
