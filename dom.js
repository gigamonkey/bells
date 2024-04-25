/*
 * Regexp to match a single HTML tag.
 */
const tagPattern = /^<(\w+)>$/;

/*
 * Get or create a single element. If the query is in the form of a tag, e.g.
 * '<p>' it creates an element of that type. Otherwise it queries the document
 * using the argument as a selector.
 */
const $ = (q, content) => {
  const tag = q.match(tagPattern)?.[1];
  if (tag) {
    const e = document.createElement(tag);
    if (content !== undefined) e.append(content);
    return e;
  } else {
    return document.querySelector(q);
  }
};

/*
 * Get all elements matching selector.
 */
const $$ = (q) => document.querySelectorAll(q);

/*
 * Create a text node.
 */
const text = (t) => document.createTextNode(t);

/*
 * Create an element or elements from literal HTML. If the HTML specifies just
 * one element it is returned. Otherwise returns an array of elements.
 */
const html = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  const children = [...t.content.children];
  return children.length == 1 ? children[0] : children;
};

/*
 * Get an object containing all DOM objects with an id.
 */
const byId = () => Object.fromEntries([...document.querySelectorAll('[id]')].map(e => [e.id, e]));


/*
 * Decorate a DOM element with a CSS class.
 */
const withClass = (className, e) => {
  e.className = className;
  return e;
};

/*
 * Make an A element with a give text and href and an optional target.
 */
const a = (text, href, target) => {
  const e = $('<a>', text);
  e.setAttribute('href', href);
  if (target) e.setAttribute('target', target);
  return e;
};

/*
 * Make a named Bootstrap icon.
 */
const icon = (name) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  svg.classList.add('bi');
  use.setAttributeNS(
    'http://www.w3.org/1999/xlink',
    'xlink:href',
    `/img/bootstrap-icons.svg#${name}`,
  );
  svg.append(use);
  return svg;
};

export { $, $$, a, byId, html, icon, text, withClass };
