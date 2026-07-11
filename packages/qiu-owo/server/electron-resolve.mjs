// Loader hook: redirect 'electron' imports to the mock in dev mode
export function resolve(specifier, context, nextResolve) {
  if (specifier === 'electron') {
    return {
      url: new URL('./electron-mock.mjs', import.meta.url).href,
      shortCircuit: true,
    }
  }
  return nextResolve(specifier)
}
