/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Single source of truth for every rasterised brand asset.
 *
 * Run with:  node scripts/generate-icons.js
 *
 * The geometry here MUST stay in sync with src/components/brand/Logo.tsx — that
 * component is the source for in-app rendering, this script is the source for
 * everything the OS and the browser chrome consume. If you change the mark,
 * change both and re-run this script.
 *
 * Emits:
 *   src/app/favicon.ico     16/32/48 multi-frame ICO  (App Router serves this one)
 *   src/app/icon.svg        vector favicon (App Router emits the <link> for it)
 *   public/icon-192.png     PWA icon
 *   public/icon-512.png     PWA icon
 *   public/apple-touch-icon.png
 *   public/icon-192.svg     vector fallbacks referenced by manifest.json
 *   public/icon-512.svg
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const APP_DIR = path.join(__dirname, '..', 'src', 'app');

const AMBER = '#f59e0b';
const TILE_BG = '#0f172a'; // slate-900 — tiles are full-bleed, so they need a field

// ── Geometry (mirrors src/components/brand/Logo.tsx) ─────────────────────────

/**
 * The Ð monogram — a heavy geometric D (for DCA) with the ₿'s crown-and-tail
 * stubs. Single path, DEFAULT (nonzero) winding: the counter subpath winds
 * opposite to the outer, so no fill-rule attribute is needed and the same
 * geometry rasterises identically in sharp, browsers, and OG images.
 * Keep in sync with src/components/brand/Logo.tsx.
 */
const PATH_FULL = [
    'M4 3.5 A1.5 1.5 0 0 1 5.5 2 H11 A10 10 0 0 1 11 22 H5.5 A1.5 1.5 0 0 1 4 20.5 Z',
    'M8.6 6.6 V17.4 H11 A5.4 5.4 0 0 0 11 6.6 Z',
    'M9.2 0 H11.7 V2 H9.2 Z',
    'M9.2 22 H11.7 V24 H9.2 Z',
].join(' ');

// The monogram scales cleanly; the 16px favicon uses the same geometry rendered
// at high density rather than a hand-snapped lattice.
const PATH_ICON16 = PATH_FULL;
const ICON16_BOX = 24;

// ── SVG builders ─────────────────────────────────────────────────────────────

/** Bare mark on transparent — browser chrome, where the surface is unknown. */
const markSvg = (d, box, color = AMBER) =>
    Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${box}" height="${box}" fill="${color}"><path d="${d}"/></svg>`,
    );

/**
 * Full-bleed tile — home screens and app launchers crop to their own shape and
 * apply no padding, so the mark is inset to a safe area and sits on a field.
 */
const tileSvg = (size, radius) => {
    const inset = size * 0.22;
    const inner = size - inset * 2;
    const scale = inner / 24;
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
            `<rect width="${size}" height="${size}" rx="${radius}" fill="${TILE_BG}"/>` +
            `<g transform="translate(${inset} ${inset}) scale(${scale})" fill="${AMBER}">` +
            `<path d="${PATH_FULL}"/></g></svg>`,
    );
};

// ── ICO container ────────────────────────────────────────────────────────────

/**
 * Assemble PNG frames into an .ico. sharp cannot write ICO, and the format is
 * trivial: a 6-byte directory header, one 16-byte entry per frame, then the PNG
 * payloads. PNG-in-ICO is understood by every browser from Vista onward.
 */
function buildIco(frames) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(frames.length, 4);

    let offset = 6 + frames.length * 16;
    const entries = frames.map(({ size, data }) => {
        const e = Buffer.alloc(16);
        e.writeUInt8(size >= 256 ? 0 : size, 0); // width  (0 means 256)
        e.writeUInt8(size >= 256 ? 0 : size, 1); // height
        e.writeUInt8(0, 2); // palette size
        e.writeUInt8(0, 3); // reserved
        e.writeUInt16LE(1, 4); // colour planes
        e.writeUInt16LE(32, 6); // bits per pixel
        e.writeUInt32LE(data.length, 8);
        e.writeUInt32LE(offset, 12);
        offset += data.length;
        return e;
    });

    return Buffer.concat([header, ...entries, ...frames.map((f) => f.data)]);
}

// ── Build ────────────────────────────────────────────────────────────────────

async function main() {
    // Favicon frames. 16px uses the pixel-snapped lattice; 32 and 48 have room
    // for the rails, so they carry the full mark.
    const frames = await Promise.all(
        [
            { size: 16, svg: markSvg(PATH_ICON16, ICON16_BOX) },
            { size: 32, svg: markSvg(PATH_FULL, 24) },
            { size: 48, svg: markSvg(PATH_FULL, 24) },
        ].map(async ({ size, svg }) => ({
            size,
            data: await sharp(svg, { density: 1200 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer(),
        })),
    );

    fs.writeFileSync(path.join(APP_DIR, 'favicon.ico'), buildIco(frames));
    console.log('Generated: src/app/favicon.ico (16/32/48)');

    // src/app/icon.svg — the App Router emits
    //   <link rel="icon" href="/icon.svg?<hash>" type="image/svg+xml" sizes="any">
    // for it, alongside the favicon.ico link. Same bare mark as the ICO frames,
    // but vector: crisp at any DPI, and Chrome/Firefox prefer it over the .ico.
    // Its hashed URL is also distinct from favicon.ico's, which matters because
    // Chrome pins favicons in a cache that survives normal reloads — a browser
    // that had the pre-rebrand mark stuck in a tab fetches this fresh.
    fs.writeFileSync(path.join(APP_DIR, 'icon.svg'), markSvg(PATH_FULL, 24).toString());
    console.log('Generated: src/app/icon.svg');

    // public/favicon.ico was a PNG wearing an .ico extension, and it shadowed
    // nothing because the App Router serves src/app/favicon.ico. Remove it so
    // there is exactly one favicon in the repo.
    const strayFavicon = path.join(PUBLIC_DIR, 'favicon.ico');
    if (fs.existsSync(strayFavicon)) {
        fs.unlinkSync(strayFavicon);
        console.log('Removed:   public/favicon.ico (stray PNG, never served)');
    }

    const tiles = [
        { name: 'apple-touch-icon.png', size: 180, radius: 0 }, // iOS applies its own mask
        { name: 'icon-192.png', size: 192, radius: 40 },
        { name: 'icon-512.png', size: 512, radius: 108 },
    ];

    for (const { name, size, radius } of tiles) {
        await sharp(tileSvg(size, radius), { density: 1200 })
            .resize(size, size)
            .png({ compressionLevel: 9 })
            .toFile(path.join(PUBLIC_DIR, name));
        console.log(`Generated: public/${name} (${size}x${size})`);
    }

    // Maskable icon for Android. The launcher crops this to its own shape
    // (circle, squircle, teardrop…), so the mark must sit inside the safe zone:
    // a circle of 80% diameter. A non-maskable icon supplied here gets shrunk
    // into a white blob, which is what Android was doing before.
    const MASKABLE = 512;
    const maskInset = MASKABLE * 0.29; // well inside the 80% safe circle
    const maskScale = (MASKABLE - maskInset * 2) / 24;
    await sharp(
        Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${MASKABLE}" height="${MASKABLE}" viewBox="0 0 ${MASKABLE} ${MASKABLE}">` +
                `<rect width="${MASKABLE}" height="${MASKABLE}" fill="${TILE_BG}"/>` +
                `<g transform="translate(${maskInset} ${maskInset}) scale(${maskScale})" fill="${AMBER}">` +
                `<path d="${PATH_FULL}"/></g></svg>`,
        ),
        { density: 1200 },
    )
        .resize(MASKABLE, MASKABLE)
        .png({ compressionLevel: 9 })
        .toFile(path.join(PUBLIC_DIR, 'icon-maskable-512.png'));
    console.log('Generated: public/icon-maskable-512.png (512x512, maskable safe zone)');

    for (const size of [192, 512]) {
        fs.writeFileSync(
            path.join(PUBLIC_DIR, `icon-${size}.svg`),
            tileSvg(size, Math.round(size * 0.21)).toString(),
        );
        console.log(`Generated: public/icon-${size}.svg`);
    }

    console.log('\nIcon generation complete.');
    console.log('REMINDER: bump CACHE_VERSION in public/sw.js so cached icons are evicted.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
