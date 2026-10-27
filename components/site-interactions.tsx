'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';

type SwiperInstance = { destroy: (deleteInstance?: boolean, cleanStyles?: boolean) => void; update: () => void };
declare global {
  interface Window { Swiper?: new (element: Element, options: Record<string, unknown>) => SwiperInstance }
}
type Gallery = { urls: string[]; index: number; title: string };

export function SiteInteractions() {
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const sliders = useRef<SwiperInstance[]>([]);

  const initializeSliders = useCallback(() => {
    if (!window.Swiper || sliders.current.length) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('.swiper').forEach(element => {
      sliders.current.push(new window.Swiper!(element, {
        speed: reducedMotion ? 0 : 600, loop: true,
        autoplay: reducedMotion ? false : { delay: 5000, disableOnInteraction: false },
        slidesPerView: 'auto', observer: true, observeParents: true,
        pagination: {
          el: element.querySelector('.swiper-pagination'), type: 'bullets', clickable: true,
          // Swiper creates these nodes at runtime, so they cannot inherit the
          // utilities migrated onto the captured HTML. Match the reference's
          // 12px gray bullets and dark active state explicitly in Tailwind.
          renderBullet: (_index: number, className: string) => `<span class="${className} tw:w-[12px] tw:h-[12px] tw:bg-[#d5d7da] tw:opacity-100 tw:[&.swiper-pagination-bullet-active]:bg-[var(--color-primary)]"></span>`,
        },
        navigation: { nextEl: element.querySelector('.swiper-button-next'), prevEl: element.querySelector('.swiper-button-prev') },
        breakpoints: element.classList.contains('slides-2') ? {
          320: { slidesPerView: 1, spaceBetween: 20 },
          1200: { slidesPerView: 2, spaceBetween: 20 },
        } : {},
        a11y: { enabled: true }, keyboard: { enabled: true, onlyInViewport: true },
      }));
    });
    void document.fonts.ready.then(() => sliders.current.forEach(slider => slider.update()));
  }, []);

  useEffect(() => {
    // Script onReady handles the first download. This also handles a cached
    // script after route remounts or Fast Refresh effect cleanup/setup.
    initializeSliders();
    const scroll = () => document.querySelectorAll('.scroll-top, .scroll-top-whatapp, .scroll-top-call, .scroll-top-email').forEach(el => el.classList.toggle('active', window.scrollY > 100));
    scroll();
    const openMenu = (open: boolean) => {
      document.body.classList.toggle('mobile-nav-active', open);
      document.querySelector('.mobile-nav-show')?.classList.toggle('d-none', open);
      document.querySelector('.mobile-nav-hide')?.classList.toggle('d-none', !open);
      document.querySelectorAll('.mobile-nav-toggle').forEach(el => el.setAttribute('aria-expanded', String(open)));
    };
    document.querySelectorAll('.portfolio-flters [data-filter]').forEach(el => { el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button'); });
    document.querySelectorAll('.navbar .dropdown > a').forEach(el => { el.setAttribute('aria-haspopup', 'true'); el.setAttribute('aria-expanded', 'false'); });
    document.querySelectorAll('#myBtn, #open-popup-modal, .modal .close, .modal-close').forEach(el => { el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); });

    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target;
      if (target.closest('.mobile-nav-toggle')) { event.preventDefault(); openMenu(!document.body.classList.contains('mobile-nav-active')); return; }
      const dropdown = target.closest('.navbar .dropdown > a');
      if (dropdown) {
        event.preventDefault();
        const expanded = dropdown.getAttribute('aria-expanded') !== 'true';
        dropdown.setAttribute('aria-expanded', String(expanded));
        dropdown.nextElementSibling?.classList.toggle('dropdown-active', expanded);
        return;
      }
      const filter = target.closest<HTMLElement>('.portfolio-flters [data-filter]');
      if (filter) {
        const selector = filter.dataset.filter || '*';
        filter.parentElement?.querySelectorAll('[data-filter]').forEach(el => { el.classList.toggle('filter-active', el === filter); el.setAttribute('aria-pressed', String(el === filter)); });
        document.querySelectorAll<HTMLElement>('.portfolio-item').forEach(el => { el.hidden = selector !== '*' && !el.matches(selector); });
      }
      const link = target.closest<HTMLAnchorElement>('a.glightbox');
      if (link) {
        event.preventDefault();
        previousFocus.current = link;
        const group = link.dataset.gallery;
        const urls = group ? Array.from(document.querySelectorAll<HTMLAnchorElement>('a.glightbox')).filter(el => el.dataset.gallery === group).map(el => el.href) : [link.href];
        setGallery({ urls, index: Math.max(0, urls.indexOf(link.href)), title: link.title || link.querySelector('img')?.alt || 'BIZ Nest gallery' });
      }
      if (target.closest('.scroll-top')) { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      const modal = document.querySelector<HTMLElement>('#myModal, #popup-modal');
      if (modal && target.closest('#myBtn, #open-popup-modal')) { modal.classList.add('tw:block!'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Inquire now'); modal.querySelector<HTMLElement>('input')?.focus(); }
      if (modal && (target === modal || target.closest('.modal .close, .modal-close'))) { modal.classList.remove('tw:block!'); document.querySelector<HTMLElement>('#myBtn, #open-popup-modal')?.focus(); }
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        openMenu(false); setGallery(null);
        const modal = document.querySelector<HTMLElement>('#myModal, #popup-modal');
        if (modal) modal.classList.remove('tw:block!');
      }
      if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLElement && event.target.matches('.portfolio-flters [data-filter], #myBtn, #open-popup-modal, .modal .close, .modal-close')) { event.preventDefault(); event.target.click(); }
    };
    document.addEventListener('click', click);
    document.addEventListener('keydown', keydown);
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      document.removeEventListener('click', click); document.removeEventListener('keydown', keydown); window.removeEventListener('scroll', scroll);
      document.body.classList.remove('mobile-nav-active');
      sliders.current.forEach(slider => slider.destroy(true, true)); sliders.current = [];
    };
  }, [initializeSliders]);

  useEffect(() => {
    if (!gallery) { previousFocus.current?.focus(); return; }
    const wasLocked = document.body.classList.contains('tw:overflow-hidden!');
    document.body.classList.add('tw:overflow-hidden!');
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') setGallery(g => g && ({ ...g, index: (g.index + 1) % g.urls.length }));
      if (event.key === 'ArrowLeft') setGallery(g => g && ({ ...g, index: (g.index - 1 + g.urls.length) % g.urls.length }));
      if (event.key === 'Tab') {
        const buttons = Array.from(dialog.current?.querySelectorAll('button') || []);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keys);
    return () => { if (!wasLocked) document.body.classList.remove('tw:overflow-hidden!'); document.removeEventListener('keydown', keys); };
  }, [gallery]);

  const current = gallery?.urls[gallery.index] || '';
  const videoId = current.match(/(?:youtu\.be\/|[?&]v=)([\w-]+)/)?.[1];
  return <>
    <Script src="/assets/vendor/bootstrap/js/bootstrap.bundle.min.js" strategy="afterInteractive" />
    <Script src="/assets/vendor/swiper/swiper-bundle.min.js" onReady={initializeSliders} strategy="afterInteractive" />
    {gallery && <div ref={dialog} className="replica-modal tw:fixed tw:inset-0 tw:z-[100000] tw:bg-[#000e] tw:p-[40px] tw:flex tw:items-center tw:justify-center tw:box-border tw:[&_*]:box-border tw:[&_button]:absolute tw:[&_button]:[border:0] tw:[&_button]:text-white tw:[&_button]:bg-[#333] tw:[&_button]:rounded-[50%] tw:[&_button]:w-[44px] tw:[&_button]:h-[44px] tw:[&_button]:[font-size:24px] tw:[&_button]:[font-family:inherit] tw:[&_button]:[line-height:inherit] tw:[&_button]:m-0 tw:[&_button]:cursor-pointer" role="dialog" aria-modal="true" aria-label={gallery.title} onClick={event => { if (event.target === event.currentTarget) setGallery(null); }}>
      <button className="close tw:top-[16px] tw:right-[16px] tw:[border:0]!" onClick={() => setGallery(null)} aria-label="Close gallery">×</button>
      {videoId ? <iframe className="tw:w-[min(1000px,90vw)] tw:h-[min(600px,75vh)] tw:border-0" title={gallery.title} src={`https://www.youtube-nocookie.com/embed/${videoId}`} allowFullScreen /> : <img className="tw:max-w-[90vw] tw:max-h-[88vh] tw:object-contain tw:align-middle" src={current} alt={gallery.title} />}
      {gallery.urls.length > 1 && <><button className="prev tw:left-[10px] tw:top-1/2" aria-label="Previous image" onClick={() => setGallery({ ...gallery, index: (gallery.index - 1 + gallery.urls.length) % gallery.urls.length })}>‹</button><button className="next tw:right-[10px] tw:top-1/2" aria-label="Next image" onClick={() => setGallery({ ...gallery, index: (gallery.index + 1) % gallery.urls.length })}>›</button></>}
    </div>}
  </>;
}
