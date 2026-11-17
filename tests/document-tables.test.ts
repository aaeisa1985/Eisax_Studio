import { describe, it, expect } from "vitest";
import { blocksToTiptapDoc, tiptapDocToBlocks } from "@/lib/document/tiptapSync";
import { buildDocx } from "@/lib/export/docx";
import { importDocx } from "@/lib/import/docx";
import type { DocumentBlock } from "@/lib/validation/projects";

describe("merged table cells", () => {
  it("preserves a rectangular merge through editor, DOCX and import", async () => {
    const table: DocumentBlock = { id: "t", kind: "table", text: "", dir: "ltr", rows: [["Merged", "", "A"], ["", "", "B"], ["C", "D", "E"]], cellSpans: [{ row: 0, col: 0, rowspan: 2, colspan: 2 }] };
    const blocks = tiptapDocToBlocks(blocksToTiptapDoc([table]));
    expect(blocks[0]?.rows).toEqual(table.rows);
    expect(blocks[0]?.cellSpans).toEqual(table.cellSpans);
    const result = await buildDocx("Table", { schemaVersion: 1, blocks });
    if ("error" in result) throw new Error(result.error);
    const imported = await importDocx(result.data);
    const importedTable = imported.content.blocks.find(b => b.kind === "table");
    expect(importedTable?.cellSpans).toEqual(table.cellSpans);
    expect(importedTable?.rows).toEqual(table.rows);
  });
});
