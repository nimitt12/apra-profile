(() => {
    'use strict';

    const root = document.documentElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

    /* ------------------------------------------------------------------
       Text splitting
       ------------------------------------------------------------------ */

    // Hero name: every letter becomes its own stamp with a slight random tilt
    function splitLetters(el, offset) {
        const text = el.textContent.trim();
        el.textContent = '';
        [...text].forEach((ch, i) => {
            const span = document.createElement('span');
            span.className = 'ltr';
            span.setAttribute('aria-hidden', 'true');
            span.textContent = ch;
            span.style.setProperty('--i', offset + i);
            span.style.setProperty('--rot', `${(Math.random() * 24 - 12).toFixed(1)}deg`);
            el.appendChild(span);
        });
        return offset + text.length;
    }

    // Headings: words pop up one after another, keeping inline wrappers like <em>
    function splitWords(el) {
        el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
        const nodes = [...el.childNodes];
        el.textContent = '';
        let n = 0;
        nodes.forEach((node) => {
            const text = node.textContent;
            const words = text.split(/\s+/).filter(Boolean);
            if (/^\s/.test(text) && el.lastChild && words.length) el.appendChild(document.createTextNode(' '));
            words.forEach((word, i) => {
                const span = document.createElement(node.nodeType === 1 ? node.tagName.toLowerCase() : 'span');
                span.className = 'w';
                span.setAttribute('aria-hidden', 'true');
                span.textContent = word;
                span.style.setProperty('--i', n++);
                el.appendChild(span);
                if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
            });
            if (/\s$/.test(text) && words.length) el.appendChild(document.createTextNode(' '));
        });
    }

    let letterCount = 0;
    $$('[data-letters]').forEach((el) => { letterCount = splitLetters(el, letterCount); });
    $$('[data-reveal="words"]').forEach(splitWords);

    // Children of [data-stagger] reveal one after another
    $$('[data-stagger]').forEach((group) => {
        [...group.children].forEach((child, i) => {
            const target = child.matches('[data-reveal]') ? child : $('[data-reveal]', child);
            target?.style.setProperty('--delay', `${(parseFloat(group.dataset.stagger) || 0) + i * 0.08}s`);
        });
    });

    /* ------------------------------------------------------------------
       Intro curtain (homepage only)
       ------------------------------------------------------------------ */

    const curtain = $('.curtain');
    if (curtain && !reduceMotion) {
        root.style.setProperty('--start', '1s');
        setTimeout(() => curtain.remove(), 1900);
    } else {
        curtain?.remove();
    }

    root.classList.add('is-ready');

    /* ------------------------------------------------------------------
       Reveal on scroll
       ------------------------------------------------------------------ */

    const reveals = $$('[data-reveal]');
    if (reduceMotion || !('IntersectionObserver' in window)) {
        reveals.forEach((el) => el.classList.add('is-in'));
    } else {
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-in');
                io.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -8% 0px' });
        reveals.forEach((el) => io.observe(el));
    }

    // Numbers on the sticky notes count up once they're on screen
    if (!reduceMotion && 'IntersectionObserver' in window) {
        $$('[data-count]').forEach((el) => {
            const end = Number(el.dataset.count);
            el.textContent = '0';
            const io = new IntersectionObserver(([entry]) => {
                if (!entry.isIntersecting) return;
                io.disconnect();
                const t0 = performance.now();
                const step = (now) => {
                    const p = Math.min(1, (now - t0) / 1400);
                    el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
                    if (p < 1) requestAnimationFrame(step);
                };
                setTimeout(() => requestAnimationFrame(step), 300);
            }, { threshold: 0.6 });
            io.observe(el);
        });
    }

    /* ------------------------------------------------------------------
       Hero: word roller, pointer parallax, falling petals
       ------------------------------------------------------------------ */

    const roller = $('.roller');
    if (roller) {
        const words = $$('.roller__word', roller);
        let index = 0;
        // The box resizes to the current word: its width plus the roller's own padding and border
        const show = () => {
            const style = getComputedStyle(roller);
            const frame = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) * 2;
            roller.style.setProperty('--i', index);
            roller.style.setProperty('--roller', words[index].dataset.c);
            roller.style.width = `${words[index].offsetWidth + frame}px`;
        };
        document.fonts?.ready.then(show);
        show();
        if (!reduceMotion) {
            setInterval(() => {
                index = (index + 1) % words.length;
                show();
            }, 2400);
        }
    }

    const hero = $('.hero');
    if (hero && finePointer && !reduceMotion) {
        hero.addEventListener('pointermove', (e) => {
            const r = hero.getBoundingClientRect();
            hero.style.setProperty('--px', (((e.clientX - r.left) / r.width) - 0.5) * 2);
            hero.style.setProperty('--py', (((e.clientY - r.top) / r.height) - 0.5) * 2);
        });
        hero.addEventListener('pointerleave', () => {
            hero.style.setProperty('--px', 0);
            hero.style.setProperty('--py', 0);
        });
    }

    function initPetals(canvas) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const colors = ['#ffb627', '#ff3d8b', '#ff7a30', '#b9a2ff', '#00a79d', '#ffcb5c'];
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const pointer = { x: -999, y: -999 };
        let width = 0;
        let height = 0;
        let petals = [];
        let raf = null;
        let visible = true;

        const make = (anywhere) => ({
            x: Math.random() * width,
            y: anywhere ? Math.random() * height : -24,
            size: 6 + Math.random() * 9,
            rot: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.04,
            fall: 0.3 + Math.random() * 0.6,
            sway: Math.random() * Math.PI * 2,
            color: colors[Math.floor(Math.random() * colors.length)]
        });

        const resize = () => {
            width = canvas.clientWidth;
            height = canvas.clientHeight;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            petals = Array.from({ length: Math.round(Math.min(36, width / 38)) }, () => make(true));
        };

        const drawPetal = (p) => {
            const s = p.size;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.moveTo(0, -s);
            ctx.bezierCurveTo(s * 0.85, -s * 0.55, s * 0.55, s * 0.75, 0, s);
            ctx.bezierCurveTo(-s * 0.55, s * 0.75, -s * 0.85, -s * 0.55, 0, -s);
            ctx.fill();
            ctx.strokeStyle = 'rgba(30, 15, 43, 0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, -s * 0.7);
            ctx.lineTo(0, s * 0.7);
            ctx.stroke();
            ctx.restore();
        };

        const frame = () => {
            ctx.clearRect(0, 0, width, height);
            petals.forEach((p) => {
                p.sway += 0.012;
                p.y += p.fall;
                p.x += Math.sin(p.sway) * 0.4;
                p.rot += p.spin;
                // The cursor blows petals aside
                const dx = p.x - pointer.x;
                const dy = p.y - pointer.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 130) {
                    const force = (1 - dist / 130) * 3;
                    p.x += (dx / (dist || 1)) * force;
                    p.y += (dy / (dist || 1)) * force;
                    p.spin += 0.002;
                }
                if (p.y > height + 24 || p.x < -40 || p.x > width + 40) Object.assign(p, make(false));
                drawPetal(p);
            });
        };

        const loop = () => {
            frame();
            raf = visible && !document.hidden ? requestAnimationFrame(loop) : null;
        };

        resize();
        new ResizeObserver(resize).observe(canvas);

        if (reduceMotion) {
            frame();
            return;
        }

        if (finePointer) {
            window.addEventListener('pointermove', (e) => {
                const r = canvas.getBoundingClientRect();
                pointer.x = e.clientX - r.left;
                pointer.y = e.clientY - r.top;
            });
        }

        new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            if (visible && !raf) raf = requestAnimationFrame(loop);
        }).observe(canvas);

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && visible && !raf) raf = requestAnimationFrame(loop);
        });
    }

    const petals = $('.hero__petals');
    if (petals) initPetals(petals);

    /* ------------------------------------------------------------------
       "What I do": a cut-out portrait follows the cursor down the list
       ------------------------------------------------------------------ */

    const hats = $('.hats');
    const preview = $('.hats__preview');
    if (hats && preview && finePointer && !reduceMotion) {
        const img = $('img', preview);
        let x = 0;
        let y = 0;
        let tx = 0;
        let ty = 0;
        let raf = null;

        const follow = () => {
            x += (tx - x) * 0.16;
            y += (ty - y) * 0.16;
            const tilt = Math.max(-14, Math.min(14, (tx - x) * 0.2));
            preview.style.transform = `translate(${x}px, ${y}px) rotate(${tilt}deg)`;
            raf = requestAnimationFrame(follow);
        };

        $$('.hat', hats).forEach((hat) => {
            hat.addEventListener('pointerenter', () => {
                img.src = hat.dataset.img;
                preview.style.setProperty('--c', getComputedStyle(hat).getPropertyValue('--c'));
            });
        });
        hats.addEventListener('pointerenter', (e) => {
            x = tx = e.clientX;
            y = ty = e.clientY;
            preview.classList.add('is-on');
            if (!raf) raf = requestAnimationFrame(follow);
        });
        hats.addEventListener('pointermove', (e) => {
            tx = e.clientX;
            ty = e.clientY;
        });
        hats.addEventListener('pointerleave', () => {
            preview.classList.remove('is-on');
            setTimeout(() => {
                if (preview.classList.contains('is-on')) return;
                cancelAnimationFrame(raf);
                raf = null;
            }, 400);
        });
    }

    /* ------------------------------------------------------------------
       Header, progress bar, menu, in-page links
       ------------------------------------------------------------------ */

    const nav = $('.nav');
    const bar = $('.progress span');
    let ticking = false;
    const onScroll = () => {
        ticking = false;
        const y = window.scrollY;
        nav.classList.toggle('is-scrolled', y > 24);
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    };
    window.addEventListener('scroll', () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(onScroll);
        }
    }, { passive: true });
    onScroll();

    const menu = $('.menu');
    const menuBtn = $('.nav__menu');
    const menuText = $('.nav__menu-text');
    let menuOpen = false;

    $$('.menu__link').forEach((link, i) => link.style.setProperty('--d', i));

    function setMenu(open) {
        menuOpen = open;
        root.classList.toggle('menu-open', open);
        menuBtn.setAttribute('aria-expanded', String(open));
        menu.setAttribute('aria-hidden', String(!open));
        menu.inert = !open;
        menuText.textContent = open ? 'Close' : 'Menu';
        if (open) setTimeout(() => $('.menu__link')?.focus({ preventScroll: true }), 350);
    }

    if (menu && menuBtn) {
        menu.inert = true;
        menuBtn.addEventListener('click', () => setMenu(!menuOpen));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && menuOpen) {
                setMenu(false);
                menuBtn.focus();
            }
        });
    }

    // Links to section pages carry data-scroll so they scroll in place when that section is on this page
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href^="#"], a[data-scroll]');
        if (!link) return;
        const id = link.dataset.scroll || link.getAttribute('href').slice(1);
        const target = id ? document.getElementById(id) : null;
        if (!target) return;
        e.preventDefault();
        if (menuOpen) setMenu(false);
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
        history.replaceState(null, '', id === 'top' || id === 'page-top' ? location.pathname : `#${id}`);
    });

    $$('.js-year').forEach((el) => { el.textContent = new Date().getFullYear(); });

    /* ------------------------------------------------------------------
       Copy to clipboard, YouTube facades
       ------------------------------------------------------------------ */

    const toast = $('.toast');
    let toastTimer;
    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2200);
    }

    $$('[data-copy]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(btn.dataset.copy);
                showToast(btn.dataset.copyMessage || 'Copied!');
            } catch {
                window.prompt('Copy this link:', btn.dataset.copy);
            }
        });
    });

    // Load the YouTube player only when asked to (privacy-friendly, no upfront weight)
    document.addEventListener('click', (e) => {
        const link = e.target.closest('.yt[data-yt]');
        if (!link) return;
        e.preventDefault();
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube-nocookie.com/embed/${link.dataset.yt}?autoplay=1&rel=0`;
        iframe.title = link.getAttribute('aria-label') || 'YouTube video';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        const player = document.createElement('div');
        player.className = 'yt';
        player.appendChild(iframe);
        link.replaceWith(player);
    });
})();
