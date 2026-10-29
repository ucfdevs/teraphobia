// Renders every .mmd file in this folder to a framed PNG for slides.
// Usage: npm install && node render.mjs   (needs Playwright's Chromium)
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const roots = {
  mermaid: dirname(require.resolve('mermaid/dist/mermaid.esm.min.mjs')),
  elk: dirname(require.resolve('@mermaid-js/layout-elk/dist/mermaid-layout-elk.esm.min.mjs')),
  fonts: join(here, 'fonts'),
};

const diagrams = [
  { file: 'gantt', title: 'Schedule', caption: 'Four milestones from planning to the final demo. Orange diamonds mark the check-in and the demo.' },
  { file: 'erd', title: 'Data model', caption: 'MongoDB keeps accounts and finished games. Live games stay in server memory until they end.' },
  { file: 'use-case', title: 'Use cases', caption: 'What each actor can do. The host is an account holder and can also join a game as a player.' },
  { file: 'class', title: 'Game classes', caption: 'The server-side game model. Game runs the round loop, and each Monster type adds one power.' },
  { file: 'sequence-round', title: 'One round', caption: 'From Night to the win check. Every phase ends on its timer, never early.' },
];

const c = {
  night: '#131A35',
  manor: '#1F2A52',
  manorDeep: '#182046',
  mist: '#7F8BB8',
  bone: '#EEF0FA',
  fog: '#C9CFEA',
  ghost: '#A99BF0',
  candle: '#F59A3C',
};

const theme = {
  theme: 'base',
  htmlLabels: false,
  fontFamily: 'IBM Plex Sans',
  themeVariables: {
    darkMode: true,
    background: c.night,
    fontFamily: 'IBM Plex Sans',
    fontSize: '16px',
    primaryColor: c.manor,
    primaryTextColor: c.bone,
    primaryBorderColor: c.mist,
    secondaryColor: '#2A2560',
    tertiaryColor: c.manorDeep,
    lineColor: c.mist,
    textColor: c.bone,
    mainBkg: c.manor,
    nodeBorder: c.mist,
    clusterBkg: '#171F40',
    clusterBorder: '#3A4578',
    titleColor: c.fog,
    edgeLabelBackground: c.night,
    noteBkgColor: '#2A2560',
    noteTextColor: c.bone,
    noteBorderColor: c.ghost,
    actorBkg: c.manor,
    actorBorder: c.mist,
    actorTextColor: c.bone,
    actorLineColor: '#3A4578',
    signalColor: c.fog,
    signalTextColor: c.bone,
    labelBoxBkgColor: c.manor,
    labelBoxBorderColor: c.mist,
    labelTextColor: c.bone,
    loopTextColor: c.fog,
    sequenceNumberColor: c.night,
    sectionBkgColor: '#1A2247',
    altSectionBkgColor: c.night,
    sectionBkgColor2: '#1A2247',
    taskBkgColor: '#3B4785',
    taskBorderColor: '#5C68A6',
    taskTextColor: c.bone,
    taskTextLightColor: c.bone,
    taskTextOutsideColor: c.bone,
    taskTextDarkColor: c.bone,
    activeTaskBkgColor: '#6B5FC0',
    activeTaskBorderColor: c.ghost,
    doneTaskBkgColor: '#2B3360',
    doneTaskBorderColor: '#5C68A6',
    critBkgColor: c.candle,
    critBorderColor: c.candle,
    gridColor: '#2E3866',
    attributeBackgroundColorOdd: c.manor,
    attributeBackgroundColorEven: c.manorDeep,
    classText: c.bone,
  },
  gantt: { barHeight: 26, barGap: 8, bottomPadding: 40, topPadding: 56, leftPadding: 170, fontSize: 14, sectionFontSize: 15 },
  sequence: { actorFontFamily: 'IBM Plex Sans', messageFontFamily: 'IBM Plex Mono', noteFontFamily: 'IBM Plex Sans', mirrorActors: false },
  er: { fontSize: 15 },
  flowchart: { curve: 'basis', padding: 16, nodeSpacing: 36, rankSpacing: 64 },
};

const font = (family, file, weight) =>
  `@font-face{font-family:'${family}';src:url('/fonts/${file}') format('woff2');font-weight:${weight};font-display:block}`;

const page = (d, source) => `<!doctype html><html><head><meta charset="utf-8"><style>
${font('Bricolage Grotesque', 'bricolage-grotesque-latin-600-normal.woff2', 600)}
${font('Bricolage Grotesque', 'bricolage-grotesque-latin-700-normal.woff2', 700)}
${font('IBM Plex Sans', 'ibm-plex-sans-latin-400-normal.woff2', 400)}
${font('IBM Plex Sans', 'ibm-plex-sans-latin-500-normal.woff2', 500)}
${font('IBM Plex Sans', 'ibm-plex-sans-latin-600-normal.woff2', 600)}
${font('IBM Plex Mono', 'ibm-plex-mono-latin-400-normal.woff2', 400)}
${font('IBM Plex Mono', 'ibm-plex-mono-latin-500-normal.woff2', 500)}
html,body{margin:0;background:${c.night}}
body{width:1600px;padding:64px 72px 72px;box-sizing:border-box;color:${c.bone};font-family:'IBM Plex Sans',sans-serif;
  background:radial-gradient(900px 520px at 92% -8%, rgba(169,155,240,.16), transparent 70%), ${c.night}}
header{display:flex;align-items:baseline;justify-content:space-between;gap:32px;margin-bottom:12px}
h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:56px;line-height:1.05;letter-spacing:-0.02em;margin:0}
.mark{font-family:'Bricolage Grotesque',sans-serif;font-weight:600;font-size:20px;color:${c.ghost}}
p{margin:0 0 40px;font-size:20px;line-height:1.5;color:${c.fog};max-width:62ch}
#out{display:flex;justify-content:center}
#out svg{max-width:100%;height:auto}
#out .erDiagramTitleText,#out .titleText{display:none}
#out .er.entityLabel,#out .label,#out .nodeLabel{font-family:'IBM Plex Sans',sans-serif}
#out .er.attributeBoxOdd + text,#out .er.entityBox + text{font-family:'IBM Plex Mono',monospace}
#out .classTitle,#out .classTitleText{font-family:'Bricolage Grotesque',sans-serif}
#out .sectionTitle{fill:${c.fog}!important;font-weight:600}
#out .grid .tick text{fill:${c.fog}!important;font-size:13px}
#out .cluster-label .nodeLabel,#out .cluster span{color:${c.fog}!important}
#out svg[aria-roledescription='er'] path{marker-start:none!important;marker-end:none!important}
#out .grid .tick line{stroke:#263063!important;opacity:1}
#out .grid path{stroke:none}
</style></head><body>
<header><h1>${d.title}</h1><span class="mark">Teraphobia</span></header>
<p>${d.caption}</p>
<div id="out"></div>
<script type="module">
import mermaid from '/mermaid/mermaid.esm.min.mjs';
import elkLayouts from '/elk/mermaid-layout-elk.esm.min.mjs';
mermaid.registerLayoutLoaders(elkLayouts);
(async () => {
  await document.fonts.load('16px "IBM Plex Sans"'); await document.fonts.load('600 16px "IBM Plex Sans"');
  await document.fonts.load('16px "IBM Plex Mono"'); await document.fonts.load('700 56px "Bricolage Grotesque"');
  await document.fonts.ready;
  mermaid.initialize(Object.assign({ startOnLoad: false, securityLevel: 'loose' }, ${JSON.stringify(theme)}));
  const { svg } = await mermaid.render('d', ${JSON.stringify(source)});
  document.getElementById('out').innerHTML = svg;
  window.__done = true;
})().catch(e => { document.body.innerText = String(e); window.__done = true; });
</script></body></html>`;

const pages = new Map();
const types = { mjs: 'text/javascript', js: 'text/javascript', woff2: 'font/woff2', html: 'text/html' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (pages.has(url)) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(pages.get(url)); }
  const [, root, ...rest] = url.split('/');
  const file = roots[root] && normalize(join(roots[root], ...rest));
  if (!file || !file.startsWith(roots[root]) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[file.split('.').pop()] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const tab = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
for (const d of diagrams) {
  const source = readFileSync(join(here, `${d.file}.mmd`), 'utf8');
  pages.set(`/${d.file}.html`, page(d, source));
  await tab.goto(`${base}/${d.file}.html`);
  await tab.waitForFunction(() => window.__done === true);
  await tab.screenshot({ path: join(here, `${d.file}.png`), fullPage: true });
  console.log(`rendered ${d.file}.png`);
}
await browser.close();
server.close();
