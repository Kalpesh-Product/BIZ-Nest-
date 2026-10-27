"""One-time, lossless-value CSS -> Tailwind migration of the captured page trees.

Ordered variants retain the original selector specificity, media conditions and
declaration order. Visual declarations become utilities on their matching nodes.
Font-face/keyframes and third-party icon/slider engine CSS are the exceptions.
"""
from pathlib import Path
from urllib.parse import urljoin, quote
from bs4 import BeautifulSoup, NavigableString
import tinycss2
import json
import re
import shutil
import cssselect2
import html5lib

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / '.reference/tailwind-before'
BACKUP.mkdir(parents=True, exist_ok=True)
for name in ['content', 'app/globals.css', 'public/assets/css/main.css', 'public/assets/vendor/bootstrap/css/bootstrap.min.css']:
    src, dest = ROOT / name, BACKUP / name
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(src, dest) if src.is_dir() else shutil.copy2(src, dest)

variants = []
exceptions = []
candidate_classes = set()
exact_values = {}
index = 0
used_variants = set()
summary = {'pages': 0, 'style_attributes_removed': 0, 'rules': 0, 'utilities': 0}

def text(tokens):
    return tinycss2.serialize([t for t in tokens if t.type != 'comment']).strip()

def selectors(tokens):
    groups, current = [], []
    for token in tokens:
        if token.type == 'literal' and token.value == ',':
            groups.append(text(current)); current = []
        else:
            current.append(token)
    groups.append(text(current))
    return [s for s in groups if s]

def absolute_urls(value, origin):
    def replace(match):
        quote, value = match.group(1) or '', match.group(2)
        if value.startswith(('data:', 'http:', 'https:', '#', '/')):
            return match.group(0)
        return f'url({quote}{urljoin(origin, value)}{quote})'
    return re.sub(r'url\(([\'\"]?)([^\)\'\"]+)\1\)', replace, value)

simple = {
    ('display','flex'):'flex', ('display','block'):'block', ('display','none'):'hidden',
    ('display','inline-block'):'inline-block', ('display','inline'):'inline',
    ('position','relative'):'relative', ('position','absolute'):'absolute', ('position','fixed'):'fixed',
    ('box-sizing','border-box'):'box-border', ('text-align','center'):'text-center',
    ('text-transform','uppercase'):'uppercase', ('overflow','hidden'):'overflow-hidden',
    ('align-items','center'):'items-center', ('justify-content','center'):'justify-center',
    ('flex-direction','column'):'flex-col', ('flex-wrap','wrap'):'flex-wrap',
    ('cursor','pointer'):'cursor-pointer', ('text-decoration','none'):'no-underline',
    ('visibility','hidden'):'invisible', ('visibility','visible'):'visible',
    ('object-fit','cover'):'object-cover', ('object-fit','contain'):'object-contain',
}

def utility(prop, value):
    value = re.sub(r'url\(([\'\"])(.*?)\1\)', lambda m: 'url(' + quote(m.group(2), safe=':/;,%=+-._~?#@&') + ')', value)
    # CSS optimizers round numeric percentages in normal declarations. Custom
    # property token streams retain the exact original grid fractions.
    if not prop.startswith('--') and re.fullmatch(r'-?\d+\.\d{5,}%', value):
        whole, fraction = value.rstrip('%').lstrip('-').split('.')
        terms = [whole]
        for offset in range(0,len(fraction),4):
            digits = fraction[offset:offset+4]
            variable = '--tw-fraction-' + digits
            exact_values[variable] = str(int(digits))
            terms.append(f'var({variable}) / {10 ** (offset + len(digits))}')
        sign = '-1%' if value.startswith('-') else '1%'
        value = f'calc(({" + ".join(terms)}) * {sign})'
    if (prop,value) in simple:
        return simple[prop,value]
    # Arbitrary properties retain exact units, shorthand semantics and values.
    escaped = value.replace('_', '\\_') if 'url(' not in value else value
    escaped = re.sub(r'\s', '_', escaped)
    return f'[{prop}:{escaped}]'

def static_candidate(selector):
    selector = re.sub(r'::?(before|after|first-letter|first-line|selection|placeholder|marker|file-selector-button)\b', '', selector)
    selector = re.sub(r'::[-\w]+(?:\([^)]*\))?', '', selector)
    selector = re.sub(r':not\([^)]*(?:hover|focus|checked|disabled|active|enabled)[^)]*\)', '', selector)
    selector = re.sub(r':not\([^)]*\.(?:show|active|d-none|collapsed|dropdown-active)\b[^)]*\)', '', selector)
    selector = re.sub(r':(?:hover|focus-visible|focus-within|focus|active|visited|link|checked|disabled|enabled|target|indeterminate|valid|invalid|placeholder-shown|read-only|read-write)\b', '', selector)
    selector = re.sub(r'\.(?:active|d-none|dropdown-active|mobile-nav-active|show|showing|collapsing|collapsed|swiper-slide-active|swiper-slide-next|swiper-slide-prev)\b', ':where(*)', selector)
    selector = re.sub(r'\[(?:aria-expanded|aria-pressed|disabled|checked)[^]]*\]', '', selector)
    selector = selector.strip()
    if not selector or selector.endswith(('>', '+', '~')):
        selector += ' *'
    return selector or '*'

def variant_selector(selector):
    # Pseudo-elements must remain outside :is(). Preserve original specificity.
    match = re.search(r'(::?(?:before|after|first-letter|first-line|selection|placeholder|marker|file-selector-button)|::[-\w]+)(.*)$', selector)
    if match:
        element = selector[:match.start()] or '*'
        pseudo = match.group(1)
        if pseudo in [':before', ':after', ':first-letter', ':first-line']:
            pseudo = ':' + pseudo
        return f'&:is({element}){pseudo}{match.group(2)}'
    return f'&:is({selector})'

def declarations(content, origin):
    return [(d.lower_name, absolute_urls(text(d.value), origin), d.important)
            for d in tinycss2.parse_declaration_list(content, skip_comments=True, skip_whitespace=True)
            if d.type == 'declaration']

def parse_css(css, origin, wrappers=()):
    global index
    result = []
    for rule in tinycss2.parse_stylesheet(css, skip_comments=True, skip_whitespace=True):
        if rule.type == 'at-rule':
            if rule.lower_at_keyword in ['media','supports','container'] and rule.content is not None:
                result.extend(parse_css(tinycss2.serialize(rule.content), origin, wrappers + (f'@{rule.lower_at_keyword} {text(rule.prelude)}',)))
            elif rule.lower_at_keyword in ['font-face', 'keyframes', '-webkit-keyframes']:
                css_rule = absolute_urls(tinycss2.serialize([rule]), origin)
                for wrapper in reversed(wrappers): css_rule = wrapper + '{' + css_rule + '}'
                if css_rule not in exceptions: exceptions.append(css_rule)
        elif rule.type == 'qualified-rule':
            decls = declarations(rule.content, origin)
            for selector in selectors(rule.prelude):
                entries = []
                for prop, value, important in decls:
                    if not value: continue
                    # Do not let Tailwind repair invalid legacy calc syntax: the
                    # browser ignored these declarations in the baseline.
                    if 'calc(' in value and re.search(r'\d[a-z%]+[+-]\d',value): continue
                    index += 1
                    variant = f'r{index:06d}'
                    definition = variant_selector(selector) + ' { @slot; }'
                    for wrapper in reversed(wrappers): definition = wrapper + ' { ' + definition + ' }'
                    variants.append((variant, f'@custom-variant {variant} {{ {definition} }}'))
                    entries.append((variant, f'tw:{variant}:{utility(prop,value)}' + ('!' if important else '')))
                result.append((selector, static_candidate(selector), entries))
    return result

global_rules = []
for name, origin in [('app/globals.css','/'), ('public/assets/vendor/bootstrap/css/bootstrap.min.css','/assets/vendor/bootstrap/css/bootstrap.min.css'), ('public/assets/css/main.css','/assets/css/main.css')]:
    global_rules.extend(parse_css((BACKUP / name).read_text(encoding='utf8'), origin))

def make_dom(nodes):
    soup = BeautifulSoup('<!doctype html><html><head></head><body><a class="skip-link" href="#main">Skip to content</a></body></html>', 'html5lib')
    refs = {}
    def append(node, parent):
        if isinstance(node,str): parent.append(NavigableString(node)); return
        tag = soup.new_tag(node['tag'], attrs=node['attrs'].copy())
        parent.append(tag); refs[id(tag)] = node
        for child in node['children']: append(child,tag)
    for node in nodes: append(node,soup.body)
    return soup, refs

selector_cache = {}
def apply_rules(soup, rules, targets):
    matcher = cssselect2.Matcher()
    for selector, candidate, entries in rules:
        if candidate not in selector_cache:
            try: selector_cache[candidate] = cssselect2.compile_selector_list(candidate)
            except Exception: selector_cache[candidate] = []
        for compiled in selector_cache[candidate]:
            matcher.add_selector(compiled, entries)
    for element in soup.find_all(True): element['data-tw-migration-id'] = str(id(element))
    tree = html5lib.parse(str(soup), treebuilder='etree', namespaceHTMLElements=False)
    for element in cssselect2.ElementWrapper.from_html_root(tree).iter_subtree():
        if element.local_name in ['head','style','script','link','meta']: continue
        key = element.etree_element.get('data-tw-migration-id')
        if key is None: continue
        for _, _, _, entries in matcher.match(element):
            bucket = targets.setdefault(int(key), [])
            for variant, cls in entries:
                if cls not in bucket: bucket.append(cls)
                used_variants.add(variant); candidate_classes.add(cls)
    for element in soup.find_all(True): element.attrs.pop('data-tw-migration-id',None)

root_classes = None
for source in sorted((BACKUP / 'content/pages').glob('*.json')):
    page = json.loads(source.read_text(encoding='utf8'))
    soup, refs = make_dom(page['nodes'])
    targets = {}
    apply_rules(soup,global_rules,targets)
    if root_classes is None:
        root_classes = {'html': ' '.join(targets.get(id(soup.html), [])), 'body': ' '.join(targets.get(id(soup.body), [])), 'skipLink': ' '.join(targets.get(id(soup.select_one('.skip-link')), []))}
    page_rules = parse_css(page['styles'], '/')
    apply_rules(soup,page_rules,targets)
    for element in soup.find_all(True):
        node = refs.get(id(element))
        if node is None: continue
        classes = targets.get(id(element), [])
        attrs = node['attrs']
        if 'style' in attrs:
            # React's existing inlineStyle uses last values, first property position,
            # and removes !important. Replicate that behavior exactly.
            inline = dict((p,v) for p,v,_ in declarations(attrs.pop('style'), '/'))
            for prop,value in inline.items():
                cls = f'tw:legacy-inline:{utility(prop,value)}'
                classes.append(cls); candidate_classes.add(cls)
            summary['style_attributes_removed'] += 1
        if classes:
            attrs['class'] = ' '.join(filter(None,[attrs.get('class',''),' '.join(classes)]))
    page.pop('styles',None)
    (ROOT / 'content/pages' / source.name).write_text(json.dumps(page,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    summary['pages'] += 1

variant_css = '\n'.join(definition for name,definition in variants if name in used_variants)
variant_css += '\n@custom-variant legacy-inline (&:not(#tw-inline-specificity#tw-inline-specificity#tw-inline-specificity));\n'
(ROOT / 'app/tailwind-variants.css').write_text('/* Generated selector/state/media variants. All visual declarations are Tailwind utilities. */\n'+variant_css,encoding='utf8')
retained_exceptions = []
for exception in exceptions:
    animation = re.search(r'@(?:-webkit-)?keyframes\s+([^\s{]+)',exception)
    if animation and not any(animation.group(1) in cls for cls in candidate_classes): continue
    retained_exceptions.append(exception)
(ROOT / 'app/tailwind-exceptions.css').write_text('/* CSS-only primitives: font-face and any actually used named keyframes. */\n'+'\n'.join(retained_exceptions),encoding='utf8')
for variable,value in exact_values.items():
    cls = f'tw:[{variable}:{value}]'
    root_classes['html'] += ' ' + cls
    candidate_classes.add(cls)
(ROOT / 'content/tailwind-root.json').write_text(json.dumps(root_classes,indent=2),encoding='utf8')
(ROOT / 'content/tailwind-candidates.txt').write_text('\n'.join(sorted(candidate_classes)),encoding='utf8')
summary.update({'rules':len(used_variants),'utilities':len(candidate_classes),'css_exceptions':len(retained_exceptions)})
(ROOT / 'content/tailwind-migration.json').write_text(json.dumps(summary,indent=2),encoding='utf8')
print(json.dumps(summary,indent=2),flush=True)
