import { loadPandablogModules } from '../build/pandablog-modules'

const manifest = loadPandablogModules()
console.log(JSON.stringify(manifest, null, 2))