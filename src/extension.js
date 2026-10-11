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
      <header><span class="mark">◎</span><div><strong>ZenOrbit</strong><small>Navigation Studio · v0.2</small></div><span class="status">LIVE</span></header>
      <section class="preview"><div id="stage"><button id="core">ZO</button><div id="orbit"></div></div></section>
      <section class="fields">
        <div class="sectionTitle">Art direction <span>Choose a starting point</span></div>
        <div class="presets"><button data-preset="editorial">Editorial</button><button data-preset="minimal">Minimal</button><button data-preset="signal">Signal</button></div>
        <div class="two"><label>Mark<input id="label" maxlength="3"></label><label>Accent<input id="color" type="color"></label></div>
        <label>Surface<input id="background" type="color"></label>
        <div class="two"><label>Position<select id="position"><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option><option value="top-right">Top right</option><option value="top-left">Top left</option></select></label><label>Export<select id="format"><option value="html">HTML + CSS</option><option value="react">React + CSS</option><option value="tailwind">React + Tailwind</option></select></label></div>
        <label>Radius <output id="radiusOut"></output><input id="radius" type="range" min="80" max="220" step="1"></label>
        <label>Button size <output id="sizeOut"></output><input id="size" type="range" min="40" max="112" step="4"></label>
        <div class="menuHead"><div><b>Menu items</b><small>Labels, destinations and accessibility</small></div><button id="addItem" class="iconButton" title="Add menu item">+</button></div>
        <div id="items" class="itemList"></div>
      </section>
      <div class="actions"><button class="secondary" id="load">Load project config</button><button class="export" id="export">Export to workspace</button></div><p class="hint" id="hint"></p>
      <script>
        const vscode=acquireVsCodeApi(), $=id=>document.getElementById(id); let config=${safeJson(this.config)};
        const fields=['label','color','background','radius','size','position','format'];
        const presets={editorial:{color:'#D4AE7E',background:'#171717',radius:132},minimal:{color:'#FAFAFA',background:'#151515',radius:112},signal:{color:'#B7FF3C',background:'#0C1413',radius:156}};
        function escape(value){return String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
        function fill(c){config={...config,...c}; fields.forEach(k=>$(k).value=config[k]); renderItems(); render();}
        function renderItems(){const list=$('items'); list.innerHTML=config.items.map((item,index)=>'<article class="itemCard"><div class="itemNo">'+String(index+1).padStart(2,'0')+'</div><div class="itemFields"><input data-index="'+index+'" data-key="label" value="'+escape(item.label)+'" placeholder="Label"><input data-index="'+index+'" data-key="href" value="'+escape(item.href)+'" placeholder="/route"><input data-index="'+index+'" data-key="ariaLabel" value="'+escape(item.ariaLabel)+'" placeholder="Accessible label"></div><button class="remove" data-remove="'+index+'" title="Remove '+escape(item.label)+'">×</button></article>').join('');}
        function render(){fields.forEach(k=>{if(k==='label')config[k]=$('label').value||'ZO'; else if(['radius','size'].includes(k))config[k]=+$(''+k).value; else config[k]=$(''+k).value;}); $('radiusOut').value=config.radius+' px'; $('sizeOut').value=config.size+' px'; $('hint').textContent='Exports '+({html:'HTML, CSS and JSON',react:'React component, CSS and JSON',tailwind:'React Tailwind component and JSON'})[config.format]+'.'; $('core').textContent=config.label; $('core').style.cssText='background:'+config.color+';width:'+config.size+'px;height:'+config.size+'px'; const preview=$('stage').parentElement,maxOrbit=config.radius+27,available=Math.min(preview.clientWidth,preview.clientHeight)-26,scale=Math.min(1,available/(maxOrbit*2)); $('stage').style.transform='scale('+scale+')'; $('stage').style.transformOrigin='center'; $('stage').parentElement.style.background='radial-gradient(circle,'+config.background+',#0e0e0e)'; $('orbit').innerHTML=''; config.items.forEach((item,i)=>{const a=(-90+i*360/config.items.length)*Math.PI/180,b=document.createElement('span');b.textContent=item.label;b.title=item.href;b.style.transform='translate('+Math.cos(a)*config.radius+'px,'+Math.sin(a)*config.radius+'px)';b.style.borderColor=config.color;$('orbit').append(b)}); vscode.postMessage({type:'update',config});}
        fields.forEach(id=>$(id).addEventListener('input',render)); $('items').addEventListener('input',event=>{const i=+event.target.dataset.index,key=event.target.dataset.key;if(key){config.items[i][key]=event.target.value;render();}}); $('items').addEventListener('click',event=>{const i=event.target.dataset.remove;if(i!==undefined){config.items.splice(+i,1);renderItems();render();}}); $('addItem').onclick=()=>{config.items.push({label:'New item',href:'/new',ariaLabel:'New item'});renderItems();render();}; document.querySelectorAll('[data-preset]').forEach(button=>button.onclick=()=>fill({...config,...presets[button.dataset.preset]})); $('export').onclick=()=>vscode.postMessage({type:'export'}); $('load').onclick=()=>vscode.postMessage({type:'load'}); window.addEventListener('message',event=>{if(event.data.type==='setConfig')fill(event.data.config)}); fill(config);
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
function panelCss() { return `:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;padding:18px;font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e9e5dd;background:#181818}header{display:flex;gap:9px;align-items:center;margin-bottom:15px}.mark{display:grid;place-items:center;width:30px;height:30px;border:1px solid #d4ae7e;border-radius:50%;font-size:21px;color:#d4ae7e}.status{margin-left:auto;border:1px solid #526247;border-radius:999px;padding:3px 7px;color:#b7ff72;font-size:9px;font-weight:800;letter-spacing:.08em}strong,small{display:block}small,.hint{color:#9c9c9c;margin-top:4px;line-height:1.45}.preview{height:230px;border:1px solid #3d3d3d;border-radius:12px;background:radial-gradient(circle,#292824,#161616);display:grid;place-items:center;overflow:hidden;box-shadow:inset 0 1px #ffffff0b}#stage{position:relative;width:1px;height:1px}#core,#orbit span{position:absolute;inset:0;display:grid;place-items:center;border-radius:50%;white-space:nowrap}#core{z-index:2;transform:translate(-50%,-50%);border:0;font-weight:800;color:#171717;box-shadow:0 8px 30px #0006}#orbit span{transform-origin:center;width:54px;height:54px;margin:-27px;border:1px solid #d4ae7e;background:#171717;font-size:10px;box-shadow:0 5px 16px #0005}.fields{margin-top:18px;display:grid;gap:13px}.sectionTitle{display:flex;justify-content:space-between;align-items:baseline;font-weight:700}.sectionTitle span{font-size:11px;color:#8f8f8f;font-weight:400}.presets{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.presets button{border:1px solid #454545;border-radius:7px;padding:8px 5px;background:#242424;color:#d8d3cb;font-size:11px;cursor:pointer}.presets button:hover{border-color:#d4ae7e;color:#fff}.two{display:grid;grid-template-columns:1fr 1fr;gap:9px}label{display:grid;gap:5px;color:#cfc8bf}input,textarea,select{width:100%;border:1px solid #444;border-radius:7px;padding:8px;background:#222;color:#fff}input:focus,select:focus{outline:2px solid #d4ae7e99;border-color:#d4ae7e}input[type=color]{height:37px;padding:3px}input[type=range]{padding:0;accent-color:#d4ae7e}output{float:right;color:#d4ae7e}.menuHead{display:flex;justify-content:space-between;align-items:center;margin-top:2px}.menuHead b{display:block}.iconButton,.remove{border:0;cursor:pointer}.iconButton{width:28px;height:28px;border-radius:50%;background:#d4ae7e;color:#1d1812;font-size:19px;line-height:1}.itemList{display:grid;gap:8px}.itemCard{display:grid;grid-template-columns:28px minmax(0,1fr) 25px;gap:8px;align-items:center;padding:8px;border:1px solid #393939;border-radius:9px;background:#202020}.itemNo{font-size:10px;color:#d4ae7e;font-weight:800}.itemFields{display:grid;grid-template-columns:1fr 1fr;gap:6px}.itemFields input{padding:6px;font-size:11px}.itemFields input:last-child{grid-column:1/-1}.remove{width:24px;height:24px;border-radius:5px;background:transparent;color:#aaa;font-size:19px}.remove:hover{background:#4a2828;color:#ff9d9d}.actions{display:grid;grid-template-columns:1fr 1.35fr;gap:8px;margin-top:18px}.actions button{padding:10px;border:0;border-radius:7px;font-weight:700;cursor:pointer}.export{background:#d4ae7e;color:#201b15}.export:hover{filter:brightness(1.08)}.secondary{background:#303030;color:#eee}.secondary:hover{background:#3a3a3a}code{color:#d4ae7e}@media(max-width:380px){.two,.itemFields{grid-template-columns:1fr}.itemFields input:last-child{grid-column:auto}.sectionTitle{display:block}.sectionTitle span{margin-top:3px}}`; }
function deactivate() {}
module.exports = { activate, deactivate };
