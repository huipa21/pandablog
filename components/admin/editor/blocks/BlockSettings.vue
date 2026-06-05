<template>
  <div class="space-y-4">
    <div v-if="!blockName" class="rounded-md border border-dashed border-stone-200 p-4 text-sm text-stone-500">
      Select a block to edit its settings.
    </div>

    <template v-else>
      <div class="rounded-md border border-stone-200 bg-white p-3">
        <div class="flex items-center gap-2">
          <UIcon :name="blockDefinition?.icon ?? 'i-lucide-box'" class="size-4 text-teal-700" />
          <div>
            <div class="text-sm font-semibold text-stone-900">{{ blockDefinition?.title ?? blockName }}</div>
            <div class="text-xs text-stone-500">{{ blockDefinition?.description ?? 'Block settings' }}</div>
          </div>
        </div>
      </div>

      <details v-if="blockName === 'heading'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Heading</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="Heading level">
            <USelect :model-value="String(attrs.level ?? 2)" :items="headingLevelItems" @update:model-value="setHeadingLevel" />
          </UFormField>
        </div>
      </details>

      <details v-if="blockName === 'image'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Image</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="Source URL">
            <UInput :model-value="String(attrs.src ?? '')" @update:model-value="updateAttrs({ src: String($event) })" />
          </UFormField>
          <UFormField label="Alt text">
            <UInput :model-value="String(attrs.alt ?? '')" @update:model-value="updateAttrs({ alt: String($event) })" />
          </UFormField>
          <UFormField label="Title">
            <UInput :model-value="String(attrs.title ?? '')" @update:model-value="updateAttrs({ title: String($event) })" />
          </UFormField>
          <UFormField label="Title position">
            <USelect
              :model-value="String(attrs.titlePosition ?? 'bottom')"
              :items="[{label: 'None', value: 'none'}, {label: 'Top', value: 'top'}, {label: 'Bottom', value: 'bottom'}]"
              @update:model-value="updateAttrs({ titlePosition: String($event) })"
            />
          </UFormField>
          <UFormField label="Source size">
            <USelect
              :model-value="imageSourceSize"
              :items="sourceSizeItems"
              @update:model-value="setImageSourceSize"
            />
          </UFormField>
          <UFormField label="Display size">
            <USelect
              :model-value="imageDisplaySize"
              :items="displaySizeItems"
              @update:model-value="setImageDisplaySize"
            />
          </UFormField>
          <div v-if="imageDisplaySize === 'custom-px'" class="grid grid-cols-2 gap-2">
            <UFormField label="Display width (px)">
              <UInput type="number" :model-value="(attrs.displayPx as number | null) ?? (attrs.width as number | null) ?? undefined" @update:model-value="setImageWidth" />
            </UFormField>
            <UFormField label="Display height (px)">
              <UInput type="number" :model-value="(attrs.height as number | null) ?? undefined" @update:model-value="setImageHeight" />
            </UFormField>
          </div>
          <UFormField v-if="imageDisplaySize === 'custom-percent'" label="Display size (%)">
            <div class="space-y-2">
              <input
                type="range"
                min="1"
                max="200"
                :value="Number(attrs.displayPercent ?? attrs.widthPercent ?? 100)"
                class="w-full"
                @input="setImageDisplayPercent(($event.target as HTMLInputElement).value)"
              >
              <UInput
                type="number"
                min="1"
                max="200"
                :model-value="(attrs.displayPercent as number | null) ?? (attrs.widthPercent as number | null) ?? 100"
                @update:model-value="setImageDisplayPercent"
              />
            </div>
          </UFormField>
          <UFormField>
            <UCheckbox
              :model-value="attrs.lockAspect !== false"
              label="Maintain aspect ratio"
              @update:model-value="setImageLockAspect"
            />
          </UFormField>
          <UFormField label="Alignment">
            <USelect
              :model-value="String(attrs.align ?? 'center')"
              :items="[{label: 'Left', value: 'left'}, {label: 'Center', value: 'center'}, {label: 'Right', value: 'right'}]"
              @update:model-value="updateAttrs({ align: String($event) })"
            />
          </UFormField>
        </div>
      </details>

      <details v-if="blockName === 'mediaText'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Media &amp; Text</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="Media position">
            <USelect
              :model-value="String(attrs.mediaPosition ?? 'left')"
              :items="[{label: 'Left', value: 'left'}, {label: 'Right', value: 'right'}]"
              @update:model-value="updateAttrs({ mediaPosition: String($event) })"
            />
          </UFormField>
          <UFormField label="Media URL">
            <UInput :model-value="String(attrs.mediaSrc ?? '')" @update:model-value="updateAttrs({ mediaSrc: String($event) })" />
          </UFormField>
          <UFormField label="Alt">
            <UInput :model-value="String(attrs.mediaAlt ?? '')" @update:model-value="updateAttrs({ mediaAlt: String($event) })" />
          </UFormField>
          <UFormField label="Caption">
            <UInput :model-value="String(attrs.mediaTitle ?? '')" @update:model-value="updateAttrs({ mediaTitle: String($event) })" />
          </UFormField>
          <UFormField label="Caption position">
            <USelect
              :model-value="String(attrs.mediaTitlePosition ?? 'bottom')"
              :items="[{label: 'None', value: 'none'}, {label: 'Top', value: 'top'}, {label: 'Bottom', value: 'bottom'}]"
              @update:model-value="updateAttrs({ mediaTitlePosition: String($event) })"
            />
          </UFormField>
          <UFormField label="Whole block width">
            <USelect
              :model-value="String(attrs.blockWidth ?? 'content')"
              :items="blockWidthItems"
              @update:model-value="updateAttrs({ blockWidth: String($event) })"
            />
          </UFormField>
          <UFormField label="Media source size">
            <USelect
              :model-value="mediaSourceSize"
              :items="sourceSizeItems"
              @update:model-value="setMediaSourceSize"
            />
          </UFormField>
          <UFormField label="Media display size">
            <USelect
              :model-value="mediaDisplaySize"
              :items="displaySizeItems"
              @update:model-value="setMediaDisplaySize"
            />
          </UFormField>
          <div v-if="mediaDisplaySize === 'custom-px'" class="grid grid-cols-2 gap-2">
            <UFormField label="Media width (px)">
              <UInput type="number" :model-value="(attrs.mediaDisplayPx as number | null) ?? (attrs.mediaWidth as number | null) ?? undefined" @update:model-value="setMediaWidth" />
            </UFormField>
            <UFormField label="Media height (px)">
              <UInput type="number" :model-value="(attrs.mediaHeight as number | null) ?? undefined" @update:model-value="setMediaHeight" />
            </UFormField>
          </div>
          <UFormField v-if="mediaDisplaySize === 'custom-percent'" label="Media size (%)">
            <div class="space-y-2">
              <input
                type="range"
                min="1"
                max="200"
                :value="Number(attrs.mediaDisplayPercent ?? attrs.mediaWidthPercent ?? 100)"
                class="w-full"
                @input="setMediaDisplayPercent(($event.target as HTMLInputElement).value)"
              >
              <UInput
                type="number"
                min="1"
                max="200"
                :model-value="(attrs.mediaDisplayPercent as number | null) ?? (attrs.mediaWidthPercent as number | null) ?? 100"
                @update:model-value="setMediaDisplayPercent"
              />
            </div>
          </UFormField>
          <UFormField>
            <UCheckbox
              :model-value="attrs.lockAspect !== false"
              label="Maintain aspect ratio"
              @update:model-value="setMediaLockAspect"
            />
          </UFormField>
          <UFormField label="Media / Text ratio">
            <USelect
              :model-value="String(Math.round(Number(attrs.ratio ?? 0.5) * 100))"
              :items="ratioPresetItems"
              @update:model-value="setMediaRatioPreset"
            />
          </UFormField>
          <UFormField :label="`Column split (${Math.round(Number(attrs.ratio ?? 0.5) * 100)}% / ${100 - Math.round(Number(attrs.ratio ?? 0.5) * 100)}%)`">
            <input
              type="range"
              min="15"
              max="85"
              :value="Math.round(Number(attrs.ratio ?? 0.5) * 100)"
              class="w-full"
              @input="updateAttrs({ ratio: Number(($event.target as HTMLInputElement).value) / 100 })"
            >
          </UFormField>
        </div>
      </details>

      <details v-if="blockName === 'codeBlock'" open class="code-settings-panel rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Code</summary>
        <div class="mt-3 space-y-3" data-code-settings>
          <UFormField label="File name (optional)" class="code-settings-field">
            <UInput class="w-full" :model-value="String(attrs.fileName ?? '')" placeholder="app.ts" @update:model-value="setCodeFileName" />
          </UFormField>
          <UFormField label="Language" class="code-settings-field">
            <USelect class="w-full" :model-value="String(attrs.language ?? 'text')" :items="languageItems" @update:model-value="setCodeLanguage" />
          </UFormField>
          <UFormField label="Theme" class="code-settings-field">
            <USelect class="w-full" :model-value="String(attrs.theme ?? 'github-dark')" :items="themeItems" @update:model-value="setCodeTheme" />
          </UFormField>
          <UFormField>
            <UCheckbox
              :model-value="attrs.lineNumbers !== false"
              label="Show line numbers"
              @update:model-value="setCodeLineNumbers"
            />
          </UFormField>
          <UFormField label="Highlighted lines" class="code-settings-field">
            <UInput
              class="w-full"
              :model-value="String(attrs.lineHighlights ?? '')"
              placeholder="10, 20-25, 31"
              @update:model-value="setCodeLineHighlights"
            />
          </UFormField>
          <UFormField>
            <UCheckbox
              :model-value="attrs.showTotalLines === true"
              label="Show total lines in code header"
              @update:model-value="setCodeShowTotalLines"
            />
          </UFormField>
          <UFormField>
            <UCheckbox
              :model-value="attrs.wrap !== false"
              label="Wrap long lines"
              @update:model-value="setCodeWrap"
            />
          </UFormField>
          <UFormField :label="`Zoom (${Math.round(Number(attrs.zoom ?? 1) * 100)}%)`">
            <input
              type="range"
              min="70"
              max="200"
              step="5"
              :value="Math.round(Number(attrs.zoom ?? 1) * 100)"
              class="w-full"
              @input="setCodeZoom(($event.target as HTMLInputElement).value)"
            >
          </UFormField>
        </div>
      </details>

      <details v-if="blockName === 'columnsBlock'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Columns</summary>
        <div class="mt-3 space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Column count" class="min-w-0">
              <USelect
                :model-value="String(columnsCount)"
                :items="columnCountItems"
                class="w-full min-w-0"
                @update:model-value="setColumnsCount"
              />
            </UFormField>
            <UFormField label="Layout" class="min-w-0">
              <USelect
                :model-value="columnsProportions"
                :items="columnProportionItems"
                class="w-full min-w-0"
                @update:model-value="setColumnsProportions"
              />
            </UFormField>
          </div>

          <UFormField>
            <UCheckbox
              :model-value="attrs.showHeaders !== false"
              label="Show headers"
              @update:model-value="setColumnsShowHeaders"
            />
          </UFormField>

          <div class="space-y-2 rounded-md border border-stone-200 bg-stone-50 p-2">
            <div
              v-for="column in columnItems"
              :key="column.index"
              class="rounded border border-stone-200 bg-white p-2"
              :class="[
                draggedColumnIndex === column.index ? 'opacity-60' : '',
                dragOverColumnIndex === column.index ? 'ring-2 ring-teal-300 ring-offset-1' : ''
              ]"
              :draggable="columnItems.length > 1"
              @dragstart="onColumnCardDragStart($event, column.index)"
              @dragover.prevent="onColumnCardDragOver(column.index)"
              @drop.prevent="onColumnCardDrop(column.index)"
              @dragend="onColumnCardDragEnd"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 text-xs font-medium text-stone-600">
                  <UIcon name="i-lucide-grip-vertical" class="size-4 text-stone-400" />
                  <span>Column {{ column.index + 1 }} · {{ columnPercentageLabel(column.index) }}</span>
                </div>
                <UButton
                  v-if="columnsCount > 2"
                  type="button"
                  icon="i-lucide-trash"
                  size="sm"
                  color="error"
                  variant="ghost"
                  @click="removeColumn(column.index)"
                >
                  Remove
                </UButton>
              </div>
            </div>
          </div>

          <div class="flex gap-2">
            <UButton
              v-if="columnsCount < 6"
              type="button"
              icon="i-lucide-plus"
              size="sm"
              variant="soft"
              color="neutral"
              @click="addColumn"
            >
              Add Column
            </UButton>
          </div>

          <div class="space-y-2">
            <UFormField label="Gap between columns">
              <UInput
                :model-value="String(attrs.columnGap ?? '1rem')"
                placeholder="1rem"
                size="sm"
                @update:model-value="updateAttrs({ columnGap: String($event) })"
              />
            </UFormField>
            <UFormField label="Margin above block">
              <UInput
                :model-value="String(attrs.marginTop ?? '1rem')"
                placeholder="1rem"
                size="sm"
                @update:model-value="updateAttrs({ marginTop: String($event) })"
              />
            </UFormField>
            <UFormField label="Margin below block">
              <UInput
                :model-value="String(attrs.marginBottom ?? '1rem')"
                placeholder="1rem"
                size="sm"
                @update:model-value="updateAttrs({ marginBottom: String($event) })"
              />
            </UFormField>
          </div>

          <UFormField label="Whole block width">
            <USelect
              :model-value="String(attrs.blockWidth ?? 'content')"
              :items="blockWidthItems"
              @update:model-value="updateAttrs({ blockWidth: String($event) })"
            />
          </UFormField>
        </div>
      </details>

      <details v-if="blockName === 'tabsBlock'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Tabs</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="Orientation">
            <USelect
              :model-value="String(attrs.orientation ?? 'horizontal')"
              :items="tabOrientationItems"
              @update:model-value="setTabsOrientation"
            />
          </UFormField>
          <UFormField label="Tab style">
            <USelect
              :model-value="String(attrs.tabStyle ?? 'underline')"
              :items="tabStyleItems"
              @update:model-value="setTabsStyle"
            />
          </UFormField>
          <UFormField label="Block width">
            <USelect
              :model-value="String(attrs.blockWidth ?? 'content')"
              :items="blockWidthItems"
              @update:model-value="updateAttrs({ blockWidth: String($event) })"
            />
          </UFormField>
          <UFormField label="Default tab">
            <USelect
              :model-value="String(tabsActiveIndex)"
              :items="tabDefaultItems"
              @update:model-value="setTabsActiveIndex"
            />
          </UFormField>
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="text-xs font-medium uppercase tracking-wider text-stone-400">Tab labels</div>
              <div class="flex gap-1.5">
                <UButton type="button" icon="i-lucide-plus" size="xs" variant="soft" color="neutral" :disabled="tabPanels.length >= 6" @click="addTabPanel">Add</UButton>
                <UButton type="button" icon="i-lucide-minus" size="xs" variant="ghost" color="neutral" :disabled="tabPanels.length <= 2" @click="removeTabPanel">Remove</UButton>
              </div>
            </div>
            <UFormField v-for="tab in tabPanels" :key="tab.index" :label="`Tab ${tab.index + 1}`">
              <UInput
                :model-value="String(tab.attrs.title ?? `Tab ${tab.index + 1}`)"
                placeholder="Tab title"
                @update:model-value="setTabTitle(tab.index, $event)"
              />
            </UFormField>
          </div>
        </div>
      </details>

      <details v-if="blockName === 'blockquote'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Quote</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="Style">
            <USelect
              :model-value="String(attrs.style ?? 'bar')"
              :items="quoteStyleItems"
              @update:model-value="updateAttrs({ style: String($event) })"
            />
          </UFormField>

          <UFormField label="Theme color">
            <div class="flex items-center gap-2">
              <input
                type="color"
                :value="String(attrs.theme ?? DEFAULT_QUOTE_THEME)"
                class="h-10 w-16 rounded border border-stone-200"
                @input="updateAttrs({ theme: ($event.target as HTMLInputElement).value })"
              >
              <UInput
                :model-value="String(attrs.theme ?? DEFAULT_QUOTE_THEME)"
                :placeholder="DEFAULT_QUOTE_THEME"
                class="flex-1"
                @update:model-value="updateAttrs({ theme: String($event) })"
              />
            </div>
          </UFormField>

          <div class="border-t border-stone-200 pt-3">
            <div class="mb-2 text-xs font-semibold text-stone-700">Typography</div>

            <UFormField label="Font family">
              <USelect
                :model-value="String(attrs.fontFamily ?? 'sans')"
                :items="fontFamilyItems"
                @update:model-value="updateAttrs({ fontFamily: String($event) })"
              />
            </UFormField>

            <UFormField label="Font size">
              <div class="flex gap-2">
                <UInput
                  type="number"
                  min="0.5"
                  step="0.1"
                  :model-value="parseFontSize(String(attrs.fontSize ?? '1rem'))"
                  placeholder="1"
                  class="w-20"
                  @update:model-value="updateAttrs({ fontSize: String($event) + 'rem' })"
                />
                <span class="flex items-center text-sm text-stone-500">rem</span>
              </div>
            </UFormField>

            <UFormField label="Text color">
              <div class="flex items-center gap-2">
                <input
                  type="color"
                  :value="String(attrs.fontColor ?? DEFAULT_QUOTE_FONT_COLOR)"
                  class="h-10 w-16 rounded border border-stone-200"
                  @input="updateAttrs({ fontColor: ($event.target as HTMLInputElement).value })"
                >
                <UInput
                  :model-value="String(attrs.fontColor ?? DEFAULT_QUOTE_FONT_COLOR)"
                  :placeholder="DEFAULT_QUOTE_FONT_COLOR"
                  class="flex-1"
                  @update:model-value="updateAttrs({ fontColor: String($event) })"
                />
              </div>
            </UFormField>

            <UFormField label="Background color (optional)">
              <div class="flex items-center gap-2">
                <input
                  type="color"
                  :value="String(attrs.backgroundColor ?? '#ffffff')"
                  class="h-10 w-16 rounded border border-stone-200"
                  @input="updateAttrs({ backgroundColor: ($event.target as HTMLInputElement).value })"
                >
                <UInput
                  :model-value="String(attrs.backgroundColor ?? '')"
                  placeholder="Leave empty for transparent"
                  class="flex-1"
                  @update:model-value="updateAttrs({ backgroundColor: String($event) })"
                />
              </div>
            </UFormField>
          </div>

          <div class="border-t border-stone-200 pt-3">
            <div class="mb-2 text-xs font-semibold text-stone-700">Source / Author</div>

            <UFormField label="Author name (optional)">
              <UInput
                :model-value="String(attrs.authorName ?? '')"
                placeholder="Firstname Lastname"
                @update:model-value="updateAttrs({ authorName: String($event) })"
              />
            </UFormField>

            <UFormField label="Title / Role (optional)">
              <UInput
                :model-value="String(attrs.authorTitle ?? '')"
                placeholder="Position or Year"
                @update:model-value="updateAttrs({ authorTitle: String($event) })"
              />
            </UFormField>
          </div>
        </div>
      </details>

      <details v-if="blockName === 'horizontalRule'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Separator</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="Line style">
            <USelect
              :model-value="String(attrs.styleType ?? 'solid')"
              :items="[{ label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' }, { label: 'Dotted', value: 'dotted' }]"
              @update:model-value="setSeparatorStyle"
            />
          </UFormField>
          <UFormField label="Thickness (px)">
            <UInput type="number" min="1" max="12" :model-value="Number(attrs.thickness ?? 1)" @update:model-value="setSeparatorThickness" />
          </UFormField>
          <UFormField label="Color palette">
            <div class="grid grid-cols-8 gap-1.5">
              <button
                v-for="color in separatorPalette"
                :key="`sep-${color}`"
                type="button"
                class="h-7 rounded border"
                :style="{ backgroundColor: color, borderColor: color === String(attrs.color ?? DEFAULT_SEPARATOR_COLOR) ? SEPARATOR_SELECTED_BORDER_COLOR : DEFAULT_SEPARATOR_COLOR }"
                :title="color"
                @click="setSeparatorColor(color)"
              />
            </div>
          </UFormField>
          <details class="rounded-md border border-stone-200 p-2">
            <summary class="cursor-pointer text-xs font-medium text-stone-700">Advanced color (picker + RGB/HEX)</summary>
            <div class="mt-2 grid grid-cols-[auto,1fr] items-center gap-2">
              <input type="color" :value="String(attrs.color ?? DEFAULT_SEPARATOR_COLOR)" class="h-9 w-12 rounded border border-stone-200" @input="setSeparatorColor(($event.target as HTMLInputElement).value)">
              <UInput :model-value="String(attrs.color ?? DEFAULT_SEPARATOR_COLOR)" :placeholder="DEFAULT_SEPARATOR_COLOR" @update:model-value="setSeparatorColorHex" />
            </div>
          </details>
          <UFormField label="Vertical margin (px)">
            <UInput type="number" min="0" max="120" :model-value="Number(attrs.marginY ?? 16)" @update:model-value="setSeparatorMargin" />
          </UFormField>
        </div>
      </details>

      <details v-if="footnoteSection" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Footnotes</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="Title">
            <UInput :model-value="footnoteTitle" @update:model-value="setFootnoteTitle" />
          </UFormField>
        </div>
      </details>

      <details v-if="blockName === 'customHtml'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Custom HTML</summary>
        <div class="mt-3 space-y-3">
          <UTextarea :model-value="String(attrs.html ?? '')" :rows="8" class="font-mono text-xs" @update:model-value="updateAttrs({ html: String($event) })" />
        </div>
      </details>

      <details v-if="blockName === 'diffBlock'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Diff</summary>
        <div class="mt-3 space-y-3">
          <UFormField label="Language">
            <USelect :model-value="String(attrs.language ?? 'plaintext')" :items="diffLanguageItems" @update:model-value="setDiffLanguage" />
          </UFormField>
          <div class="grid grid-cols-2 gap-2">
            <UFormField label="Old label">
              <UInput :model-value="String(attrs.oldLabel ?? 'Before')" @update:model-value="setDiffOldLabel" />
            </UFormField>
            <UFormField label="New label">
              <UInput :model-value="String(attrs.newLabel ?? 'After')" @update:model-value="setDiffNewLabel" />
            </UFormField>
          </div>
          <p class="rounded-md border border-teal-100 bg-teal-50 px-3 py-2 text-xs leading-relaxed text-teal-900">
            Select the diff block in the editor to edit the before and after text in two columns.
          </p>
        </div>
      </details>

      <details v-if="blockName === 'mermaid'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Mermaid</summary>
        <div class="mt-3">
          <UTextarea :model-value="String(attrs.code ?? '')" :rows="8" @update:model-value="updateAttrs({ code: String($event) })" />
        </div>
      </details>

      <details v-if="blockName === 'table'" open class="rounded-md border border-stone-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-medium text-stone-900">Table</summary>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <UButton type="button" icon="i-lucide-columns-3" size="sm" variant="soft" color="neutral" @click="runTableCommand('addColumnAfter')">Add column</UButton>
          <UButton type="button" icon="i-lucide-rows-3" size="sm" variant="soft" color="neutral" @click="runTableCommand('addRowAfter')">Add row</UButton>
          <UButton type="button" icon="i-lucide-trash-2" size="sm" variant="ghost" color="error" @click="runTableCommand('deleteColumn')">Delete column</UButton>
          <UButton type="button" icon="i-lucide-trash" size="sm" variant="ghost" color="error" @click="runTableCommand('deleteRow')">Delete row</UButton>
        </div>
      </details>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { CODE_BLOCK_LANGUAGES, CODE_BLOCK_THEMES } from '~/extensions/codeBlockEnhanced'
import { DEFAULT_QUOTE_FONT_COLOR, DEFAULT_QUOTE_THEME, QUOTE_STYLES, QUOTE_FONT_FAMILIES } from '~/extensions/blockquoteEnhanced'
import { DEFAULT_SEPARATOR_COLOR, SEPARATOR_PALETTE, SEPARATOR_SELECTED_BORDER_COLOR } from '~/extensions/separator'
import type { JsonContent } from '~/types/content'
import { DIFF_BLOCK_LANGUAGES, normalizeDiffLanguage } from '~/utils/diffBlock'

const props = defineProps<{
  editor: Editor | null
}>()

const editorStore = useEditorStore()
const blockRegistry = useBlockRegistry()

const blockName = computed(() => editorStore.selectedBlockType)
const attrs = computed(() => editorStore.selectedBlockAttrs)
const blockDefinition = computed(() => blockName.value ? blockRegistry.getBlockDefinition(blockName.value) : null)

const headingLevelItems = [
  { label: 'Heading 1', value: '1' },
  { label: 'Heading 2', value: '2' },
  { label: 'Heading 3', value: '3' },
  { label: 'Heading 4', value: '4' },
  { label: 'Heading 5', value: '5' },
  { label: 'Heading 6', value: '6' }
]

const languageItems = CODE_BLOCK_LANGUAGES.map((l) => ({ label: l.label, value: l.value as string }))
const themeItems = CODE_BLOCK_THEMES.map((t) => ({ label: t.label, value: t.value as string }))
const diffLanguageItems = DIFF_BLOCK_LANGUAGES.map((language) => ({ label: language.label, value: language.value as string }))
const sourceSizeItems = [
  { label: 'Thumbnail', value: 'thumbnail' },
  { label: 'Medium', value: 'medium' },
  { label: 'Large', value: 'large' },
  { label: 'Full / Original', value: 'full' }
]
const displaySizeItems = [
  { label: 'Natural / Auto', value: 'natural' },
  { label: 'Fill container', value: 'fill-container' },
  { label: 'Custom percent', value: 'custom-percent' },
  { label: 'Custom px', value: 'custom-px' }
]
const blockWidthItems = [
  { label: 'Content', value: 'content' },
  { label: 'Wide', value: 'wide' },
  { label: 'Full bleed', value: 'full-bleed' }
]
const columnCountItems = [
  { label: '2 columns', value: '2' },
  { label: '3 columns', value: '3' },
  { label: '4 columns', value: '4' },
  { label: '5 columns', value: '5' },
  { label: '6 columns', value: '6' }
]
const columnProportionItems = computed(() => {
  const count = columnsCount.value
  const items: Array<{ label: string, value: string }> = []

  if (count === 2) {
    items.push(
      { label: 'Equal halves', value: '1-1' },
      { label: 'One third / Two thirds', value: '1-2' },
      { label: 'Two thirds / One third', value: '2-1' }
    )
  } else if (count === 3) {
    items.push(
      { label: 'Equal thirds', value: '1-1-1' },
      { label: 'Narrow / Narrow / Wide', value: '1-1-2' },
      { label: 'Narrow / Wide / Narrow', value: '1-2-1' },
      { label: 'Wide / Narrow / Narrow', value: '2-1-1' }
    )
  } else if (count === 4) {
    items.push({ label: 'Equal quarters', value: '1-1-1-1' })
  } else if (count === 5) {
    items.push({ label: 'Equal fifths', value: '1-1-1-1-1' })
  } else if (count === 6) {
    items.push({ label: 'Equal sixths', value: '1-1-1-1-1-1' })
  } else {
    items.push({ label: 'Even distribution', value: '1-1' })
  }

  items.push({ label: 'Manual', value: 'manual' })
  return items
})
const tabOrientationItems = [
  { label: 'Horizontal', value: 'horizontal' },
  { label: 'Vertical', value: 'vertical' }
]
const tabStyleItems = [
  { label: 'Underline', value: 'underline' },
  { label: 'Pills', value: 'pills' },
  { label: 'Enclosed', value: 'enclosed' }
]
const ratioPresetItems = [
  { label: '30 / 70', value: '30' },
  { label: '40 / 60', value: '40' },
  { label: '50 / 50', value: '50' },
  { label: '60 / 40', value: '60' },
  { label: '70 / 30', value: '70' }
]

const separatorPalette = [...SEPARATOR_PALETTE]

const quoteStyleItems = QUOTE_STYLES.map((s) => ({ label: s.label, value: s.value as string }))
const fontFamilyItems = QUOTE_FONT_FAMILIES.map((f) => ({ label: f.label, value: f.value as string }))

const parseFontSize = (size: string) => {
  const match = size.match(/^([\d.]+)rem$/)
  return match ? match[1] : '1'
}

const imageSourceSize = computed(() => String(attrs.value.sourceSize ?? 'full'))
const imageDisplaySize = computed(() => {
  const explicit = String(attrs.value.displaySize ?? '')
  if (explicit) {
    return explicit
  }

  const percent = Number(attrs.value.widthPercent ?? 0)
  if (Number.isFinite(percent) && percent > 0 && percent !== 100) {
    return 'custom-percent'
  }

  const width = numberOrNull(attrs.value.width)
  return width ? 'custom-px' : 'fill-container'
})

const mediaSourceSize = computed(() => String(attrs.value.mediaSourceSize ?? 'full'))
const mediaDisplaySize = computed(() => {
  const explicit = String(attrs.value.mediaDisplaySize ?? '')
  if (explicit) {
    return explicit
  }

  const percent = Number(attrs.value.mediaWidthPercent ?? 0)
  if (Number.isFinite(percent) && percent > 0 && percent !== 100) {
    return 'custom-percent'
  }

  const width = numberOrNull(attrs.value.mediaWidth)
  return width ? 'custom-px' : 'fill-container'
})

const selectedBlockNode = computed(() => {
  const activeEditor = props.editor
  const activeBlockName = blockName.value
  if (!activeEditor || !activeBlockName) return null

  const pos = resolveSelectedBlockPos(activeEditor, activeBlockName, editorStore.selectedBlockPos)
  if (pos === null) return null

  const node = activeEditor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== activeBlockName) return null


  return { pos, node }
})

const columnItems = computed(() => childSettings('columnItem'))
const columnsCount = computed(() => Math.max(2, Math.min(6, columnItems.value.length || Number(attrs.value.columns ?? 2) || 2)))
const columnsCustomPercentages = computed(() => parseCustomPercentages(String(attrs.value.customPercentages ?? ''), columnsCount.value))
const columnsPercentages = computed(() => {
  if (columnsCustomPercentages.value.length === columnsCount.value) {
    return columnsCustomPercentages.value
  }
  return proportionsToPercentages(String(attrs.value.proportions ?? ''), columnsCount.value)
})
const columnsProportions = computed(() => {
  if (columnsCustomPercentages.value.length === columnsCount.value) {
    return 'manual'
  }
  return normalizeColumnProportions(String(attrs.value.proportions ?? ''), columnsCount.value)
})
const draggedColumnIndex = ref<number | null>(null)
const dragOverColumnIndex = ref<number | null>(null)
const tabPanels = computed(() => childSettings('tabPanel'))
const tabsActiveIndex = computed(() => normalizeTabsActiveIndex(Number(attrs.value.activeIndex ?? 0), tabPanels.value.length))
const tabDefaultItems = computed(() => tabPanels.value.map((tab) => ({
  label: String(tab.attrs.title ?? `Tab ${tab.index + 1}`).trim() || `Tab ${tab.index + 1}`,
  value: String(tab.index)
})))

const footnoteSection = computed(() => {
  const activeEditor = props.editor
  const selectedPos = editorStore.selectedBlockPos
  if (!activeEditor || selectedPos === null) return null

  const topLevel: Array<{ pos: number, node: any }> = []
  activeEditor.state.doc.forEach((node, pos) => {
    topLevel.push({ pos, node })
  })

  for (let i = 1; i < topLevel.length; i += 1) {
    const heading = topLevel[i - 1]
    const list = topLevel[i]
    if (!heading || !list) continue
    if (heading.node.type.name !== 'paragraph' || list.node.type.name !== 'orderedList') continue
    if (selectedPos !== heading.pos && selectedPos !== list.pos) continue
    return { headingPos: heading.pos, headingNode: heading.node, listPos: list.pos }
  }

  return null
})

const footnoteTitle = computed(() => {
  return footnoteSection.value?.headingNode?.textContent?.trim() || 'Footnotes'
})

function updateAttrs(nextAttrs: Record<string, unknown>) {
  const activeEditor = props.editor
  const activeBlockName = blockName.value

  if (!activeEditor || !activeBlockName) {
    return
  }

  const state = activeEditor.state
  const targetPos = resolveSelectedBlockPos(activeEditor, activeBlockName, editorStore.selectedBlockPos)

  if (targetPos !== null) {
    const node = state.doc.nodeAt(targetPos)
    if (!node || node.type.name !== activeBlockName) {
      return
    }

    const mergedAttrs = { ...node.attrs, ...nextAttrs }
    const tr = state.tr.setNodeMarkup(targetPos, undefined, mergedAttrs)
    tr.setMeta('addToHistory', true)
    activeEditor.view.dispatch(tr)
    editorStore.mergeSelectedBlockAttrs(nextAttrs)
    return
  }

  const updated = activeEditor.chain().updateAttributes(activeBlockName, nextAttrs).run()
  if (updated) {
    editorStore.mergeSelectedBlockAttrs(nextAttrs)
  }
}

function resolveSelectedBlockPos(editor: Editor, blockType: string, storePos: number | null) {
  const candidates = new Set<number>()

  if (typeof storePos === 'number') {
    candidates.add(Math.max(0, Math.min(storePos, editor.state.doc.content.size)))
  }

  const selectionPos = topLevelSelectionPos(editor)
  if (selectionPos !== null) {
    candidates.add(selectionPos)
  }

  const idPos = selectedBlockIdPos()
  if (idPos !== null) {
    candidates.add(idPos)
  }

  for (const pos of candidates) {
    const node = editor.state.doc.nodeAt(pos)
    if (node?.type.name === blockType) {
      return pos
    }
  }

  return null
}

function selectedBlockIdPos() {
  const id = editorStore.selectedBlockId
  if (!id || typeof id !== 'string') {
    return null
  }

  const match = id.match(/:(\d+)$/)
  if (!match) {
    return null
  }

  return Number(match[1])
}

function topLevelSelectionPos(editor: Editor) {
  const { $from } = editor.state.selection

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth - 1).type.name === 'doc') {
      return $from.before(depth)
    }
  }

  return null
}

function childSettings(typeName: string) {
  const selected = selectedBlockNode.value
  if (!selected) return []

  const children: Array<{ index: number, attrs: Record<string, unknown> }> = []
  selected.node.forEach((child: any, _offset: number, index: number) => {
    if (child.type.name === typeName) {
      children.push({ index, attrs: { ...child.attrs } })
    }
  })

  return children
}

function selectedBlockJson(blockType: string) {
  const selected = selectedBlockNode.value
  if (!selected || selected.node.type.name !== blockType) return null
  return selected.node.toJSON() as JsonContent
}

function replaceSelectedBlockJson(blockType: string, nextJson: JsonContent) {
  const activeEditor = props.editor
  const selected = selectedBlockNode.value
  if (!activeEditor || !selected || selected.node.type.name !== blockType) return

  const replacement = activeEditor.schema.nodeFromJSON(nextJson)
  const tr = activeEditor.state.tr.replaceWith(selected.pos, selected.pos + selected.node.nodeSize, replacement)
  tr.setMeta('addToHistory', true)
  activeEditor.view.dispatch(tr)
  editorStore.selectBlock({
    id: `${blockType}:${selected.pos}`,
    type: blockType,
    attrs: nextJson.attrs ?? {},
    pos: selected.pos
  })
}

function updateNestedChildAttrs(blockType: string, childType: string, childIndex: number, nextAttrs: Record<string, unknown>) {
  const nextJson = selectedBlockJson(blockType)
  if (!nextJson || !Array.isArray(nextJson.content)) return

  const child = nextJson.content[childIndex]
  if (!child || child.type !== childType) return

  child.attrs = { ...(child.attrs ?? {}), ...nextAttrs }
  replaceSelectedBlockJson(blockType, nextJson)
}

function normalizeColumnProportions(value: string, count: number) {
  const fallback = Array.from({ length: Math.max(2, Math.min(6, count)) }, () => '1').join('-')
  const parts = value.split('-').map((part) => Number(part))
  if (parts.length !== count || parts.some((part) => !Number.isFinite(part) || part <= 0)) {
    return fallback
  }

  return parts.map((part) => Math.max(1, Math.round(part))).join('-')
}

function parseCustomPercentages(value: string, count: number): number[] {
  if (!value.trim()) return []
  const parts = value.split(',').map((part) => Number(part.trim()))
  if (parts.length !== count || parts.some((part) => !Number.isFinite(part) || part <= 0 || part >= 100)) {
    return []
  }

  const total = parts.reduce((sum, part) => sum + part, 0)
  if (Math.abs(total - 100) > 0.1) {
    return []
  }

  return normalizePercentages(parts)
}

function proportionsToPercentages(value: string, count: number): number[] {
  const normalized = normalizeColumnProportions(value, count)
  const weights = normalized.split('-').map((part) => Math.max(1, Number(part) || 1))
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  if (!totalWeight) {
    return normalizePercentages(Array.from({ length: count }, () => 100 / count))
  }
  return normalizePercentages(weights.map((weight) => (weight / totalWeight) * 100))
}

function normalizePercentages(values: number[]): number[] {
  if (!values.length) return []
  const rounded = values.map((value) => Math.max(1, Math.min(99, Math.round(value * 100) / 100)))
  const total = rounded.reduce((sum, value) => sum + value, 0)
  const adjustment = Math.round((100 - total) * 100) / 100
  const lastIndex = rounded.length - 1
  const lastValue = rounded[lastIndex] ?? 0
  rounded[lastIndex] = Math.round((lastValue + adjustment) * 100) / 100
  return rounded
}

function serializePercentages(values: number[]) {
  return normalizePercentages(values)
    .map((value) => value.toFixed(2).replace(/\.00$/, ''))
    .join(',')
}

function columnPercentageLabel(index: number) {
  const value = columnsPercentages.value[index] ?? 0
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(value * 10) / 10}%`
}

function normalizeColumnItems(content: JsonContent[] | undefined, count: number) {
  const existing = (content ?? []).filter((child) => child.type === 'columnItem')
  const columns: JsonContent[] = existing.slice(0, count).map((child, index) => ({
    ...child,
    attrs: {
      ...(child.attrs ?? {}),
      header: String(child.attrs?.header ?? '')
    },
    content: child.content?.length ? child.content : defaultColumnItem(index).content
  }))

  const overflow = existing.slice(count)
  if (overflow.length && columns.length) {
    const last = columns[columns.length - 1]!
    last.content = [
      ...(last.content ?? []),
      ...overflow.flatMap((column) => column.content ?? [])
    ]
  }

  while (columns.length < count) {
    columns.push(defaultColumnItem(columns.length))
  }

  return columns
}

function defaultColumnItem(_index: number): JsonContent {
  return {
    type: 'columnItem',
    attrs: { header: '' },
    content: [{ type: 'paragraph' }]
  }
}

function defaultTabPanel(_index: number): JsonContent {
  return {
    type: 'tabPanel',
    attrs: { title: '' },
    content: [{ type: 'paragraph' }]
  }
}

function asSelectValue(value: unknown, fallback: string) {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object') {
    const maybeValue = (value as { value?: unknown }).value
    if (typeof maybeValue === 'string') {
      return maybeValue
    }
  }

  return fallback
}

function asInputValue(value: unknown, fallback = '') {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object') {
    const target = (value as { target?: { value?: unknown } }).target
    if (target && typeof target.value === 'string') {
      return target.value
    }
    const maybeValue = (value as { value?: unknown }).value
    if (typeof maybeValue === 'string') {
      return maybeValue
    }
  }

  return fallback
}

function asBooleanValue(value: unknown, fallback = false) {
  if (typeof value === 'boolean') {
    return value
  }

  if (value && typeof value === 'object') {
    const target = (value as { target?: { checked?: unknown } }).target
    if (target && typeof target.checked === 'boolean') {
      return target.checked
    }

    const maybeChecked = (value as { checked?: unknown }).checked
    if (typeof maybeChecked === 'boolean') {
      return maybeChecked
    }
  }

  return fallback
}

function setCodeFileName(value: unknown) {
  updateAttrs({ fileName: asInputValue(value, '') })
}

function setCodeLanguage(value: unknown) {
  updateAttrs({ language: asSelectValue(value, 'text') })
}

function setCodeTheme(value: unknown) {
  updateAttrs({ theme: asSelectValue(value, 'github-dark') })
}

function setCodeLineNumbers(value: unknown) {
  updateAttrs({ lineNumbers: asBooleanValue(value, true) })
}

function setCodeLineHighlights(value: unknown) {
  updateAttrs({ lineHighlights: asInputValue(value, '') })
}

function setCodeShowTotalLines(value: unknown) {
  updateAttrs({ showTotalLines: asBooleanValue(value, false) })
}

function setCodeWrap(value: unknown) {
  updateAttrs({ wrap: asBooleanValue(value, true) })
}

function setCodeZoom(value: unknown) {
  const next = Number(value)
  const zoom = Number.isFinite(next) ? Math.max(0.7, Math.min(2, next > 10 ? next / 100 : next)) : 1
  updateAttrs({ zoom: Math.round(zoom * 100) / 100 })
}

function setSeparatorStyle(value: unknown) {
  updateAttrs({ styleType: asSelectValue(value, 'solid') })
}

function setSeparatorThickness(value: unknown) {
  const thickness = Math.max(1, Math.min(12, Number(value) || 1))
  updateAttrs({ thickness })
}

function setSeparatorMargin(value: unknown) {
  const marginY = Math.max(0, Math.min(120, Number(value) || 0))
  updateAttrs({ marginY })
}

function setSeparatorColor(value: string) {
  updateAttrs({ color: value || DEFAULT_SEPARATOR_COLOR })
}

function setSeparatorColorHex(value: unknown) {
  const next = String(value ?? '').trim()
  if (isHexColor(next)) {
    setSeparatorColor(next)
  }
}

function setFootnoteTitle(value: unknown) {
  const activeEditor = props.editor
  const section = footnoteSection.value
  if (!activeEditor || !section) return

  const title = asInputValue(value, 'Footnotes').trim() || 'Footnotes'
  const from = section.headingPos + 1
  const to = section.headingPos + section.headingNode.nodeSize - 1
  const tr = activeEditor.state.tr.insertText(title, from, to)
  activeEditor.view.dispatch(tr)
}

function setColumnsCount(value: unknown) {
  const countStr = asSelectValue(value, '2')
  const count = Math.max(2, Math.min(6, Number(countStr) || 2))
  const nextJson = selectedBlockJson('columnsBlock')
  if (!nextJson) return

  const nextColumns = normalizeColumnItems(nextJson.content, count)
  nextJson.attrs = {
    ...(nextJson.attrs ?? {}),
    columns: count,
    proportions: normalizeColumnProportions(String(nextJson.attrs?.proportions ?? ''), count),
    customPercentages: ''
  }
  nextJson.content = nextColumns
  replaceSelectedBlockJson('columnsBlock', nextJson)
}

function setColumnsProportions(value: unknown) {
  const selected = asSelectValue(value, '1-1')

  if (selected === 'manual') {
    const current = columnsCustomPercentages.value.length === columnsCount.value
      ? columnsCustomPercentages.value
      : proportionsToPercentages(String(attrs.value.proportions ?? ''), columnsCount.value)
    updateAttrs({ columns: columnsCount.value, customPercentages: serializePercentages(current) })
    return
  }

  const defaultProportions = Array.from({ length: Math.max(2, Math.min(6, columnsCount.value)) }, () => '1').join('-')
  const proportions = normalizeColumnProportions(selected || defaultProportions, columnsCount.value)
  updateAttrs({ columns: columnsCount.value, proportions, customPercentages: '' })
}

function setColumnsShowHeaders(value: boolean | 'indeterminate') {
  updateAttrs({ showHeaders: value === true })
}

function addColumn() {
  if (columnsCount.value >= 6) return
  setColumnsCount(String(columnsCount.value + 1))
}

function removeColumn(index: number) {
  const nextJson = selectedBlockJson('columnsBlock')
  if (!nextJson) return

  const nextColumns = normalizeColumnItems(nextJson.content, columnsCount.value)
  if (nextColumns.length <= 2 || index < 0 || index >= nextColumns.length) {
    return
  }

  const [removed] = nextColumns.splice(index, 1)
  if (removed?.content?.length) {
    const receiverIndex = Math.max(0, index - 1)
    const receiver = nextColumns[receiverIndex]
    if (receiver) {
      receiver.content = [...(receiver.content ?? []), ...removed.content]
    }
  }

  const nextCount = Math.max(2, Math.min(6, nextColumns.length))
  nextJson.content = nextColumns.slice(0, nextCount)
  nextJson.attrs = {
    ...(nextJson.attrs ?? {}),
    columns: nextCount,
    proportions: normalizeColumnProportions(String(nextJson.attrs?.proportions ?? ''), nextCount),
    customPercentages: ''
  }

  replaceSelectedBlockJson('columnsBlock', nextJson)
}

function onColumnCardDragStart(event: DragEvent, index: number) {
  draggedColumnIndex.value = index
  dragOverColumnIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function onColumnCardDragOver(index: number) {
  if (draggedColumnIndex.value === null || draggedColumnIndex.value === index) {
    return
  }
  dragOverColumnIndex.value = index
}

function onColumnCardDrop(index: number) {
  const from = draggedColumnIndex.value
  onColumnCardDragEnd()
  if (from === null || from === index) {
    return
  }
  moveColumn(from, index)
}

function onColumnCardDragEnd() {
  draggedColumnIndex.value = null
  dragOverColumnIndex.value = null
}

function moveColumn(fromIndex: number, toIndex: number) {
  const nextJson = selectedBlockJson('columnsBlock')
  if (!nextJson) return

  const nextColumns = normalizeColumnItems(nextJson.content, columnsCount.value)
  if (
    fromIndex < 0
    || toIndex < 0
    || fromIndex >= nextColumns.length
    || toIndex >= nextColumns.length
    || fromIndex === toIndex
  ) {
    return
  }

  const [movedColumn] = nextColumns.splice(fromIndex, 1)
  if (!movedColumn) return
  nextColumns.splice(toIndex, 0, movedColumn)

  const normalizedProportions = normalizeColumnProportions(String(nextJson.attrs?.proportions ?? ''), nextColumns.length)
    .split('-')
    .map((part) => Number(part) || 1)
  const [movedProportion] = normalizedProportions.splice(fromIndex, 1)
  normalizedProportions.splice(toIndex, 0, movedProportion ?? 1)

  const currentCustomPercentages = columnsCustomPercentages.value.length === nextColumns.length
    ? [...columnsCustomPercentages.value]
    : []
  if (currentCustomPercentages.length) {
    const [movedPercent] = currentCustomPercentages.splice(fromIndex, 1)
    currentCustomPercentages.splice(toIndex, 0, movedPercent ?? 100 / nextColumns.length)
  }

  nextJson.content = nextColumns
  nextJson.attrs = {
    ...(nextJson.attrs ?? {}),
    columns: nextColumns.length,
    proportions: normalizedProportions.map((value) => Math.max(1, Math.round(value))).join('-'),
    customPercentages: currentCustomPercentages.length ? serializePercentages(currentCustomPercentages) : ''
  }

  replaceSelectedBlockJson('columnsBlock', nextJson)
}

function setTabsOrientation(value: unknown) {
  updateAttrs({ orientation: asSelectValue(value, 'horizontal') === 'vertical' ? 'vertical' : 'horizontal' })
}

function setTabsStyle(value: unknown) {
  const tabStyle = asSelectValue(value, 'underline')
  updateAttrs({ tabStyle: tabStyle === 'pills' || tabStyle === 'enclosed' ? tabStyle : 'underline' })
}

function setTabsActiveIndex(value: unknown) {
  updateAttrs({ activeIndex: normalizeTabsActiveIndex(Number(asSelectValue(value, '0')), tabPanels.value.length) })
}

function setTabTitle(index: number, value: unknown) {
  updateNestedChildAttrs('tabsBlock', 'tabPanel', index, { title: asInputValue(value, `Tab ${index + 1}`).trim() || `Tab ${index + 1}` })
}

function normalizeTabsActiveIndex(value: number, count: number) {
  const maxIndex = Math.max(0, count - 1)
  return Number.isFinite(value) ? Math.max(0, Math.min(maxIndex, Math.round(value))) : 0
}

function setDiffLanguage(value: unknown) {
  updateAttrs({ language: normalizeDiffLanguage(asSelectValue(value, 'plaintext')) })
}

function setDiffOldLabel(value: unknown) {
  updateAttrs({ oldLabel: asInputValue(value, 'Before').trim() || 'Before' })
}

function setDiffNewLabel(value: unknown) {
  updateAttrs({ newLabel: asInputValue(value, 'After').trim() || 'After' })
}

function addTabPanel() {
  const nextJson = selectedBlockJson('tabsBlock')
  if (!nextJson) return

  const panels = (nextJson.content ?? []).filter((child) => child.type === 'tabPanel')
  if (panels.length >= 6) return

  panels.push(defaultTabPanel(panels.length))
  nextJson.content = panels
  nextJson.attrs = { ...(nextJson.attrs ?? {}), activeIndex: panels.length - 1 }
  replaceSelectedBlockJson('tabsBlock', nextJson)
}

function removeTabPanel() {
  const nextJson = selectedBlockJson('tabsBlock')
  if (!nextJson) return

  const panels = (nextJson.content ?? []).filter((child) => child.type === 'tabPanel')
  if (panels.length <= 2) return

  const removed = panels.pop()
  const last = panels[panels.length - 1]
  if (removed && last) {
    last.content = [...(last.content ?? []), ...(removed.content ?? [])]
  }

  const activeIndex = Math.min(Number(nextJson.attrs?.activeIndex ?? 0) || 0, panels.length - 1)
  nextJson.content = panels
  nextJson.attrs = { ...(nextJson.attrs ?? {}), activeIndex }
  replaceSelectedBlockJson('tabsBlock', nextJson)
}

function isHexColor(value: string) {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
}

function setHeadingLevel(value: string | number) {
  updateAttrs({ level: Number(value) })
}

function numberOrNull(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    return null
  }

  return n
}

function percentOrNull(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    return null
  }

  return Math.max(1, Math.min(200, Math.round(n)))
}

function aspectRatioFrom(currentWidth: unknown, currentHeight: unknown) {
  const width = numberOrNull(currentWidth)
  const height = numberOrNull(currentHeight)
  if (!width || !height) {
    return null
  }

  return width / height
}

function derivePercent(size: number | null, natural: number | null) {
  if (!size || !natural || natural <= 0) {
    return 100
  }

  return Math.max(1, Math.min(200, Math.round((size / natural) * 100)))
}

function imageNaturalDims() {
  const naturalWidth = numberOrNull(attrs.value.naturalWidth ?? attrs.value.width)
  const naturalHeight = numberOrNull(attrs.value.naturalHeight ?? attrs.value.height)
  return { naturalWidth, naturalHeight }
}

function mediaNaturalDims() {
  const mediaNaturalWidth = numberOrNull(attrs.value.mediaNaturalWidth ?? attrs.value.mediaWidth)
  const mediaNaturalHeight = numberOrNull(attrs.value.mediaNaturalHeight ?? attrs.value.mediaHeight)
  return { mediaNaturalWidth, mediaNaturalHeight }
}

function setImageSourceSize(value: unknown) {
  updateAttrs({ sourceSize: asSelectValue(value, 'full') })
}

function setImageDisplaySize(value: unknown) {
  const displaySize = asSelectValue(value, 'fill-container')
  updateAttrs({ displaySize })
}

function setImageWidth(value: unknown) {
  const width = numberOrNull(value)
  const lockAspect = attrs.value.lockAspect !== false
  const ratio = aspectRatioFrom(attrs.value.naturalWidth, attrs.value.naturalHeight) ?? aspectRatioFrom(attrs.value.width, attrs.value.height)
  const { naturalWidth, naturalHeight } = imageNaturalDims()

  if (lockAspect && width && ratio) {
    const height = Math.round(width / ratio)
    updateAttrs({
      displaySize: 'custom-px',
      displayPx: width,
      width,
      height,
      displayPercent: derivePercent(width, naturalWidth),
      widthPercent: derivePercent(width, naturalWidth),
      naturalWidth: naturalWidth ?? width,
      naturalHeight: naturalHeight ?? height
    })
    return
  }

  updateAttrs({
    displaySize: 'custom-px',
    displayPx: width,
    width,
    displayPercent: derivePercent(width, naturalWidth),
    widthPercent: derivePercent(width, naturalWidth),
    naturalWidth: naturalWidth ?? width
  })
}

function setImageHeight(value: unknown) {
  const height = numberOrNull(value)
  const lockAspect = attrs.value.lockAspect !== false
  const ratio = aspectRatioFrom(attrs.value.naturalWidth, attrs.value.naturalHeight) ?? aspectRatioFrom(attrs.value.width, attrs.value.height)
  const { naturalWidth, naturalHeight } = imageNaturalDims()

  if (lockAspect && height && ratio) {
    const width = Math.round(height * ratio)
    updateAttrs({
      displaySize: 'custom-px',
      displayPx: width,
      height,
      width,
      displayPercent: derivePercent(width, naturalWidth),
      widthPercent: derivePercent(width, naturalWidth),
      naturalHeight: naturalHeight ?? height,
      naturalWidth: naturalWidth ?? width
    })
    return
  }

  updateAttrs({
    displaySize: 'custom-px',
    height,
    displayPercent: derivePercent(height, naturalHeight),
    widthPercent: derivePercent(height, naturalHeight),
    naturalHeight: naturalHeight ?? height
  })
}

function setImageDisplayPercent(value: unknown) {
  const widthPercent = percentOrNull(value)
  if (!widthPercent) {
    return
  }

  const { naturalWidth, naturalHeight } = imageNaturalDims()
  if (!naturalWidth || !naturalHeight) {
    updateAttrs({ displaySize: 'custom-percent', displayPercent: widthPercent, widthPercent })
    return
  }

  const width = Math.round((naturalWidth * widthPercent) / 100)
  const height = Math.round((naturalHeight * widthPercent) / 100)
  updateAttrs({
    displaySize: 'custom-percent',
    displayPercent: widthPercent,
    widthPercent,
    width,
    height,
    naturalWidth,
    naturalHeight
  })
}

function setMediaSourceSize(value: unknown) {
  updateAttrs({ mediaSourceSize: asSelectValue(value, 'full') })
}

function setMediaDisplaySize(value: unknown) {
  const mediaDisplaySize = asSelectValue(value, 'fill-container')
  updateAttrs({ mediaDisplaySize })
}

function setMediaWidth(value: unknown) {
  const mediaWidth = numberOrNull(value)
  const lockAspect = attrs.value.lockAspect !== false
  const ratio = aspectRatioFrom(attrs.value.mediaNaturalWidth, attrs.value.mediaNaturalHeight) ?? aspectRatioFrom(attrs.value.mediaWidth, attrs.value.mediaHeight)
  const { mediaNaturalWidth, mediaNaturalHeight } = mediaNaturalDims()

  if (lockAspect && mediaWidth && ratio) {
    const mediaHeight = Math.round(mediaWidth / ratio)
    updateAttrs({
      mediaDisplaySize: 'custom-px',
      mediaDisplayPx: mediaWidth,
      mediaWidth,
      mediaHeight,
      mediaDisplayPercent: derivePercent(mediaWidth, mediaNaturalWidth),
      mediaWidthPercent: derivePercent(mediaWidth, mediaNaturalWidth),
      mediaNaturalWidth: mediaNaturalWidth ?? mediaWidth,
      mediaNaturalHeight: mediaNaturalHeight ?? mediaHeight
    })
    return
  }

  updateAttrs({
    mediaDisplaySize: 'custom-px',
    mediaDisplayPx: mediaWidth,
    mediaWidth,
    mediaDisplayPercent: derivePercent(mediaWidth, mediaNaturalWidth),
    mediaWidthPercent: derivePercent(mediaWidth, mediaNaturalWidth),
    mediaNaturalWidth: mediaNaturalWidth ?? mediaWidth
  })
}

function setMediaHeight(value: unknown) {
  const mediaHeight = numberOrNull(value)
  const lockAspect = attrs.value.lockAspect !== false
  const ratio = aspectRatioFrom(attrs.value.mediaNaturalWidth, attrs.value.mediaNaturalHeight) ?? aspectRatioFrom(attrs.value.mediaWidth, attrs.value.mediaHeight)
  const { mediaNaturalWidth, mediaNaturalHeight } = mediaNaturalDims()

  if (lockAspect && mediaHeight && ratio) {
    const mediaWidth = Math.round(mediaHeight * ratio)
    updateAttrs({
      mediaDisplaySize: 'custom-px',
      mediaDisplayPx: mediaWidth,
      mediaHeight,
      mediaWidth,
      mediaDisplayPercent: derivePercent(mediaWidth, mediaNaturalWidth),
      mediaWidthPercent: derivePercent(mediaWidth, mediaNaturalWidth),
      mediaNaturalHeight: mediaNaturalHeight ?? mediaHeight,
      mediaNaturalWidth: mediaNaturalWidth ?? mediaWidth
    })
    return
  }

  updateAttrs({
    mediaDisplaySize: 'custom-px',
    mediaHeight,
    mediaDisplayPercent: derivePercent(mediaHeight, mediaNaturalHeight),
    mediaWidthPercent: derivePercent(mediaHeight, mediaNaturalHeight),
    mediaNaturalHeight: mediaNaturalHeight ?? mediaHeight
  })
}

function setMediaDisplayPercent(value: unknown) {
  const mediaWidthPercent = percentOrNull(value)
  if (!mediaWidthPercent) {
    return
  }

  const { mediaNaturalWidth, mediaNaturalHeight } = mediaNaturalDims()
  if (!mediaNaturalWidth || !mediaNaturalHeight) {
    updateAttrs({ mediaDisplaySize: 'custom-percent', mediaDisplayPercent: mediaWidthPercent, mediaWidthPercent })
    return
  }

  const mediaWidth = Math.round((mediaNaturalWidth * mediaWidthPercent) / 100)
  const mediaHeight = Math.round((mediaNaturalHeight * mediaWidthPercent) / 100)
  updateAttrs({
    mediaDisplaySize: 'custom-percent',
    mediaDisplayPercent: mediaWidthPercent,
    mediaWidthPercent,
    mediaWidth,
    mediaHeight,
    mediaNaturalWidth,
    mediaNaturalHeight
  })
}

function setMediaRatioPreset(value: unknown) {
  const raw = Number(asSelectValue(value, '50'))
  if (!Number.isFinite(raw)) {
    return
  }

  const ratio = Math.max(15, Math.min(85, Math.round(raw))) / 100
  updateAttrs({ ratio })
}

function setImageLockAspect(value: unknown) {
  const lockAspect = asBooleanValue(value, true)
  if (!lockAspect) {
    updateAttrs({ lockAspect })
    return
  }

  const { naturalWidth, naturalHeight } = imageNaturalDims()
  const width = numberOrNull(attrs.value.width)
  if (naturalWidth && naturalHeight && width) {
    updateAttrs({
      lockAspect,
      height: Math.round((width / naturalWidth) * naturalHeight),
      widthPercent: derivePercent(width, naturalWidth),
      naturalWidth,
      naturalHeight
    })
    return
  }

  updateAttrs({ lockAspect })
}

function setMediaLockAspect(value: unknown) {
  const lockAspect = asBooleanValue(value, true)
  if (!lockAspect) {
    updateAttrs({ lockAspect })
    return
  }

  const { mediaNaturalWidth, mediaNaturalHeight } = mediaNaturalDims()
  const mediaWidth = numberOrNull(attrs.value.mediaWidth)
  if (mediaNaturalWidth && mediaNaturalHeight && mediaWidth) {
    updateAttrs({
      lockAspect,
      mediaHeight: Math.round((mediaWidth / mediaNaturalWidth) * mediaNaturalHeight),
      mediaWidthPercent: derivePercent(mediaWidth, mediaNaturalWidth),
      mediaNaturalWidth,
      mediaNaturalHeight
    })
    return
  }

  updateAttrs({ lockAspect })
}

function runTableCommand(command: 'addColumnAfter' | 'addRowAfter' | 'deleteColumn' | 'deleteRow') {
  const activeEditor = props.editor
  if (!activeEditor) {
    return
  }

  const chain = activeEditor.chain().focus() as any
  chain[command]().run()
}
</script>

<style scoped>
.code-settings-panel :deep(.code-settings-field .u-select),
.code-settings-panel :deep(.code-settings-field .u-input),
.code-settings-panel :deep(.code-settings-field .u-input-root) {
  width: 100%;
}

.code-settings-panel :deep(.code-settings-field .u-select button) {
  width: 100%;
}

.code-settings-panel :deep(.code-settings-field .u-select button span) {
  white-space: nowrap;
  overflow: visible;
  text-overflow: clip;
}

.code-settings-panel :deep([role='option']) {
  white-space: nowrap;
}
</style>
