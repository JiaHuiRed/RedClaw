// Preload script: mock the 'electron' module for dev mode (running server under plain Node.js)
// Usage: node --import ./dev-preload.mjs server/serve.js

import { register } from 'node:module'

register('./electron-mock-loader.mjs', {
  parentURL: import.meta.url,
  data: {}
})
