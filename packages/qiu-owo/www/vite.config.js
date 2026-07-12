import pathLib from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const __dirname = pathLib.dirname(fileURLToPath(import.meta.url));
const nm = pathLib.resolve(__dirname, "..", "node_modules");

export default defineConfig({
  resolve: {
    alias: {
      "@pixi/core": pathLib.resolve(nm, "pixi.js/node_modules/@pixi/core"),
      "@pixi/display": pathLib.resolve(nm, "pixi.js/node_modules/@pixi/display"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    https: false,
    /* proxy:{
      "/api":{
        target:"http://localhost:9501",
        changeOrigin:true,
        //rewrite:(path) => path.replace(/^\/api/,"")
      }
    }, */
  },
  build: {
    minify: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: pathLib.resolve("./index.html"),
      },
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
    },
  },
  /*   esbuild: {
      keepNames: true,
      minifyIdentifiers: false,
      minifySyntax: false,
      minifyWhitespace: false,
    }, */
  plugins: [
    //splitVendorChunkPlugin()
  ],
  // Uncomment to use JSX:
  // esbuild: {
  //   jsx: "transform",
  //   jsxFactory: "m",
  //   jsxFragment: "'['",
  // },
});
