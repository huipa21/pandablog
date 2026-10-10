import { readFileSync } from 'node:fs'
import { compileScript, parse } from '@vue/compiler-sfc'
import { ModuleKind, transpileModule } from 'typescript'
import * as vue from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { EditorState } from '@tiptap/pm/state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '../../stores/editor'
import { ColumnsBlockNode, ColumnItemNode } from '../../extensions/columnsBlock'
import { TabsBlockNode, TabPanelNode } from '../../extensions/tabsBlock'
import { AccordionBlockNode, AccordionPaneNode } from '../../extensions/accordionBlock'
import * as code from '../../extensions/codeBlockEnhanced'
import * as diff from '../../utils/diffBlock'
import * as presentation from '../../utils/blockPresentation'

const descriptor = parse(readFileSync(new URL('../../components/admin/editor/blocks/BlockSettings.vue', import.meta.url),'utf8')).descriptor
const compiled = transpileModule(compileScript(descriptor,{id:'editor-settings-test'}).content,{compilerOptions:{module:ModuleKind.CommonJS}}).outputText
const schema = getSchema([StarterKit,ColumnsBlockNode,ColumnItemNode,TabsBlockNode,TabPanelNode,AccordionBlockNode,AccordionPaneNode])
let store: ReturnType<typeof useEditorStore>
let state: EditorState
let setup: any
beforeEach(() => {
  const pinia=createPinia();setActivePinia(pinia)
  for(const key of ['computed','ref'] as const)vi.stubGlobal(key,vue[key])
  vi.stubGlobal('useEditorStore',()=>useEditorStore(pinia))
  vi.stubGlobal('useBlockRegistry',()=>({getBlockDefinition:()=>null}))
  vi.stubGlobal('useI18n',()=>({t:(key:string)=>key}))
  store=useEditorStore(pinia)
})
afterEach(()=>{vi.unstubAllGlobals();setActivePinia(undefined)})
function mount(type: string, childType: string, count: number, attrs: Record<string,unknown>={}) {
  const children=Array.from({length:count},(_,i)=>({type:childType,attrs:{header:`H${i}`,title:`T${i}`,defaultOpen:i===0},content:[{type:'paragraph',content:[{type:'text',text:`Body${i}`}]}]}))
  state=EditorState.create({schema,doc:schema.nodeFromJSON({type:'doc',content:[{type,attrs,content:children}]})})
  store.selectBlock({id:`${type}:0`,type,pos:0,attrs:state.doc.firstChild!.attrs})
  const exports: any={}
  new Function('require','exports',compiled)((id:string)=>id==='vue'?vue:id.includes('codeBlockEnhanced')?code:id.includes('diffBlock')?diff:id.includes('blockPresentation')?presentation:{},exports)
  setup=exports.default.setup({editor:{isEditable:true,get state(){return state},schema,view:{dispatch(tr:any){state=state.apply(tr)}}}},{expose:()=>{}})
}
describe('real settings setup with ProseMirror schema',()=>{
  it.each(['en','zh-CN'])('has translated canonical presets without arbitrary presentation fields (%s)', locale => {
    const messages = JSON.parse(readFileSync(new URL(`../../i18n/locales/${locale}.json`,import.meta.url),'utf8')).admin.editor.settingsPanel
    for(const key of ['small','medium','fullContentWidth','equal','widerLeft','widerRight','quoteBar','quoteMarks']) expect(messages[key]).toBeTruthy()
    mount('columnsBlock','columnItem',3,{columns:3})
    expect(setup.fields.value[0].items.map((item:any)=>item.value)).toEqual(['equal'])
  })

  it('keeps column content when reducing count and canonicalizes layout',()=>{
    mount('columnsBlock','columnItem',3,{columns:3})
    setup.setColumnCount('2')
    expect(state.doc.firstChild!.childCount).toBe(2)
    expect(state.doc.textContent).toBe('Body0Body1Body2')
    expect(state.doc.firstChild!.attrs.layoutPreset).toBe('equal')
    expect(setup.fields.value.map((f:any)=>f.key)).toEqual(['layoutPreset','blockWidth'])
  })
  it.each([['tabsBlock','tabPanel',3],['accordionBlock','accordionPane',2]])('preserves removed child contents for %s',(type,child,count)=>{
    mount(String(type),String(child),Number(count))
    setup.removeChild(1)
    expect(state.doc.textContent).toContain('Body1')
    expect(state.doc.firstChild!.childCount).toBe(Number(count)-1)
  })
  it('reorders columns without changing layout weights',()=>{
    mount('columnsBlock','columnItem',2,{columns:2,layoutPreset:'wider-left'})
    setup.moveChild(0,1)
    expect(state.doc.textContent).toBe('Body1Body0')
    expect(state.doc.firstChild!.attrs.layoutPreset).toBe('wider-left')
  })
  it('single-open and collapsed controls retain valid child default states',()=>{
    mount('accordionBlock','accordionPane',2)
    setup.setPaneOpen(1,true)
    expect(state.doc.firstChild!.attrs.defaultOpenIndices).toEqual([1])
    setup.updateAttrs({startCollapsed:true})
    expect(state.doc.firstChild!.attrs.defaultOpenIndices).toEqual([])
    expect(state.doc.firstChild!.content.content.every(node=>node.attrs.defaultOpen===false)).toBe(true)
  })
})
