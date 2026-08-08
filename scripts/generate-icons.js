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

const bar = ({ x, y, w, h }, r) =>
    [
        `M${x + r} ${y}`,
        `H${x + w - r}`,
        `A${r} ${r} 0 0 1 ${x + w} ${y + r}`,
        `V${y + h - r}`,
        `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
        `H${x + r}`,
        `A${r} ${r} 0 0 1 ${x} ${y + h - r}`,
        `V${y + r}`,
        `A${r} ${r} 0 0 1 ${x + r} ${y}`,
        'Z',
    ].join(' ');

const slot = ({ x, y, w, h }) => `M${x} ${y} H${x + w} V${y + h} H${x} Z`;

const COLUMNS = [
    { x: 1, y: 17, w: 4, h: 6 },
    { x: 7, y: 12, w: 4, h: 11 },
    { x: 13, y: 6, w: 4, h: 17 },
    { x: 19, y: 1, w: 4, h: 22 },
];

const SLOTS = [
    { x: 13, y: 9, w: 4, h: 2 },
    { x: 19, y: 9, w: 4, h: 2 },
    { x: 7, y: 15, w: 4, h: 2 },
    { x: 13, y: 15, w: 4, h: 2 },
    { x: 19, y: 15, w: 4, h: 2 },
];

const PATH_FULL = [...COLUMNS.map((c) => bar(c, 1.6)), ...SLOTS.map(slot)].join(' ');
const PATH_COMPACT = COLUMNS.map((c) => bar(c, 1.6)).join(' ');

/**
 * Favicon-only geometry on a 16-unit integer lattice: 3-wide columns with 1-unit
 * gaps landing on whole pixels at 16px. Downsampling the 24-unit mark instead put
 * every edge on a half pixel and turned the tab icon into grey smear.
 */
const PATH_ICON16 = [
    { x: 0, y: 11, w: 3, h: 5 },
    { x: 4, y: 8, w: 3, h: 8 },
    { x: 8, y: 4, w: 3, h: 12 },
    { x: 12, y: 0, w: 3, h: 16 },
]
    .map((c) => bar(c, 0.75))
    .join(' ');

// ── SVG builders ─────────────────────────────────────────────────────────────

/** Bare mark on transparent — browser chrome, where the surface is unknown. */
const markSvg = (d, box, color = AMBER) =>
    Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${box}" height="${box}" fill="${color}" fill-rule="evenodd"><path d="${d}"/></svg>`,
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
            `<g transform="translate(${inset} ${inset}) scale(${scale})" fill="${AMBER}" fill-rule="evenodd">` +
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
            { size: 16, svg: markSvg(PATH_ICON16, 16) },
            { size: 32, svg: markSvg(PATH_FULL, 24) },
            { size: 48, svg: markSvg(PATH_FULL, 24) },
        ].map(async ({ size, svg }) => ({
            size,
            data: await sharp(svg, { density: 1200 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer(),
        })),
    );

    fs.writeFileSync(path.join(APP_DIR, 'favicon.ico'), buildIco(frames));
    console.log('Generated: src/app/favicon.ico (16/32/48)');

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
                `<g transform="translate(${maskInset} ${maskInset}) scale(${maskScale})" fill="${AMBER}" fill-rule="evenodd">` +
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
