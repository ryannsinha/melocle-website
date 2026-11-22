'use strict';


function setWorkspace(view) {
  const data = WORKSPACE[view];
  if (!data) return;
  document.querySelector('#workspace-content').innerHTML = data.html;
  window.MeloclePreview?.track('workspace_view',{placement:'walkthrough',workspace:view});
  document.querySelector('#app-breadcrumb').textContent = data.name;
  document.querySelectorAll('[data-view]').forEach(button => {
    const selected = button.dataset.view === view;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

document.querySelector('#app-navigation').innerHTML = Object.entries(WORKSPACE).map(([id, data]) =>
  `<button class="app-nav-item" data-view="${id}" aria-pressed="false">${icon(data.icon)}<span>${data.name}</span></button>`
).join('');
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setWorkspace(button.dataset.view)));
setWorkspace('overview');
document.querySelector('#workspace-content').addEventListener('click',event=>{const step=event.target.closest('[data-walkthrough-step]');if(step)setWorkspace(step.dataset.walkthroughStep);});
document.querySelector('#preview-detail-toggle').addEventListener('click',event=>{const button=event.currentTarget,expanded=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(expanded));document.querySelector('.product-window').classList.toggle('is-expanded',expanded);button.textContent=expanded?'Show concise example':'Show full workspace example';scheduleWorkspaceMeasure();});

// Reserve the tallest example at the current width so every option shares one frame.
const workspaceContent = document.querySelector('#workspace-content');
let workspaceMeasureFrame = 0;
function measureWorkspaceHeight() {
  workspaceMeasureFrame = 0;
  const probe = document.createElement('div');
  probe.className = 'workspace-measurement';
  probe.inert = true;
  probe.setAttribute('aria-hidden','true');
  const style = getComputedStyle(workspaceContent);
  probe.style.width = workspaceContent.getBoundingClientRect().width + 'px';
  probe.style.padding = style.padding;
  workspaceContent.parentElement.append(probe);
  let height = 0;
  try {
    for (const data of Object.values(WORKSPACE)) {
      probe.innerHTML = data.html;
      height = Math.max(height,probe.getBoundingClientRect().height);
    }
  } finally {
    probe.remove();
  }
  workspaceContent.style.setProperty('--workspace-content-height',Math.ceil(height) + 'px');
}
function scheduleWorkspaceMeasure() {
  if (!workspaceMeasureFrame) workspaceMeasureFrame = requestAnimationFrame(measureWorkspaceHeight);
}
const workspaceResize = new ResizeObserver(scheduleWorkspaceMeasure);
workspaceResize.observe(workspaceContent.parentElement);
// The heading also catches user text-spacing changes without a viewport resize.
const workspaceTextResize = new ResizeObserver(scheduleWorkspaceMeasure);
new MutationObserver(() => {
  workspaceTextResize.disconnect();
  [...workspaceContent.children].forEach(child => workspaceTextResize.observe(child));
}).observe(workspaceContent,{childList:true});
window.addEventListener('resize',scheduleWorkspaceMeasure,{passive:true});
document.fonts.ready.then(scheduleWorkspaceMeasure);
measureWorkspaceHeight();

function setTabState(selector, key, selected) {
  document.querySelectorAll(selector).forEach(button => {
    const active = button.dataset[key] === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
}
function wireTabs(selector, key, update, orientation = 'horizontal') {
  const buttons = [...document.querySelectorAll(selector)];
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => update(button.dataset[key]));
    button.addEventListener('keydown', event => {
      let next;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      if (event.key === (orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight')) next = (index + 1) % buttons.length;
      if (event.key === (orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft')) next = (index - 1 + buttons.length) % buttons.length;
      if (next === undefined) return;
      event.preventDefault();
      update(buttons[next].dataset[key]);
      buttons[next].focus();
    });
  });
}
// Product sections stay visible in document order; their previews do not replace one another.
document.querySelectorAll('[data-presence-preview]').forEach(preview => {
  preview.innerHTML = PRESENCE[preview.dataset.presencePreview].html;
});
// Optional depth lives outside the equal-height cards.
function openStackDetail(id, trigger) {
  const detail = document.getElementById(id);
  detail.returnFocus = trigger;
  closeMenu();
  detail.showModal();
}
document.querySelectorAll('[data-detail]').forEach(button => button.addEventListener('click', () => openStackDetail(button.dataset.detail, button)));
document.querySelectorAll('a[href="#brand-context"]').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  openStackDetail('context-dialog', link);
}));
for (const id of ['context-dialog', 'signals-dialog']) {
  const detail = document.getElementById(id);
  detail.querySelector('[data-close-detail]').addEventListener('click', () => detail.close());
  detail.addEventListener('close', () => {
    const trigger = detail.returnFocus;
    if (trigger?.getClientRects().length) trigger.focus({preventScroll:true});
    else document.querySelector('#product-toggle').focus({preventScroll:true});
  });
  detail.addEventListener('click', event => {
    const box = detail.getBoundingClientRect();
    if (event.target === detail && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) detail.close();
  });
}

// Native sticky cards share one scroll boundary. The menu's shorter boundary ends at Unibox.
const productStack = document.querySelector('.product-stack');
const sectionNav = document.querySelector('.platform-subnav');
const navTrack = document.querySelector('.product-nav-track');
const sectionLinks = [...sectionNav.querySelectorAll('a')];
const productSections = [...productStack.querySelectorAll('[data-product-section]')];
const stackMarkers = new Map([...productStack.querySelectorAll('[data-stack-for]')].map(marker => [marker.dataset.stackFor, marker]));
let sectionScrollFrame = 0;
let activeProductSection = '';
let mainNavHeight = 0;
let sectionNavHeight = 0;
let stackBaseTop = 0;
let stackPeek = 32;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function updateProductSection() {
  sectionScrollFrame = 0;
  // Read layout once, then update compositor-friendly depth without delaying native scroll.
  const markerTops = productSections.map(section => stackMarkers.get(section.id).getBoundingClientRect().top);
  const uniboxTop = markerTops[markerTops.length - 1];
  const release = Math.max(0, Math.min(sectionNavHeight, mainNavHeight + sectionNavHeight - uniboxTop));
  const animateDepth = !reducedMotion.matches && !productStack.classList.contains('stack-flow');
  const scales = productSections.map((section, index) => {
    if (!animateDepth || index === productSections.length - 1) return '1';
    const settleAt = stackBaseTop + (index + 1) * stackPeek - release;
    const enterAt = Math.max(settleAt + 1, window.innerHeight * 0.74);
    const progress = Math.max(0, Math.min(1, (enterAt - markerTops[index + 1]) / Math.max(1, enterAt - settleAt)));
    const eased = progress * progress * (3 - 2 * progress);
    return (1 - eased * 0.018).toFixed(4);
  });
  productStack.style.setProperty('--menu-release', release + 'px');
  productSections.forEach((section, index) => {
    if (section.style.getPropertyValue('--stack-scale') !== scales[index]) section.style.setProperty('--stack-scale', scales[index]);
  });
  let current = productSections[0];
  productSections.forEach((section, index) => {
    if (markerTops[index] <= stackBaseTop + index * stackPeek - release + 12) current = section;
  });
  if (current.id === activeProductSection) return;
  activeProductSection = current.id;
  sectionLinks.forEach(link => {
    if (link.hash === '#' + current.id) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
  const activeLink = sectionNav.querySelector('[aria-current]');
  const scroller = sectionNav.querySelector('.platform-subnav-links');
  const linkBox = activeLink.getBoundingClientRect();
  const scrollBox = scroller.getBoundingClientRect();
  if (linkBox.left < scrollBox.left || linkBox.right > scrollBox.right) {
    scroller.scrollTo({left: scroller.scrollLeft + linkBox.left - scrollBox.left - (scrollBox.width - linkBox.width) / 2, behavior: 'instant'});
  }
}
function scheduleProductSection() {
  if (!sectionScrollFrame) sectionScrollFrame = requestAnimationFrame(updateProductSection);
}
function measureStickyNavigation() {
  mainNavHeight = document.querySelector('.site-header').getBoundingClientRect().height;
  sectionNavHeight = sectionNav.getBoundingClientRect().height;
  const mobile = window.innerWidth <= 620;
  stackPeek = mobile ? 24 : 32;
  stackBaseTop = mainNavHeight + sectionNavHeight + (mobile ? 10 : 12);
  const available = window.innerHeight - stackBaseTop - stackPeek * (productSections.length - 1) - (mobile ? 18 : 24);
  const cardHeight = Math.max(280, Math.min(520, Math.floor(available)));
  const root = document.documentElement;
  root.style.setProperty('--main-nav-height', mainNavHeight + 'px');
  root.style.setProperty('--section-nav-height', sectionNavHeight + 'px');
  productStack.style.setProperty('--stack-card-height', cardHeight + 'px');
  productStack.style.setProperty('--stack-peek', stackPeek + 'px');
  // Very short/zoomed viewports retain a readable flow instead of clipping copy.
  const sample=document.querySelector('.product-stack .feature-copy>p');
  const textStyle=getComputedStyle(sample);
  const adaptedText=(parseFloat(textStyle.letterSpacing)||0)>=parseFloat(textStyle.fontSize)*.1 || (parseFloat(textStyle.wordSpacing)||0)>=parseFloat(textStyle.fontSize)*.12;
  productStack.classList.toggle('stack-flow',window.innerHeight<540 || adaptedText);
  productSections.forEach((section, index) => {
    section.style.setProperty('--stack-top', stackBaseTop + index * stackPeek + 'px');
    section.style.setProperty('--stack-order', index + 1);
  });
  navTrack.style.height = stackMarkers.get('unibox').offsetTop + 'px';
  scheduleProductSection();
}
const stickyNavResize = new ResizeObserver(measureStickyNavigation);
stickyNavResize.observe(document.querySelector('.site-header'));
stickyNavResize.observe(sectionNav);
productSections.forEach(section => {stickyNavResize.observe(section);stickyNavResize.observe(section.querySelector('.feature-copy'));});
window.addEventListener('scroll', scheduleProductSection, {passive: true});
window.addEventListener('resize', measureStickyNavigation, {passive: true});
reducedMotion.addEventListener('change', scheduleProductSection);
measureStickyNavigation();

function scrollToProduct(id, behavior = reducedMotion.matches ? 'instant' : 'smooth') {
  const marker = stackMarkers.get(id);
  if (!marker) return;
  const index = productSections.findIndex(section => section.id === id);
  const offset = id === 'unibox' ? mainNavHeight : stackBaseTop + index * stackPeek;
  window.scrollTo({top: marker.getBoundingClientRect().top + window.scrollY - offset, behavior});
}
document.querySelectorAll('a[href^="#"]').forEach(link => {
  const id = link.hash.slice(1);
  if (!stackMarkers.has(id)) return;
  link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (location.hash !== link.hash) history.pushState(null, '', link.hash);
    // Wait for a mobile navigation disclosure to close and update the header size.
    requestAnimationFrame(() => { measureStickyNavigation(); scrollToProduct(id); });
  });
});
window.addEventListener('popstate', () => requestAnimationFrame(() => scrollToProduct(location.hash.slice(1), 'instant')));
window.addEventListener('load', () => { measureStickyNavigation(); scrollToProduct(location.hash.slice(1), 'instant'); });
productStack.addEventListener('focusin', event => {
  const section = event.target.closest('[data-product-section]');
  if (section && section.id !== activeProductSection) scrollToProduct(section.id, 'instant');
});

document.querySelector('#network-tabs').innerHTML = Object.entries(NETWORK).map(([id, data], index) =>
  `<button id="network-${id}" class="network-tab" role="tab" aria-selected="false" aria-controls="network-panel" tabindex="${index ? -1 : 0}" data-network="${id}">${icon(data.icon)}<span><strong>${data.name}</strong><small>${NETWORK_OPTIONS[data.group].items.length} signal ${NETWORK_OPTIONS[data.group].items.length === 1 ? 'type' : 'types'}</small></span></button>`
).join('');
function setNetwork(id) {
  const data = NETWORK[id];
  if (!data) return;
  setTabState('[data-network]', 'network', id);
  const panel = document.querySelector('#network-panel');
  panel.setAttribute('aria-labelledby', `network-${id}`);
  const coverage = NETWORK_OPTIONS[data.group];
  panel.innerHTML = `<div class="network-copy"><div class="eyebrow">${data.eyebrow}</div><h3>${data.title}</h3><p>${data.description}</p><div class="signal-example"><div class="signal-example-heading">${icon(data.icon)}<span>${data.source}</span></div><blockquote>${data.event}</blockquote><div class="signal-example-action">${icon('spark')}<span>${data.action}</span></div></div></div><div class="signal-coverage"><div class="signal-coverage-heading"><h4>Signals we cover</h4><span>${coverage.items.length} ${coverage.items.length === 1 ? 'type' : 'types'}</span></div><ul>${coverage.items.map(([label, needsSource]) => `<li>${icon('check')}<span>${label}${needsSource ? '<small>Additional source required</small>' : ''}</span></li>`).join('')}</ul></div>`;
}
wireTabs('[data-network]', 'network', setNetwork);
setNetwork('buying');

function setOutreach(id) {
  if (!OUTREACH[id]) return;
  setTabState('[data-outreach]', 'outreach', id);
  const panel = document.querySelector('#outreach-panel');
  panel.setAttribute('aria-labelledby', `outreach-${id}`);
  panel.innerHTML = OUTREACH[id];
}
wireTabs('[data-outreach]', 'outreach', setOutreach);
setOutreach('signals');

function setPrompt(id) {
  const data = PROMPTS[id];
  if (!data) return;
  document.querySelectorAll('[data-prompt]').forEach(button => {
    const active = button.dataset.prompt === id;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelector('#mello-response').innerHTML = `<div class="mello-user-prompt">${data.prompt}</div><h3>${data.title}</h3><p>${data.body}</p><div class="mello-context-tags">${data.tags.map(tag=>`<span>${tag}</span>`).join('')}</div>`;
}
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => setPrompt(button.dataset.prompt)));
setPrompt('content');

// One native page scroll: the role menu stays pinned while its five stories move past it.
const caseLinks = [...document.querySelectorAll('[data-case-link]')];
document.querySelector('#use-case-content').innerHTML = Object.entries(AUDIENCES).map(([id, data]) =>
  `<div class="use-case-marker" data-case-for="${id}" aria-hidden="true"></div><article class="use-case-card" id="use-case-${id}" data-use-case="${id}" aria-labelledby="case-title-${id}"><div class="use-case-card-inner"><div class="eyebrow">${data.eyebrow}</div><h3 id="case-title-${id}">${data.title}</h3><p class="use-case-intro">${data.description}</p><div class="use-case-workflow"><h4>A focused workflow</h4><ol>${data.workflow.map(step=>`<li><span class="use-case-step-icon">${icon(step.icon)}</span><div><strong>${step.title}</strong><p>${step.body}</p></div></li>`).join('')}</ol></div><button class="button button-blue" data-access data-persona-access="${id}">Request early access</button></div></article>`
).join('');
const caseCards = [...document.querySelectorAll('[data-use-case]')];
const caseMarkers = [...document.querySelectorAll('[data-case-for]')];
const caseNav = document.querySelector('.use-case-nav');
const caseSidebar = document.querySelector('.use-case-sidebar');
const caseLayout = document.querySelector('.use-case-layout');
const caseContent = document.querySelector('.use-case-content');
const caseIndicator = document.createElement('span');
caseIndicator.className = 'use-case-indicator';
caseIndicator.setAttribute('aria-hidden','true');
caseNav.prepend(caseIndicator);
let activeUseCase = '';
let caseScrollFrame = 0;
let caseMeasureFrame = 0;
let caseStackTop = 0, caseStackHeight = 0, casePeek = 0, caseEndMargin = 0, caseFlow = false;

function positionCaseIndicator() {
  const link = caseNav.querySelector('[aria-current]');
  if (!link) return;
  caseIndicator.style.width = link.offsetWidth + 'px';
  caseIndicator.style.height = link.offsetHeight + 'px';
  caseIndicator.style.transform = `translate3d(${link.offsetLeft}px,${link.offsetTop}px,0)`;
}
function measureUseCases() {
  caseMeasureFrame = 0;
  const mobile = window.innerWidth <= 680;
  const header = document.querySelector('.site-header').getBoundingClientRect().height;
  const menuHeight = mobile ? caseSidebar.getBoundingClientRect().height : 0;
  const viewport = window.visualViewport?.height || window.innerHeight;
  // Content determines the height; short/zoomed screens use ordinary, unclipped flow.
  caseStackHeight = Math.ceil(Math.max(...caseCards.map(card => {
    const style = getComputedStyle(card);
    return card.firstElementChild.scrollHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 2;
  })));
  caseEndMargin = parseFloat(getComputedStyle(caseCards.at(-1)).marginBottom) || 0;
  caseStackTop = header + (mobile ? menuHeight + 12 : 24);
  const spare = viewport - caseStackTop - caseStackHeight - 16;
  casePeek = Math.max(0,Math.min(mobile ? 10 : 20,Math.floor(spare / (caseCards.length - 1))));
  caseFlow = reducedMotion.matches || viewport < 540 || caseStackHeight > viewport - caseStackTop - 8;
  caseLayout.style.setProperty('--use-case-height',caseStackHeight + 'px');
  caseLayout.style.setProperty('--use-case-menu-height',menuHeight + 'px');
  caseContent.style.setProperty('--case-peek',casePeek + 'px');
  caseContent.classList.toggle('case-flow',caseFlow);
  caseCards.forEach((card,index) => {
    card.style.setProperty('--case-top',caseStackTop + index * casePeek + 'px');
    card.style.setProperty('--case-order',index + 1);
  });
  positionCaseIndicator();
  keepActiveCaseVisible();
  scheduleUseCase();
}
function scheduleCaseMeasure() {
  if (!caseMeasureFrame) caseMeasureFrame = requestAnimationFrame(measureUseCases);
}
function updateUseCase() {
  caseScrollFrame = 0;
  // Natural-position markers keep navigation stable after the cards pin and overlap.
  const markerTops = caseMarkers.map(marker => marker.getBoundingClientRect().top);
  const contentBottom = caseContent.getBoundingClientRect().bottom;
  const lastTop = caseStackTop + (caseCards.length - 1) * casePeek;
  const release = caseFlow ? 0 : Math.max(0,lastTop + caseStackHeight + caseEndMargin - contentBottom);
  let selectedIndex = 0;
  const readingOffset = Math.min(120,caseStackHeight * .24);
  for (let i = 0; i < caseCards.length; i++) {
    const threshold = caseStackTop + (caseFlow ? 0 : i * casePeek) + readingOffset;
    if (markerTops[i] <= threshold) selectedIndex = i;
  }
  const releaseValue = release.toFixed(2) + 'px';
  if (caseContent.style.getPropertyValue('--case-release') !== releaseValue) caseContent.style.setProperty('--case-release',releaseValue);
  caseCards.forEach((card,index) => {
    let scale = 1;
    if (!caseFlow && index < caseCards.length - 1) {
      const covered = caseStackTop + index * casePeek + caseStackHeight - markerTops[index + 1];
      const progress = Math.max(0,Math.min(1,covered / Math.max(1,caseStackHeight - casePeek)));
      const eased = progress * progress * (3 - 2 * progress);
      scale -= .014 * eased;
    }
    const scaleValue = scale.toFixed(5);
    if (card.style.getPropertyValue('--case-scale') !== scaleValue) card.style.setProperty('--case-scale',scaleValue);
  });
  const selected = caseCards[selectedIndex];
  if (activeUseCase === selected.dataset.useCase) return;
  activeUseCase = selected.dataset.useCase;
  for (const card of caseCards) card.classList.toggle('is-current',card === selected);
  for (const link of caseLinks) {
    if (link.dataset.caseLink === activeUseCase) link.setAttribute('aria-current','location');
    else link.removeAttribute('aria-current');
  }
  positionCaseIndicator();
  keepActiveCaseVisible();
}
function keepActiveCaseVisible() {
  if (window.innerWidth > 680) return;
  const link = caseNav.querySelector('[aria-current]');
  if (!link) return;
  const linkBox = link.getBoundingClientRect(), navBox = caseNav.getBoundingClientRect();
  if (linkBox.left < navBox.left || linkBox.right > navBox.right) {
    caseNav.scrollTo({left:caseNav.scrollLeft + linkBox.left - navBox.left - (navBox.width - linkBox.width)/2,behavior:reducedMotion.matches ? 'instant' : 'smooth'});
  }
}
function scheduleUseCase() {
  if (!caseScrollFrame) caseScrollFrame = requestAnimationFrame(updateUseCase);
}
function scrollToUseCase(id,behavior = reducedMotion.matches ? 'instant' : 'smooth') {
  const index = caseCards.findIndex(card => card.dataset.useCase === id);
  if (index < 0) return;
  const offset = caseStackTop + (caseFlow ? 0 : index * casePeek);
  window.scrollTo({top:caseMarkers[index].getBoundingClientRect().top + window.scrollY - offset,behavior});
}
// Keyboard focus reveals a covered story before its controls can receive input.
caseContent.addEventListener('focusin',event => {
  const card = event.target.closest('[data-use-case]');
  if (!caseFlow && card && event.target.matches(':focus-visible') && card.dataset.useCase !== activeUseCase) scrollToUseCase(card.dataset.useCase,'instant');
});
for (const link of caseLinks) link.addEventListener('click', event => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (location.hash !== link.hash) history.pushState(null,'',link.hash);
  scrollToUseCase(link.dataset.caseLink);
});
window.addEventListener('scroll',scheduleUseCase,{passive:true});
window.addEventListener('resize',scheduleCaseMeasure,{passive:true});
window.visualViewport?.addEventListener('resize',scheduleCaseMeasure,{passive:true});
reducedMotion.addEventListener('change',scheduleCaseMeasure);
document.fonts.ready.then(scheduleCaseMeasure);
window.addEventListener('popstate',()=>{if(location.hash.startsWith('#use-case-'))scrollToUseCase(location.hash.slice(10),'instant');});
window.addEventListener('load',()=>{measureUseCases();if(location.hash.startsWith('#use-case-'))scrollToUseCase(location.hash.slice(10),'instant');});
measureUseCases();
const caseContentResize=new ResizeObserver(scheduleCaseMeasure);
caseCards.forEach(card=>caseContentResize.observe(card.firstElementChild));
caseContentResize.observe(caseSidebar);
caseContentResize.observe(document.querySelector('.site-header'));

const menuToggle = document.querySelector('.menu-toggle');
const mobileNav = document.querySelector('#mobile-nav');
const productToggle = document.querySelector('#product-toggle');
const productMenu = document.querySelector('#product-menu');
function closeProductMenu() {
  productMenu.hidden = true;
  productToggle.setAttribute('aria-expanded', 'false');
}
function closeMenu() {
  mobileNav.hidden = true;
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open navigation');
  closeProductMenu();
}
menuToggle.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
  mobileNav.hidden = expanded;
  menuToggle.setAttribute('aria-expanded', String(!expanded));
  menuToggle.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
});
productToggle.addEventListener('click', () => {
  const expanded = productToggle.getAttribute('aria-expanded') === 'true';
  productMenu.hidden = expanded;
  productToggle.setAttribute('aria-expanded', String(!expanded));
});
mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
productMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeProductMenu));
document.querySelectorAll('[data-open-outreach]').forEach(link => link.addEventListener('click', () => setOutreach(link.dataset.openOutreach)));
document.addEventListener('click', event => {
  if (!event.target.closest('.product-disclosure')) closeProductMenu();
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!productMenu.hidden) {
    closeProductMenu();
    productToggle.focus();
  }
  if (!mobileNav.hidden) {
    closeMenu();
    menuToggle.focus();
  }
});
window.matchMedia('(min-width: 621px)').addEventListener('change', event => { if (event.matches) closeMenu(); });
document.querySelector('.product-disclosure').addEventListener('focusout', event => {
  if (!event.currentTarget.contains(event.relatedTarget)) closeProductMenu();
});

document.querySelector('#copyright-year').textContent = new Date().getFullYear();
document.querySelectorAll('svg:not(.icon-library)').forEach(svg => {
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
});

// Quiet, one-time chapter reveals; all content remains visible without motion support.
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const revealTargets = document.querySelectorAll('.supporting-heading,.supporting-grid,.mello-copy,.mello-demo,.use-case-heading,.faq-heading,.faq-list,.closing-section>h2,.closing-section>.button');
  document.body.classList.add('motion-ready');
  const chapterReveals = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.add('is-revealed');
      chapterReveals.unobserve(entry.target);
    }
  }, {threshold:.08});
  for (const target of revealTargets) {
    target.dataset.reveal = '';
    chapterReveals.observe(target);
  }
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      document.body.classList.remove('motion-ready');
      chapterReveals.disconnect();
    }
  });
}


// Sample the chapter beneath the glass, so navigation stays legible on paper, ink, and blue.
const glassHeader = document.querySelector('.site-header');
let glassHeaderFrame = 0;
function updateGlassHeader() {
  glassHeaderFrame = 0;
  if (document.querySelector('#mobile-nav:not([hidden])')) return;
  const y = Math.min(glassHeader.getBoundingClientRect().height / 2, 42);
  const underlay = document.elementsFromPoint(window.innerWidth / 2, y).find(el => !glassHeader.contains(el));
  let surface = underlay?.closest('.hero-scene,.platform-walkthrough,.opening-chapter,[data-product-section],.mello-section,.use-case-card,.use-cases-section,.faq-section,.closing-section,.relationship-section,.site-footer') || underlay;
  let rgb = [255,255,255];
  if (window.scrollY > glassHeader.offsetHeight) {
    while (surface) {
      const color = getComputedStyle(surface).backgroundColor.match(/[\d.]+/g)?.map(Number);
      if (color && (color[3] ?? 1) > .9) { rgb = color.slice(0,3); break; }
      surface = surface.parentElement;
    }
  }
  const luminance = rgb.map(v => {v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;}).reduce((sum,v,i) => sum + v * [.2126,.7152,.0722][i],0);
  const tone = luminance < .4 ? 'dark' : 'light';
  const tint = rgb.join(',');
  if (glassHeader.dataset.tint !== tint) {
    glassHeader.style.setProperty('--header-rgb',tint);
    glassHeader.dataset.tint = tint;
    glassHeader.dataset.tone = tone;
  }
}
function scheduleGlassHeader() {
  if (!glassHeaderFrame) glassHeaderFrame = requestAnimationFrame(updateGlassHeader);
}
window.addEventListener('scroll',scheduleGlassHeader,{passive:true});
window.addEventListener('resize',scheduleGlassHeader,{passive:true});
window.addEventListener('load',scheduleGlassHeader);
new MutationObserver(scheduleGlassHeader).observe(mobileNav,{attributes:true,attributeFilter:['hidden']});
scheduleGlassHeader();


// Restrained pointer parallax: no idle loop, no touch scrolling interference.
(() => {
  const scene = document.querySelector('.hero-scene');
  const cells = [...scene.querySelectorAll('.grid-cell')];
  const finePointer = window.matchMedia('(hover:hover) and (pointer:fine)');
  const depths = [.65,1,.55,-.75,-1,-.6];
  let visible = true, bounds = null, frame = 0, previousTime = 0;
  let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
  const allowed = () => visible && finePointer.matches && !reducedMotion.matches && !document.hidden;
  const paint = () => cells.forEach((cell,i) => {
    cell.style.setProperty('--drift-x',(currentX * depths[i]).toFixed(3) + 'px');
    cell.style.setProperty('--drift-y',(currentY * depths[i]).toFixed(3) + 'px');
    cell.style.setProperty('--drift-tilt',(currentX * depths[i] * .06).toFixed(3) + 'deg');
  });
  function clear() {
    cancelAnimationFrame(frame);
    frame = previousTime = 0;
    targetX = targetY = currentX = currentY = 0;
    for (const cell of cells) for (const property of ['--drift-x','--drift-y','--drift-tilt']) cell.style.removeProperty(property);
  }
  function animate(time) {
    frame = 0;
    if (!allowed()) { clear(); return; }
    const elapsed = previousTime ? Math.min(time - previousTime,50) : 16.7;
    previousTime = time;
    const ease = 1 - Math.exp(-elapsed / 110);
    currentX += (targetX - currentX) * ease;
    currentY += (targetY - currentY) * ease;
    const settled = Math.abs(targetX - currentX) < .015 && Math.abs(targetY - currentY) < .015;
    if (settled) { currentX = targetX; currentY = targetY; }
    paint();
    if (!settled) frame = requestAnimationFrame(animate);
    else previousTime = 0;
  }
  function start() { if (!frame && allowed()) frame = requestAnimationFrame(animate); }
  function settle() {
    bounds = null;
    targetX = targetY = 0;
    if (!allowed()) { clear(); return; }
    if (currentX || currentY || frame) start();
  }
  scene.addEventListener('pointermove',event => {
    if (event.pointerType !== 'mouse' || !allowed()) return;
    bounds ||= scene.getBoundingClientRect();
    targetX = Math.max(-1,Math.min(1,(event.clientX - bounds.left) / bounds.width * 2 - 1)) * 12;
    targetY = Math.max(-1,Math.min(1,(event.clientY - bounds.top) / bounds.height * 2 - 1)) * 8;
    start();
  },{passive:true});
  scene.addEventListener('pointerleave',settle);
  window.addEventListener('scroll',settle,{passive:true});
  window.addEventListener('resize',settle,{passive:true});
  document.addEventListener('visibilitychange',clear);
  finePointer.addEventListener('change',clear);
  reducedMotion.addEventListener('change',clear);
  if ('IntersectionObserver' in window) new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) clear();
  }).observe(scene);
})();
