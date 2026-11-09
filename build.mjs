// Bundles everything into one self-contained index.html, so the site opens by
// double-clicking the file and works with no internet during the presentation.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const b64 = (p) => readFileSync(p).toString('base64');
const fonts = `
@font-face{font-family:'Anybody';font-style:normal;font-weight:100 900;font-stretch:50% 150%;font-display:swap;
  src:url(data:font/woff2;base64,${b64('node_modules/@fontsource-variable/anybody/files/anybody-latin-standard-normal.woff2')}) format('woff2');}
@font-face{font-family:'Atkinson Hyperlegible';font-style:normal;font-weight:400;font-display:swap;
  src:url(data:font/woff2;base64,${b64('node_modules/@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2')}) format('woff2');}
@font-face{font-family:'Atkinson Hyperlegible';font-style:normal;font-weight:700;font-display:swap;
  src:url(data:font/woff2;base64,${b64('node_modules/@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2')}) format('woff2');}
`;

const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fonts + readFileSync('src/styles.css', 'utf8');
const html = readFileSync('src/index.html', 'utf8')
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => js);
writeFileSync('index.html', html);
console.log(`index.html written: ${(html.length / 1024 / 1024).toFixed(2)} MB`);
