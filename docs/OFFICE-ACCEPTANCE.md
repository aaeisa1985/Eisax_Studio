# Office acceptance workflows

This checklist separates automated checks of generated Office archives from visual and behavioral checks in Microsoft Word and PowerPoint. Passing a ZIP/XML or application-level test does **not** establish that Microsoft Office renders or edits a file correctly. Record the app/version, OS, fixture, result, and any issue for each external check.

## Synthetic fixtures

Run `node scripts/create-office-fixtures.mjs` to create five deterministic, synthetic files in `.data/office-fixtures/`:

1. `01-arabic-letter.docx`
2. `02-cv.docx`
3. `03-long-table-report.docx`
4. `04-mixed-language.docx`
5. `05-picture-chart-presentation.pptx`

The content is fictional and contains no personal or customer data. These fixtures exercise representative file structures; they are not snapshots of real customer documents. Repository tests such as `tests/phase6-office-roundtrip.test.ts` inspect import/export behavior and OOXML structure synthetically. They do not launch Microsoft Office.

## Five manual workflows

For each Word workflow: open the fixture in Microsoft Word, review the whole document in Print Layout, make the stated edit, save as a new copy, close Word, reopen the copy, and verify the edit persisted. Inspect any repair/conversion warning and record it. Do not overwrite the supplied fixture.

### 1. Arabic formal letter

- Open `01-arabic-letter.docx`.
- Check right-to-left paragraph direction, right alignment, Arabic punctuation and digits, date placement, and the signature block.
- Add one Arabic sentence, save a copy, close and reopen it. Confirm the sentence remains correctly ordered and selectable.
- Print-preview and export to PDF; check line wrapping, page count, and that the signature is not clipped.

### 2. CV

- Open `02-cv.docx`.
- Check heading hierarchy, contact details, bullets, dates, and alignment of Arabic and Latin text.
- Add a skill bullet and change one heading's emphasis. Save, close, and reopen.
- Print-preview and export to PDF; check for orphaned headings, split bullets, or clipped contact details.

### 3. Long table report

- Open `03-long-table-report.docx`.
- Check repeated header rows, column widths, borders, page breaks, and rows that cross pages.
- Edit a value near the final page, save, close, and reopen. Confirm the table remains editable and the value is retained.
- Print-preview and export to PDF; review every page for clipped columns, missing rows, blank pages, and page-number consistency.

### 4. Mixed-language document

- Open `04-mixed-language.docx`.
- Check an Arabic paragraph beside English words, dates, parentheses, punctuation, and numerals. Confirm cursor movement, selection, and typing in both directions.
- Insert a short English phrase within Arabic text and an Arabic phrase within English text; save, close, and reopen.
- Print-preview and export to PDF; verify bidirectional ordering and punctuation visually.

For PowerPoint workflow: open the presentation, inspect Normal and Slide Sorter views, make the stated edit, save as a new copy, close PowerPoint, reopen, and run Slide Show from the beginning.

### 5. Picture and chart presentation

- Open `05-picture-chart-presentation.pptx`.
- Check that the picture and native chart render, chart labels/legend are legible, and neither object is clipped or substituted.
- In Slide Sorter, reorder two slides. Edit a chart value and move the picture slightly; save, close, and reopen.
- Confirm slide order and edits persist, then run the slide show and export to PDF. Review all slides for cropping, missing media, and readable labels.

## Evidence and result labels

- **Synthetic fixture generation:** confirms only that the local generator wrote files.
- **Automated repository tests:** confirm only assertions exercised by those tests (for example archive parsing, round-trip model content, or OOXML entries). They are not Microsoft Office compatibility certification.
- **External Word/PowerPoint validation:** mark complete only after the manual open/edit/save/close/reopen and print or slide-show checks above are performed in the named Microsoft application. Record exact app version and platform; otherwise mark **Not run**.

Suggested result record: `Workflow | Fixture | App/version + OS | Open/reopen | Edit/save | Print/PDF or slide show | Issues | Date`.
