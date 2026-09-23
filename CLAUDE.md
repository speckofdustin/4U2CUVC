# 4U2CtheUVC — agent notes

## Design system

Use Color Flow design system **v0.1.0** from `/Users/dustin/Documents/codex/ColorTool2/color-flow-design-system` (repository: `speckofdustin/color-flow-design-system`, commit: `3017600c8bdcf2c1ae9e8155507ca6823de3bdd9`). Read its `AGENTS.md`, `docs/foundations.md`, and `docs/components.md` before changing UI. Inspect its desktop light/dark and Cubehelix credit reference images. Reuse the scoped CSS and behaviors in `src/` when appropriate. Preserve the neutral surfaces, filled sliders, button hierarchy, and information-popup pattern while adapting the layout to this product. Check relevant keyboard, theme, and narrow-screen states. If the reference is inaccessible, report that instead of guessing its contents.

- Vendored runtime copy: `public/vendor/color-flow/` (`src/` + `LICENSE` at the pinned commit). Do not edit these files; do not fetch the private repo at build time.
- Stay on this pin until Dustin says to upgrade.
- `<body class="flow-ui">` is the single mounted root (`FlowUI.mount(document.body)` → `flowUI`). Call `flowUI.refresh()` after setting slider values programmatically or re-rendering sliders.
- Themes: light and dark only (Light/Dark buttons at the top of the Controls panel, saved in `localStorage` key `4u2c-theme`, first run follows the OS). No custom background colors.

### Deliberate deviations from Color Flow

1. **Editable slider values.** `.flow-slider` normally shows a read-only `<output>`. Here most sliders carry a `.cam-slider-value` number field (built by `sliderHTML()` in `public/index.html`) layered above the invisible range input, so exact values can be typed. The exposure slider keeps a read-only output because it commits and verifies on release.
2. **Status dot.** Green/red connection indicator inside the Camera field (left of its label) at the top of the Controls panel. Color Flow has no status palette, but the color carries meaning (camera connected vs. offline), so it is kept. The dot is `aria-hidden`; a visually hidden `#camera-status` (role=status, referenced by the select's `aria-describedby`) carries the text.
3. **Toast.** Color Flow has no toast; a local paper-sheet toast is used for transient results and errors.
4. **Black preview stage.** The video stage stays black in both themes (letterbox around Fit). Scopes are *not* black: they sit on the panel paper with traces and graticule in the theme's ink, and vectorscope targets use a darker variant in light mode for legibility (`readScopePalette()` / `VS_TARGETS`). False color and the skin marker keep fixed data colors.
5. **Toggles as pressed buttons, app-owned state.** UVC auto modes and backlight compensation use `.flow-button[aria-pressed]` without `data-flow-toggle`: the app sets `aria-pressed` from the value the camera confirms and reverts on failure.
6. **Neutral gray chrome.** Color Flow's chrome tokens carry a subtle warm/olive tint; this app overrides them with luminance-matched neutral grays (same alpha) on `body.flow-ui` in `public/index.html`, for both themes, plus a neutral panel shadow. The vendored `tokens.css` is untouched. Data colors (false color, scope targets, skin marker, status dot) are unaffected.

Not in scope: an iOS/mobile app. The narrow (≤900px) layout just stacks the browser UI.
