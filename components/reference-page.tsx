import { createElement, type ReactNode } from 'react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Metadata } from 'next';
import { cacheLife } from 'next/cache';
import manifest from '@/content/manifest.json';
import rootClasses from '@/content/tailwind-root.json';
import { InquiryForm } from './inquiry-form';
import { SiteInteractions } from './site-interactions';
import { PageAnimations } from './page-animations';
import { SiteLink } from './site-link';
import { hasEntranceAnimation, revealWaitingClasses } from './animation-styles';
type ContentNode = string | { tag: string; attrs: Record<string, string>; children: ContentNode[] };
type PageContent = { title: string; description: string; nodes: ContentNode[] };
const entries: Record<string, { title: string; description: string }> = manifest;
export function pageMetadata(name: string): Metadata {
  const page = entries[name];
  return page ? { title: page.title, description: page.description || undefined } : {};
}
const attributeNames: Record<string, string> = {
  class: 'className', for: 'htmlFor', tabindex: 'tabIndex', colspan: 'colSpan', rowspan: 'rowSpan',
  cellpadding: 'cellPadding', cellspacing: 'cellSpacing', frameborder: 'frameBorder', allowfullscreen: 'allowFullScreen',
  readonly: 'readOnly', maxlength: 'maxLength', minlength: 'minLength', autocomplete: 'autoComplete',
  inputmode: 'inputMode', srcset: 'srcSet', crossorigin: 'crossOrigin', referrerpolicy: 'referrerPolicy',
  autoplay: 'autoPlay', playsinline: 'playsInline', enctype: 'encType', viewbox: 'viewBox',
  'fill-rule': 'fillRule', 'clip-rule': 'clipRule', 'stroke-width': 'strokeWidth',
};
const booleanAttributes = new Set(['required', 'disabled', 'multiple', 'checked', 'selected', 'readonly', 'autoplay', 'muted', 'loop', 'controls', 'playsinline', 'allowfullscreen', 'hidden']);
function renderNode(node: ContentNode, key: number): ReactNode {
  if (typeof node === 'string') return node;
  const { tag, attrs, children } = node;
  const props: Record<string, unknown> = { key };
  for (const [name, value] of Object.entries(attrs)) {
    if (name.startsWith('on') || ['align', 'valign', 'marginheight', 'marginwidth', 'border', 'color', 'size'].includes(name)) continue;
    if (name === 'style') continue;
    props[attributeNames[name] || name] = booleanAttributes.has(name) ? true : value;
  }
  if (hasEntranceAnimation(attrs['data-aos'])) {
    props['data-reveal-state'] = 'pending';
    props.className = `${props.className || ''} ${revealWaitingClasses.join(' ')}`;
  }
  if (tag === 'input') {
    if (props.value !== undefined) { props.defaultValue = props.value; delete props.value; }
    if (props.checked !== undefined) { props.defaultChecked = props.checked; delete props.checked; }
  }
  if (tag === 'option') delete props.selected;
  const renderedChildren = children.map(renderNode);
  if (tag === 'a' && attrs.href?.startsWith('/') && !attrs.href.startsWith('//') && !attrs.target && !Object.hasOwn(attrs, 'download')) {
    const pathname = attrs.href.split(/[?#]/)[0];
    let destination = pathname.slice(1);
    try { destination = decodeURIComponent(destination); } catch { /* Keep unknown URLs native. */ }
    if (pathname === '/' || Object.hasOwn(entries, destination)) {
      return createElement(SiteLink, { ...props, href: attrs.href }, ...renderedChildren);
    }
  }
  if (tag === 'form') {
    const attributes = { ...props };
    delete attributes.key;
    return <InquiryForm key={key} attributes={attributes}>{renderedChildren}</InquiryForm>;
  }
  if (tag === 'textarea') return createElement(tag, { ...props, defaultValue: children.filter(x => typeof x === 'string').join('') });
  return children.length ? createElement(tag, props, ...renderedChildren) : createElement(tag, props);
}
export async function ReferencePage({ name }: { name: string }) {
  'use cache';
  cacheLife('max');
  if (!Object.hasOwn(entries, name)) throw new Error('Unknown page');
  const file = path.join(process.cwd(), 'content', 'pages', name.replace(/\.html$/, '.json'));
  const page: PageContent = JSON.parse(await readFile(file, 'utf8'));
  return <><a className={`skip-link ${rootClasses.skipLink}`} href="#main">Skip to content</a>{page.nodes.map(renderNode)}<SiteInteractions /><PageAnimations /></>;
}
