// Builds the static site around public/index.html, the single source of truth for page chrome:
//   • the latest posts on the homepage (between the posts:latest markers)
//   • one crawlable page per homepage section (/about/, /work/, /podcast/, /contact/)
//   • the blog: /blog/, /blog/category/…/ and one page per post at its original WordPress URL
//   • feed.xml and sitemap.xml
// Edit index.html or content/, then run `node scripts/build-pages.mjs` (also runs on `firebase deploy`).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PUBLIC = `${ROOT}public/`;
const SITE = 'https://aprajeetasingh.com';
const MODIFIED = new Date().toISOString().slice(0, 10);
const LATEST_ON_HOME = 6;

const AUTHOR_BIO = 'Founder &amp; CEO of Craftcart, content marketer of 9+ years, and a writer and podcaster at “Apravyakti”.';
const SHARE_X = 'app_apra';

// Order of the "Next" links at the bottom of every page
const FLOW = [
    { slug: 'about', crumb: 'About' },
    { slug: 'work', crumb: 'What I do' },
    { slug: 'podcast', crumb: 'Podcast' },
    { slug: 'blog', crumb: 'Blog' },
    { slug: 'contact', crumb: 'Contact' }
];

const pages = [
    {
        slug: 'about',
        section: 'about',
        type: 'AboutPage',
        crumb: 'About',
        title: 'About Aprajeeta Singh | Writer, Podcaster & Creativepreneur',
        description: 'About Aprajeeta Singh: Founder & CEO of Craftcart and Aprakriti, content marketer of 9+ years, and a writer and podcaster sharing stories and poetries.',
        heading: 'About <em>Aprajeeta</em>',
        lede: 'Entrepreneur, writer and podcaster. Founder &amp; CEO of Craftcart since 2015, content marketer for brands for 9+ years, and the voice behind “Apravyakti”.'
    },
    {
        slug: 'work',
        section: 'work',
        type: 'CollectionPage',
        crumb: 'What I do',
        title: 'What I Do | Aprajeeta Singh',
        description: 'The work of Aprajeeta Singh: Craftcart handcrafted decor and gifting, Aprakriti handmade jewellery, content marketing, stories, poetries and the Apravyakti podcast.',
        heading: 'What I <em>do</em>',
        lede: 'An entrepreneur, a content marketer, a writer and a podcaster: five pursuits, held together by a love for stories.'
    },
    {
        slug: 'podcast',
        section: 'podcast',
        type: 'WebPage',
        crumb: 'Podcast',
        title: 'Apravyakti Podcast | Aprajeeta Singh',
        description: 'Apravyakti is the podcast of Aprajeeta Singh, voicing her own compositions, stories, poetries and thoughts. Listen on Spotify or join her on an episode.',
        heading: 'The <em>Apravyakti</em> podcast',
        lede: 'Compositions and thoughts, voiced exactly in the tone and with the notion they were drafted. Tune in on Spotify, or come on an episode.'
    },
    {
        slug: 'contact',
        section: 'contact',
        type: 'ContactPage',
        crumb: 'Contact',
        title: 'Contact | Aprajeeta Singh',
        description: "Like to discuss new ideas or interested in joining Aprajeeta Singh on her podcast? Get in touch and let's take this association further!",
        heading: 'Get in <em>touch</em>',
        lede: 'For any queries, ideas or podcast collaborations, send a message or reach out on whichever platform you prefer.'
    }
];

/* ---------- Helpers ---------- */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');
// Strings in the page config are already HTML-escaped where needed; attributes must not double-escape
const escAttrOnce = (s) => s.replace(/&(?!amp;|quot;|lt;|gt;|#)/g, '&amp;').replace(/"/g, '&quot;');
const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const indent = (s, n) => s.split('\n').map((line) => (line ? ' '.repeat(n) + line : line)).join('\n');
const lang = (post) => (post.lang === 'hi' ? ' lang="hi"' : '');

const dateFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' });
const fmtDate = (iso) => dateFormat.format(new Date(iso));

const between = (str, start, end, from = 0) => {
    const a = str.indexOf(start, from);
    const b = str.indexOf(end, a + start.length);
    if (a < 0 || b < 0) throw new Error(`Marker not found: ${start} … ${end}`);
    return [a, b + end.length];
};

/* ---------- Content ---------- */

const posts = JSON.parse(readFileSync(`${ROOT}content/posts.json`, 'utf8'))
    .sort((a, b) => b.date.localeCompare(a.date));
posts.forEach((post) => {
    post.body = readFileSync(`${ROOT}content/posts/${post.slug}.html`, 'utf8').trim();
    post.url = `${SITE}/blog/${post.slug}/`;
    post.words = stripTags(post.body).split(' ').filter(Boolean).length;
    post.minutes = Math.max(1, Math.round(post.words / 200));
});

const catPath = (c) => (c.parent ? `/blog/category/${c.parent}/${c.slug}/` : `/blog/category/${c.slug}/`);

const categories = [...new Map(posts.flatMap((p) => p.categories).map((c) => [c.slug, c])).values()]
    .map((c) => ({ ...c, path: catPath(c), posts: posts.filter((p) => p.categories.some((pc) => pc.slug === c.slug)) }))
    .sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name));

const CARD_COLORS = ['marigold', 'rani', 'peacock', 'lilac', 'leaf', 'tangerine'];

function card(post, { feature = false, level = 3, index = 0 } = {}) {
    const img = post.image
        ? `<img src="${post.image.src}" alt="${escAttr(post.image.alt)}" width="${post.image.width}" height="${post.image.height}" loading="lazy" decoding="async">`
        : '';
    return `<article class="post-card${feature ? ' post-card--feature' : ''}" data-reveal="pop" style="--c: var(--${CARD_COLORS[index % CARD_COLORS.length]})">
    <a href="/blog/${post.slug}/" class="post-card__link">
        <div class="post-card__media">${img}</div>
        <div class="post-card__body">
            <p class="post-card__meta"><span>${post.categories.slice(0, 2).map((c) => esc(c.name)).join(' · ')}</span><time datetime="${post.date}">${fmtDate(post.date)}</time></p>
            <h${level} class="post-card__title"${lang(post)}>${esc(post.title)}</h${level}>
            <p class="post-card__excerpt"${lang(post)}>${esc(post.excerpt)}</p>
            <span class="post-card__more">Read story <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
        </div>
    </a>
</article>`;
}

/* ---------- Homepage: latest posts ---------- */

let src = readFileSync(`${PUBLIC}index.html`, 'utf8');
{
    const open = '<!-- posts:latest (generated by scripts/build-pages.mjs from content/posts.json) -->';
    const [a, b] = between(src, open, '<!-- /posts:latest -->');
    const cards = posts.slice(0, LATEST_ON_HOME).map((p, i) => indent(card(p, { index: i }), 20)).join('\n');
    src = `${src.slice(0, a)}${open}\n${cards}\n                    <!-- /posts:latest -->${src.slice(b)}`;
    src = src.replace(/data-count="\d+" data-post-count>\d+</, `data-count="${posts.length}" data-post-count>${posts.length}<`);
    writeFileSync(`${PUBLIC}index.html`, src);
    console.log(`✓ index.html (latest ${Math.min(LATEST_ON_HOME, posts.length)} posts)`);
}

/* ---------- Shared chrome from index.html ---------- */

const [headStart, headEnd] = between(src, '<head>', '</head>');
const baseHead = src.slice(headStart, headEnd);
const [, bodyOpenEnd] = between(src, '<body>', '\n');
const [mainOpen] = between(src, '    <main id="main">', '\n');
const chrome = src.slice(bodyOpenEnd, mainOpen)
    .replace(/ *<!-- Curtain -->[\s\S]*?(?= *<!-- Header -->)/, '');
const [footerStart] = between(src, '    <!-- ============ FOOTER', '\n');
const tail = src.slice(footerStart).replace(/ aria-current="page"/g, '');

function extractSection(id) {
    const at = src.indexOf(`id="${id}"`);
    const start = src.lastIndexOf('        <section', at);
    const end = src.indexOf('</section>', at) + '</section>'.length;
    if (at < 0 || start < 0) throw new Error(`Section #${id} not found`);
    return src.slice(start, end);
}

function setMeta(head, attr, key, value) {
    const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(">)`);
    if (!re.test(head)) throw new Error(`Meta ${key} not found`);
    return head.replace(re, `$1${escAttrOnce(value)}$2`);
}

const ldScript = (graph) => {
    const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 4)
        .split('\n').map((line) => `        ${line}`).join('\n');
    return `    <script type="application/ld+json">\n${json}\n    </script>`;
};

const personRef = {
    '@type': 'Person',
    '@id': `${SITE}/#person`,
    name: 'Aprajeeta Singh',
    url: `${SITE}/`,
    jobTitle: 'Founder & CEO',
    worksFor: { '@type': 'Organization', name: 'Craftcart' }
};

const breadcrumb = (url, trail) => ({
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: [{ name: 'Home', item: `${SITE}/` }, ...trail].map((t, i) => ({ '@type': 'ListItem', position: i + 1, ...t }))
});

function makeHead({ title, description, url, image, graph, article }) {
    let head = baseHead
        .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
        .replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${url}$2`)
        .replace(/ *<meta property="profile:[^>]*>\n/g, '')
        .replace(/ *<script type="application\/ld\+json">[\s\S]*?<\/script>/, ldScript(graph));
    head = setMeta(head, 'name', 'description', description);
    head = setMeta(head, 'property', 'og:type', article ? 'article' : 'website');
    head = setMeta(head, 'property', 'og:url', url);
    head = setMeta(head, 'property', 'og:title', title);
    head = setMeta(head, 'property', 'og:description', description);
    head = setMeta(head, 'name', 'twitter:title', title);
    head = setMeta(head, 'name', 'twitter:description', description);
    if (image) {
        head = setMeta(head, 'property', 'og:image', `${SITE}${image.src}`);
        head = setMeta(head, 'property', 'og:image:width', String(image.width));
        head = setMeta(head, 'property', 'og:image:height', String(image.height));
        head = setMeta(head, 'property', 'og:image:alt', image.alt || title);
        head = setMeta(head, 'name', 'twitter:image', `${SITE}${image.src}`);
        head = setMeta(head, 'name', 'twitter:image:alt', image.alt || title);
    }
    if (article) {
        const tags = [
            `<meta property="article:published_time" content="${article.date}">`,
            `<meta property="article:modified_time" content="${article.modified}">`,
            `<meta property="article:author" content="${SITE}/about/">`,
            ...article.categories.map((c) => `<meta property="article:section" content="${escAttr(c.name)}">`)
        ].map((t) => `    ${t}`).join('\n');
        head = head
            .replace(/(<meta property="og:type" content="article">)/, `$1\n${tags}`)
            .replace(/(<meta name="keywords" content=")[^"]*(">)/, `$1${escAttr(['Aprajeeta Singh', ...article.categories.map((c) => c.name)].join(', '))}$2`);
    }
    return head;
}

// navHref marks the matching menu link; footerHref the matching footer link
function renderPage({ head, navHref, footerHref, main }) {
    const nav = navHref ? chrome.replaceAll(`href="${navHref}" `, `href="${navHref}" aria-current="page" `) : chrome;
    const footer = tail
        .replace(`<a href="${footerHref}">`, `<a href="${footerHref}" aria-current="page">`)
        .replace('href="#top" class="footer__top"', 'href="#page-top" class="footer__top"');
    return `<!DOCTYPE html>
<!-- Generated by scripts/build-pages.mjs. Edit index.html or content/, then run: node scripts/build-pages.mjs -->
<html lang="en">

${head}

<body>${nav}    <main id="main" class="page">
${main}
    </main>

${footer}`;
}

function pageHero({ crumbs, heading, lede, before = '', narrow = false, ledeLang = '', headingClass = 'display', headingLang = '' }) {
    // The last crumb is the current page unless it carries a link (post pages end on their category)
    const trail = crumbs.map((c, i) => (i === crumbs.length - 1 && !c.href
        ? `<li><span aria-current="page">${c.label}</span></li>`
        : `<li><a href="${c.href}">${c.label}</a></li>`)).join('\n                        ');
    return `        <header class="page-hero" id="page-top">
            <div class="page-hero__art" aria-hidden="true">
                <svg class="doodle spin"><use href="#i-flower"/></svg>
                <svg class="doodle bob"><use href="#i-sparkle"/></svg>
                <svg class="doodle bob"><use href="#i-sparkle"/></svg>
            </div>
            <div class="container${narrow ? ' container--narrow' : ''}">
                <nav aria-label="Breadcrumb" data-reveal>
                    <ol class="crumbs">
                        <li><a href="/">Home</a></li>
                        ${trail}
                    </ol>
                </nav>
${before}                <h1 class="${headingClass}" data-reveal="words"${headingLang}>${heading}</h1>
                <p class="page-hero__lede" data-reveal style="--delay: 0.3s"${ledeLang}>${lede}</p>
            </div>
        </header>`;
}

function pageNext(slug) {
    const i = FLOW.findIndex((f) => f.slug === slug);
    const next = FLOW[i + 1] || { slug: '', crumb: 'Home' };
    return `        <nav class="page-next" aria-label="Next page">
            <div class="container">
                <a href="/${next.slug ? `${next.slug}/` : ''}" class="page-next__link">
                    <span class="page-next__label">Next</span>
                    <span class="page-next__title">${next.crumb}<i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
                </a>
            </div>
        </nav>`;
}

function write(path, html) {
    mkdirSync(`${PUBLIC}${path}`, { recursive: true });
    writeFileSync(`${PUBLIC}${path}index.html`, html);
    console.log(`✓ ${path}index.html`);
}

/* ---------- Section pages ---------- */

pages.forEach((page) => {
    const url = `${SITE}/${page.slug}/`;
    const section = extractSection(page.section);
    const graph = [
        {
            '@type': page.type,
            '@id': `${url}#webpage`,
            url,
            name: page.title,
            description: page.description,
            isPartOf: { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'Aprajeeta Singh' },
            about: { '@id': `${SITE}/#person` },
            breadcrumb: { '@id': `${url}#breadcrumb` },
            dateModified: MODIFIED,
            inLanguage: 'en'
        },
        breadcrumb(url, [{ name: page.crumb, item: url }]),
        personRef
    ];

    if (page.slug === 'work') {
        const titles = [...section.matchAll(/class="hat__title">([\s\S]*?)<\/h3>/g)].map((m) => stripTags(m[1]));
        const descs = [...section.matchAll(/class="hat__desc">([\s\S]*?)<\/p>/g)].map((m) => stripTags(m[1]));
        graph[0].mainEntity = {
            '@type': 'ItemList',
            itemListElement: titles.map((name, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                item: { '@type': 'CreativeWork', name, description: descs[i], creator: { '@id': `${SITE}/#person` } }
            }))
        };
    }

    const html = renderPage({
        head: makeHead({ title: page.title, description: page.description, url, graph }),
        navHref: `/${page.slug}/`,
        footerHref: `/${page.slug}/`,
        main: `${pageHero({ crumbs: [{ label: page.crumb }], heading: page.heading, lede: page.lede })}

${section}

${pageNext(page.slug)}`
    });
    write(`${page.slug}/`, html);
});

/* ---------- Blog index & categories ---------- */

function filters(active) {
    const all = `<a href="/blog/" class="filter"${active ? '' : ' aria-current="page"'}>All <sup>${posts.length}</sup></a>`;
    const links = categories.map((c) => `<a href="${c.path}" class="filter"${active === c.slug ? ' aria-current="page"' : ''}>${esc(c.name)} <sup>${c.posts.length}</sup></a>`);
    return `<nav class="filters" aria-label="Categories" data-reveal>
    ${[all, ...links].join('\n    ')}
</nav>`;
}

function listingPage({ path, title, description, crumbs, heading, lede, list, active, type = 'CollectionPage' }) {
    const url = `${SITE}${path}`;
    const graph = [
        {
            '@type': type,
            '@id': `${url}#webpage`,
            url,
            name: title,
            description,
            isPartOf: { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'Aprajeeta Singh' },
            breadcrumb: { '@id': `${url}#breadcrumb` },
            inLanguage: 'en',
            mainEntity: {
                '@type': 'ItemList',
                itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: p.url, name: p.title }))
            }
        },
        breadcrumb(url, crumbs.map((c) => ({ name: c.label, item: c.href ? `${SITE}${c.href}` : url }))),
        personRef
    ];
    const cards = list.map((p, i) => card(p, { feature: i === 0 && list.length > 2, level: 2, index: i })).join('\n');

    const html = renderPage({
        head: makeHead({ title, description, url, graph }),
        navHref: '/blog/',
        footerHref: '/blog/',
        main: `${pageHero({ crumbs, heading, lede })}

        <section class="section blog" id="writing">
            <div class="container">
${indent(filters(active), 16)}
                <div class="posts">
${indent(cards, 20)}
                </div>
            </div>
        </section>

${pageNext('blog')}`
    });
    write(path.slice(1), html);
}

listingPage({
    path: '/blog/',
    type: 'Blog',
    title: 'Blog | Stories, Poetries & Life Lessons by Aprajeeta Singh',
    description: 'The blog of Aprajeeta Singh: stories, life lessons, observations and experiences, written in English and Hindi.',
    crumbs: [{ label: 'Blog' }],
    heading: 'Stories, poetries &amp; some <em>noteworthy</em> discussions',
    lede: 'Life lessons, observations and experiences, written in English and हिंदी.',
    list: posts
});

categories.forEach((c) => {
    const n = c.posts.length;
    listingPage({
        path: c.path,
        title: `${c.name} | Blog | Aprajeeta Singh`,
        description: `${n} ${n === 1 ? 'story' : 'stories'} by Aprajeeta Singh filed under ${c.name}: ${c.posts.slice(0, 3).map((p) => p.title).join(', ')}.`,
        crumbs: [{ label: 'Blog', href: '/blog/' }, { label: esc(c.name) }],
        heading: `<em>${esc(c.name)}</em>`,
        lede: `${n} ${n === 1 ? 'story' : 'stories'} from the blog, filed under ${esc(c.name)}.`,
        list: c.posts,
        active: c.slug
    });
});

/* ---------- Posts ---------- */

const shareLinks = (post) => {
    const u = encodeURIComponent(post.url);
    const t = encodeURIComponent(post.title);
    return [
        ['X', 'fa-brands fa-x-twitter', `https://x.com/intent/post?url=${u}&text=${t}&via=${SHARE_X}`],
        ['LinkedIn', 'fa-brands fa-linkedin-in', `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
        ['WhatsApp', 'fa-brands fa-whatsapp', `https://wa.me/?text=${t}%20${u}`],
        ['Facebook', 'fa-brands fa-facebook-f', `https://www.facebook.com/sharer/sharer.php?u=${u}`]
    ].map(([label, icon, href]) => `<li><a href="${escAttr(href)}" target="_blank" rel="noopener" aria-label="Share on ${label}"><i class="${icon}" aria-hidden="true"></i></a></li>`);
};

function related(post) {
    const slugs = post.categories.map((c) => c.slug);
    const score = (p) => p.categories.filter((c) => slugs.includes(c.slug)).length;
    return posts.filter((p) => p !== post).sort((a, b) => score(b) - score(a) || b.date.localeCompare(a.date)).slice(0, 3);
}

posts.forEach((post, i) => {
    const url = post.url;
    const older = posts[i + 1];
    const newer = posts[i - 1];
    const primary = post.categories[0];
    // A drop cap only works on Latin script; skip it when the story opens in Devanagari
    const firstPara = stripTags(post.body.match(/<p>([\s\S]*?)<\/p>/)?.[1] || '');
    const dropcap = post.lang !== 'hi' && /^[A-Za-z"“‘']/.test(firstPara);

    const graph = [
        {
            '@type': 'BlogPosting',
            '@id': `${url}#article`,
            headline: post.title,
            description: post.description,
            url,
            mainEntityOfPage: { '@type': 'WebPage', '@id': url },
            image: post.image ? { '@type': 'ImageObject', url: `${SITE}${post.image.src}`, width: post.image.width, height: post.image.height } : undefined,
            datePublished: post.date,
            dateModified: post.modified,
            author: { '@id': `${SITE}/#person` },
            publisher: { '@id': `${SITE}/#person` },
            isPartOf: { '@type': 'Blog', '@id': `${SITE}/blog/#webpage`, name: 'Aprajeeta Singh — Blog' },
            articleSection: post.categories.map((c) => c.name),
            wordCount: post.words,
            inLanguage: post.lang,
            breadcrumb: { '@id': `${url}#breadcrumb` }
        },
        breadcrumb(url, [
            { name: 'Blog', item: `${SITE}/blog/` },
            ...(primary ? [{ name: primary.name, item: `${SITE}${catPath(primary)}` }] : []),
            { name: post.title, item: url }
        ]),
        personRef
    ];

    const meta = `                <ul class="post-meta" data-reveal>
                    <li><time datetime="${post.date}">${fmtDate(post.date)}</time></li>
                    <li>${post.minutes} min read</li>
                    ${post.categories.map((c) => `<li><a href="${catPath(c)}">${esc(c.name)}</a></li>`).join('\n                    ')}
                </ul>
`;

    const cover = post.image ? `        <figure class="post-cover" data-reveal>
            <div class="post-cover__frame">
                <img src="${post.image.src}" alt="${escAttr(post.image.alt)}" width="${post.image.width}" height="${post.image.height}" fetchpriority="high">
            </div>
        </figure>

` : '';

    const navLinks = [
        older && `<a href="/blog/${older.slug}/"><span>← Previous story</span><strong${lang(older)}>${esc(older.title)}</strong></a>`,
        newer && `<a href="/blog/${newer.slug}/"><span>Next story →</span><strong${lang(newer)}>${esc(newer.title)}</strong></a>`
    ].filter(Boolean).join('\n            ');

    const main = `${pageHero({
        crumbs: [{ label: 'Blog', href: '/blog/' }, ...(primary ? [{ label: esc(primary.name), href: catPath(primary) }] : [])],
        heading: esc(post.title),
        headingClass: 'display post-title',
        headingLang: lang(post),
        lede: esc(post.description),
        ledeLang: lang(post),
        before: meta,
        narrow: true
    })}

${cover}        <article class="prose${dropcap ? ' prose--dropcap' : ''}" lang="${post.lang}">
${indent(post.body, 12)}
        </article>

        <aside class="post-end" aria-label="About this story">
            <div class="share">
                <p class="hand">share this story →</p>
                <ul class="socials">
                    ${shareLinks(post).join('\n                    ')}
                    <li><button type="button" data-copy="${url}" data-copy-message="Link copied!" aria-label="Copy link"><i class="fa-solid fa-link" aria-hidden="true"></i></button></li>
                </ul>
            </div>
            <div class="author" data-reveal="pop">
                <img src="/img/aprajeeta-singh.jpg" alt="Aprajeeta Singh" width="800" height="800" loading="lazy">
                <div>
                    <p class="hand">written by</p>
                    <p class="author__name">Aprajeeta Singh</p>
                    <p class="author__bio">${AUTHOR_BIO}</p>
                    <a href="/about/" class="link-underline">More about me</a>
                </div>
            </div>
        </aside>

        <nav class="post-nav" aria-label="More stories">
            ${navLinks}
        </nav>

        <section class="section related" aria-label="Related stories">
            <div class="container">
                <div class="section__head">
                    <span class="section__num">✦</span>
                    <span class="section__label">Keep reading</span>
                    <svg class="section__arrow" data-reveal="draw" aria-hidden="true"><use href="#i-arrow"/></svg>
                </div>
                <h2 class="display" data-reveal="words">More <em>stories</em></h2>
                <div class="posts">
${indent(related(post).map((p, n) => card(p, { index: n + i + 1 })).join('\n'), 20)}
                </div>
            </div>
        </section>`;

    const html = renderPage({
        head: makeHead({ title: `${post.title} | Aprajeeta Singh`, description: post.description, url, image: post.image, graph, article: post }),
        navHref: '/blog/',
        footerHref: '/blog/',
        main
    }).replace('<main id="main" class="page">', '<main id="main" class="page page--post">');
    write(`blog/${post.slug}/`, html);
});

/* ---------- RSS feed ---------- */

const absolute = (html) => html.replace(/(src|href)="\/(?!\/)/g, `$1="${SITE}/`);
const cdata = (s) => `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
    <channel>
        <title>Aprajeeta Singh — Blog</title>
        <link>${SITE}/blog/</link>
        <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
        <description>Stories, poetries, life lessons and observations by Aprajeeta Singh.</description>
        <language>en</language>
        <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${posts.map((p) => `        <item>
            <title>${esc(p.title)}</title>
            <link>${p.url}</link>
            <guid isPermaLink="true">${p.url}</guid>
            <pubDate>${new Date(p.date).toUTCString()}</pubDate>
            <dc:creator>Aprajeeta Singh</dc:creator>
${p.categories.map((c) => `            <category>${esc(c.name)}</category>`).join('\n')}
            <description>${cdata(p.description)}</description>
            <content:encoded>${cdata(absolute(`${p.image ? `<p><img src="${p.image.src}" alt="${escAttr(p.image.alt)}"></p>` : ''}${p.body}`))}</content:encoded>
        </item>`).join('\n')}
    </channel>
</rss>
`;
writeFileSync(`${PUBLIC}feed.xml`, feed);
console.log('✓ feed.xml');

/* ---------- Sitemap ---------- */

const urls = [
    { loc: `${SITE}/`, priority: '1.0', lastmod: MODIFIED, image: `${SITE}/img/aprajeeta-singh.jpg` },
    ...pages.map((p) => ({ loc: `${SITE}/${p.slug}/`, priority: '0.8', lastmod: MODIFIED })),
    { loc: `${SITE}/blog/`, priority: '0.9', lastmod: posts[0]?.modified.slice(0, 10) || MODIFIED },
    ...categories.map((c) => ({ loc: `${SITE}${c.path}`, priority: '0.5', lastmod: c.posts[0].modified.slice(0, 10) })),
    ...posts.map((p) => ({ loc: p.url, priority: '0.7', lastmod: p.modified.slice(0, 10), image: p.image && `${SITE}${p.image.src}` }))
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map((u) => `    <url>
        <loc>${u.loc}</loc>
        <lastmod>${u.lastmod}</lastmod>
        <priority>${u.priority}</priority>${u.image ? `
        <image:image>
            <image:loc>${u.image}</image:loc>
        </image:image>` : ''}
    </url>`).join('\n')}
</urlset>
`;
writeFileSync(`${PUBLIC}sitemap.xml`, sitemap);
console.log('✓ sitemap.xml');
