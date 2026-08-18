/**
 * react-sketch-canvas@6 maps pointers as:
 *   pageX - getBoundingClientRect().left - window.scrollX
 *
 * getBoundingClientRect is post-transform (workspace zoom). SVG user space is
 * pre-transform layout pixels. Mixing them makes strokes miss the cursor —
 * toward the scaled origin (up/left when zoomed out, down/right when zoomed in).
 *
 * Do not prefer SVG getScreenCTM(): Chrome often omits CSS scale on HTML
 * ancestors, which makes the remap a no-op.
 */

export type SketchPoint = { x: number; y: number };

export function layoutPointFromVisualRect(
  clientX: number,
  clientY: number,
  visualRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  layoutWidth: number,
  layoutHeight: number,
): SketchPoint {
  const scaleX = visualRect.width === 0 ? 1 : layoutWidth / visualRect.width;
  const scaleY = visualRect.height === 0 ? 1 : layoutHeight / visualRect.height;
  return {
    x: (clientX - visualRect.left) * scaleX,
    y: (clientY - visualRect.top) * scaleY,
  };
}

export function mapClientToSketchPoint(
  sketchRoot: HTMLElement,
  clientX: number,
  clientY: number,
): SketchPoint {
  return layoutPointFromVisualRect(
    clientX,
    clientY,
    sketchRoot.getBoundingClientRect(),
    sketchRoot.offsetWidth,
    sketchRoot.offsetHeight,
  );
}

function defineEventNumber(event: PointerEvent, key: 'clientX' | 'clientY' | 'pageX' | 'pageY', value: number) {
  try {
    Object.defineProperty(event, key, {
      configurable: true,
      get: () => value,
    });
  } catch {
    // Some environments freeze native events; drawing then stays unpatched.
  }
}

/**
 * Rewrite pointer coordinates so react-sketch-canvas's pageX − rect − scroll
 * math lands in layout pixels, including ancestor CSS scale.
 */
export function alignPointerEventWithSketchCanvas(event: PointerEvent, sketchRoot: HTMLElement) {
  const local = mapClientToSketchPoint(sketchRoot, event.clientX, event.clientY);
  const rect = sketchRoot.getBoundingClientRect();
  const alignedClientX = rect.left + local.x;
  const alignedClientY = rect.top + local.y;

  defineEventNumber(event, 'clientX', alignedClientX);
  defineEventNumber(event, 'clientY', alignedClientY);
  defineEventNumber(event, 'pageX', alignedClientX + window.scrollX);
  defineEventNumber(event, 'pageY', alignedClientY + window.scrollY);
}

export function attachSketchCanvasPointerFix(container: HTMLElement): () => void {
  const remap = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const sketchRoot = target.closest<HTMLElement>('.react-sketch-canvas');
    if (!sketchRoot || !container.contains(sketchRoot)) return;

    if (event.type === 'pointerdown' && event.isPrimary && event.button === 0) {
      try {
        sketchRoot.setPointerCapture(event.pointerId);
      } catch {
        // Not all targets can capture; drawing still works inside the canvas.
      }
    }

    alignPointerEventWithSketchCanvas(event, sketchRoot);

    if (
      (event.type === 'pointerup' || event.type === 'pointercancel')
      && sketchRoot.hasPointerCapture(event.pointerId)
    ) {
      sketchRoot.releasePointerCapture(event.pointerId);
    }
  };

  // Document capture runs before React's root listeners, so rewritten
  // clientX/pageX are what react-sketch-canvas reads.
  const options: AddEventListenerOptions = { capture: true };
  document.addEventListener('pointerdown', remap, options);
  document.addEventListener('pointermove', remap, options);
  document.addEventListener('pointerup', remap, options);
  document.addEventListener('pointercancel', remap, options);

  return () => {
    document.removeEventListener('pointerdown', remap, options);
    document.removeEventListener('pointermove', remap, options);
    document.removeEventListener('pointerup', remap, options);
    document.removeEventListener('pointercancel', remap, options);
  };
}
