// One-off migration from the old WordPress site. Pulls every published post through the
// WP REST API, cleans the block-editor markup down to plain semantic HTML, downloads the
// images it references into public/img/blog/, and writes:
//   content/posts.json        metadata for every post (newest first)
//   content/posts/<slug>.html the post body
// After this, content/ is the source of truth: edit those files, then run build-pages.mjs.
// Re-run (`node scripts/import-wordpress.mjs`) only while WordPress is still live, and note
// that it overwrites content/ with whatever WordPress has.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WP = 'https://aprajeetasingh.com';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CONTENT = `${ROOT}content/`;
const IMG_DIR = `${ROOT}public/img/blog/`;
const MAX_IMAGE_WIDTH = 1600;

// WordPress category names that read better fixed; slugs stay as they were so old URLs keep working
const CATEGORY_NAMES = { obervations: 'Observations' };

const UA = { 'User-Agent': 'Mozilla/5.0 (site migration)' };

async function getJSON(path) {
    const res = await fetch(`${WP}/wp-json/wp/v2/${path}`, { headers: UA });
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    return res.json();
}

const decode = (s) => s
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&#8216;|&#8217;/g, '’').replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8230;|&hellip;/g, '…').replace(/&nbsp;/g, ' ').replace(/&#038;|&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

const text = (html) => decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/* ---------- Images ---------- */

const downloaded = new Map();

function localName(url) {
    const { pathname } = new URL(url);
    let name = decodeURIComponent(pathname.split('/').pop()).replace(/×/g, 'x');
    // Blogger serves extension-less names under a size folder; keep them unique and typed
    if (!/\.(jpe?g|png|gif|webp)$/i.test(name)) name += '.jpg';
    return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-scaled(?=\.)/, '');
}

// Photos saved as PNG (no transparency) are several times heavier than the same JPEG
function hasAlpha(file) {
    try {
        return /hasAlpha: yes/.test(execFileSync('sips', ['-g', 'hasAlpha', file], { encoding: 'utf8' }));
    } catch {
        return true;
    }
}

async function download(url) {
    if (downloaded.has(url)) return downloaded.get(url);
    let name = localName(url);
    const jpgName = name.replace(/\.png$/i, '.jpg');
    if (existsSync(`${IMG_DIR}${jpgName}`)) name = jpgName;
    const file = `${IMG_DIR}${name}`;
    if (!existsSync(file)) {
        const res = await fetch(url, { headers: UA });
        if (!res.ok) throw new Error(`${res.status} ${url}`);
        writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        // Shrink oversized photos when macOS `sips` is around; skip GIFs so animations survive
        if (!/\.gif$/i.test(name) && (imageSize(file)?.width || 0) > MAX_IMAGE_WIDTH) {
            try {
                execFileSync('sips', ['--resampleWidth', String(MAX_IMAGE_WIDTH), file], { stdio: 'ignore' });
            } catch { /* not on macOS, keep the original */ }
        }
        if (/\.png$/i.test(name) && !hasAlpha(file)) {
            try {
                execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', file, '--out', `${IMG_DIR}${jpgName}`], { stdio: 'ignore' });
                rmSync(file);
                name = jpgName;
            } catch { /* keep the PNG */ }
        }
        console.log(`  ↓ ${name}`);
    }
    const local = `/img/blog/${name}`;
    downloaded.set(url, local);
    return local;
}

function imageSize(file) {
    try {
        const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
        const [w, h] = [...out.matchAll(/pixel(?:Width|Height): (\d+)/g)].map((m) => Number(m[1]));
        return { width: w, height: h };
    } catch {
        return null;
    }
}

/* ---------- Markup cleanup ---------- */

async function clean(html) {
    let out = html
        // Grammarly leaves its own tags behind
        .replace(/<\/?gwmw[^>]*>/g, '')
        // YouTube embeds become click-to-load facades
        .replace(/<figure class="wp-block-embed[^"]*youtube[^"]*">[\s\S]*?youtube\.com\/embed\/([\w-]{11})[\s\S]*?<\/figure>/g,
            (_, id) => `<figure class="embed"><a class="yt" href="https://www.youtube.com/watch?v=${id}" data-yt="${id}" target="_blank" rel="noopener"><img src="https://i.ytimg.com/vi/${id}/maxresdefault.jpg" alt="Play video" width="1280" height="720" loading="lazy"><span class="yt__play"><i class="fa-solid fa-play" aria-hidden="true"></i></span></a></figure>`)
        .replace(/<figure class="wp-block-gallery[^"]*">/g, '<figure class="gallery">')
        .replace(/<figure class="wp-block-image[^"]*">/g, '<figure>');

    // Images: drop responsive WP attributes, localise the file, keep intrinsic size
    const imgs = [...out.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    for (const tag of imgs) {
        const src = tag.match(/\ssrc="([^"]+)"/)?.[1];
        if (!src) continue;
        if (src.includes('i.ytimg.com')) continue;
        const local = await download(src.replace(/&amp;/g, '&'));
        const alt = tag.match(/\salt="([^"]*)"/)?.[1] ?? '';
        const size = imageSize(`${ROOT}public${local}`);
        const dims = size ? ` width="${size.width}" height="${size.height}"` : '';
        out = out.replace(tag, `<img src="${local}" alt="${alt}"${dims} loading="lazy" decoding="async">`);
    }

    out = out
        // Images wrapped in a link to themselves don't need the link
        .replace(/<a href="[^"]*"[^>]*>\s*(<img [^>]+>)\s*<\/a>/g, '$1')
        // Strip WordPress attributes, keeping the ones the facades above rely on
        .replace(/ (class|style|id|data-[\w-]+)="[^"]*"/g, (m, attr) => (
            /^data-yt$/.test(attr) || /class="(embed|gallery|yt|yt__play|fa-[^"]*)"/.test(m) ? m : ''
        ))
        .replace(/href="https?:\/\/(?:www\.)?aprajeetasingh\.com(\/[^"]*)"/g, 'href="$1"')
        .replace(/<a href="(https?:\/\/[^"]+)"(?![^>]*target=)/g, '<a href="$1" target="_blank" rel="noopener"')
        .replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/g, '')
        .replace(/\n{2,}/g, '\n')
        .trim();

    return `${out}\n`;
}

/* ---------- Run ---------- */

mkdirSync(`${CONTENT}posts`, { recursive: true });
mkdirSync(IMG_DIR, { recursive: true });

const categories = new Map((await getJSON('categories?per_page=100')).map((c) => [c.id, c]));
const posts = await getJSON('posts?per_page=100&status=publish&_embed=1');
const meta = [];

for (const post of posts) {
    console.log(`→ ${post.slug}`);
    const body = await clean(post.content.rendered);
    writeFileSync(`${CONTENT}posts/${post.slug}.html`, body);

    const featured = post._embedded?.['wp:featuredmedia']?.[0];
    let image = null;
    if (featured?.source_url) {
        const src = await download(featured.source_url);
        image = { src, alt: featured.alt_text || '', ...imageSize(`${ROOT}public${src}`) };
    }

    const cats = post.categories.map((id) => categories.get(id)).filter(Boolean).map((c) => ({
        name: CATEGORY_NAMES[c.slug] || decode(c.name),
        slug: c.slug,
        parent: c.parent ? categories.get(c.parent)?.slug : null
    }));

    const excerpt = text(post.excerpt.rendered).replace(/\s*(\[…\]|…)$/, '…');
    const devanagari = (text(post.title.rendered).match(/[ऀ-ॿ]/g) || []).length;

    meta.push({
        slug: post.slug,
        title: text(post.title.rendered),
        date: post.date_gmt ? `${post.date_gmt}Z` : post.date,
        modified: post.modified_gmt ? `${post.modified_gmt}Z` : post.modified,
        lang: devanagari > 2 ? 'hi' : 'en',
        description: post.yoast_head_json?.description || excerpt,
        excerpt,
        categories: cats,
        image
    });
}

meta.sort((a, b) => b.date.localeCompare(a.date));
writeFileSync(`${CONTENT}posts.json`, `${JSON.stringify(meta, null, 4)}\n`);
console.log(`✓ ${meta.length} posts → content/`);
