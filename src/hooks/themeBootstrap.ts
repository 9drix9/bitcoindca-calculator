/**
 * Theme constants shared by the pre-paint script in the root layout and by
 * ThemeToggle, so the two cannot disagree about the storage key or the colours.
 */
export const THEME_KEY = 'theme-preference';

/** Browser-chrome colour per theme: the page surface (slate-50 / slate-950). */
export const THEME_COLOR = { light: '#f8fafc', dark: '#020617' } as const;

/**
 * Inline <head> script. Runs before first paint, so it is plain ES5 in a string.
 *
 * 1. Decides the theme. Storage is read in its own try: with site data blocked
 *    the read throws, and the OS preference must still apply. In one try with
 *    the media query, an OS-dark visitor would get a white flash on every page.
 *    Anything other than an explicit 'light' or 'dark' follows the OS, which is
 *    also how ThemeToggle reads an unrecognised value.
 *
 * 2. Owns <meta name="theme-color">. Next's `viewport.themeColor` can only
 *    emit media-queried metas, which follow the OS and nothing else: pick dark
 *    in the app on a light phone and the address bar stays light. Mutating
 *    those tags does not hold either, because every client-side navigation
 *    re-ships them in the RSC payload and React re-creates them. So Next emits
 *    none, and this script creates a single tag that React does not know
 *    about. It mirrors the `dark` class on <html>, which every theme change
 *    goes through (the toggle, an OS change, the /embed override), so no other
 *    code has to remember to update it.
 */
export const THEME_BOOTSTRAP_SCRIPT = `
(function(){
  var root = document.documentElement, stored = null, dark = false;
  try { stored = localStorage.getItem('${THEME_KEY}'); } catch (e) {}
  try {
    dark = stored === 'dark' || (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch (e) {}
  if (dark) root.classList.add('dark');
  try {
    var meta = document.createElement('meta');
    meta.name = 'theme-color';
    var sync = function(){
      meta.content = root.classList.contains('dark') ? '${THEME_COLOR.dark}' : '${THEME_COLOR.light}';
      if (!meta.parentNode) document.head.appendChild(meta);
    };
    sync();
    new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['class'] });
  } catch (e) {}
})();
`;
