import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join, resolve, dirname, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { parse, compileScript, compileStyle } from '@vue/compiler-sfc'
import { build } from 'esbuild'
import { chromium } from '@playwright/test'
import { describe, expect, it } from 'vitest'

// Opt-in browser component/schema fixture: no Nuxt dotenv, application server,
// DB, accounts or user storage. Uses only a generated bundle and owned browser.
const run = process.env.PB_EDITOR_BROWSER === '1' ? it : it.skip
const root = resolve('.')
const files = [
  'components/admin/editor/ImageBlockNodeView.vue', 'components/content/NodeImage.vue',
  'components/admin/editor/MediaTextNodeView.vue', 'components/content/NodeMediaText.vue',
  'components/admin/editor/ColumnsBlockNodeView.vue', 'components/content/NodeColumnsBlock.vue',
  'components/admin/editor/QuoteBlockNodeView.vue', 'components/content/NodeQuoteBlock.vue'
]
describe('owned presentation browser/schema integration', () => {
  run('checks all presets, legacy HTML/JSON round trips and proportional geometry in Chromium', async () => {
    const owned = await mkdtemp(join(tmpdir(), 'pb-editor-browser-'))
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
    const styles: string[] = []
    try {
      const entry = `
import * as Vue from 'vue';
import {ImageBlockNode} from './extensions/imageBlock';
import {MediaTextNode} from './extensions/mediaText';
import {ColumnsBlockNode,ColumnItemNode} from './extensions/columnsBlock';
import {BlockquoteEnhanced} from './extensions/blockquoteEnhanced';
import {getSchema} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {DOMParser,DOMSerializer} from '@tiptap/pm/model';
import {normalizeBlockPresentation} from './utils/blockPresentation';
import {fallbackContentImage} from './utils/contentImage';
${files.map((file,i)=>`import C${i} from './${file}';`).join('\n')}
Object.assign(globalThis,Vue);
const url = x => x;
globalThis.useMediaConfig=()=>({settings:Vue.ref({})});
globalThis.useMediaUrl=()=>({resolveMediaUrl:url,toPublicMediaVariantUrl:(x,size)=>x+'?variant='+size});
globalThis.useI18n=()=>({t:key=>key});
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="teal"/></svg>');
const node=(type,attrs,content=[])=>({type,attrs,content,childCount:content.length,textContent:'Text',toJSON(){return {type,attrs,content}}});
const schema=getSchema([StarterKit.configure({blockquote:false}),ImageBlockNode,MediaTextNode,ColumnsBlockNode,ColumnItemNode,BlockquoteEnhanced]);
const html=document.createElement('div'); html.innerHTML='<img src="/media/example" data-display-size="custom-percent" data-display-percent="33">';
const parsed=DOMParser.fromSchema(schema).parse(html).toJSON();
const canonical=normalizeBlockPresentation({type:'doc',content:[{type:'image',attrs:{src:'/media/example',displaySize:'custom-percent',displayPercent:66,lockAspect:false,height:20}}]});
const roundtrip=schema.nodeFromJSON(canonical).toJSON();
const serialized=DOMSerializer.fromSchema(schema).serializeFragment(schema.nodeFromJSON(canonical).content); const wrapper=document.createElement('div');wrapper.append(serialized);
globalThis.schemaEvidence={parsed,roundtrip,html:wrapper.innerHTML};
const components=[${files.map((_,i)=>`C${i}`).join(',')}];
const h=Vue.h;
const renderView=(component,n,editor)=>h(component,editor?{node:n,selected:false,editor:{state:{doc:{resolve(){return {parent:{attrs:{showHeaders:true}}}}},selection:{}},isEditable:false},getPos:()=>0,updateAttributes:()=>{}}:{node:n});
const variants=[h('img',{id:'fallback-probe',src:'http://fixture.test/media/original',srcset:'http://fixture.test/media/missing 900w',sizes:'100vw',onError:fallbackContentImage})];
for(const sizePreset of ['small','medium','full']) {const n=node('image',{src:image,sizePreset,alt:'fixture'}); variants.push(h('section',{'data-case':'image-'+sizePreset},[renderView(C0,n,true),renderView(C1,n,false)]));}
for(const preset of ['equal','wider-left','wider-right']) {const n=node('columnsBlock',{columns:2,layoutPreset:preset}); variants.push(h('section',{'data-case':'columns-'+preset},[renderView(C4,n,true),renderView(C5,n,false)]));}
for(const sizePreset of ['small','medium','full']) {const n=node('mediaText',{mediaSrc:image,mediaMime:'image/svg+xml',mediaSizePreset:sizePreset,layoutPreset:'equal'});variants.push(h('section',{'data-case':'media-'+sizePreset},[renderView(C2,n,true),renderView(C3,n,false)]));}
for(const style of ['bar','marks']){const n=node('blockquote',{style,authorName:'Author',theme:'red',fontSize:'9rem'});variants.push(h('section',{'data-case':'quote-'+style},[renderView(C6,n,true),renderView(C7,n,false)]));}
const app=Vue.createApp({render:()=>h('main',variants)});app.component('UIcon',{render:()=>null});app.mount('#app');
`
      const result = await build({ stdin: { contents: entry, resolveDir: root, sourcefile: 'editor-browser-entry.ts', loader: 'ts' }, bundle: true, write: false, format: 'iife', platform: 'browser', plugins: [{ name: 'owned-sfc', setup(builder) {
        builder.onResolve({ filter: /^~\// }, args => ({ path: resolve(root, args.path.slice(2)) + (extname(args.path) ? '' : '.ts') }))
        builder.onLoad({ filter: /\.css$/ }, async args => { styles.push(await readFile(args.path, 'utf8')); return { contents: '', loader: 'js' } })
        builder.onLoad({ filter: /\.vue$/ }, async args => {
          // Editor wrappers/content are adapters; actual block SFC template runs.
          if (!files.some(file => resolve(root,file) === args.path)) return { contents: 'export default {render(){return null}}', loader: 'js' }
          const source = await readFile(args.path, 'utf8'), descriptor = parse(source).descriptor
          for (const style of descriptor.styles) {
            const text = style.src ? await readFile(style.src.startsWith('~/') ? resolve(root,style.src.slice(2)) : resolve(dirname(args.path),style.src),'utf8') : style.content
            styles.push(compileStyle({ source:text,filename:args.path,id:'browser-fixture',scoped:false }).code)
          }
          const script = compileScript(descriptor,{id:'browser-fixture',inlineTemplate:true})
          return { contents:script.content,loader:'ts' }
        })
        builder.onResolve({filter:/^@tiptap\/vue-3$/},()=>({path:'tiptap-adapter',namespace:'fixture'}))
        builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`import {h} from 'vue';export const nodeViewProps={node:Object,selected:Boolean,editor:Object,getPos:Function,updateAttributes:Function};export const NodeViewWrapper={inheritAttrs:false,setup(_,ctx){return ()=>h('div',ctx.attrs,ctx.slots.default?.())}};export const NodeViewContent={inheritAttrs:false,setup(_,ctx){return ()=>h(ctx.attrs.as||'div',ctx.attrs,'Text')}};`,loader:'js',resolveDir:root}))
      } }] })
      browser = await chromium.launch({headless:true})
      const page = await browser.newPage()
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://fixture.test/**', route => {
        const url = route.request().url()
        return route.fulfill(url.endsWith('/media/missing') ? { status:404,body:'' } : url.endsWith('/media/original') ? {contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="60" height="30"/>'} : {contentType:'text/html',body:'<div id="app"></div>'})
      })
      await page.goto('http://fixture.test/')
      await page.addStyleTag({content:styles.join('\n')+'\n#fallback-probe{max-width:100%;height:auto}figure{margin:0}.flex{display:flex}.inline-block{display:inline-block}.block{display:block}.w-full{width:100%}.max-w-full{max-width:100%}body{margin:0}section{width:100%;min-width:0}main{width:100%;max-width:900px;margin:auto}*{box-sizing:border-box}:root{--pb-text:rgb(20,20,20);--pb-primary:teal;--pb-divider:silver;--pb-font-text:Arial;--pb-surface:white;--pb-surface-subtle:whitesmoke}'})
      await page.addScriptTag({content:result.outputFiles[0]!.text})
      expect(errors).toEqual([])
      await page.waitForFunction(() => { const img = document.querySelector<HTMLImageElement>('#fallback-probe'); return img?.complete && img.naturalWidth > 0 && !img.hasAttribute('srcset') }, null, {timeout:5000}).catch(async error => { throw new Error(`${error.message}; probe=${JSON.stringify(await page.locator('#fallback-probe').evaluate(el => ({html:el.outerHTML,src:(el as HTMLImageElement).currentSrc,width:(el as HTMLImageElement).naturalWidth})))}`) })
      expect(errors).toEqual([])
      const evidence = await page.evaluate(() => (globalThis as any).schemaEvidence)
      expect(evidence.parsed.content[0].attrs.sizePreset).toBe('small')
      expect(evidence.roundtrip.content[0].attrs.sizePreset).toBe('medium')
      expect(evidence.html).toContain('data-size-preset="medium"')
      expect(evidence.html).not.toContain('data-display-size')
      for (const mode of ['light','dark']) {
        await page.evaluate(mode => { document.documentElement.dataset.theme = mode; document.documentElement.style.setProperty('--pb-text', mode === 'dark' ? 'white' : 'black') }, mode)
      for (const width of [360,768,1024,1440]) {
        await page.setViewportSize({width,height:900})
        for (const preset of ['small','medium','full']) {
          const figures = page.locator(`[data-case="image-${preset}"] figure`)
          const boxes = await figures.evaluateAll(elements=>elements.map(el=>({width:el.getBoundingClientRect().width,parent:el.parentElement!.getBoundingClientRect().width})))
          expect(boxes[0]!.width).toBeCloseTo(boxes[1]!.width,0)
          const ratio=width<=768?1:preset==='small'?1/3:preset==='medium'?2/3:1
          expect(boxes[0]!.width/boxes[0]!.parent).toBeCloseTo(ratio,2)
          for(const img of await figures.locator('img').all()) {
            await img.evaluate(async el => { if(!(el as HTMLImageElement).complete) await new Promise(r=>el.addEventListener('load',r,{once:true})) })
            const box=await img.boundingBox(); expect(box!.width/box!.height).toBeCloseTo(2,1)
          }
        }
        for (const preset of ['small','medium','full']) {
          const images = page.locator(`[data-case="media-${preset}"] img`)
          const ratios = await images.evaluateAll(elements => elements.map(el => el.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().width))
          expect(ratios[0]).toBeCloseTo(ratios[1]!, 2)
        }
        for (const preset of ['equal','wider-left','wider-right']) {
          const grids = page.locator(`[data-case="columns-${preset}"] .columns-block-grid`)
          const templates = await grids.evaluateAll(elements => elements.map(el => getComputedStyle(el).gridTemplateColumns))
          expect(templates[0]).toBe(templates[1])
        }
        for (const style of ['bar','marks']) {
          const quotes = page.locator(`[data-case="quote-${style}"] .quote-block`)
          const metrics = await quotes.evaluateAll(elements => elements.map(el => ({font:getComputedStyle(el).fontSize,color:getComputedStyle(el).color})))
          expect(metrics[0]).toEqual(metrics[1])
          expect(metrics[0]?.font).not.toBe('144px')
        }
        const overflow = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => `${el.tagName}.${el.className}`).slice(0,10) }))
        expect(overflow.width, JSON.stringify(overflow)).toBeLessThanOrEqual(width)
      }
      }
    } finally {
      await browser?.close()
      await rm(owned,{recursive:true,force:true})
    }
  }, 60_000)
})
