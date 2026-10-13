const vscode = require('vscode');

const DEFAULT_CONFIG = {
  label: 'ZO', size: 64, radius: 132, color: '#D4AE7E', background: '#171717',
  position: 'bottom-right', format: 'html', motionDuration: 0.32, motionEase: 'cubic-bezier(.34,1.56,.64,1)', rotateCenter: true, logoMode: 'text', logoText: 'ZO',
  logoIcon: '◎', logoImage: '', logoScale: 72, previewDevice: 'desktop',
  items: [
    { icon: '⌂', label: 'Home', href: '/', ariaLabel: 'Go to home' },
    { icon: '✦', label: 'Work', href: '/work', ariaLabel: 'See our work' },
    { icon: 'i', label: 'About', href: '/about', ariaLabel: 'About us' },
    { icon: '✉', label: 'Contact', href: '/contact', ariaLabel: 'Contact us' }
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
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${panelCssResponsive()}</style></head><body>
      <header><span class="mark">◎</span><div><strong>ZenOrbit</strong><small>Navigation Studio · v0.2</small></div><span class="status">LIVE</span></header>
      <div class="previewToolbar"><span id="deviceInfo">Preview stage</span><div class="deviceSwitch"><button data-device="desktop">Desktop</button><button data-device="tablet">Tablet</button><button data-device="mobile">Mobile</button></div></div>
      <section class="preview" id="preview"><div id="deviceFrame"><div id="stage"><button id="core">ZO</button><div id="orbit"></div></div></div></section>
      <section class="controls">
      <section class="fields">
        <div class="sectionTitle">Art direction <span>Choose a starting point</span></div>
        <div class="presets"><button data-preset="editorial">Editorial</button><button data-preset="minimal">Minimal</button><button data-preset="signal">Signal</button></div>
        <div class="logoStudio"><div class="sectionTitle">Logo studio <span>Centre identity</span></div><label>Logo mode<select id="logoMode"><option value="text">Text</option><option value="icon">Icon</option><option value="image">Image</option></select></label><div id="logoFields"></div><label>Logo scale <output id="logoScaleOut"></output><input id="logoScale" type="range" min="35" max="92" step="1"></label></div>
        <div class="motionStudio"><div class="sectionTitle">Motion studio <span>Click the centre button to test</span></div><label>Open duration <output id="motionDurationOut"></output><input id="motionDuration" type="range" min="0.12" max="1.2" step="0.04"></label><div class="two"><label>Easing<select id="motionEase"><option value="cubic-bezier(.34,1.56,.64,1)">Spring</option><option value="ease-out">Ease out</option><option value="linear">Linear</option></select></label><label>Centre rotation<select id="rotateCenter"><option value="true">Rotate 180°</option><option value="false">No rotation</option></select></label></div></div>
        <div class="two"><label>Mark<input id="label" maxlength="3"></label><label>Accent<input id="color" type="color"></label></div>
        <label>Surface<input id="background" type="color"></label>
        <div class="two"><label>Position<select id="position"><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option><option value="top-right">Top right</option><option value="top-left">Top left</option></select></label><label>Export<select id="format"><option value="html">HTML + CSS</option><option value="react">React + CSS</option><option value="tailwind">React + Tailwind</option></select></label></div>
        <label>Radius <output id="radiusOut"></output><input id="radius" type="range" min="80" max="220" step="1"></label>
        <label>Button size <output id="sizeOut"></output><input id="size" type="range" min="40" max="112" step="4"></label>
        <div class="menuHead"><div><b>Menu items</b><small>Labels, destinations and accessibility</small></div><button id="addItem" class="iconButton" title="Add menu item">+</button></div>
        <div id="items" class="itemList"></div>
      </section>
      <div class="actions"><button class="secondary" id="load">Load project config</button><button class="export" id="export">Export to workspace</button></div><p class="hint" id="hint"></p>
      </section>
      <script>
        const vscode=acquireVsCodeApi(), $=id=>document.getElementById(id); let config=${safeJson(this.config)};
        const fields=['label','color','background','radius','size','position','format','logoMode','logoScale','motionDuration','motionEase','rotateCenter'];
        const presets={editorial:{color:'#D4AE7E',background:'#171717',radius:132},minimal:{color:'#FAFAFA',background:'#151515',radius:112},signal:{color:'#B7FF3C',background:'#0C1413',radius:156}},deviceProfiles={desktop:{size:64,radius:72},tablet:{size:52,radius:54},mobile:{size:36,radius:34}};
        function escape(value){return String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
        function fill(c){config={...config,...c}; fields.forEach(k=>$(k).value=config[k]); renderLogoFields(); renderItems(); render();}
        function renderLogoFields(){const node=$('logoFields'); if(config.logoMode==='image'){node.innerHTML='<label>Workspace image<input id="logoFile" type="file" accept="image/*"><small>Stored with this ZenOrbit project on export.</small></label>';}else if(config.logoMode==='icon'){node.innerHTML='<label>Icon<input id="logoIcon" maxlength="3" value="'+escape(config.logoIcon)+'" placeholder="◎"></label>';}else{node.innerHTML='<label>Logo text<input id="logoText" maxlength="5" value="'+escape(config.logoText)+'" placeholder="ZO"></label>';} const input=$('logoText')||$('logoIcon'); if(input)input.oninput=event=>{config[config.logoMode==='icon'?'logoIcon':'logoText']=event.target.value;render();}; const file=$('logoFile');if(file)file.onchange=event=>{const selected=event.target.files[0];if(!selected)return;const reader=new FileReader();reader.onload=()=>{config.logoImage=reader.result;render();};reader.readAsDataURL(selected);};}
        function renderItems(){const list=$('items'); list.innerHTML=config.items.map((item,index)=>'<article class="itemCard" draggable="true" data-drag="'+index+'" title="Drag to reorder"><div class="itemNo">⋮⋮<span>'+String(index+1).padStart(2,'0')+'</span></div><div class="itemFields"><input class="itemIcon" data-index="'+index+'" data-key="icon" value="'+escape(item.icon)+'" maxlength="3" placeholder="✦"><input data-index="'+index+'" data-key="label" value="'+escape(item.label)+'" placeholder="Label"><input data-index="'+index+'" data-key="href" value="'+escape(item.href)+'" placeholder="/route"><input data-index="'+index+'" data-key="ariaLabel" value="'+escape(item.ariaLabel)+'" placeholder="Accessible label"></div><button class="remove" data-remove="'+index+'" title="Remove '+escape(item.label)+'">×</button><div class="submenuPanel"><button class="submenuToggle" data-submenu="'+index+'">'+(item.submenu?.length?'Submenu · '+item.submenu.length+' items':'＋ Add submenu')+'</button>'+(item.submenu?.map((child,subIndex)=>'<div class="subItem"><input data-index="'+index+'" data-sub-index="'+subIndex+'" data-key="label" value="'+escape(child.label)+'" placeholder="Submenu label"><input data-index="'+index+'" data-sub-index="'+subIndex+'" data-key="href" value="'+escape(child.href)+'" placeholder="/route"></div>').join('')||'')+(item.submenu?.length?'<button class="addSubItem" data-add-sub-item="'+index+'">+ Add submenu item</button>':'')+'</div></article>').join('');}
        let previewOpen=true,activeSubmenu=null; function render(){fields.forEach(k=>{if(k==='label')config[k]=$('label').value||'ZO'; else if(['radius','size','logoScale','motionDuration'].includes(k))config[k]=+$(''+k).value; else if(k==='rotateCenter')config[k]=$(''+k).value==='true'; else config[k]=$(''+k).value;}); document.querySelectorAll('[data-device]').forEach(button=>button.classList.toggle('active',button.dataset.device===config.previewDevice)); const frame=$('deviceFrame');frame.className='device-'+config.previewDevice; $('deviceInfo').textContent=config.previewDevice[0].toUpperCase()+config.previewDevice.slice(1)+' · '+config.size+' px button · '+config.radius+' px radius'; $('radiusOut').value=config.radius+' px'; $('sizeOut').value=config.size+' px'; $('logoScaleOut').value=config.logoScale+' %'; $('motionDurationOut').value=config.motionDuration.toFixed(2)+' s'; $('hint').textContent='Exports '+({html:'HTML, CSS and JSON',react:'React component, CSS and JSON',tailwind:'React Tailwind component and JSON'})[config.format]+'.'; const core=$('core');core.innerHTML='';const logo=activeSubmenu!==null?Object.assign(document.createElement('span'),{textContent:'←',className:'logoText'}):config.logoMode==='image'&&config.logoImage?Object.assign(document.createElement('img'),{src:config.logoImage,alt:'',className:'logoImage'}):Object.assign(document.createElement('span'),{textContent:config.logoMode==='icon'?config.logoIcon:config.logoText||config.label,className:'logoText'});logo.style.maxWidth=config.logoScale+'%';logo.style.maxHeight=config.logoScale+'%';core.append(logo); core.style.cssText='background:'+config.color+';width:'+config.size+'px;height:'+config.size+'px;transition:transform '+config.motionDuration+'s '+config.motionEase+';transform:translate(-50%,-50%) rotate('+(previewOpen&&config.rotateCenter?180:0)+'deg)'; const itemSize=Math.max(24,Math.round(config.size*.72)); $('stage').style.transform='scale(1)'; frame.style.background='radial-gradient(circle,'+config.background+',#0e0e0e)'; $('orbit').innerHTML=''; const visibleItems=activeSubmenu===null?config.items:config.items[activeSubmenu].submenu; visibleItems.forEach((item,i)=>{const a=(-90+i*360/visibleItems.length)*Math.PI/180,b=document.createElement('button');b.textContent=(item.icon ? item.icon+' ' : '')+item.label;b.title=item.href;b.style.width=itemSize+'px';b.style.height=itemSize+'px';b.style.margin=(-itemSize/2)+'px';b.style.fontSize=Math.max(7,Math.round(itemSize*.18))+'px';b.style.transition='transform '+config.motionDuration+'s '+config.motionEase+',opacity '+config.motionDuration+'s ease';b.style.opacity=previewOpen?'1':'0';b.style.transform=previewOpen?'translate('+Math.cos(a)*config.radius+'px,'+Math.sin(a)*config.radius+'px)':'translate(0,0) scale(.3)';b.style.borderColor=config.color;if(activeSubmenu===null&&item.submenu?.length)b.onclick=()=>{activeSubmenu=i;previewOpen=true;render();};$('orbit').append(b)}); vscode.postMessage({type:'update',config});}
        let draggingIndex=null; fields.forEach(id=>$(id).addEventListener('input',event=>{if(id==='logoMode')renderLogoFields();render();})); document.querySelectorAll('[data-device]').forEach(button=>button.onclick=()=>{const device=button.dataset.device;Object.assign(config,{previewDevice:device,...deviceProfiles[device]});$('size').value=config.size;$('radius').value=config.radius;render();}); $('core').onclick=()=>{if(activeSubmenu!==null){activeSubmenu=null;previewOpen=true;}else previewOpen=!previewOpen;render();}; $('items').addEventListener('input',event=>{const i=+event.target.dataset.index,subIndex=event.target.dataset.subIndex,key=event.target.dataset.key;if(key){const target=subIndex===undefined?config.items[i]:config.items[i].submenu[+subIndex];target[key]=event.target.value;render();}}); $('items').addEventListener('click',event=>{const i=event.target.dataset.remove;if(i!==undefined){config.items.splice(+i,1);renderItems();render();return;}const parent=event.target.dataset.submenu;if(parent!==undefined&&!config.items[+parent].submenu?.length){config.items[+parent].submenu=[{icon:'•',label:'Sub item 1',href:'/sub-1',ariaLabel:'Sub item 1'},{icon:'•',label:'Sub item 2',href:'/sub-2',ariaLabel:'Sub item 2'}];renderItems();render();}const add=event.target.dataset.addSubItem;if(add!==undefined){config.items[+add].submenu.push({icon:'•',label:'New sub item',href:'/new',ariaLabel:'New sub item'});renderItems();render();}}); $('items').addEventListener('dragstart',event=>{draggingIndex=+event.target.closest('.itemCard').dataset.drag;event.target.closest('.itemCard').classList.add('dragging')}); $('items').addEventListener('dragend',event=>event.target.closest('.itemCard')?.classList.remove('dragging')); $('items').addEventListener('dragover',event=>event.preventDefault()); $('items').addEventListener('drop',event=>{event.preventDefault();const card=event.target.closest('.itemCard'),dropIndex=card ? +card.dataset.drag : config.items.length;if(draggingIndex===null||draggingIndex===dropIndex)return;const [item]=config.items.splice(draggingIndex,1);config.items.splice(dropIndex,0,item);draggingIndex=null;renderItems();render();}); $('addItem').onclick=()=>{config.items.push({icon:'✦',label:'New item',href:'/new',ariaLabel:'New item',submenu:[]});renderItems();render();}; document.querySelectorAll('[data-preset]').forEach(button=>button.onclick=()=>fill({...config,...presets[button.dataset.preset]})); $('export').onclick=()=>vscode.postMessage({type:'export'}); $('load').onclick=()=>vscode.postMessage({type:'load'}); window.addEventListener('message',event=>{if(event.data.type==='setConfig')fill(event.data.config)}); fill(config);
      </script></body></html>`;
  }
}

function normalizeMenuItem(item) {
  if (typeof item === 'string') return { icon: '', label: item, href: `#${slug(item)}`, ariaLabel: item, submenu: [] };
  return {
    icon: item.icon || '',
    label: item.label || 'Menu item',
    href: item.href || `#${slug(item.label || 'item')}`,
    ariaLabel: item.ariaLabel || item.label || 'Menu item',
    submenu: Array.isArray(item.submenu) ? item.submenu.map(normalizeMenuItem) : []
  };
}
function normalizeConfig(config = {}) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  merged.items = (config.items || DEFAULT_CONFIG.items).map(normalizeMenuItem);
  return merged;
}

function exportFilesFor(c) {
  if (c.format === 'react') return { 'ZenOrbitMenu.jsx': makeReact(c), 'ZenOrbitMenu.css': makeCss(c) };
  if (c.format === 'tailwind') return { 'ZenOrbitMenu.jsx': makeTailwind(c) };
  return { 'orbit.html': makeHtml(c), 'orbit.css': makeCss(c) };
}

function makeCss(c) { return `/* Generated by ZenOrbit for VS Code */\n.zo-orbit{--zo-size:${c.size}px;--zo-accent:${c.color};position:fixed;${positionCss(c.position)};width:var(--zo-size);height:var(--zo-size);z-index:1000}.zo-orbit button,.zo-orbit a{box-sizing:border-box}.zo-orbit__toggle{position:relative;z-index:2;width:100%;height:100%;border:0;border-radius:50%;background:var(--zo-accent);color:#171717;font-weight:800;cursor:pointer;overflow:hidden;transition:transform ${c.motionDuration}s ${c.motionEase}}.zo-orbit.is-open .zo-orbit__toggle{transform:rotate(${c.rotateCenter ? 180 : 0}deg)}.zo-orbit__logo{max-width:${c.logoScale}%;max-height:${c.logoScale}%;object-fit:contain}.zo-orbit__layer[hidden]{display:none}.zo-orbit__item{position:absolute;inset:0;display:grid;place-items:center;border:1px solid var(--zo-accent);border-radius:50%;background:${c.background};color:#fff;text-decoration:none;opacity:0;pointer-events:none;transform:translate(0,0) scale(.3);transition:transform ${c.motionDuration}s ${c.motionEase},opacity ${c.motionDuration}s ease}.zo-orbit.is-open .zo-orbit__item{opacity:1;pointer-events:auto}.zo-orbit__item:focus-visible,.zo-orbit__toggle:focus-visible{outline:3px solid #fff;outline-offset:3px}`; }
function makeHtml(c) { return `<!-- Generated by ZenOrbit for VS Code -->\n<link rel="stylesheet" href="orbit.css">\n${menuMarkup(c)}\n<script>const nav=document.querySelector('.zo-orbit'),toggle=nav.querySelector('.zo-orbit__toggle');function layer(id){nav.querySelectorAll('.zo-orbit__layer').forEach(el=>el.hidden=el.dataset.layer!==id);nav.dataset.layer=id;toggle.setAttribute('aria-label',id==='root'?'Open navigation':'Back to main navigation')}nav.querySelectorAll('[data-submenu]').forEach(link=>link.onclick=e=>{e.preventDefault();layer('sub-'+link.dataset.submenu);nav.classList.add('is-open')});toggle.onclick=()=>{if(nav.dataset.layer!=='root'){layer('root');return}nav.classList.toggle('is-open');toggle.setAttribute('aria-expanded',nav.classList.contains('is-open'))};layer('root')</script>`; }
function menuMarkup(c) { const layer=(items,name,parentIndex=null)=>`<div class="zo-orbit__layer" data-layer="${name}"${name==='root'?'':' hidden'}>\n${items.map((item,i)=>{const point=orbitPoint({ ...c,items },i), submenu=parentIndex===null&&item.submenu?.length?` data-submenu="${i}"`:'';return `  <a class="zo-orbit__item" href="${escapeHtml(item.href)}" aria-label="${escapeHtml(item.ariaLabel)}"${submenu} style="transform:translate(${point.x}px,${point.y}px)">${escapeHtml(menuItemText(item))}</a>`;}).join('\n')}\n</div>`; return `<nav class="zo-orbit" aria-label="Main navigation">\n  <button class="zo-orbit__toggle" aria-expanded="false" aria-label="Open navigation">${logoMarkup(c)}</button>\n${layer(c.items,'root')}\n${c.items.filter(item=>item.submenu?.length).map((item,i)=>layer(item.submenu,'sub-'+c.items.indexOf(item),c.items.indexOf(item))).join('\n')}\n</nav>`; }
function makeReact(c) { return `import { useState } from 'react';\nimport './ZenOrbitMenu.css';\n\nconst items = ${JSON.stringify(c.items, null, 2)};\nconst point = (index, total) => { const angle = (-90 + index * 360 / total) * Math.PI / 180; return { transform: 'translate(' + Math.round(Math.cos(angle) * ${c.radius}) + 'px, ' + Math.round(Math.sin(angle) * ${c.radius}) + 'px)' }; };\n\nexport default function ZenOrbitMenu() {\n  const [open, setOpen] = useState(false);\n  const [submenu, setSubmenu] = useState(null);\n  const visibleItems = submenu === null ? items : items[submenu].submenu;\n  const toggle = () => submenu !== null ? setSubmenu(null) : setOpen(!open);\n  return (\n    <nav className={\`zo-orbit \${open ? 'is-open' : ''}\`} aria-label="Main navigation">\n      <button className="zo-orbit__toggle" aria-expanded={open} aria-label={submenu === null ? 'Open navigation' : 'Back to main navigation'} onClick={toggle}>{submenu === null ? '${escapeJsx(c.label)}' : '←'}</button>\n      {visibleItems.map((item, index) => <a key={item.href} className="zo-orbit__item" href={item.href} aria-label={item.ariaLabel} style={point(index, visibleItems.length)} onClick={event => { if (submenu === null && item.submenu?.length) { event.preventDefault(); setSubmenu(index); setOpen(true); } }}>{item.icon ? item.icon + ' ' : ''}{item.label}</a>)}\n    </nav>\n  );\n}\n`; }
function makeTailwind(c) { return `import { useState } from 'react';\n\nconst items = ${JSON.stringify(c.items, null, 2)};\nconst itemStyle = (index, total) => { const angle = (-90 + index * 360 / total) * Math.PI / 180; return { transform: 'translate(' + Math.round(Math.cos(angle) * ${c.radius}) + 'px, ' + Math.round(Math.sin(angle) * ${c.radius}) + 'px)' }; };\n\nexport default function ZenOrbitMenu() {\n  const [open, setOpen] = useState(false);\n  const [submenu, setSubmenu] = useState(null);\n  const visibleItems = submenu === null ? items : items[submenu].submenu;\n  return (\n    <nav className="fixed z-50 ${tailwindPosition(c.position)}" aria-label="Main navigation">\n      <div className="relative" style={{ width: ${c.size}, height: ${c.size} }}>\n        <button className="relative z-10 grid h-full w-full place-items-center rounded-full font-extrabold text-neutral-900" style={{ background: '${c.color}' }} aria-expanded={open} aria-label={submenu === null ? 'Open navigation' : 'Back to main navigation'} onClick={() => submenu !== null ? setSubmenu(null) : setOpen(!open)}>{submenu === null ? '${escapeJsx(c.label)}' : '←'}</button>\n        {visibleItems.map((item, index) => <a key={item.href} href={item.href} aria-label={item.ariaLabel} style={itemStyle(index, visibleItems.length)} onClick={event => { if (submenu === null && item.submenu?.length) { event.preventDefault(); setSubmenu(index); setOpen(true); } }} className={\`absolute inset-0 grid place-items-center rounded-full border bg-neutral-900 text-sm text-white no-underline transition-all \${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}\`}><span>{item.icon ? item.icon + ' ' : ''}{item.label}</span></a>)}\n      </div>\n    </nav>\n  );\n}\n`; }
function orbitPoint(c, index) { const angle = (-90 + index * 360 / c.items.length) * Math.PI / 180; return { x: Math.round(Math.cos(angle) * c.radius), y: Math.round(Math.sin(angle) * c.radius) }; }
function positionCss(position) { return ({ 'bottom-right':'right:24px;bottom:24px', 'bottom-left':'left:24px;bottom:24px', 'top-right':'right:24px;top:24px', 'top-left':'left:24px;top:24px' })[position] || 'right:24px;bottom:24px'; }
function tailwindPosition(position) { return ({ 'bottom-right':'right-6 bottom-6', 'bottom-left':'bottom-6 left-6', 'top-right':'right-6 top-6', 'top-left':'left-6 top-6' })[position] || 'right-6 bottom-6'; }
function formatName(format) { return ({ html:'HTML', react:'React', tailwind:'Tailwind' })[format] || 'HTML'; }
function menuItemText(item) { return item.icon ? `${item.icon} ${item.label}` : item.label; }
function logoMarkup(c) { return c.logoMode === 'image' && c.logoImage ? `<img class="zo-orbit__logo" src="${escapeHtml(c.logoImage)}" alt="">` : escapeHtml(c.logoMode === 'icon' ? c.logoIcon : (c.logoText || c.label)); }
function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item'; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]); }
function escapeJsx(value) { return escapeHtml(value).replace(/`/g, '\\`').replace(/\$/g, '\\$'); }
function safeJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }
function panelCssResponsive() { return `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; }
body { margin: 0; padding: 18px; font: 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #e9e5dd; background: #181818; display: flex; flex-direction: column; }
header { display: flex; flex: 0 0 auto; gap: 9px; align-items: center; margin-bottom: 15px; }
.mark { display: grid; place-items: center; width: 30px; height: 30px; border: 1px solid #d4ae7e; border-radius: 50%; font-size: 21px; color: #d4ae7e; }
.status { margin-left: auto; border: 1px solid #526247; border-radius: 999px; padding: 3px 7px; color: #b7ff72; font-size: 9px; font-weight: 800; letter-spacing: .08em; }
strong, small { display: block; } small, .hint { color: #9c9c9c; margin-top: 4px; line-height: 1.45; }
.previewToolbar { display: flex; align-items: center; justify-content: space-between; margin: 0 0 7px; color: #aaa; font-size: 11px; }
.deviceSwitch { display: flex; overflow: hidden; border: 1px solid #414141; border-radius: 6px; }
.deviceSwitch button { padding: 4px 6px; border: 0; border-right: 1px solid #414141; background: #252525; color: #aaa; font-size: 10px; cursor: pointer; }
.deviceSwitch button:last-child { border-right: 0; }.deviceSwitch button.active { background: #d4ae7e; color: #1d1812; font-weight: 700; }
.preview { height: 230px; flex: 0 0 230px; display: grid; place-items: center; overflow: hidden; border: 1px solid #3d3d3d; border-radius: 12px; background: radial-gradient(circle, #292824, #161616); box-shadow: inset 0 1px #ffffff0b; }
#deviceFrame { position: relative; display: grid; place-items: center; max-width: calc(100% - 18px); max-height: calc(100% - 18px); overflow: hidden; border: 1px solid #575757; border-radius: 11px; box-shadow: 0 10px 28px #0006; transition: width .2s ease, height .2s ease; }
#deviceFrame.device-desktop { width: min(320px, 100%); height: 190px; border-radius: 9px; }
#deviceFrame.device-tablet { width: 220px; height: 198px; border-radius: 13px; }
#deviceFrame.device-mobile { width: 122px; height: 198px; border-width: 3px; border-radius: 18px; }
#stage { position: relative; width: 1px; height: 1px; } #core, #orbit button { position: absolute; inset: 0; display: grid; place-items: center; border-radius: 50%; white-space: nowrap; }
#core { z-index: 2; transform: translate(-50%, -50%); border: 0; font-weight: 800; color: #171717; box-shadow: 0 8px 30px #0006; overflow: hidden; }.logoImage { object-fit: contain; }.logoText { line-height: 1; }
#orbit button { transform-origin: center; width: 54px; height: 54px; margin: -27px; border: 1px solid #d4ae7e; background: #171717; color: #fff; font-size: 10px; box-shadow: 0 5px 16px #0005; cursor: pointer; }
.controls { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 18px 2px 0; }.fields { display: grid; gap: 13px; }
.sectionTitle { display: flex; justify-content: space-between; align-items: baseline; font-weight: 700; }.sectionTitle span { color: #8f8f8f; font-size: 11px; font-weight: 400; }
.logoStudio, .motionStudio { display: grid; gap: 9px; padding: 11px; border: 1px solid #393939; border-radius: 9px; background: #1d1d1d; }
.presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }.presets button { padding: 8px 5px; border: 1px solid #454545; border-radius: 7px; background: #242424; color: #d8d3cb; font-size: 11px; cursor: pointer; }.presets button:hover { border-color: #d4ae7e; color: #fff; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; } label { display: grid; gap: 5px; color: #cfc8bf; } input, textarea, select { width: 100%; padding: 8px; border: 1px solid #444; border-radius: 7px; background: #222; color: #fff; } input:focus, select:focus { outline: 2px solid #d4ae7e99; border-color: #d4ae7e; } input[type=color] { height: 37px; padding: 3px; } input[type=range] { padding: 0; accent-color: #d4ae7e; } output { float: right; color: #d4ae7e; }
.menuHead { display: flex; justify-content: space-between; align-items: center; margin-top: 2px; }.menuHead b { display: block; }.iconButton, .remove { border: 0; cursor: pointer; }.iconButton { width: 28px; height: 28px; border-radius: 50%; background: #d4ae7e; color: #1d1812; font-size: 19px; line-height: 1; }
.itemList { display: grid; gap: 8px; }.itemCard { display: grid; grid-template-columns: 28px minmax(0, 1fr) 25px; gap: 8px; align-items: center; padding: 8px; border: 1px solid #393939; border-radius: 9px; background: #202020; cursor: grab; }.itemCard.dragging { opacity: .45; }.itemNo { display: grid; gap: 3px; justify-items: center; color: #d4ae7e; font-size: 10px; font-weight: 800; line-height: 1; }.itemNo span { font-size: 9px; }.itemFields { display: grid; grid-template-columns: 42px 1fr; gap: 6px; }.itemFields input { padding: 6px; font-size: 11px; }.itemFields input[data-key="href"], .itemFields input[data-key="ariaLabel"] { grid-column: 1 / -1; }.itemIcon { text-align: center; font-size: 15px !important; }
.submenuPanel { grid-column: 1 / -1; display: grid; gap: 6px; padding-top: 2px; }.submenuToggle, .addSubItem { padding: 6px; border: 1px solid #474747; border-radius: 6px; background: #282828; color: #d4ae7e; font-size: 11px; cursor: pointer; }.subItem { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }.subItem input { padding: 6px; font-size: 11px; }.remove { width: 24px; height: 24px; border-radius: 5px; background: transparent; color: #aaa; font-size: 19px; }.remove:hover { background: #4a2828; color: #ff9d9d; }
.actions { display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 18px; }.actions button { padding: 10px; border: 0; border-radius: 7px; font-weight: 700; cursor: pointer; }.export { background: #d4ae7e; color: #201b15; }.export:hover { filter: brightness(1.08); }.secondary { background: #303030; color: #eee; }.secondary:hover { background: #3a3a3a; } code { color: #d4ae7e; }
@media (max-width: 380px) { .preview { height: 200px; flex-basis: 200px; } #deviceFrame.device-desktop { width: 280px; height: 164px; } #deviceFrame.device-tablet { width: 190px; height: 170px; } #deviceFrame.device-mobile { width: 104px; height: 174px; } .two, .itemFields, .subItem { grid-template-columns: 1fr; }.itemFields input:last-child { grid-column: auto; }.sectionTitle { display: block; }.sectionTitle span { margin-top: 3px; } }
`; }
function deactivate() {}
module.exports = { activate, deactivate };
