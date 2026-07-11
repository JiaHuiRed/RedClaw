// Dev entry — register electron mock, import serve.js and start server under plain Node
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./electron-resolve.mjs', pathToFileURL('./'))

const { default: init } = await import('./serve.js')
const { server } = await init()
console.log('Server running on http://0.0.0.0:%s', server.info.port);
