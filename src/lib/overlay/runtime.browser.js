// @ts-check
/* eslint-disable max-lines -- injected as one self-contained script; splitting it would need state shared between separately injected scripts */
// Runs inside the recorded page. Plain JavaScript on purpose: TypeScript sources
// pass through swc/tsx, which may inject helpers that do not exist in the page.
;(() => {
  const KEY = '__agentVideoRecorder'
  if (KEY in window) return

  /** @typedef {{ x: number, y: number }} Point */
  /** @typedef {{ size: number, color: string, outline: string }} CursorStyle */
  /** @typedef {{ color: string, durationMs: number, sizePx: number, intensity: number }} ClickStyle */
  /** @typedef {{ cursor: CursorStyle | false, clickEffect: ClickStyle | false }} Config */
  /** @typedef {{ kind: 'outline' | 'background' | 'glow', color: string, widthPx: number, opacity: number }} HighlightStyle */
  /** @typedef {{ box: HTMLDivElement, frame: number }} Highlight */
  /**
   * @typedef {{
   *   position: 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
   *   animation: 'fade' | 'slide', fontSizePx: number, maxWidthPct: number,
   *   color: string, background: string
   * }} NarrationStyle
   */

  /** @type {HTMLDivElement | undefined} */
  let host
  /** @type {HTMLDivElement | undefined} */
  let layer
  /** @type {HTMLDivElement | undefined} */
  let cursorEl
  /** @type {Config} */
  let config = { cursor: false, clickEffect: false }
  /** @type {Point} */
  let cursorAt = { x: 0, y: 0 }
  let visible = false
  let ripples = 0
  /** @type {Map<number, Highlight>} */
  const highlights = new Map()
  let nextHighlightId = 1
  // Space between the element and the highlight, so it frames rather than covers.
  const HIGHLIGHT_PAD = 4
  const HIGHLIGHT_FADE_MS = 200
  /** @type {{ el: HTMLDivElement, style: NarrationStyle } | undefined} */
  let caption
  const CAPTION_MS = 250
  const CAPTION_EDGE = 28

  const STYLE = `
    :host { all: initial; }
    .layer { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
    .layer[hidden] { display: none; }
    .layer * { pointer-events: none; }
    .cursor { position: absolute; left: 0; top: 0; will-change: transform; }
    .highlight { position: absolute; box-sizing: border-box; opacity: 0; }
    .caption {
      position: absolute; box-sizing: border-box; width: fit-content;
      padding: .4em .85em; border-radius: .3em; backdrop-filter: blur(3px);
      font-family: system-ui, sans-serif; font-weight: 500; line-height: 1.45;
      text-align: center; text-shadow: 0 1px 2px rgba(0,0,0,.6);
      white-space: pre-wrap; overflow-wrap: anywhere;
    }
    .ripple {
      position: absolute; box-sizing: border-box; border-radius: 50%;
      border: 3px solid;
      /* White halos keep the ring visible on dark and coloured controls too. */
      box-shadow: 0 0 0 2px rgba(255,255,255,.85), inset 0 0 0 2px rgba(255,255,255,.85);
    }
  `

  function ensureHost() {
    if (host && host.isConnected) return
    const root = document.documentElement
    if (!root) return
    if (!host) {
      host = document.createElement('div')
      host.setAttribute('data-agent-video-recorder', '')
      host.style.cssText =
        'position:fixed;inset:0;pointer-events:none;z-index:2147483647;'
      const shadow = host.attachShadow({ mode: 'closed' })
      const style = document.createElement('style')
      style.textContent = STYLE
      layer = document.createElement('div')
      layer.className = 'layer'
      layer.hidden = !visible
      shadow.append(style, layer)
    }
    // Frameworks that re-render <html> can drop the host; re-attach it.
    root.appendChild(host)
  }

  /** @param {HighlightStyle} style */
  function highlightCss(style) {
    const { kind, color, widthPx } = style
    if (kind === 'outline') return `border:${widthPx}px solid ${color};`
    if (kind === 'background') return `background:${color};`
    return `box-shadow:0 0 0 2px ${color},0 0 ${widthPx * 2}px ${widthPx / 2}px ${color};`
  }

  /**
   * @param {HTMLDivElement} box
   * @param {Element} el
   */
  function placeHighlight(box, el) {
    const r = el.getBoundingClientRect()
    box.style.left = `${r.left - HIGHLIGHT_PAD}px`
    box.style.top = `${r.top - HIGHLIGHT_PAD}px`
    box.style.width = `${r.width + HIGHLIGHT_PAD * 2}px`
    box.style.height = `${r.height + HIGHLIGHT_PAD * 2}px`
    box.style.visibility = el.isConnected ? 'visible' : 'hidden'
  }

  /** @param {NarrationStyle['position']} position */
  function captionPlacement(position) {
    const edge = `${CAPTION_EDGE}px`
    const vertical = position.startsWith('top')
      ? `top:${edge};`
      : `bottom:${edge};`
    if (position === 'top' || position === 'bottom') {
      // margin:auto centres without a transform, which the slide animation uses.
      return `${vertical}left:0;right:0;margin:0 auto;`
    }
    return (
      vertical +
      (position.endsWith('left') ? `left:${edge};` : `right:${edge};`)
    )
  }

  /** @param {NarrationStyle} style */
  function captionKeyframes(style) {
    if (style.animation === 'fade') return [{ opacity: 0 }, { opacity: 1 }]
    const offset = style.position.startsWith('top') ? -16 : 16
    return [
      { opacity: 0, transform: `translateY(${offset}px)` },
      { opacity: 1, transform: 'translateY(0)' },
    ]
  }

  /** @param {{ el: HTMLDivElement, style: NarrationStyle }} leaving */
  async function removeCaption(leaving) {
    const exit = leaving.el.animate(captionKeyframes(leaving.style).reverse(), {
      duration: CAPTION_MS,
      fill: 'forwards',
    })
    try {
      await exit.finished
    } finally {
      leaving.el.remove()
    }
  }

  /** @param {Point} p */
  function translate(p) {
    return `translate(${p.x}px, ${p.y}px)`
  }

  function renderCursor() {
    if (!layer) return
    cursorEl?.remove()
    cursorEl = undefined
    const style = config.cursor
    if (!style) return
    cursorEl = document.createElement('div')
    cursorEl.className = 'cursor'
    // Arrow pointer with its hotspot at the SVG origin (the tip).
    cursorEl.innerHTML =
      `<svg width="${style.size}" height="${style.size * 1.5}" viewBox="0 0 16 24">` +
      `<path d="M1 1 L1 18 L5.5 13.8 L8.6 21 L11.4 19.8 L8.4 12.8 L14.5 12.8 Z" ` +
      `fill="${style.color}" stroke="${style.outline}" stroke-width="1.4" stroke-linejoin="round"/></svg>`
    cursorEl.style.transform = translate(cursorAt)
    layer.appendChild(cursorEl)
  }

  const api = {
    /**
     * @param {Config} nextConfig
     * @param {Point} point
     */
    show(nextConfig, point) {
      ensureHost()
      config = nextConfig
      cursorAt = point
      visible = true
      if (layer) layer.hidden = false
      renderCursor()
    },

    hide() {
      visible = false
      if (layer) layer.hidden = true
    },

    /**
     * @param {Point[]} keyframes
     * @param {number} durationMs
     */
    async moveCursor(keyframes, durationMs) {
      ensureHost()
      const target = keyframes[keyframes.length - 1]
      if (!target) return
      cursorAt = target
      if (!cursorEl) return
      const animation = cursorEl.animate(
        keyframes.map((p) => ({ transform: translate(p) })),
        { duration: durationMs, easing: 'linear', fill: 'forwards' },
      )
      await animation.finished
      cursorEl.style.transform = translate(target)
      animation.cancel()
    },

    /** @param {Point} point */
    async click(point) {
      ensureHost()
      const style = config.clickEffect
      if (!style || !layer) return
      const ripple = document.createElement('div')
      ripple.className = 'ripple'
      const half = style.sizePx / 2
      ripple.style.cssText =
        `left:${point.x - half}px;top:${point.y - half}px;` +
        `width:${style.sizePx}px;height:${style.sizePx}px;border-color:${style.color};`
      layer.insertBefore(ripple, cursorEl ?? null)
      ripples++
      const animation = ripple.animate(
        [
          { transform: 'scale(0.3)', opacity: style.intensity },
          { opacity: style.intensity, offset: 0.4 },
          { transform: 'scale(1)', opacity: 0 },
        ],
        {
          duration: style.durationMs,
          easing: 'cubic-bezier(0.2, 0.6, 0.35, 1)',
        },
      )
      try {
        await animation.finished
      } finally {
        ripple.remove()
        ripples--
      }
    },

    /**
     * Waits for the page's finite, running animations and transitions (not the
     * recorder's own) to finish. Resolves false when the timeout wins.
     * @param {number} timeoutMs
     */
    async waitForAnimations(timeoutMs) {
      /** @type {Promise<boolean>} */
      const timeout = new Promise((resolve) =>
        setTimeout(() => resolve(false), timeoutMs),
      )
      // UIs often start transitions a frame or two after the change (React
      // effects, rAF-driven class toggles), so let those begin first.
      /** @type {Promise<boolean>} */
      const twoFrames = new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))),
      )
      if (!(await Promise.race([twoFrames, timeout]))) return false
      const ownRoot = layer ? layer.getRootNode() : undefined
      // getAnimations() flushes styles, so transitions started by the action are included.
      const pending = document.getAnimations().filter((animation) => {
        const effect = animation.effect
        if (animation.playState !== 'running' || !effect) return false
        if (!Number.isFinite(effect.getComputedTiming().endTime)) return false
        const target = effect instanceof KeyframeEffect ? effect.target : null
        return !target || target.getRootNode() !== ownRoot
      })
      if (pending.length === 0) return true
      const finished = Promise.all(
        pending.map((animation) => animation.finished.catch(() => undefined)),
      ).then(() => true)
      return Promise.race([finished, timeout])
    },

    /**
     * Frames the element until unhighlight(); follows scroll and layout changes.
     * @param {Element} el
     * @param {HighlightStyle} style
     */
    highlight(el, style) {
      ensureHost()
      if (!layer) return 0
      const box = document.createElement('div')
      box.className = 'highlight'
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
      box.style.cssText = `border-radius:${radius + HIGHLIGHT_PAD}px;${highlightCss(style)}`
      placeHighlight(box, el)
      layer.insertBefore(box, cursorEl ?? null)
      const id = nextHighlightId++
      /** @type {Highlight} */
      const entry = { box, frame: 0 }
      const follow = () => {
        placeHighlight(box, el)
        entry.frame = requestAnimationFrame(follow)
      }
      entry.frame = requestAnimationFrame(follow)
      highlights.set(id, entry)
      box.animate([{ opacity: 0 }, { opacity: style.opacity }], {
        duration: HIGHLIGHT_FADE_MS,
        fill: 'forwards',
      })
      return id
    },

    /** @param {number} id */
    async unhighlight(id) {
      const entry = highlights.get(id)
      if (!entry) return
      highlights.delete(id)
      const from = getComputedStyle(entry.box).opacity
      const fade = entry.box.animate([{ opacity: from }, { opacity: 0 }], {
        duration: HIGHLIGHT_FADE_MS,
        fill: 'forwards',
      })
      try {
        await fade.finished
      } finally {
        cancelAnimationFrame(entry.frame)
        entry.box.remove()
      }
    },

    /**
     * Shows a caption, cross-fading out the previous one.
     * @param {string} text
     * @param {NarrationStyle} style
     * @param {boolean} animate false when restoring a caption after navigation
     */
    async narrate(text, style, animate) {
      ensureHost()
      if (!layer) return
      if (caption) void removeCaption(caption)
      const el = document.createElement('div')
      el.className = 'caption'
      el.textContent = text
      el.style.cssText =
        captionPlacement(style.position) +
        `max-width:${style.maxWidthPct}%;font-size:${style.fontSizePx}px;` +
        `color:${style.color};background:${style.background};`
      layer.insertBefore(el, cursorEl ?? null)
      caption = { el, style }
      if (!animate) return
      await el.animate(captionKeyframes(style), {
        duration: CAPTION_MS,
        easing: 'ease-out',
      }).finished
    },

    async clearNarration() {
      const leaving = caption
      caption = undefined
      if (leaving) await removeCaption(leaving)
    },

    /** Test hook: what the layer currently renders. */
    inspect() {
      return {
        visible,
        attached: !!host && host.isConnected,
        cursor: cursorEl ? cursorAt : null,
        ripples,
        highlights: [...highlights.values()].map(({ box }) => {
          const { left, top, width, height } = box.getBoundingClientRect()
          return { left, top, width, height }
        }),
        narration: caption
          ? (() => {
              const r = caption.el.getBoundingClientRect()
              return {
                text: caption.el.textContent ?? '',
                rect: {
                  left: r.left,
                  top: r.top,
                  width: r.width,
                  height: r.height,
                },
              }
            })()
          : null,
      }
    },
  }

  Object.defineProperty(window, KEY, {
    value: api,
    enumerable: false,
    configurable: true,
    writable: false,
  })
})()
