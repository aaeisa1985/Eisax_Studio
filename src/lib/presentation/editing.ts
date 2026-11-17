import type { SlideElement } from "@/lib/validation/projects";

export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";
export function selectionBounds(elements: SlideElement[]) {
  const x = Math.min(...elements.map(e => e.x));
  const y = Math.min(...elements.map(e => e.y));
  return { x, y, w: Math.max(...elements.map(e => e.x + e.w)) - x, h: Math.max(...elements.map(e => e.y + e.h)) - y };
}

/** Locked objects remain anchors, never mutation targets. */
export function alignElements(elements: SlideElement[], ids: string[], alignment: Alignment): SlideElement[] {
  const selected = elements.filter(e => ids.includes(e.id));
  if (selected.length < 2) return elements;
  const b = selectionBounds(selected);
  return elements.map(e => !ids.includes(e.id) || e.locked ? e : {
    ...e,
    x: alignment === "left" ? b.x : alignment === "center" ? b.x + (b.w - e.w) / 2 : alignment === "right" ? b.x + b.w - e.w : e.x,
    y: alignment === "top" ? b.y : alignment === "middle" ? b.y + (b.h - e.h) / 2 : alignment === "bottom" ? b.y + b.h - e.h : e.y,
  });
}

export function distributeElements(elements: SlideElement[], ids: string[], axis: "x" | "y"): SlideElement[] {
  const size = axis === "x" ? "w" : "h";
  const selected = elements.filter(e => ids.includes(e.id)).sort((a,b) => a[axis] - b[axis]);
  if (selected.length < 3 || selected.some(e => e.locked)) return elements;
  const first = selected[0]!;
  const last = selected[selected.length - 1]!;
  const gap = (last[axis] + last[size] - first[axis] - selected.reduce((sum,e) => sum + e[size], 0)) / (selected.length - 1);
  let position = first[axis];
  const positions = new Map(selected.map(e => { const p = position; position += e[size] + gap; return [e.id, p]; }));
  return elements.map(e => positions.has(e.id) ? { ...e, [axis]: positions.get(e.id)! } : e);
}

export function snapPosition(box: {x:number;y:number;w:number;h:number}, others: SlideElement[], threshold = 0.8) {
  const guides: {axis:"x"|"y";position:number}[] = [];
  const out = { ...box };
  for (const axis of ["x", "y"] as const) {
    const size = axis === "x" ? "w" : "h";
    const targets = [0, 50, 100, ...others.flatMap(e => [e[axis], e[axis]+e[size]/2, e[axis]+e[size]])];
    let best = threshold;
    let delta = 0;
    let guide: number | undefined;
    for (const target of targets) for (const offset of [0, box[size]/2, box[size]]) {
      const d = target - box[axis] - offset;
      if (Math.abs(d) < best) { best = Math.abs(d); delta = d; guide = target; }
    }
    out[axis] += delta;
    if (guide !== undefined) guides.push({ axis, position: guide });
  }
  return { box: out, guides };
}

export function elementFormat(el: SlideElement): Partial<SlideElement> {
  const {fontSize,fontFamily,bold,italic,underline,color,align,valign,dir,fillColor,borderColor,borderWidth} = el;
  return {fontSize,fontFamily,bold,italic,underline,color,align,valign,dir,fillColor,borderColor,borderWidth};
}
