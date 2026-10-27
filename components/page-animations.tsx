'use client';

import { useEffect } from 'react';
import { revealWaitingClasses as waiting, revealEnteringClasses as entering } from './animation-styles';

function documentTop(element: HTMLElement) {
  let top = 0;
  // offsetTop ignores reveal transforms, including those on animated parents.
  for (let current: HTMLElement | null = element; current; current = current.offsetParent as HTMLElement | null) top += current.offsetTop;
  return top;
}

export function PageAnimations() {
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches) return;

    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-aos="fade-up"], [data-aos="fade"], [data-aos="zoom-in"]'));
    const counters = Array.from(document.querySelectorAll<HTMLElement>('.purecounter[data-purecounter-end]'));
    if (!elements.length && !counters.length) return;
    const pending = new Map(elements.map(element => [element, documentTop(element)]));
    const frames = new Map<HTMLElement, number>();
    let scrollFrame = 0;
    let stopped = false;

    const finishCounter = (element: HTMLElement) => {
      const frame = frames.get(element);
      if (frame !== undefined) cancelAnimationFrame(frame);
      frames.delete(element);
      element.textContent = element.dataset.purecounterEnd || '0';
    };
    const reveal = (element: HTMLElement) => {
      if (!pending.delete(element)) return;
      element.classList.add(...entering);
      element.dataset.revealState = 'visible';
    };
    const check = () => {
      scrollFrame = 0;
      if (stopped) return;
      const bottom = window.scrollY + window.innerHeight;
      pending.forEach((top, element) => {
        // Original AOS defaults: top-bottom anchor, 120px offset, once: true.
        if (bottom >= top + 120) reveal(element);
      });
    };
    const schedule = () => { if (!scrollFrame && !stopped) scrollFrame = requestAnimationFrame(check); };
    const refresh = () => {
      pending.forEach((_, element) => pending.set(element, documentTop(element)));
      schedule();
    };
    const transitionEnd = (event: TransitionEvent) => {
      if (event.propertyName === 'opacity' && event.target instanceof HTMLElement && elements.includes(event.target)) {
        event.target.classList.remove(...waiting, ...entering);
      }
    };
    const focus = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      for (let parent: HTMLElement | null = event.target; parent; parent = parent.parentElement) reveal(parent);
    };

    elements.forEach(element => {
      // These are already present in the server HTML; reapply only for effect
      // remounts during development. Never expose a visible pre-animation frame.
      element.classList.add(...waiting);
      element.dataset.revealState = 'pending';
    });
    // Commit the starting styles before the first scroll check starts transitions.
    if (elements[0]) void getComputedStyle(elements[0]).opacity;
    schedule();

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5 || stopped) return;
        const element = entry.target as HTMLElement;
        observer.unobserve(element);
        const start = Number(element.dataset.purecounterStart || 0);
        const end = Number(element.dataset.purecounterEnd || 0);
        const duration = Number(element.dataset.purecounterDuration || 1) * 1000;
        if (duration <= 0) { finishCounter(element); return; }
        const started = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - started) / duration);
          element.textContent = (start + (end - start) * progress).toFixed(0);
          if (progress < 1) frames.set(element, requestAnimationFrame(tick));
          else finishCounter(element);
        };
        frames.set(element, requestAnimationFrame(tick));
      });
    }, { rootMargin: '20px', threshold: 0.5 });
    counters.forEach(element => {
      element.textContent = element.dataset.purecounterStart || '0';
      observer.observe(element);
    });

    const finish = () => {
      stopped = true;
      cancelAnimationFrame(scrollFrame);
      observer.disconnect();
      elements.forEach(element => {
        element.classList.remove(...waiting, ...entering);
        delete element.dataset.revealState;
      });
      pending.clear();
      counters.forEach(finishCounter);
    };
    const preferenceChanged = () => { if (motion.matches) finish(); };
    const resizeObserver = new ResizeObserver(refresh);
    resizeObserver.observe(document.body);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', refresh);
    document.addEventListener('load', refresh, true);
    document.addEventListener('transitionend', transitionEnd);
    document.addEventListener('focusin', focus);
    motion.addEventListener('change', preferenceChanged);
    return () => {
      finish();
      resizeObserver.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', refresh);
      document.removeEventListener('load', refresh, true);
      document.removeEventListener('transitionend', transitionEnd);
      document.removeEventListener('focusin', focus);
      motion.removeEventListener('change', preferenceChanged);
    };
  }, []);

  return null;
}
