/* Dependency-free progressive enhancement; styles work without JavaScript.
   Load as a classic script, then call FlowUI.mount(root). */
(function (global) {
  'use strict';
  const mounted = new WeakMap();
  function luminance(hex) {
    if (!/^#[\da-f]{6}$/i.test(hex)) throw new TypeError('Expected #rrggbb');
    const rgb = hex.slice(1).match(/../g).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
    return rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722;
  }
  function setBackground(root, hex) {
    const dark = luminance(hex) < .35;
    root.dataset.flowTheme = dark ? 'dark' : 'light';
    root.style.setProperty('--flow-background', hex);
  }
  function syncSliders(root) {
    root.querySelectorAll('.flow-slider input[type="range"]').forEach(input => {
      const face = input.closest('.flow-slider');
      const min = input.min === '' ? 0 : Number(input.min), max = input.max === '' ? 100 : Number(input.max);
      const percent = max > min ? Math.max(0, Math.min(100, (Number(input.value)-min)/(max-min)*100)) : 0;
      face.style.setProperty('--flow-fill', `${percent}%`);
      const output = face.querySelector('output');
      if (output && !face.hasAttribute('data-flow-manual-output')) {
        const digits = Math.min(8, Math.max(0, Number(input.dataset.flowDecimals) || 0));
        output.textContent = Number(input.value).toFixed(digits) + (input.dataset.flowUnit || '');
      }
      if (output) input.setAttribute('aria-valuetext', output.textContent.trim());
    });
  }
  function mount(root) {
    if (!(root instanceof Element) || !root.classList.contains('flow-ui')) throw new TypeError('Pass a .flow-ui element');
    if (mounted.has(root)) return mounted.get(root);
    const controller = new AbortController(), options = { signal: controller.signal };
    const triggers = new Map();
    const dialogs = () => [...root.querySelectorAll('dialog.flow-popup, dialog.flow-dialog')];
    function position(dialog, trigger) {
      const r = trigger.getBoundingClientRect();
      const clamp = (v, max) => Math.max(12, Math.min(v, max));
      dialog.style.left = clamp(r.right-dialog.offsetWidth, innerWidth-dialog.offsetWidth-12)+'px';
      dialog.style.top = clamp(r.bottom+8, innerHeight-dialog.offsetHeight-12)+'px';
    }
    function refresh() { syncSliders(root); }
    root.addEventListener('input', event => { if (event.target.matches('.flow-slider input')) refresh(); }, options);
    root.addEventListener('click', event => {
      const target = event.target.closest('button');
      if (!target || target.disabled || !root.contains(target)) return;
      if (target.hasAttribute('data-flow-toggle')) {
        target.setAttribute('aria-pressed', String(target.getAttribute('aria-pressed') !== 'true'));
        target.dispatchEvent(new CustomEvent('flow:toggle', { bubbles:true, detail:{pressed:target.getAttribute('aria-pressed') === 'true'} }));
      }
      if (target.hasAttribute('data-flow-open')) {
        const dialog = dialogs().find(d => d.id === target.dataset.flowOpen);
        if (!dialog || dialog.open) return;
        triggers.set(dialog, target);
        dialog.showModal();
        if (dialog.classList.contains('flow-popup')) position(dialog, target);
      }
      if (target.hasAttribute('data-flow-close')) target.closest('dialog')?.close();
    }, options);
    // Capture handles dialogs added after mounting, too.
    root.addEventListener('close', event => {
      const trigger = triggers.get(event.target);
      if (trigger?.isConnected) trigger.focus({preventScroll:true});
      triggers.delete(event.target);
    }, {...options, capture:true});
    root.addEventListener('click', event => {
      const dialog = event.target;
      if (!(dialog instanceof HTMLDialogElement) || !dialog.open) return;
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
    }, options);
    global.addEventListener('resize', () => {
      for (const [dialog, trigger] of triggers) if (dialog.open && dialog.classList.contains('flow-popup')) position(dialog,trigger);
    }, options);
    const api = { refresh, destroy() {
      dialogs().filter(d => d.open).forEach(d => d.close());
      controller.abort(); triggers.clear(); mounted.delete(root);
    }};
    mounted.set(root,api); refresh(); return api;
  }
  global.FlowUI = Object.freeze({mount, syncSliders, setBackground, luminance});
})(window);
