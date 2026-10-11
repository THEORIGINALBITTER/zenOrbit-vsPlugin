const vscode = require('vscode');

const DEFAULT_CONFIG = {
  label: 'ZO', size: 64, radius: 132, color: '#D4AE7E', background: '#171717',
  position: 'bottom-right', format: 'html',
  items: [
    { label: 'Home', href: '/', ariaLabel: 'Go to home' },
    { label: 'Work', href: '/work', ariaLabel: 'See our work' },
    { label: 'About', href: '/about', ariaLabel: 'About us' },
    { label: 'Contact', href: '/contact', ariaLabel: 'Contact us' }
  ]
};

function activate(context) {
  const provider = new ZenOrbitViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('zenorbit.studio', provider),
    vscode.commands.registerCommand('zenorbit.openStudio', () => vscode.commands.executeCommand('zenorbit.studio.focus')),
    vscode.commands.registerCommand('zenorbit.createFiles', () => provider.exportFiles(provider.config))
  );
}

class ZenOrbitViewProvider {
  constructor(context) {
    this.context = context;
    this.config = normalizeConfig(context.workspaceState.get('config'));
  }

  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html();
    view.webview.onDidReceiveMessage(async ({ type, config }) => {
      if (type === 'update') {
        this.config = normalizeConfig(config);
        await this.context.workspaceState.update('config', this.config);
      }
      if (type === 'export') await this.exportFiles(this.config);
      if (type === 'load') await this.loadProjectConfig();
    });
  }

  async loadProjectConfig() {
    const files = await vscode.workspace.findFiles('**/zenorbit.json', '**/{node_modules,.git}/**');
    if (!files.length) return vscode.window.showInformationMessage('No zenorbit.json was found in this workspace.');
    const selected = files.length === 1 ? files[0] : await vscode.window.showQuickPick(
      files.map(uri => ({ label: vscode.workspace.asRelativePath(uri), uri })),
      { title: 'Load a ZenOrbit configuration' }
    );
    const uri = selected?.uri || selected;
    if (!uri) return;
    try {
      this.config = normalizeConfig(JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8')));
      await this.context.workspaceState.update('config', this.config);
      this.view?.webview.postMessage({ type: 'setConfig', config: this.config });
      vscode.window.showInformationMessage(`Loaded ${vscode.workspace.asRelativePath(uri)}.`);
    } catch (error) {
      vscode.window.showErrorMessage(`Could not read ZenOrbit configuration: ${error.message}`);
    }
  }

  async exportFiles(config) {
    const root = vscode.workspace.workspaceFolders?.[0];
    if (!root) return vscode.window.showErrorMessage('Open a workspace folder before exporting ZenOrbit.');
    const directory = vscode.workspace.getConfiguration('zenorbit').get('exportDirectory', 'zenorbit');
    const target = vscode.Uri.joinPath(root.uri, directory);
    const files = exportFilesFor(config);
    await vscode.workspace.fs.createDirectory(target);
    await Promise.all([
      ...Object.entries(files).map(([name, contents]) => vscode.workspace.fs.writeFile(vscode.Uri.joinPath(target, name), Buffer.from(contents))),
      vscode.workspace.fs.writeFile(vscode.Uri.joinPath(target, 'zenorbit.json'), Buffer.from(JSON.stringify(config, null, 2)))
    ]);
    vscode.window.showInformationMessage(`ZenOrbit ${formatName(config.format)} export created in ${directory}/`);
    const mainFile = config.format === 'html' ? 'orbit.html' : 'ZenOrbitMenu.jsx';
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.joinPath(target, mainFile)));
  }

  html() {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${panelCss()}</style></head><body>
      <header><span class="mark">◎</span><div><strong>ZenOrbit</strong><small>Navigation Studio</small></div></header>
      <section class="preview"><div id="stage"><button id="core">ZO</button><div id="orbit"></div></div></section>
      <section class="fields">
        <div class="two"><label>Mark<input id="label" maxlength="3"></label><label>Accent<input id="color" type="color"></label></div>
        <div class="two"><label>Position<select id="position"><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option><option value="top-right">Top right</option><option value="top-left">Top left</option></select></label><label>Export<select id="format"><option value="html">HTML + CSS</option><option value="react">React + CSS</option><option value="tailwind">React + Tailwind</option></select></label></div>
        <label>Radius <output id="radiusOut"></output><input id="radius" type="range" min="80" max="220" step="1"></label>
        <label>Button size <output id="sizeOut"></output><input id="size" type="range" min="40" max="112" step="4"></label>
        <label>Menu items <textarea id="items" rows="6" placeholder="Label | /route | Accessible label"></textarea><small>One per line: <code>Label | URL or route | accessible label</code></small></label>
      </section>
      <div class="actions"><button class="secondary" id="load">Load project config</button><button class="export" id="export">Export to workspace</button></div><p class="hint" id="hint"></p>
      <script>
        const vscode=acquireVsCodeApi(), $=id=>document.getElementById(id); let config=${safeJson(this.config)};
        const fields=['label','color','radius','size','position','format','items'];
        const normalizeItems=value=>value.split('\\n').map(line=>line.split('|').map(part=>part.trim())).filter(parts=>parts[0]).map(([label,href,ariaLabel])=>({label,href:href||'#'+label.toLowerCase().replace(/[^a-z0-9]+/g,'-'),ariaLabel:ariaLabel||label}));
        function fill(c){config={...config,...c}; ['label','color','radius','size','position','format'].forEach(k=>$(k).value=config[k]); $('items').value=config.items.map(item=>[item.label,item.href,item.ariaLabel].join(' | ')).join('\\n'); render();}
        function render(){const c={...config,label:$('label').value||'ZO',color:$('color').value,radius:+$('radius').value,size:+$('size').value,position:$('position').value,format:$('format').value,items:normalizeItems($('items').value)}; config=c; $('radiusOut').value=c.radius+' px'; $('sizeOut').value=c.size+' px'; $('hint').textContent='Exports '+({html:'HTML, CSS and JSON',react:'React component, CSS and JSON',tailwind:'React Tailwind component and JSON'})[c.format]+'.'; $('core').textContent=c.label; $('core').style.cssText='background:'+c.color+';width:'+c.size+'px;height:'+c.size+'px'; $('orbit').innerHTML=''; c.items.forEach((item,i)=>{const a=(-90+i*360/c.items.length)*Math.PI/180,b=document.createElement('span');b.textContent=item.label;b.title=item.href;b.style.transform='translate('+Math.cos(a)*c.radius+'px,'+Math.sin(a)*c.radius+'px)';b.style.borderColor=c.color;$('orbit').append(b)}); vscode.postMessage({type:'update',config:c});}
        fields.forEach(id=>$(id).addEventListener('input',render)); $('export').onclick=()=>vscode.postMessage({type:'export'}); $('load').onclick=()=>vscode.postMessage({type:'load'}); window.addEventListener('message',event=>{if(event.data.type==='setConfig')fill(event.data.config)}); fill(config);
      </script></body></html>`;
  }
}

function normalizeConfig(config = {}) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  merged.items = (config.items || DEFAULT_CONFIG.items).map(item => typeof item === 'string'
    ? { label: item, href: `#${slug(item)}`, ariaLabel: item }
    : { label: item.label || 'Menu item', href: item.href || `#${slug(item.label || 'item')}`, ariaLabel: item.ariaLabel || item.label || 'Menu item' });
  return merged;
}

function exportFilesFor(c) {
  if (c.format === 'react') return { 'ZenOrbitMenu.jsx': makeReact(c), 'ZenOrbitMenu.css': makeCss(c) };
  if (c.format === 'tailwind') return { 'ZenOrbitMenu.jsx': makeTailwind(c) };
  return { 'orbit.html': makeHtml(c), 'orbit.css': makeCss(c) };
}

function makeCss(c) { return `/* Generated by ZenOrbit for VS Code */\n.zo-orbit{--zo-size:${c.size}px;--zo-accent:${c.color};position:fixed;${positionCss(c.position)};width:var(--zo-size);height:var(--zo-size);z-index:1000}.zo-orbit button,.zo-orbit a{box-sizing:border-box}.zo-orbit__toggle{position:relative;z-index:2;width:100%;height:100%;border:0;border-radius:50%;background:var(--zo-accent);color:#171717;font-weight:800;cursor:pointer}.zo-orbit__item{position:absolute;inset:0;display:grid;place-items:center;border:1px solid var(--zo-accent);border-radius:50%;background:${c.background};color:#fff;text-decoration:none;opacity:0;pointer-events:none;transition:.25s}.zo-orbit.is-open .zo-orbit__item{opacity:1;pointer-events:auto}.zo-orbit__item:focus-visible,.zo-orbit__toggle:focus-visible{outline:3px solid #fff;outline-offset:3px}`; }
function makeHtml(c) { return `<!-- Generated by ZenOrbit for VS Code -->\n<link rel="stylesheet" href="orbit.css">\n${menuMarkup(c)}\n<script>document.querySelector('.zo-orbit__toggle').onclick=e=>{const n=e.currentTarget.parentElement;n.classList.toggle('is-open');e.currentTarget.setAttribute('aria-expanded',n.classList.contains('is-open'))}</script>`; }
function menuMarkup(c) { return `<nav class="zo-orbit" aria-label="Main navigation">\n  <button class="zo-orbit__toggle" aria-expanded="false" aria-label="Open navigation">${escapeHtml(c.label)}</button>\n${c.items.map((item, i) => { const point = orbitPoint(c, i); return `  <a class="zo-orbit__item" href="${escapeHtml(item.href)}" aria-label="${escapeHtml(item.ariaLabel)}" style="transform:translate(${point.x}px,${point.y}px)">${escapeHtml(item.label)}</a>`; }).join('\n')}\n</nav>`; }
function makeReact(c) { return `import { useState } from 'react';\nimport './ZenOrbitMenu.css';\n\nconst items = ${JSON.stringify(c.items, null, 2)};\n\nexport default function ZenOrbitMenu() {\n  const [open, setOpen] = useState(false);\n  return (\n    <nav className={\`zo-orbit \${open ? 'is-open' : ''}\`} aria-label="Main navigation">\n      <button className="zo-orbit__toggle" aria-expanded={open} aria-label="Open navigation" onClick={() => setOpen(!open)}>${escapeJsx(c.label)}</button>\n${c.items.map((item, i) => { const point = orbitPoint(c, i); return `      <a className="zo-orbit__item" href={items[${i}].href} aria-label={items[${i}].ariaLabel} style={{ transform: 'translate(${point.x}px, ${point.y}px)' }}>${escapeJsx(item.label)}</a>`; }).join('\n')}\n    </nav>\n  );\n}\n`; }
function makeTailwind(c) { return `import { useState } from 'react';\n\nconst items = ${JSON.stringify(c.items, null, 2)};\nconst itemStyle = (index) => { const angle = (-90 + index * 360 / items.length) * Math.PI / 180; return { transform: 'translate(' + Math.round(Math.cos(angle) * ${c.radius}) + 'px, ' + Math.round(Math.sin(angle) * ${c.radius}) + 'px)' }; };\n\nexport default function ZenOrbitMenu() {\n  const [open, setOpen] = useState(false);\n  return (\n    <nav className="fixed z-50 ${tailwindPosition(c.position)}" aria-label="Main navigation">\n      <div className="relative" style={{ width: ${c.size}, height: ${c.size} }}>\n        <button className="relative z-10 grid h-full w-full place-items-center rounded-full font-extrabold text-neutral-900" style={{ background: '${c.color}' }} aria-expanded={open} aria-label="Open navigation" onClick={() => setOpen(!open)}>${escapeJsx(c.label)}</button>\n        {items.map((item, index) => <a key={item.href} href={item.href} aria-label={item.ariaLabel} style={itemStyle(index)} className={\`absolute inset-0 grid place-items-center rounded-full border bg-neutral-900 text-sm text-white no-underline transition-all \${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}\`}><span>{item.label}</span></a>)}\n      </div>\n    </nav>\n  );\n}\n`; }
function orbitPoint(c, index) { const angle = (-90 + index * 360 / c.items.length) * Math.PI / 180; return { x: Math.round(Math.cos(angle) * c.radius), y: Math.round(Math.sin(angle) * c.radius) }; }
function positionCss(position) { return ({ 'bottom-right':'right:24px;bottom:24px', 'bottom-left':'left:24px;bottom:24px', 'top-right':'right:24px;top:24px', 'top-left':'left:24px;top:24px' })[position] || 'right:24px;bottom:24px'; }
function tailwindPosition(position) { return ({ 'bottom-right':'right-6 bottom-6', 'bottom-left':'bottom-6 left-6', 'top-right':'right-6 top-6', 'top-left':'left-6 top-6' })[position] || 'right-6 bottom-6'; }
function formatName(format) { return ({ html:'HTML', react:'React', tailwind:'Tailwind' })[format] || 'HTML'; }
function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item'; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]); }
function escapeJsx(value) { return escapeHtml(value).replace(/`/g, '\\`').replace(/\$/g, '\\$'); }
function safeJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }
function panelCss() { return `:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;padding:16px;font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e8e3dc;background:#1e1e1e}header{display:flex;gap:9px;align-items:center;margin-bottom:15px}.mark{font-size:25px;color:#d4ae7e}strong,small{display:block}small,.hint{color:#aaa;margin-top:4px;line-height:1.45}.preview{height:245px;border:1px solid #3b3b3b;border-radius:10px;background:radial-gradient(circle,#292824,#161616);display:grid;place-items:center;overflow:hidden}#stage{position:relative;width:1px;height:1px}#core,#orbit span{position:absolute;inset:0;display:grid;place-items:center;border-radius:50%;white-space:nowrap}#core{z-index:2;transform:translate(-50%,-50%);border:0;font-weight:800;color:#171717}#orbit span{transform-origin:center;width:54px;height:54px;margin:-27px;border:1px solid #d4ae7e;background:#171717;font-size:10px}.fields{margin-top:16px;display:grid;gap:12px}.two{display:grid;grid-template-columns:1fr 1fr;gap:9px}label{display:grid;gap:5px;color:#cfc8bf}input,textarea,select{width:100%;border:1px solid #4a4a4a;border-radius:5px;padding:7px;background:#252525;color:#fff}input[type=color]{height:34px;padding:3px}input[type=range]{padding:0}output{float:right;color:#d4ae7e}.actions{display:grid;grid-template-columns:1fr 1.35fr;gap:8px;margin-top:16px}.actions button{padding:9px;border:0;border-radius:5px;font-weight:700;cursor:pointer}.export{background:#d4ae7e;color:#201b15}.secondary{background:#353535;color:#eee}code{color:#d4ae7e}`; }
function deactivate() {}
module.exports = { activate, deactivate };
