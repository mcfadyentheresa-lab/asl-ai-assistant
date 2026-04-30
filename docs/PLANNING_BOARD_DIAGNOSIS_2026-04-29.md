# Planning Board — honest diagnosis & redesign proposal

**Date:** 2026-04-29
**Trigger:** Theresa's screenshot of the Furniture Refinishing template, plus eight months of accumulated complaints that the board is "clumsy and incoherent." This document exists because patching one bug at a time has not worked. Before writing any more code, I am going to lay out exactly what is wrong, why, and what I want to rebuild.
**Author:** Computer (the agent), walking the board as a developer, designer, and project manager — not as a marketing voice.

> No code was changed to produce this document. Nothing ships until you red-pen this and tell me which parts you agree with.

---

## 1. The screenshot

The image you sent is the **Furniture Refinishing** template, freshly opened. What it shows:

- A header that reads "SWATCHES, MATERIALS &" on one line and "PALETTE" on the next — the template heading wrapped in the middle of a sentence.
- Four swatch cards in a row labeled "Paint C…", "Stain C…", "Topco…", "Hardw…" — every title truncated.
- Below them, three material cards labeled "Wood Grain Note", "Edge Profile", "Topcoat" — the only ones that didn't get truncated.
- Two yellow sticky notes in a column to the right.
- No images on any of the swatch cards. No images on the material cards either, even though the cards have an `imageUrl` field.

If a designer opens that template fresh, they get **placeholder text where the template author should have shown them what to do**. "Paint Colour" is not an example of a paint colour. It is the word "Paint Colour."

**Code locations responsible:**
- `server/board-templates.ts` lines 467–476 — the template ships with `name: "Paint Colour"` instead of, say, `name: "White Dove"`. The kitchen template (lines 338–342) does it right with real BM colours; this one does not.
- `server/board-templates.ts` line 227 — swatch width is hard-coded to 130px. "Paint Colour" at the card's font size needs ~155px. Hence the "Paint C…" truncation.
- `client/src/components/SpatialCanvas.tsx` ~line 4669 — the material card renders `imageUrl` as a `<img>` element only if non-empty. The template ships every material with `imageUrl: ""`, so every material card is a text-only block.

---

## 2. What you said, restated as findings

### F1. The Add menu has too many overlapping concepts.
You: *"there are not pain[t] colours product and hardware add image there are too many things that 1 thing can do 4 of them."*

Code reality: there are **two** parallel definitions of the Add palette in `SpatialCanvas.tsx` (the older `Content/Layout/Design/Tools` grouping and the newer `Words/Visual/Selections/Layout` grouping called `addPaletteGroups`). Between them, the user can add **16 different element types**: `text-note`, `text-clean`, `text-heading`, `text-callout`, `link`, `todo`, `image`, `column`, `room_zone`, `surface-paint`, `surface-material`, `hardware`, `product`, `draw`, `connect`, `palette`. Many of these collapse into the same idea:
- "Paint", "Material", "Hardware", "Product", "Image" — all four+image are essentially "a thing on a card with a name and an image."
- "Note", "Clean", "Callout", "Heading" — four flavours of text where one with formatting controls would do.

**The user-facing damage:** every time you open the menu you have to re-decide what you are doing instead of just doing it. There is no muscle memory because the choices keep changing.

### F2. Drag vs. double-click vs. single-click is inconsistent.
You: *"do they drag and drop or do you double click, either or works or doesn't work."*

Code reality: a sample of behaviours I confirmed in `SpatialCanvas.tsx`:
- The Add palette items use `onMouseDown` to start a drag and place at cursor.
- "Hardware" opens a dialog *before* placement (`pendingHardwareDropRef`).
- "Image" opens an *Add Image popup* with three different paths (file picker, URL paste, drag from external tab) — three patterns inside one button.
- "Extract palette" opens *another* dialog, then drops swatches as an anchored row.
- "Draw" enters a global drawing mode that hijacks the canvas.
- The Photos drawer on the right rail uses `onAddImageUrl` (single click adds at viewport center).

Six interaction models for "put a thing on the canvas." A first-time user has no chance.

### F3. "Project board" vs. "library board" is a developer concept leaking into the UI.
You: *"what the fuck is project board and library board???"*

Code reality: `boards.mode` is a string column with values `"project"` or `"library"`. On project boards, primary tabs are rooms; on library boards, primary tabs are categories. Different toolbars, different tab strips, different secondary chips. The user is asked to choose this at board creation time without any explanation that lands.

This **should not be a user choice at all.** A designer thinks in two surfaces:
- "My current project" — what we're working on right now, broken into rooms.
- "My library" — every paint, material, hardware item, fabric, stone I've ever curated, organised the way I want, available on every project I open.

Those are not two flavours of the same `boards` table. They are different objects. We mashed them together because the canvas code already existed and it was cheaper than building two surfaces. That was wrong.

### F4. The library is not actually a library.
You: *"if im in a board, i would want my library card like an asset card. i dont want to constantly recollect items/material i want to always have them at my fingertips."*

Code reality: today the only way to access library content from a project board is:
1. Open the right-rail Photos drawer (which is project-scoped, not library-scoped, and was renamed from "Assets" to "Photos" in PR #94).
2. Open the Materials drawer — which **only shows materials from boards in `mode='library'`** — `MaterialsDrawer.tsx` line 190: *"Your library boards have no material-like items yet. Add images, color swatches…"*
3. Manually type the same hardware item again.

There is no global, cross-project library that surfaces every material/hardware/colour on every board the way you want. The plumbing exists (the data model has cross-board search), but the UI hides it behind a separate "library board" concept that the user has to remember to populate manually.

### F5. Tagging exists but does not pull weight.
You: *"i like that i can tag a job, but it better be useful."*

Code reality: room tags work — every roomable element (`hardware`, `surface`, `product`) carries a `room` field, and the room tab strip filters by it. But the value stops there:
- No budget rollup per room beyond the small chip on the tab strip.
- No "show me everything I've tagged for the kitchen across all my boards."
- No export ("send me a PDF spec for the kitchen").
- No "show me every Aged Brass item across all rooms" — even though that is a totally normal designer ask.

The tag is a noun without a verb.

### F6. The hardware/furniture button on the toolbar duplicates the side rail.
You: *"the furniture icon when clicked its cramped and really its not even needed because its also on the left hand side panel."*

Code reality: confirmed. There's a `FurnitureDrawer` (17 lines, mostly a stub) and a separate furniture entry in the Add palette that opens a hardware-style dialog. Two surfaces, neither is good.

### F7. Stone and hardware should be visual, not textual.
You: *"i want to ba able to see images, of stone and hardware a link is not a visual element."*

Code reality: the hardware card (`SpatialCanvas.tsx` ~line 4779) does render `imageUrl` if present, but:
- The HardwarePickerDialog does not require an image.
- The default hardware element is text-only.
- The "Product" card type defaults to a favicon when there's no `og:image` — favicons are not product images.
- The Furniture Refinishing template ships every material with `imageUrl: ""` (see screenshot).

A designer's library should be **image-first, text-secondary**. We have it backwards.

### F8. The asset board the user liked is gone.
You: *"i did have assests and now there not there."*

Code reality: PR #94 renamed the side-drawer "Photos" → "Assets" → back to "Photos" depending on which file you read. `PhotosDrawer.tsx` shows `"Upload asset"` and empty state `"No assets yet"` — but the surface is project-scoped photos, not the cross-board library asset card you want. **What the user calls "the asset board I liked" has not been removed; it was renamed and re-scoped without communicating the change.** That is a regression in mental model even if the data is intact.

### F9. The file is 8,197 lines of one component.
Not in your words, but a structural finding worth naming. `client/src/components/SpatialCanvas.tsx` holds:
- Canvas viewport + pan/zoom
- Toolbar
- Add palette (twice, see F1)
- 16 element renderers
- 4 dialogs (hardware, palette, render, image)
- 3 drawers
- WebSocket sync
- Drawing mode
- Print/presentation mode

Every feature gets bolted into the same file because there is no other home for it. **This is the structural reason you keep getting incoherent UX.** You cannot redesign one surface without touching all of them.

---

## 3. The redesign

These are the things I want to change. I am laying them out as decisions I am proposing, not as a fait accompli. You strike out the ones you don't like.

### R1. Collapse the Add menu from 16 things to 5.

The Add menu becomes:

| Tool       | What it adds                                                                           | Interaction       |
| :--------- | :------------------------------------------------------------------------------------- | :---------------- |
| **Image**  | Upload, paste URL, or drag from another tab. One unified popover.                      | Click to open popover |
| **Card**   | A typed item (paint / material / hardware / product / fabric / stone). User picks the type *inside* the card after dropping it. | Drag onto canvas |
| **Text**   | Note, heading, callout — all one element with style picker on the toolbar.             | Drag onto canvas |
| **Shape**  | Room zone, column, divider — layout containers.                                        | Drag onto canvas |
| **Draw**   | Pencil mode (Apple Pencil first).                                                      | Toggle button     |

That kills `text-note` / `text-clean` / `text-callout` / `text-heading` as separate concepts (one Text card with formatting), kills `surface-paint` / `surface-material` / `hardware` / `product` as separate Add buttons (one Card type with a kind picker), and removes `link` / `todo` / `palette` from the primary Add menu (link goes into the Card type as a kind; todo lives on the right rail; palette extraction lives on the image card itself as a context action).

**One interaction pattern: drag onto canvas.** No double-click, no popovers-before-placement except the unified Image popover.

### R2. Break "project board" and "library" into two surfaces. Stop calling them both "boards".

- **Project boards** stay where they are — under each project, organised by room tabs. No more "mode" picker.
- **Library** becomes a top-level destination in the sidebar (not nested inside any project). It is *one* persistent collection of every paint, material, hardware item, fabric, stone the user has ever curated. Organised by category tabs (Paint / Stone / Hardware / Fabric / Lighting / etc.). Cards in the library are first-class — image-first, name + supplier + code, vendor link.
- **From any project board's right rail, the Library is one click away** — a slide-out panel showing every library item, searchable, draggable directly onto the room tab you're on. Picking a library card onto a project board creates a *reference* (not a copy), so updates to the library item propagate.
- The `boards.mode = "library"` column gets retired. Library items live in their own table (`library_items`) keyed to the user/org, not to a board.

The first time you log in after this ships, your existing "library boards" get migrated into the new Library destination automatically. Nothing is deleted.

### R3. Rebuild the templates so they teach instead of placeholder.

The Furniture Refinishing template should not say "Paint Colour" — it should ship with a *suggested* paint colour (Benjamin Moore Simply White or similar), already swatched, with a vendor link, an image of a real painted sample. Same for stain, topcoat, hardware. The template's job is to show a designer what a finished spec looks like; "Paint Colour" is an empty slot.

Concrete edits, all in `server/board-templates.ts`:
- Every swatch in every template gets a real `name`, `hex`, `code`, `brand`. No "TBD".
- Every material gets a real `imageUrl` (curated Unsplash or similar) so the card renders an image, not a text block.
- Increase `swatchW` from 130 → 170 in `swatchRow` so titles up to ~14 chars don't truncate.
- Add a small "Replace example" affordance on each card so a designer can swap the example for their actual spec without first deleting the placeholder.

### R4. Make tagging do something.

For every tag (room) on every project board:
- A budget rollup row at the top of the active tab that actually adds the prices (we have the data; we just don't display it).
- A "Spec sheet" export action in the project header that produces a one-page PDF of every selection in that room — paint, materials, hardware, products — with prices, vendors, lead times.
- A cross-board library filter that shows "every Aged Brass item I've ever specified" so the designer can re-use rather than re-type.

### R5. The element cards become image-first.

For every "thing on the canvas" card (paint, material, hardware, product, fabric, stone):
- Image fills 70% of the card height. Text 30%, two lines max.
- Empty state: a generous dashed area with "Drop an image" — not a 12pt grey caption.
- Editing the image is one click on the image area, not a popover.
- For paint: instead of just a hex block, render the swatch as the card's image and put the hex/name/code below it.
- For hardware/product: require an image to be set before the card leaves "draft" status.

### R6. Tear `SpatialCanvas.tsx` apart.

This is the structural fix. We split the 8,197-line file into:

- `SpatialCanvas.tsx` (canvas viewport, pan/zoom, drag-and-drop coordinator) — target ~1,000 lines
- `BoardToolbar.tsx` (top bar, mode/zoom/lock/share controls) — ~400 lines
- `BoardAddPalette.tsx` (the new five-tool Add menu) — ~300 lines
- `RoomTabStrip.tsx` (already exists, unchanged)
- `LibraryPanel.tsx` (the new right-rail library access) — ~500 lines
- `ElementCards/` — one file per element type:
  - `TextCard.tsx`, `ImageCard.tsx`, `TypedCard.tsx` (paint/material/hardware/product), `RoomZone.tsx`, `Connector.tsx`, `Drawing.tsx`
- `BoardDialogs/` — `HardwarePickerDialog.tsx` (already exists), `PaletteExtractionDialog.tsx` (exists), the new unified `AddImagePopover.tsx`.

**Why this matters to you:** the next time you say "the board feels clumsy," I can change one card without rewriting six other surfaces. Today, every fix risks every surface.

---

## 4. What ships first vs. later

If you greenlight the redesign in principle, here is the sequence I propose. Each step is a pull request. Each one is independently mergeable and shippable — meaning if you change your mind partway through, the partial state is still better than today.

| Order | PR                                              | What it does                                                                                                | Effort | Risk |
| :---- | :---------------------------------------------- | :---------------------------------------------------------------------------------------------------------- | :----- | :--- |
| 1     | **Templates: real content, no placeholders**    | Rewrite `server/board-templates.ts` so every template ships with real swatches, real materials, real images. Bump swatch width. | 2 hrs  | Low. No code structure changes, just data. |
| 2     | **Image-first cards**                            | Update paint / material / hardware / product card renderers in `SpatialCanvas.tsx` to be image-first.        | 4 hrs  | Medium. Touches multiple element renderers. |
| 3     | **Tear `SpatialCanvas.tsx` apart**              | Split the file into ~10 focused components. No behaviour change; this is pure refactor.                     | 1 day  | Medium. Big surface area, but well-typed; easy to revert per file. |
| 4     | **Collapse the Add menu to five tools**         | New `BoardAddPalette.tsx` with the five-tool design. Old Add palette code deleted.                          | 6 hrs  | Medium. Changes muscle memory — but for the better. |
| 5     | **Library as a top-level destination**          | New `library_items` table, migration from existing library boards, new `/library` page, right-rail panel.    | 2 days | High. Schema change + data migration + new surface. Worth doing carefully. |
| 6     | **Tagging that pays for itself**                | Budget rollups, spec-sheet PDF export, cross-board library filter.                                          | 1 day  | Low. Pure addition.                          |

**Steps 1–4 land in the next session if you say go. Steps 5–6 the session after.** The whole sequence is roughly 1 week of focused work.

---

## 5. What this fixes vs. what it doesn't

This redesign **does** fix:
- The truncated, placeholder-text templates the screenshot is about.
- The Add menu having 16 things.
- The drag-vs.-click-vs.-double-click confusion.
- The "what is project vs. library" question.
- The library not actually being a library.
- The cards being text-first.
- The 8,000-line file.

This redesign **does not** fix:
- Houzz/Pinterest hotlink protection (#13, separate problem).
- Invite emails not arriving in Mailinator (#22, separate P1).
- Apple Pencil pressure/latency on iPad (separate hardware story; needs an iPad in hand to verify).

---

## 6. What I need from you

Mark up this document — strike out anything you disagree with, add anything I missed, change priorities. Specifically I want a yes/no/edit on each of:

- [ ] **R1** — collapse Add menu to 5 tools (Image / Card / Text / Shape / Draw).
- [ ] **R2** — split project board and library into separate surfaces; library becomes top-level.
- [ ] **R3** — templates ship with real curated content, not "Paint Colour" placeholders.
- [ ] **R4** — make room tags do something (budget, spec sheet PDF, cross-board filter).
- [ ] **R5** — image-first element cards.
- [ ] **R6** — break the 8,000-line file into ~10 focused components.

And a yes/no on the order in section 4.

Once you mark this up and send it back, I write the code in the order you approve. No more patches. No more "should work." If a thing in this document doesn't get done, it isn't because I forgot — it is because you struck it out.

— Computer
