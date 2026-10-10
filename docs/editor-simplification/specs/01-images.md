# Spec 01: Image presets and automatic sources

**Implemented locally; full-app acceptance incomplete.** Applies to ES-03 in [plan](../plan.md). ES-D08 is user-confirmed in [spec 03](./03-state-and-existing-content.md). Verification: B1–B4 and D1–D4 in [acceptance](../acceptance-test.md).

## 1. One sizing representation

Recommended canonical attr: `sizePreset: 'small' | 'medium' | 'full'` on standalone images, `mediaSizePreset` on media/text images. Default is Full. Do not use `mediaSize`: that existing attr is file byte metadata.

| Preset | Baseline width | Reference |
|---|---|---|
| Small | One-third | Containing content/media area |
| Medium | Two-thirds | Containing content/media area |
| Full content width | Full | Containing content/media area, never viewport |

Persist the preset name only, not computed pixel/percentage widths. Use one shared mapping on both surfaces; a small site's token may tune preset widths without introducing per-post overrides. At/below 48rem, Small and Medium may expand to full available width for legibility, but editor/public behaviour must match. Never create horizontal overflow, including inside columns/tabs/accordions.

- Settings expose the three choices, with obvious selected state and translated labels.
- Delete custom pixel/percent inputs/sliders, display-mode/source-resolution dropdowns, aspect checkbox and free-resize handles/listeners/badges. Do not keep natural/custom/viewport/full-bleed image modes as active authoring paths.
- Remove active sizing attrs `displaySize`, `displayPercent`, `displayPx`, `width`, `height`, `widthPercent`, `lockAspect`, `sourceSize` and media-prefixed equivalents according to the confirmed normalization policy.
- Keep alignment, source, alt, caption/title and caption position. Preserve original geometry with proportional width and automatic height; no stretching or cropping. Intrinsic dimensions can remain metadata for layout stability/source selection, never alternate display sizing state.
- An image load may update intrinsic metadata if required, but must not write legacy display attrs, infer a new preset or create unnecessary undo entries.
- Update registry creation, media picker, pasted/local uploads, remote media, schema/HTML import and public/diff rendering. Full is the default in every new creation path.

## 2. Media/text

Apply the same image sizing/aspect/source rules within the media area. The entire media/text block's width and position controls remain as scoped in the plan. Its split uses Equal / Wider left / Wider right under [spec 02](./02-layout-and-presentation.md).

Preserve `mediaItems`, file links, MIME/name/byte metadata, image captions and nested text. Non-image attachments retain existing previews/download behaviour; never send a document/audio/video to an image variant endpoint.

## 3. Automatic delivery: preserve the image, not just its box

Reuse `useMediaUrl`, existing immutable original/variant URLs and metadata. Do not add arbitrary URL transforms, a resizing proxy, public metadata leaks or new media query parameters.

Current processor facts:

- `thumbnail` is a **360×360 cover crop**. It must not be used for an uncropped content-image preset merely because that preset is Small.
- `medium` fits inside 1024×1024 and `large` inside 1600×1600 without enlargement. Actual dimensions vary by source shape; do not label every candidate 1024w/1600w when its real width differs.
- Variants are WebP. Some originals have animation/vector semantics; automatic delivery must not flatten an animated GIF/WebP or rasterize an SVG unexpectedly.
- Missing variants return 404 under current serving code; no automatic server fallback can be assumed.

Recommended bounded policy:

1. Canonical original remains the fallback `src`.
2. For ordinary raster images, build `srcset` from known available non-cropped medium/large variants using their **actual width metadata**, plus the original where appropriate; deduplicate widths. Supply `sizes` consistent with preset and containing layout. Reuse the same helper/policy on both surfaces.
3. If availability/dimensions cannot be safely established from existing metadata, serve the original. Do not invent candidates or add per-image DB lookups. A lightweight metadata read must be reviewed for auth, caching and request cost before introducing one.
4. External URLs, SVG and known/possibly animated formats use their original resolved source unless preservation is positively established. No server fetch/probe of arbitrary external URLs.
5. A stale/missing candidate must fall back to the original, without an error retry loop or clearing the saved source. Verify this in a real browser; `src` alone does not prove fallback after a chosen `srcset` candidate fails.

Exact helper naming and safe metadata source are implementation choices, recorded in progress. The acceptance gate is automatic delivery with no author resolution control, correct geometry, sensible available raster candidates and safe original fallback—not a promise of measured network savings.

## 4. Existing attrs and source changes

The confirmed ES-D08 policy normalizes saved legacy display attrs. Natural source dimensions are not a valid reference for inferring old **container-relative** percentages. Never overwrite the original URL with a variant URL during normalization.

When a source changes, reset stale intrinsic/variant metadata; preserve the semantic size preset, alt/caption intent and other content fields. Missing/invalid metadata must not distort the image or prevent a post from opening.
