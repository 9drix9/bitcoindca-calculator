import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NAV_HIDDEN_QUERY } from './useBottomNavGone';

/**
 * globals.css and the app-shell components make promises to each other that
 * nothing else enforces: a media query written twice, a CSS variable published
 * by a hook and consumed by a rule, a contrast ratio quoted in a comment. These
 * tests read the stylesheet as text and hold it to them.
 */
const globalsCss = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8');
const layoutSource = readFileSync(fileURLToPath(new URL('../app/layout.tsx', import.meta.url)), 'utf8');
const tailwindTheme = readFileSync(fileURLToPath(new URL('../../node_modules/tailwindcss/theme.css', import.meta.url)), 'utf8');
const source = (fromSrc: string): string => readFileSync(fileURLToPath(new URL(`../${fromSrc}`, import.meta.url)), 'utf8');

// ── Colour maths ─────────────────────────────────────────────────────────────

type Rgb = [number, number, number];

/** A Tailwind palette entry (declared in OKLCH) as the 8-bit sRGB a browser paints. */
function tailwindColor(name: string): Rgb {
    const m = tailwindTheme.match(new RegExp(`--color-${name}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`));
    if (!m) throw new Error(`Tailwind theme has no --color-${name}`);
    const L = Number(m[1]) / 100;
    const C = Number(m[2]);
    const h = (Number(m[3]) * Math.PI) / 180;
    const a = C * Math.cos(h);
    const b = C * Math.sin(h);
    // OKLab -> linear sRGB (Björn Ottosson's reference matrices).
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const linear = [
        4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
    ];
    return linear.map((c) => {
        const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
        return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
    }) as Rgb;
}

function hexColor(hex: string): Rgb {
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(rgb: Rgb): number {
    const [r, g, b] = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

const WHITE: Rgb = [255, 255, 255];
/** Light surfaces muted text is known to sit on. */
const PANEL_SURFACES = ['slate-100', 'rose-50', 'violet-50', 'slate-50'];

describe('muted text contrast in the light theme', () => {
    const override = globalsCss.match(/:root:not\(\.dark\)\s*\{\s*--color-slate-500:\s*(#[0-9a-f]{6});/i);

    it('documents the defect: stock slate-500 fails AA on slate-100 panels', () => {
        const stock = tailwindColor('slate-500');
        expect(contrast(stock, tailwindColor('slate-100'))).toBeLessThan(4.5);
        expect(contrast(stock, tailwindColor('slate-100'))).toBeCloseTo(4.35, 1);
        // ...while passing on the two surfaces it had been validated against.
        expect(contrast(stock, WHITE)).toBeGreaterThan(4.5);
        expect(contrast(stock, tailwindColor('slate-50'))).toBeGreaterThan(4.5);
    });

    it('overrides slate-500 for the light theme only', () => {
        expect(override).not.toBeNull();
        // The dark theme must keep Tailwind's value: no other rule may set the token.
        expect(globalsCss.match(/--color-slate-500\s*:/g)).toHaveLength(1);
    });

    it('clears 4.5:1 on every panel surface, with room for rounding', () => {
        const muted = hexColor(override![1]);
        for (const surface of PANEL_SURFACES) {
            expect(contrast(muted, tailwindColor(surface)), `slate-500 on ${surface}`).toBeGreaterThanOrEqual(4.6);
        }
        expect(contrast(muted, WHITE)).toBeGreaterThanOrEqual(4.6);
    });

    it('says where the lifted value still fails, and that slate-600 is the colour for those surfaces', () => {
        // The override is not a licence to put slate-500 on any light surface.
        // globals.css names the ones it does not reach; these are the figures
        // it quotes, so a change to the token has to revisit the note.
        const muted = hexColor(override![1]);
        const on = (surface: string) => contrast(muted, tailwindColor(surface)).toFixed(2);
        expect(on('slate-200')).toBe('4.15');
        expect(on('blue-100')).toBe('4.20');
        expect(on('red-100')).toBe('4.20');
        expect(on('rose-100')).toBe('4.27');
        expect(globalsCss).toContain(`${on('slate-200')}:1`);

        const slate600 = tailwindColor('slate-600');
        const onSlate100 = contrast(slate600, tailwindColor('slate-100')).toFixed(2);
        const onSlate200 = contrast(slate600, tailwindColor('slate-200')).toFixed(2);
        expect(Number(onSlate200)).toBeGreaterThanOrEqual(4.5);
        expect(globalsCss).toContain(`${onSlate100}:1 on slate-100, ${onSlate200}:1 on slate-200`);
    });

    it('stays within a few 8-bit steps of the stock colour, so the design does not visibly change', () => {
        const muted = hexColor(override![1]);
        const stock = tailwindColor('slate-500');
        muted.forEach((channel, i) => {
            expect(Math.abs(channel - stock[i])).toBeLessThanOrEqual(6);
            // Darker, never lighter: lighter would make the ratios worse.
            expect(channel).toBeLessThanOrEqual(stock[i]);
        });
    });
});

describe('touch targets', () => {
    it('sets the 44px button floor for narrow screens and for coarse pointers, in the base layer', () => {
        // Components restate the floor with `max-sm:` and `pointer-coarse:`
        // utilities and rely on this rule for every plain <button>. Outside
        // @layer base it would outrank those utilities.
        const floor = globalsCss.match(/@layer base \{\s*@media \(max-width: 640px\), \(pointer: coarse\) \{([\s\S]*?)\n {2}\}\n\}/)?.[1] ?? '';
        expect(floor).toMatch(/button\s*\{\s*min-height:\s*44px;/);
        expect(floor).toMatch(/details > summary\s*\{\s*min-height:\s*48px;/);
    });
});

describe('bottom overlay clearance', () => {
    it('hides the tab bar under the same media query useBottomNavGone watches', () => {
        // If these drift, the cookie banner and install prompt keep a 76px gap
        // for a tab bar that CSS has already hidden (or sit on top of one that
        // it has not).
        expect(globalsCss).toContain(`@media ${NAV_HIDDEN_QUERY} {`);
    });

    it('adds the published overlay height to scroll-padding at every width', () => {
        const rules = [...globalsCss.matchAll(/scroll-padding-bottom:\s*([^;]+);/g)].map((m) => m[1]);
        // Every width, phones, and phone landscape.
        expect(rules).toHaveLength(3);
        for (const value of rules) expect(value).toContain('var(--bottom-overlay-h, 0px)');
    });

    it('shows the header Menu button exactly where it hides the tab bar', () => {
        // .nav-hidden-only wraps the only way to the menu once the tab bar is
        // gone. Hidden by default, shown inside the block that hides the bar:
        // one cannot change without the other.
        const start = globalsCss.indexOf(`@media ${NAV_HIDDEN_QUERY} {`);
        const end = globalsCss.indexOf('\n}', start);
        const landscape = globalsCss.slice(start, end);
        const elsewhere = globalsCss.slice(0, start) + globalsCss.slice(end);
        expect(landscape).toMatch(/nav\[aria-label='Main navigation'\]\.fixed\s*\{\s*display:\s*none;/);
        expect(landscape).toMatch(/\.nav-hidden-only\s*\{\s*display:\s*block;/);
        expect(elsewhere).toMatch(/\n\.nav-hidden-only\s*\{\s*display:\s*none;/);
        expect(elsewhere).not.toMatch(/\.nav-hidden-only\s*\{\s*display:\s*block;/);

        const header = source('components/nav/ResponsiveNav.tsx');
        expect(header).toMatch(/className="nav-hidden-only">\s*<button[^>]*aria-controls="mobile-menu-drawer"/);
        expect(source('components/nav/MobileMenuDrawer.tsx')).toMatch(/className="nav-hidden-only[ "]/);
    });

    it('stops clearing the tab bar and the header in phone landscape, where neither is fixed', () => {
        // That block hides the tab bar and un-sticks the header. If the scroll
        // padding for them stays, a 320px-high screen gives 160px of it to
        // chrome that is not on screen.
        const start = globalsCss.indexOf(`@media ${NAV_HIDDEN_QUERY} {`);
        expect(start).toBeGreaterThan(-1);
        // The block runs to the first closing brace in column 0.
        const landscape = globalsCss.slice(start, globalsCss.indexOf('\n}', start));
        expect(landscape).toMatch(/nav\[aria-label='Main navigation'\]\.fixed\s*\{\s*display:\s*none;/);
        expect(landscape).toMatch(/header\.sticky\s*\{\s*position:\s*static;/);

        const html = landscape.match(/\n\s*html\s*\{([^}]*)\}/)?.[1] ?? '';
        const bottom = html.match(/scroll-padding-bottom:\s*([^;]+);/)?.[1] ?? '';
        expect(bottom).toContain('var(--bottom-overlay-h, 0px)');
        expect(bottom).not.toContain('--bottom-nav-h');
        // Less than the 5rem that clears the sticky header everywhere else.
        const top = html.match(/scroll-padding-top:\s*([\d.]+)rem;/)?.[1];
        expect(top).toBeDefined();
        expect(Number(top)).toBeLessThan(5);
    });

    it('adds it to the footer clearance wherever the footer sets one', () => {
        const footerRules = [...globalsCss.matchAll(/#site-footer\s*\{([^}]*)\}/g)].map((m) => m[1]);
        expect(footerRules.length).toBeGreaterThanOrEqual(3);
        for (const body of footerRules) expect(body).toContain('var(--bottom-overlay-h, 0px)');
    });
});

describe('sideways overflow guard', () => {
    const shell = globalsCss.match(/\n\.app-shell\s*\{([^}]*)\}/)?.[1] ?? '';

    it('clips the app shell, not the root element', () => {
        expect(shell).toMatch(/overflow-x:\s*clip;/);
        expect(layoutSource).toMatch(/<div className="app-shell[ "]/);
        // On html or body it breaks scroll-to-top on every client-side navigation.
        expect(globalsCss).not.toMatch(/(?:^|\n)\s*(?:html|body)\s*\{[^}]*overflow-x/);
    });

    it('makes the shell a containing block, so absolutely positioned strays are clipped too', () => {
        // Without it an `sr-only` label inside a wide scrolling table is clipped
        // by nothing: it widens the document, and on a phone that stretches the
        // layout viewport, pushes the fixed tab bar and cookie banner off screen
        // and trips the keyboard detection that unmounts the tab bar.
        expect(shell).toMatch(/position:\s*relative;/);
    });
});

describe('hooks other components find the bottom chrome by', () => {
    // DockedResult (the calculator's docked answer on phones) works out what is
    // fixed to the bottom of the screen with the selector
    // `nav[aria-label="Main navigation"], [data-bottom-overlay]`, and measures
    // again whenever <html style> changes. Nothing else ties that selector to
    // the components below: rename a hook here and the bar keeps working but
    // stops clearing that element.
    it('keeps the tab bar a nav labelled "Main navigation" that is hidden from md up', () => {
        const tabBar = source('components/nav/MobileBottomNav.tsx');
        expect(tabBar).toMatch(/<nav\s[^>]*aria-label="Main navigation"/);
        expect(tabBar).toMatch(/className="[^"]*\bfixed bottom-0\b[^"]*\bmd:hidden\b/);
    });

    it('marks the cookie banner and the install prompt with data-bottom-overlay', () => {
        for (const file of ['components/CookieConsent.tsx', 'components/PwaInstallPrompt.tsx']) {
            expect(source(file), file).toMatch(/^\s*data-bottom-overlay$/m);
        }
        // The same attribute is what the short-viewport rule hides.
        expect(globalsCss).toMatch(/\[data-bottom-overlay\]\s*\{\s*display:\s*none;/);
    });

    it('publishes the overlay height as an inline style on <html>', () => {
        const hook = source('hooks/useBottomOverlayHeight.ts');
        expect(hook).toMatch(/document\.documentElement/);
        expect(hook).toMatch(/\.style\.setProperty\('--bottom-overlay-h'/);
        expect(hook).toMatch(/\.style\.removeProperty\('--bottom-overlay-h'\)/);
    });
});

describe('root layout', () => {
    it('leaves theme-color to the bootstrap script', () => {
        // A themeColor in the viewport export makes Next emit media-queried metas
        // on every page and in every navigation payload. They follow the OS, and
        // they would sit alongside the script-owned tag that follows the toggle.
        expect(layoutSource).not.toMatch(/themeColor\s*:/);
        expect(layoutSource).toContain('THEME_BOOTSTRAP_SCRIPT');
    });

    it('has no h4: footer column titles follow the page\'s h2s without skipping a level', () => {
        expect(layoutSource).not.toMatch(/<h4[\s>]/);
        expect(layoutSource.match(/<h2 className=\{footerHeading\}>/g)).toHaveLength(4);
    });
});
