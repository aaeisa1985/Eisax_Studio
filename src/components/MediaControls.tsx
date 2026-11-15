"use client";

import { normalizeCrop } from "@/lib/utils/mediaStyle";
import type { ChartData, ImageCrop } from "@/lib/validation/projects";

export function ChartDataEditor({
  chart,
  ar,
  onChange,
  onClose,
}: {
  chart: ChartData;
  ar: boolean;
  onChange: (next: ChartData) => void;
  onClose?: () => void;
}) {
  const count = Math.min(chart.categories.length, chart.values.length);
  const categories = chart.categories.slice(0, count);
  const values = chart.values.slice(0, count);

  function updateRow(idx: number, patch: { cat?: string; val?: number }) {
    const nextCats = [...categories];
    const nextVals = [...values];
    if (patch.cat !== undefined) nextCats[idx] = patch.cat.slice(0, 60);
    if (patch.val !== undefined && Number.isFinite(patch.val)) nextVals[idx] = patch.val;
    onChange({ ...chart, categories: nextCats, values: nextVals });
  }

  function addRow() {
    if (categories.length >= 10) return;
    onChange({
      ...chart,
      categories: [...categories, `${ar ? "بند" : "Item"} ${categories.length + 1}`],
      values: [...values, 50],
    });
  }

  function removeRow(idx: number) {
    if (categories.length <= 2) return;
    onChange({
      ...chart,
      categories: categories.filter((_, i) => i !== idx),
      values: values.filter((_, i) => i !== idx),
    });
  }

  return (
    <div
      className="mt-2 rounded-lg border p-2.5 text-xs"
      style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select
          value={chart.kind}
          onChange={(e) => onChange({ ...chart, kind: e.target.value as ChartData["kind"] })}
          className="input !w-auto !py-1 text-xs"
          aria-label={ar ? "نوع الرسم البياني" : "Chart type"}
        >
          <option value="bar">{ar ? "أعمدة (Bar)" : "Bar"}</option>
          <option value="line">{ar ? "خطي (Line)" : "Line"}</option>
          <option value="pie">{ar ? "دائري (Pie)" : "Pie"}</option>
        </select>
        <input
          value={chart.title}
          onChange={(e) => onChange({ ...chart, title: e.target.value.slice(0, 200) })}
          className="input !w-auto min-w-32 flex-1 !py-1 text-xs"
          placeholder={ar ? "عنوان الرسم" : "Chart title"}
          dir="auto"
        />
        <input
          value={chart.unit ?? ""}
          onChange={(e) => onChange({ ...chart, unit: e.target.value.slice(0, 20) || undefined })}
          className="input !w-20 !py-1 text-xs"
          placeholder={ar ? "الوحدة" : "Unit"}
          dir="auto"
        />
        {onClose && (
          <button type="button" onClick={onClose} className="btn btn-primary !px-2 !py-1 text-xs">
            ✓ {ar ? "تم" : "Done"}
          </button>
        )}
      </div>

      <div className="space-y-1">
        {categories.map((cat, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <input
              value={cat}
              onChange={(e) => updateRow(idx, { cat: e.target.value })}
              className="input !w-auto flex-1 !py-0.5 text-xs"
              placeholder={ar ? "التسمية" : "Label"}
              dir="auto"
            />
            <input
              type="number"
              step="any"
              value={String(values[idx] ?? 0)}
              onChange={(e) => {
                const n = Number.parseFloat(e.target.value);
                if (Number.isFinite(n)) updateRow(idx, { val: n });
              }}
              className="input !w-24 !py-0.5 text-xs tabular-nums"
              aria-label={`Value ${idx + 1}`}
            />
            <button
              type="button"
              onClick={() => removeRow(idx)}
              disabled={categories.length <= 2}
              className="btn btn-ghost !px-1.5 !py-0.5 text-xs"
              style={{ color: "var(--danger)" }}
              title={ar ? "حذف الصف" : "Remove row"}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={addRow}
          disabled={categories.length >= 10}
          className="btn btn-ghost !px-2 !py-0.5 text-xs"
        >
          + {ar ? "إضافة قيمة" : "Add data point"}
        </button>
        <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
          {count}/10
        </span>
      </div>
    </div>
  );
}

export function CropControlsBar({
  crop,
  ar,
  onChange,
  onDone,
}: {
  crop?: ImageCrop | null;
  ar: boolean;
  onChange: (next: ImageCrop) => void;
  onDone?: () => void;
}) {
  const c = normalizeCrop(crop);
  const edges: Array<{ key: keyof ImageCrop; label: string }> = [
    { key: "top", label: ar ? "أعلى" : "Top" },
    { key: "right", label: ar ? "يمين" : "Right" },
    { key: "bottom", label: ar ? "أسفل" : "Bottom" },
    { key: "left", label: ar ? "يسار" : "Left" },
  ];

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
      style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="font-semibold" style={{ color: "var(--turquoise)" }}>
        ✂ {ar ? "قص الصورة (%):" : "Crop (%):"}
      </span>
      {edges.map(({ key, label }) => (
        <label key={key} className="flex items-center gap-1">
          <span style={{ color: "var(--text-dim)" }}>{label}</span>
          <input
            type="number"
            min={0}
            max={45}
            step={1}
            value={Math.round(c[key])}
            onChange={(e) => {
              const v = Number.parseFloat(e.target.value);
              onChange(normalizeCrop({ ...c, [key]: Number.isFinite(v) ? v : 0 }));
            }}
            className="input !w-14 !py-0.5 text-center text-xs tabular-nums"
          />
        </label>
      ))}
      <button
        type="button"
        className="btn btn-ghost !px-2 !py-0.5 text-xs"
        onClick={() => onChange({ top: 0, right: 0, bottom: 0, left: 0 })}
      >
        {ar ? "إعادة ضبط" : "Reset"}
      </button>
      {onDone && (
        <button type="button" className="btn btn-primary !px-2 !py-0.5 text-xs" onClick={onDone}>
          ✓ {ar ? "تطبيق القص" : "Done"}
        </button>
      )}
    </div>
  );
}
