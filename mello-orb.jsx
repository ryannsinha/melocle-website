// Reuses Dashboard 2's ThinkingOrb component and composing-state settings.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThinkingOrb } from 'thinking-orbs';

const roots = new Map();
const visibility = new IntersectionObserver(entries => {
  for (const { target, isIntersecting } of entries) {
    roots.get(target)?.render(<ThinkingOrb state="composing" size={Number(target.dataset.melloOrb)} speed={0.9} theme="light" paused={!isIntersecting} aria-hidden="true" />);
  }
});

function syncOrbs() {
  for (const [host, root] of roots) {
    if (!host.isConnected) {
      visibility.unobserve(host);
      root.unmount();
      roots.delete(host);
    }
  }
  for (const host of document.querySelectorAll('[data-mello-orb]')) {
    if (roots.has(host)) continue;
    roots.set(host, createRoot(host));
    visibility.observe(host);
  }
}

new MutationObserver(syncOrbs).observe(document.querySelector('main'), { childList: true, subtree: true });
syncOrbs();
