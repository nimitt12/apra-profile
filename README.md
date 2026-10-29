# Aprajeeta Singh

Source for [aprajeetasingh.com](https://aprajeetasingh.com/), the site of Aprajeeta Singh: writer, podcaster at “Apravyakti” and founder of Craftcart. It replaces the old WordPress site with a fast static site (plain HTML, CSS and JS, no framework and no dependencies) that keeps every old URL working.

## Layout

```
content/
  posts.json              metadata for every blog post (title, date, categories, cover image…)
  posts/<slug>.html        post bodies
public/
  index.html              homepage, and the source of the nav, menu and footer on every page
  assets/css/main.css
  assets/js/main.js
  img/                    site images; img/blog/ holds post images
  …                       everything else in here is generated (see below)
scripts/
  build-pages.mjs         generates the pages, feed and sitemap
  import-wordpress.mjs    one-off migration from the WordPress REST API
```

`node scripts/build-pages.mjs` generates:

- the latest posts on the homepage (between the `posts:latest` markers in `index.html`)
- `/about/`, `/work/`, `/podcast/`, `/contact/`, sliced from the matching homepage sections
- `/blog/`, one page per category at its old WordPress path (`/blog/category/…/`) and one page per post at its old URL (`/blog/<slug>/`)
- `feed.xml` (RSS) and `sitemap.xml`

Don't edit the generated pages by hand; edit `index.html` or `content/` and rebuild.

## Writing a new post

1. Add the body as `content/posts/<slug>.html` (plain `<p>`, `<h2>`, `<figure><img></figure>`, `<ul>`… no classes needed). Put images in `public/img/blog/`.
2. Add an entry at the top of `content/posts.json`, copying an existing one. Set `"lang": "hi"` for posts written in Hindi.
3. Run `node scripts/build-pages.mjs`.

To embed a YouTube video, copy the `<figure class="embed">…</figure>` block from `content/posts/therapy-vs-self-talk.html` and change the video id.

## Preview locally

```bash
node scripts/build-pages.mjs
python3 -m http.server 8080 -d public
```

Then visit <http://localhost:8080/>.

## Deploy (Firebase Hosting)

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # pick or create the Firebase project, once
firebase deploy             # runs the build first
```

`firebase.json` serves clean URLs with trailing slashes (the same shape WordPress used). It also redirects old WordPress-only paths (`/feed/`, tag and author archives, pagination, Yoast sitemaps) to their new homes. To go live, add `aprajeetasingh.com` as a custom domain in the Firebase console and point the DNS records there.

## Re-importing from WordPress

While WordPress is still online, `node scripts/import-wordpress.mjs` pulls every published post again into `content/` and downloads its images. It overwrites `content/`, so only use it before you start editing posts here.
