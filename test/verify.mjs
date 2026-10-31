import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {domFixture,TestContext} from './dom-fixture.mjs';
const source=readFileSync(new URL('../lib/client.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
const plain=x=>JSON.parse(JSON.stringify(x));
class Observable{
  constructor(value){this.value=value;this.listeners=new Set();}
  getSnapshot(){return this.value;}
  subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  emit(){[...this.listeners].forEach(fn=>fn());}
}
function load(extra={}){
  let registration;
  const window=extra.window||{};window.__ModuleLoader__={load(r){registration=r;}};
  const sandbox={window,console,setTimeout,clearTimeout,Map,Set,Promise,...extra};sandbox.window=window;
  vm.runInNewContext(source,sandbox,{filename:'client.js'});
  return {registration,plugin:registration.factory(id=>{assert.equal(id,'react');return {createElement(){},useState(){return [0,()=>{}];},useEffect(){}};}),sandbox,window};
}
function fixture(opts={}){
  const {plugin}=load();
  const list=new Observable({phase:opts.phase||'ready',ids:['a','b','c'],byId:{a:{id:'a',displayTitle:'A',blank:false,running:false,retainedBy:{mainView:1}},b:{id:'b',displayTitle:'B',blank:false,running:false,retainedBy:{}},c:{id:'c',displayTitle:'C',blank:false,running:false,retainedBy:{}}}});
  const status=new Observable(new Map()),workspaces=new Observable({items:[],archivedSessionIds:[]}),panel=new Observable({activePanelId:null});
  const calls=[],refs=[],values=new Map();if(opts.raw)values.set(plugin.storageKey,opts.raw);
  const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>{values.set(k,v);}};
  const services={sessions:{list,retain(id,options){
    calls.push(['retain',id,options.source]);
    const r={id,released:false,ready:opts.rejectReady?Promise.reject(new Error('open failed')):Promise.resolve(),release(){if(r.released)return;r.released=true;const row=list.value.byId[id];if(row){delete row.retainedBy[options.source];list.emit();}}};refs.push(r);
    list.value.byId[id].retainedBy[options.source]=1;list.emit();return r;
  }},uiSession:{sessionStatus:status},workspaces:{list:workspaces},layout:{panelInfo:panel},uiWorkspace:{
    openSession(id){if(opts.failOpen)throw new Error('navigation failure');calls.push(['open',id]);Object.values(list.value.byId).forEach(row=>delete row.retainedBy.mainView);list.value.byId[id].retainedBy.mainView=1;list.emit();},
    startSession(){calls.push(['new']);if(opts.noCreate)return;const id='new'+calls.length;list.value.byId[id]={id,displayTitle:'new',blank:true,retainedBy:{}};services.uiWorkspace.openSession(id);}
  }};
  // The service guard rejects undeclared injection, unlike a permissive plain ctx.
  const ctx=new Proxy({}, {get(_,key){assert.ok(plugin.inject.includes(key),'undeclared service '+String(key));return services[key];}});
  const controller=plugin.createController(ctx,{storage,lang:()=>opts.lang||'en'});
  return {plugin,ctx,services,controller,list,status,workspaces,panel,calls,refs,storage,values};
}
test('published module shape, lazy import, declared services and metadata',()=>{
  const r=load();assert.equal(r.registration.id,pkg.name);assert.equal(typeof r.plugin.apply,'function');assert.equal(r.plugin.default,undefined);assert.deepEqual(Object.keys(r.window),['__ModuleLoader__']);
  for(const file of [pkg.main,pkg.icon,pkg.dsh.bundle.patch,pkg.exports['./client']])assert.ok(readFileSync(new URL('../'+file,import.meta.url)).length);
  assert.equal(pkg.dsh.client.platform,'web');
});
test('parse rejects malformed, future and unsafe data; de-duplicates and bounds IDs',()=>{
  const {plugin}=load();assert.deepEqual(plain(plugin.parse('{')), {version:1,enabled:true,ids:[],active:null});
  assert.equal(plugin.parse('{"version":2,"ids":["x"]}').ids.length,0);
  const state=plugin.parse({version:1,ids:['a','a','',3,null,'\u0000',...Array.from({length:250},(_,i)=>'s'+i)],active:'a'});
  assert.equal(state.ids.length,200);assert.equal(state.ids[0],'a');assert.equal(state.active,'a');assert.deepEqual(plain(plugin.parse(plugin.serialize(state))),plain(state));
});
test('initial active reference has its own source; inactive restored IDs do not open history',()=>{
  const f=fixture({raw:'{"version":1,"ids":["a","b","c"],"active":"a"}'});
  assert.deepEqual(f.calls,[['retain','a','dsh-session-tabs']]);assert.equal(f.controller.snapshot().retained,1);assert.equal(f.list.value.byId.a.retainedBy.mainView,1);
  f.controller.dispose();
});
test('restore once after ready, prune removed IDs, and do not steal focus later',()=>{
  const f=fixture({phase:'pending',raw:'{"version":1,"ids":["a","b","gone"],"active":"b"}'});
  assert.equal(f.calls.some(c=>c[0]==='open'),false);f.list.value.phase='ready';f.list.emit();
  assert.equal(f.controller.snapshot().active,'b');assert.deepEqual(plain(f.controller.snapshot().ids),['a','b']);
  f.controller.open('a');f.list.emit();assert.equal(f.controller.snapshot().active,'a');f.controller.dispose();
});
test('native navigation and per-session input lifecycle survive switching',()=>{
  const f=fixture();f.controller.open('b');assert.equal(f.controller.snapshot().active,'b');
  assert.equal(f.refs.filter(r=>!r.released).length,2);assert.equal(f.list.value.byId.a.retainedBy.mainView,undefined);
  assert.equal(f.list.value.byId.a.retainedBy['dsh-session-tabs'],1);f.controller.dispose();
});
test('opening a tab navigates first and takes its keepalive ref only after the switch settles',()=>{
  const f=fixture();f.controller.open('b');
  const openAt=f.calls.findIndex(c=>c[0]==='open'&&c[1]==='b');
  const retainAt=f.calls.findIndex(c=>c[0]==='retain'&&c[1]==='b');
  assert.ok(openAt>=0&&retainAt>openAt,'retain must follow navigation, not sit on the click path');
  assert.equal(f.refs.find(r=>r.id==='b').released,false);f.controller.dispose();
});
test('closing a running tab never cancels and retains it until idle',()=>{
  const f=fixture();f.controller.open('b');f.list.value.byId.a.running=true;f.status.value.set('a',{running:true});f.status.emit();
  f.controller.close('a');assert.equal(f.controller.snapshot().ids.includes('a'),false);assert.equal(f.refs.find(r=>r.id==='a').released,false);
  assert.equal(f.calls.some(c=>['cancel','delete','archive'].includes(c[0])),false);
  f.list.value.byId.a.running=false;f.status.value.set('a',{running:false});f.status.emit();assert.equal(f.refs.find(r=>r.id==='a').released,true);f.controller.dispose();
});
test('pending interaction outranks running and closing preserves its ownership',()=>{
  const f=fixture();f.controller.open('b');f.status.value.set('a',{running:true,pendingInteraction:{key:'approval-a'}});f.status.emit();assert.equal(f.controller.status('a'),'pending');
  f.controller.close('a');assert.equal(f.refs.find(r=>r.id==='a').released,false);f.controller.dispose();
});
test('close active selects a neighbour; final close creates a blank without readding the old tab',()=>{
  const f=fixture();f.controller.open('b');f.controller.close('b');assert.equal(f.controller.snapshot().active,'a');
  f.controller.close('a');assert.ok(f.controller.snapshot().active.startsWith('new'));assert.equal(f.controller.snapshot().ids.includes('a'),false);f.controller.dispose();
});
test('new command reopens a closed blank even when native startSession reuses it',()=>{
  // The reused blank becomes the main view, so it earns its tab back immediately: `+` must
  // visibly do something, not silently leave the strip unchanged.
  const f=fixture();f.list.value.byId.a.blank=true;f.controller.close('a');assert.equal(f.controller.snapshot().ids.length,0);
  f.services.uiWorkspace.startSession=()=>{};f.controller.newSession();assert.deepEqual(plain(f.controller.snapshot().ids),['a']);assert.equal(f.controller.snapshot().active,'a');f.controller.dispose();
});
test('reopen and reorder preserve identity and active selection',()=>{
  const f=fixture();f.controller.open('b');f.controller.open('c');f.controller.reorder('c','a');assert.deepEqual(plain(f.controller.snapshot().ids),['c','a','b']);
  f.controller.move('c',1);assert.deepEqual(plain(f.controller.snapshot().ids),['a','c','b']);assert.equal(f.controller.move('a',-1),false);
  f.controller.close('a');f.controller.reopen();assert.ok(f.controller.snapshot().ids.includes('a'));f.controller.dispose();
});
test('archived session is not navigated; host deletion and archive prune tabs',()=>{
  const f=fixture({raw:'{"version":1,"ids":["a","b","c"],"active":"a"}'});f.workspaces.value.archivedSessionIds=['b'];f.workspaces.emit();
  assert.equal(f.controller.open('b'),false);assert.equal(f.calls.some(c=>c[0]==='open'&&c[1]==='b'),false);
  delete f.list.value.byId.c;f.list.emit();assert.equal(f.controller.snapshot().ids.includes('c'),false);f.controller.dispose();
});
test('cross-window storage updates never change native current session',()=>{
  const f=fixture();f.controller.external('{"version":1,"enabled":true,"ids":["b","a"],"active":"b"}');
  assert.equal(f.controller.snapshot().active,'a');assert.equal(f.calls.some(c=>c[0]==='open'),false);assert.deepEqual(plain(f.controller.snapshot().ids),['b','a']);f.controller.dispose();
});
test('native view preserves draft ownership, survives private storage errors, and restores',()=>{
  const f=fixture();f.storage.setItem=()=>{throw Error('quota');};f.controller.setEnabled(false);assert.equal(f.controller.snapshot().enabled,false);assert.equal(f.refs[0].released,false);
  f.controller.setEnabled(true);assert.equal(f.controller.snapshot().enabled,true);assert.ok(f.refs.some(r=>!r.released));f.controller.dispose();
});
test('ready or navigation failure degrades to a notice without stopping native UI',async()=>{
  const f=fixture({rejectReady:true,failOpen:true});await Promise.resolve();assert.equal(f.controller.snapshot().notice,'Session unavailable');
  assert.equal(f.controller.open('b'),false);assert.equal(f.controller.snapshot().notice,'Could not open session');f.controller.dispose();
});
test('status projection includes completion and reconnect baseline without duplicate retains',()=>{
  const f=fixture();f.controller.open('b');f.status.value.set('a',{running:false,completionUnread:true});f.status.emit();assert.equal(f.controller.status('a'),'done');
  const count=f.calls.filter(c=>c[0]==='retain').length;f.list.emit();f.list.emit();assert.equal(f.calls.filter(c=>c[0]==='retain').length,count);f.controller.dispose();
});
test('dispose releases each reference once and removes every observable subscription',()=>{
  const f=fixture();f.controller.open('b');f.controller.dispose();f.controller.dispose();assert.ok(f.refs.every(r=>r.released));
  for(const observable of [f.list,f.status,f.workspaces,f.panel])assert.equal(observable.listeners.size,0);
});
test('implementation forbids client cloning, sidebar replacement, global keys and unscoped CSS',()=>{
  assert.doesNotMatch(source,/createElement\(['"]iframe|<iframe|window\.open\(|sidebarRight\.|name:\s*['"](?:rightbar|sidebar|root|main)['"]/);
  assert.doesNotMatch(source,/(?:document|window)\.addEventListener\(['"]keydown/);assert.match(source,/e\.isComposing\|\|e\.keyCode===229/);
  const {plugin}=load();assert.doesNotMatch(plugin.CSS,/[A-Za-z0-9_]{6,}_(?:root|header|frame)/);assert.match(plugin.CSS,/-webkit-app-region:no-drag/);
});
function mounted(setup,opts){const f=fixture(opts);f.controller.dispose();const dom=domFixture();
  // The strip reads window.localStorage; when a test seeds remembered tabs, back the DOM's
  // storage with the fixture's map so the plugin sees them at mount time.
  if(opts&&opts.raw)dom.extra.window.localStorage={getItem:k=>f.values.get(k)||null,setItem:(k,v)=>{f.values.set(k,v);}};
  setup?.(dom);const {plugin,window}=load(dom.extra);const ctx=new TestContext(f.services,plugin.inject);plugin.apply(ctx);dom.flush();return {...f,dom,plugin,window,ctx};}
test('actual apply mounts only the center and leaves both native sidebar nodes intact',()=>{
  const f=mounted();assert.equal(f.dom.center.firstChild.getAttribute('data-dsh-session-tabs'),'');assert.equal(f.dom.native.getAttribute('data-dsh-session-tabs-main'),'');
  assert.equal(f.dom.left.textContent,'native left');assert.equal(f.dom.right.textContent,'native right');assert.deepEqual(f.dom.left.attrs,{'data-slot':'sidebar'});assert.deepEqual(f.dom.right.attrs,{'data-slot':'rightbar'});
  assert.equal(f.ctx.registrations[0].meta.name,'sidebar.footer.action');assert.equal(f.dom.doc.querySelectorAll('[data-dsh-session-tabs]').length,1);f.ctx.dispose();
});
test('actual apply is idempotent and dispose removes DOM, styles, listeners, observers and refs',()=>{
  const f=mounted();f.plugin.apply(f.ctx);assert.equal(f.ctx.cleanups.length,1);f.ctx.dispose();f.dom.flush();
  assert.equal(f.dom.doc.querySelectorAll('[data-dsh-session-tabs]').length,0);assert.equal(f.dom.doc.querySelectorAll('[data-plugin="dsh-session-tabs"]').length,0);
  assert.equal(f.dom.center.hasAttribute('data-dsh-session-tabs-column'),false);assert.equal(f.dom.native.hasAttribute('data-dsh-session-tabs-main'),false);assert.equal(f.window.__dshSessionTabs,undefined);
  assert.equal(f.ctx.registrations.length,0);assert.ok(f.dom.observers.every(o=>o.stopped));assert.equal(f.dom.window.listeners.get('storage').size,0);assert.equal(f.dom.doc.listeners.get('pointerdown')?.size||0,0);assert.equal(f.list.listeners.size,0);
});
test('native mode and global panels restore original center sizing and hide only the strip',()=>{
  const f=mounted();f.window.__dshSessionTabs.enable(false);f.dom.flush();assert.equal(f.dom.center.firstChild.hidden,true);assert.equal(f.dom.native.hasAttribute('data-dsh-session-tabs-main'),false);
  f.window.__dshSessionTabs.enable(true);f.panel.value.activePanelId='settings';f.panel.emit();f.dom.flush();assert.equal(f.dom.center.firstChild.hidden,true);
  f.panel.value.activePanelId=null;f.panel.emit();f.dom.flush();assert.equal(f.dom.center.firstChild.hidden,false);f.ctx.dispose();
});
test('own mutations do not schedule an observer-render loop, and keyboard events are IME guarded',()=>{
  const f=mounted(),host=f.dom.center.firstChild,button=host.querySelector('[data-dsst-action="open"]');
  f.dom.observers[0].fn([{target:host}]);assert.equal(f.dom.timers.size,0);
  f.dom.observers[0].fn([{target:f.dom.native}]);assert.equal(f.dom.timers.size,0,'streaming chat mutations should not remount the strip');
  const before=f.calls.length;host.dispatch('keydown',{target:button,key:'ArrowRight',isComposing:true,preventDefault(){throw Error('IME must not be captured');}});assert.equal(f.calls.length,before);
  assert.equal(f.dom.doc.listeners.has('keydown'),false);f.ctx.dispose();
});
test('conversation remount re-marks the flex body synchronously, before the coalesced refresh',()=>{
  const f=mounted(),dom=f.dom,conv=dom.main.firstChild;
  const old=dom.native,fresh=dom.doc.createElement('div');
  conv.append(fresh);old.remove();
  dom.observers[0].fn([{type:'childList',target:conv,removedNodes:[old],addedNodes:[fresh]}]);
  assert.equal(fresh.hasAttribute('data-dsh-session-tabs-main'),true,'the new body must be marked in the same microtask');
  assert.equal(old.hasAttribute('data-dsh-session-tabs-main'),false);
  f.ctx.dispose();
});
test('replacing chat with a global panel does not create a hidden-attribute observer loop',()=>{
  const f=mounted(),dom=f.dom,host=dom.center.firstChild,old=dom.native;
  let hidden=host.hidden,writes=0;const mutations=[];
  // Like a browser, assigning HTMLElement.hidden queues an attribute mutation even if unchanged.
  Object.defineProperty(host,'hidden',{get:()=>hidden,set:value=>{hidden=!!value;writes++;mutations.push({type:'attributes',attributeName:'hidden',target:host});}});
  try{
    f.panel.value.activePanelId='plugins';f.panel.emit();
    const page=dom.doc.createElement('div');dom.main.replaceChildren(page);
    dom.observers[0].fn([{type:'childList',target:dom.main,removedNodes:[old],addedNodes:[page]}]);
    dom.flush();
    for(let round=0;round<20&&mutations.length;round++)dom.observers[0].fn(mutations.splice(0));
    assert.equal(mutations.length,0,'own hidden mutations must settle instead of starving the renderer');
    assert.ok(writes<=2,'hiding a global panel must not repeatedly mount a detached chat body');
    assert.equal(host.hidden,true);assert.equal(page.hasAttribute('data-dsh-session-tabs-main'),false);
    f.panel.value.activePanelId=null;dom.main.replaceChildren(old);f.panel.emit();dom.flush();
    assert.equal(host.hidden,false);assert.equal(old.hasAttribute('data-dsh-session-tabs-main'),true);
  }finally{f.ctx.dispose();}
});
test('partial mount failure rolls back rather than blocking native UI',()=>{
  const f=fixture();f.controller.dispose();const dom=domFixture();dom.extra.window.getComputedStyle=()=>{throw Error('bad native structure');};
  const {plugin,window}=load(dom.extra);const ctx=new TestContext(f.services,plugin.inject);assert.doesNotThrow(()=>plugin.apply(ctx));dom.flush();
  assert.equal(window.__dshSessionTabs,undefined);assert.equal(dom.doc.querySelectorAll('[data-dsh-session-tabs]').length,0);assert.equal(f.list.listeners.size,0);assert.equal(ctx.warnings.length,1);
});
test('status, title and selection updates preserve tab nodes and focused controls',()=>{
  const f=mounted(),host=f.dom.center.firstChild,a=host.querySelector('[data-dsst-id="a"]'),plus=host.querySelector('[data-dsst-action="new"]');
  a.focus();f.status.value.set('a',{running:true});f.status.emit();f.dom.flush();
  assert.equal(host.querySelector('[data-dsst-id="a"]'),a);assert.equal(f.dom.doc.activeElement,a);
  f.list.value.byId.a.displayTitle='renamed';f.list.emit();f.dom.flush();assert.equal(a.textContent.includes('renamed'),true);
  host.dispatch('click',{target:plus});assert.equal(host.querySelector('[data-dsst-id="a"]'),a);
  // `+` opens a blank session, which earns a tab of its own while it is on screen.
  assert.equal(host.querySelector('[data-dsst-action="new"]'),plus);assert.equal(host.querySelectorAll('[data-dsst-tab]').length,2);
  assert.equal(f.window.__dshSessionTabs.snapshot().active.startsWith('new'),true);
  f.ctx.dispose();
});
test('removing options keeps native fallback and strip-local reopen, with IME guarding',()=>{
  const f=mounted(),host=f.dom.center.firstChild,plus=host.querySelector('[data-dsst-action="new"]');
  assert.equal(host.querySelector('[data-dsst-action="menu"]'),null);assert.equal(f.ctx.registrations[0].meta.id,'dsh-session-tabs:mode');
  host.dispatch('click',{target:plus});const blank=f.window.__dshSessionTabs.snapshot().active;
  assert.equal(f.window.__dshSessionTabs.snapshot().ids.includes(blank),true,'`+` must earn a tab while the blank is on screen');
  // Close a real tab, then confirm the strip still owns the reopen shortcut for it.
  const real=f.window.__dshSessionTabs.snapshot().ids[0];
  host.dispatch('click',{target:host.querySelectorAll('[data-dsst-action="close"]').find(b=>b.getAttribute('data-dsst-id')===real)});
  assert.equal(f.window.__dshSessionTabs.snapshot().ids.includes(real),false);
  host.dispatch('keydown',{target:plus,key:'T',metaKey:true,shiftKey:true,isComposing:true,preventDefault(){throw Error('IME must not be captured');}});
  assert.equal(f.window.__dshSessionTabs.snapshot().ids.includes(real),false);
  host.dispatch('keydown',{target:plus,key:'T',metaKey:true,shiftKey:true,preventDefault(){}});
  assert.equal(f.window.__dshSessionTabs.snapshot().ids.includes(real),true);assert.equal(f.dom.doc.listeners.has('keydown'),false);
  const list=host.querySelector('[role="tablist"]');f.ctx.dispose();assert.equal(list.listeners.get('scroll').size,0);
});
test('the host New Session button in the chrome seat is suppressed, its sidebar toggle is kept',()=>{
  // With the macOS sidebar collapsed the frame mounts `shell.leading`, whose occupant is the
  // host's own [sidebar toggle, New Session] pair. The strip already offers New Session, so that
  // row showed two `+` targets. Only the duplicate must go: the toggle is the sole way to reopen
  // a collapsed sidebar.
  let seat,hostNew,toggle;
  const f=mounted(dom=>{
    seat=dom.doc.createElement('div');seat.setAttribute('data-shell-leading','');
    // The real glyphs: the New Session icon is a bubble with a plus, the toggle is the panel rect.
    hostNew=dom.doc.createElement('button');hostNew.setAttribute('aria-label','新建会话');
    const bubble=dom.doc.createElement('svg');bubble.append(dom.doc.createElement('path'));
    bubble.firstChild.setAttribute('d','M8 5V11');
    hostNew.append(bubble);
    toggle=dom.doc.createElement('button');toggle.setAttribute('aria-label','展开侧栏');
    const panel=dom.doc.createElement('svg');panel.append(dom.doc.createElement('path'));
    panel.firstChild.setAttribute('d','M8 1.5V14.5');
    toggle.append(panel);
    seat.append(toggle,hostNew);dom.doc.body.append(seat);
  });
  assert.equal(hostNew.hasAttribute('data-dsh-session-tabs-native-hidden'),true,'the duplicate + must be hidden');
  assert.equal(toggle.hasAttribute('data-dsh-session-tabs-native-hidden'),false,'the sidebar toggle must stay usable');
  // The strip keeps its own New Session control.
  const plus=f.dom.center.firstChild.querySelector('[data-dsst-action="new"]');assert.equal(plus.hidden,false);
  // Native mode hands the whole row back to the host.
  f.window.__dshSessionTabs.enable(false);
  assert.equal(hostNew.hasAttribute('data-dsh-session-tabs-native-hidden'),false);
  f.window.__dshSessionTabs.enable(true);
  assert.equal(hostNew.hasAttribute('data-dsh-session-tabs-native-hidden'),true);
  f.ctx.dispose();
  assert.equal(hostNew.hasAttribute('data-dsh-session-tabs-native-hidden'),false,'disposal must restore the host control');
});
test('top panel controls relay native clicks, track native state and restore originals',()=>{
  let bottom,right,other,bottomClicks=0,rightClicks=0;
  const f=mounted(dom=>{
    bottom=dom.doc.createElement('button');bottom.setAttribute('data-dsh-bottom-toggle','');bottom.setAttribute('aria-label','展开底部面板');bottom.setAttribute('aria-pressed','false');bottom.append(dom.doc.createElement('svg'));
    bottom.addEventListener('click',()=>{bottomClicks++;bottom.setAttribute('aria-pressed','true');bottom.setAttribute('aria-label','收起底部面板');});
    right=dom.doc.createElement('button');right.setAttribute('data-sidebar-right-expand','');right.setAttribute('aria-label','打开右侧边栏');right.addEventListener('click',()=>rightClicks++);
    other=dom.doc.createElement('button');other.setAttribute('aria-label','其他操作');dom.native.append(bottom,right,other);
  });
  const host=f.dom.center.firstChild,b=host.querySelector('[data-dsst-action="bottom"]'),r=host.querySelector('[data-dsst-action="right"]');
  assert.equal(bottom.parentElement,f.dom.native);assert.equal(right.parentElement,f.dom.native);assert.equal(other.hasAttribute('data-dsh-session-tabs-native-hidden'),false);
  assert.equal(bottom.hasAttribute('data-dsh-session-tabs-native-hidden'),true);assert.notEqual(b.firstChild,bottom.firstChild);
  host.dispatch('click',{target:b});f.dom.flush();assert.equal(bottomClicks,1);assert.equal(b.getAttribute('aria-pressed'),'true');assert.equal(b.getAttribute('aria-label'),'收起底部面板');
  host.dispatch('click',{target:r});assert.equal(rightClicks,1);right.disabled=true;host.dispatch('click',{target:r});assert.equal(rightClicks,1);
  f.window.__dshSessionTabs.enable(false);assert.equal(bottom.hasAttribute('data-dsh-session-tabs-native-hidden'),false);assert.equal(right.hasAttribute('data-dsh-session-tabs-native-hidden'),false);
  f.window.__dshSessionTabs.enable(true);f.ctx.dispose();assert.equal(bottom.hasAttribute('data-dsh-session-tabs-native-hidden'),false);assert.equal(right.hasAttribute('data-dsh-session-tabs-native-hidden'),false);
});
test('panel proxies copy the whole glyph container so an inline rotation survives the clone',()=>{
  // dsh-better-sidebar draws the bottom toggle as the left-panel svg wrapped in a span whose
  // inline style carries rotate(-90deg). Cloning just the svg silently drops that rotation and
  // the proxy renders a sideways glyph — the exact symptom reported against 0.1.7-fork.1.
  let bottom,right;
  const f=mounted(dom=>{
    bottom=dom.doc.createElement('button');bottom.setAttribute('data-dsh-bottom-toggle','');bottom.setAttribute('aria-label','展开底部面板');
    const wrapper=dom.doc.createElement('span');wrapper.style.transform='rotate(-90deg)';wrapper.style.display='inline-flex';
    wrapper.append(dom.doc.createElement('svg'));bottom.append(wrapper);
    right=dom.doc.createElement('button');right.setAttribute('data-sidebar-right-expand','');right.setAttribute('aria-label','打开右侧边栏');
    right.append(dom.doc.createElement('svg'));dom.native.append(bottom,right);
  });
  const host=f.dom.center.firstChild,b=host.querySelector('[data-dsst-action="bottom"]'),r=host.querySelector('[data-dsst-action="right"]');
  const glyph=b.firstChild;
  assert.equal(glyph.tagName,'SPAN','the rotated wrapper, not the bare svg, must be cloned');
  assert.equal(glyph.style.transform,'rotate(-90deg)','dropping this transform is the reported bug');
  assert.ok(glyph.querySelector('svg'),'the wrapper still carries the native panel mark');
  assert.equal(r.firstChild.tagName,'SVG','a rotation-free glyph is still cloned as the svg itself');
  assert.notEqual(r.firstChild,right.firstChild);f.ctx.dispose();
});
test('expanded right sidebar keeps only its native edge toggle and restores the opener after collapse',()=>{
  let expand,collapse,domRef;
  const f=mounted(dom=>{
    domRef=dom;expand=dom.doc.createElement('button');expand.setAttribute('data-sidebar-right-expand','');expand.setAttribute('aria-label','打开右侧边栏');
    collapse=dom.doc.createElement('button');collapse.setAttribute('data-sidebar-right-toggle','');collapse.setAttribute('aria-label','收起右侧边栏');
    expand.addEventListener('click',()=>{expand.remove();dom.right.append(collapse);});
    collapse.addEventListener('click',()=>{collapse.remove();dom.native.append(expand);});dom.native.append(expand);
  });
  const host=f.dom.center.firstChild,proxy=host.querySelector('[data-dsst-action="right"]');
  assert.equal(proxy.hidden,false);host.dispatch('click',{target:proxy});f.dom.flush();
  assert.equal(proxy.hidden,true);assert.equal(collapse.parentElement,domRef.right);assert.equal(collapse.hasAttribute('data-dsh-session-tabs-native-hidden'),false);
  collapse.click();f.dom.observers[0].fn([{target:domRef.native,addedNodes:[expand]}]);f.dom.flush();assert.equal(proxy.hidden,false);
  f.window.__dshSessionTabs.enable(false);assert.equal(expand.hasAttribute('data-dsh-session-tabs-native-hidden'),false);
  f.ctx.dispose();assert.equal(collapse.hasAttribute('data-dsh-session-tabs-native-hidden'),false);
});
test('native panel attributes win over a stale opener and update without a tab render delay',()=>{
  let expand,panel;
  const f=mounted(dom=>{
    expand=dom.doc.createElement('button');expand.setAttribute('data-sidebar-right-expand','');expand.append(dom.doc.createElement('svg'));dom.native.append(expand);
    panel=dom.doc.createElement('div');panel.setAttribute('data-sidebar-right-panel','push');panel.setAttribute('data-sidebar-right-session','a');dom.right.append(panel);
  });
  const proxy=f.dom.center.firstChild.querySelector('[data-dsst-action="right"]');assert.equal(proxy.hidden,false);
  panel.setAttribute('data-sidebar-right-open','');f.dom.observers[0].fn([{type:'attributes',target:panel,attributeName:'data-sidebar-right-open'}]);
  assert.equal(proxy.hidden,true,'attribute handoff must sync immediately, before timers');
  assert.equal(expand.hasAttribute('data-dsh-session-tabs-native-hidden'),true,'stale native opener must not flash back');f.ctx.dispose();
});
test('collapse handoff reserves the right slot and disables only its placeholder until the native opener returns',()=>{
  let expand,panel,bottomClicks=0;
  const f=mounted(dom=>{
    const bottom=dom.doc.createElement('button');bottom.setAttribute('data-dsh-bottom-toggle','');bottom.addEventListener('click',()=>bottomClicks++);dom.native.append(bottom);
    expand=dom.doc.createElement('button');expand.setAttribute('data-sidebar-right-expand','');expand.append(dom.doc.createElement('svg'));dom.native.append(expand);
    panel=dom.doc.createElement('div');panel.setAttribute('data-sidebar-right-panel','push');panel.setAttribute('data-sidebar-right-session','a');dom.right.append(panel);
  });
  const host=f.dom.center.firstChild,proxy=host.querySelector('[data-dsst-action="right"]'),slot=proxy.parentElement;
  expand.remove();panel.setAttribute('data-sidebar-right-open','');f.dom.observers[0].fn([{type:'attributes',target:panel}]);assert.equal(proxy.hidden,true);
  panel.removeAttribute('data-sidebar-right-open');f.dom.observers[0].fn([{type:'attributes',target:panel}]);
  assert.equal(proxy.parentElement,slot);assert.equal(slot.hasAttribute('data-dsst-right-slot'),true);assert.equal(proxy.hidden,false);assert.equal(proxy.disabled,true);
  host.dispatch('click',{target:proxy});assert.equal(bottomClicks,0);assert.equal(host.querySelector('[data-dsst-action="bottom"]').disabled,false);
  f.dom.native.append(expand);f.dom.observers[0].fn([{type:'childList',target:f.dom.native,addedNodes:[expand]}]);
  assert.equal(proxy.disabled,false);assert.equal(proxy.hidden,false);f.ctx.dispose();
});
test('native panel sources ignore hidden retained session headers',()=>{
  let wrong=0,right=0;
  const f=mounted(dom=>{
    const old=dom.doc.createElement('div');old.setAttribute('hidden','');dom.native.append(old);
    for(const container of [old,dom.native]){
      const b=dom.doc.createElement('button');b.setAttribute('data-sidebar-right-expand','');b.addEventListener('click',()=>{if(container===old)wrong++;else right++;});container.append(b);
    }
  });
  const host=f.dom.center.firstChild;host.dispatch('click',{target:host.querySelector('[data-dsst-action="right"]')});assert.equal(right,1);assert.equal(wrong,0);f.ctx.dispose();
});
test('`+` earns a tab at once, and an unused blank is retired on the next switch',()=>{
  const f=fixture({raw:'{"version":1,"enabled":true,"ids":["a","b"],"active":"a"}'});
  // `+` navigates to a blank session: it is on screen, so the tab appears in the same sync.
  f.services.uiWorkspace.startSession();f.controller.sync();
  const blank=f.controller.snapshot().active;assert.equal(f.controller.snapshot().ids.includes(blank),true,'`+` must produce a tab');
  assert.equal(f.list.value.byId[blank].blank,true);
  // Abandoning it (navigating elsewhere) retires the unused blank, and no later sync revives it.
  f.controller.open('b');assert.deepEqual(plain(f.controller.snapshot().ids),['a','b']);
  delete f.list.value.byId[blank];f.list.emit();
  assert.equal(f.controller.snapshot().ids.includes(blank),false);
  // A blank that produced work keeps its tab even after the reader moves away.
  f.list.value.byId.a.blank=true;f.status.value.set('a',{running:true});f.status.emit();
  assert.equal(f.controller.snapshot().ids.includes('a'),true,'work in progress must keep its tab');
  f.controller.dispose();
});
test('blank-session retain never loops: one retain per sync, none for the on-screen blank',()=>{
  const f=fixture();let retains=0;const count=id=>{retains++;return f.services.sessions.retain.bind(null)(id,{source:'dsh-session-tabs'});};
  f.services.sessions.retain=(id,options)=>{retains++;const row=f.list.value.byId[id];row.retainedBy[options.source]=1;const r={id,released:false,ready:Promise.resolve(),release(){r.released=true;delete row.retainedBy[options.source];f.list.emit();}};return r;};
  f.services.uiWorkspace.startSession();f.controller.sync();
  const blank=f.controller.snapshot().active;assert.equal(f.list.value.byId[blank].blank,true);
  // Several unrelated notifications must not churn a retain/release cycle for the blank session.
  const before=retains;for(let i=0;i<5;i++)f.list.emit();
  assert.equal(retains-before<=1,true,'a retained blank must not be re-retained on every notification');
  assert.equal(f.controller.snapshot().ids.includes(blank),true,'the on-screen blank keeps its tab');
  f.controller.dispose();
});
test('pointer drag reorders live and a travelled press never selects',()=>{
  const f=mounted(),dom=f.dom,host=dom.center.firstChild;
  f.controller.open('b');f.controller.open('c');dom.flush();
  const cells=()=>host.querySelectorAll('[data-dsst-tab]');
  // Give the three tabs a left-to-right layout: 0-100, 100-200, 200-300.
  // The fixture lays the list out as a real flex row: 78 px tabs from x=20, so midpoints land
  // at 59 / 139 / 219. No hand-written rects, so the geometry the drag reads is the real one.
  const list=host.querySelector('[role="tablist"]');list._flowX=true;list._childWidth=78;list._rowHeight=40;list._rect={left:20,top:0,width:400,height:40};
  const layout=()=>{};
  const byId=id=>host.querySelector('[data-dsst-id="'+id+'"]').parentElement;
  layout();const a=byId('a'),c=byId('c');
  host.dispatch('pointerdown',{target:a.querySelector('[data-dsst-action="open"]'),button:0,pointerId:1,clientX:50,clientY:14});
  // A small wobble stays a press.
  dom.dispatch(a,'pointermove',{pointerId:1,clientX:54,clientY:15});assert.deepEqual(plain(f.window.__dshSessionTabs.snapshot().ids),['a','b','c']);
  // Past the midpoint of the second tab: it moves while the pointer is still down.
  dom.dispatch(a,'pointermove',{pointerId:1,clientX:150,clientY:14});dom.flush();layout();
  assert.deepEqual(plain(f.window.__dshSessionTabs.snapshot().ids),['b','a','c'],'the tab must move under the pointer, not on release');
  assert.equal(a.getAttribute('data-dragging'),'true');
  dom.dispatch(a,'pointermove',{pointerId:1,clientX:280,clientY:14});dom.flush();layout();
  assert.deepEqual(plain(f.window.__dshSessionTabs.snapshot().ids),['b','c','a']);
  dom.dispatch(a,'pointerup',{pointerId:1});
  assert.equal(a.hasAttribute('data-dragging'),false);
  // The click that follows the release (same task, before any timer) must not re-open the tab.
  const before=f.calls.filter(x=>x[0]==='open').length;
  host.dispatch('click',{target:a.querySelector('[data-dsst-action="open"]')});
  assert.equal(f.calls.filter(x=>x[0]==='open').length,before,'a drag must not be read as a selection');
  dom.flush();
  // A plain press still selects.
  const b=byId('b');
  host.dispatch('pointerdown',{target:b.querySelector('[data-dsst-action="open"]'),button:0,pointerId:2,clientX:50,clientY:14});
  host.dispatch('click',{target:b.querySelector('[data-dsst-action="open"]')});dom.flush();
  assert.equal(f.window.__dshSessionTabs.snapshot().active,'b');
  f.ctx.dispose();
});
test('no native drag is armed on the tabs, and a stray one is refused',()=>{
  const f=mounted(),dom=f.dom,host=dom.center.firstChild;
  const cell=host.querySelector('[data-dsst-tab]');
  // `draggable` would hand the gesture to the browser's HTML5 drag and stop pointermove.
  assert.equal(cell.hasAttribute('draggable'),false);
  let prevented=false;const ev={target:cell,preventDefault(){prevented=true;}};
  host.dispatch('dragstart',ev);assert.equal(prevented,true,'a native drag inside the strip must be refused');
  f.ctx.dispose();
});
test('the dragged cell moves in the same task as the pointer, not on the next render',()=>{
  const f=mounted(),dom=f.dom,host=dom.center.firstChild;
  f.controller.open('b');f.controller.open('c');dom.flush();
  const cells=()=>host.querySelectorAll('[data-dsst-tab]');
  // The fixture lays the list out as a real flex row: 78 px tabs from x=20, so midpoints land
  // at 59 / 139 / 219. No hand-written rects, so the geometry the drag reads is the real one.
  const list=host.querySelector('[role="tablist"]');list._flowX=true;list._childWidth=78;list._rowHeight=40;list._rect={left:20,top:0,width:400,height:40};
  const layout=()=>{};
  const order=()=>[...cells()].map(c=>c.getAttribute('data-dsst-tab'));
  const a=host.querySelector('[data-dsst-id="a"]').parentElement;
  layout();
  host.dispatch('pointerdown',{target:a.querySelector('[data-dsst-action="open"]'),button:0,pointerId:1,clientX:50,clientY:14});
  // No flush() on purpose: the DOM must already be reordered before any timer runs.
  // a starts at 20..98 and b at 100..178, so b's centre is 139: moving the pointer 50 px puts
  // a's right edge (148) past it, which is the half-covered threshold.
  dom.dispatch(a,'pointermove',{pointerId:1,clientX:100,clientY:14});
  assert.deepEqual(order(),['b','a','c'],'the cell must move synchronously, without waiting for the render timer');
  // The dragged tab must also follow the pointer, not sit still until it crosses a midpoint.
  assert.match(a.style.transform,/^translateX\(/,'the dragged cell must float onto the pointer');
  assert.deepEqual(plain(f.window.__dshSessionTabs.snapshot().ids),['b','a','c'],'state and DOM must agree');
  dom.dispatch(a,'pointermove',{pointerId:1,clientX:280,clientY:14});
  assert.deepEqual(order(),['b','c','a']);
  dom.dispatch(a,'pointerup',{pointerId:1});
  dom.flush();
  assert.deepEqual(order(),['b','c','a'],'a completed render must not undo the drag order');
  f.ctx.dispose();
});
test('the swap fires when half the neighbour is covered, not after a full tab-width',()=>{
  const f=mounted(),dom=f.dom,host=dom.center.firstChild;
  f.controller.open('b');f.controller.open('c');dom.flush();
  const list=host.querySelector('[role="tablist"]');list._flowX=true;list._childWidth=78;list._rowHeight=40;list._rect={left:20,top:0,width:400,height:40};
  const order=()=>[...host.querySelectorAll('[data-dsst-tab]')].map(c=>c.getAttribute('data-dsst-tab'));
  const a=host.querySelector('[data-dsst-id="a"]').parentElement;
  host.dispatch('pointerdown',{target:a.querySelector('[data-dsst-action="open"]'),button:0,pointerId:1,clientX:59,clientY:14});
  // a is 20..98, b is 100..178 (centre 139); the press is at 59, so a follows the pointer 1:1.
  // +35 px puts a at 55..133 — its right edge is still short of b's centre.
  dom.dispatch(a,'pointermove',{pointerId:1,clientX:94,clientY:14});
  assert.deepEqual(order(),['a','b','c'],'a must not swap before its right edge passes b\'s centre');
  // +42 px puts a at 62..140 — the right edge is past b's centre, half of b is covered.
  dom.dispatch(a,'pointermove',{pointerId:1,clientX:101,clientY:14});
  assert.deepEqual(order(),['b','a','c'],'a must swap once half of b is covered');
  // Dragging back uses the LEFT edge as the leading one. At x=59 a sits at 20..98 again, so its
  // left edge is well left of b's centre and it belongs in front of b once more.
  dom.dispatch(a,'pointermove',{pointerId:1,clientX:59,clientY:14});
  assert.deepEqual(order(),['a','b','c'],'dragging back must restore the original order');
  dom.dispatch(a,'pointerup',{pointerId:1});dom.flush();
  f.ctx.dispose();
});
test('the active-tab join tracks its tab while it is dragged, and stays placed on release',()=>{
  // Mounted with three remembered tabs so there is a real active tab to drag.
  const f=mounted(null,{raw:'{"version":1,"enabled":true,"ids":["a","b","c"],"active":"a"}'});
  const dom=f.dom,host=dom.center.firstChild;
  const list=host.querySelector('[role="tablist"]');list._flowX=true;list._childWidth=78;list._rowHeight=40;list._rect={left:20,top:7,width:400,height:40};
  const strip=host.querySelector('.dsst-strip');strip._rect={left:0,top:0,width:400,height:47};
  const join=host.querySelector('.dsst-join');
  // Geometry is assigned after mount, so re-place the join once the strip knows its box.
  dom.flush();f.window.__dshSessionTabs.enable(false);dom.flush();f.window.__dshSessionTabs.enable(true);dom.flush();
  // The mock DOM matches one attribute at a time, so resolve the active cell by filtering.
  const a=[...host.querySelectorAll('[data-dsst-tab]')].find(cell=>cell.getAttribute('data-active')==='true');
  assert.ok(a,'an active tab must exist');
  assert.equal(join.hidden,false,'the join is drawn under the active tab at rest');
  const pressX=a.getBoundingClientRect().left+20;
  host.dispatch('pointerdown',{target:a.querySelector('[data-dsst-action="open"]'),button:0,pointerId:1,clientX:pressX,clientY:14});
  dom.dispatch(a,'pointermove',{pointerId:1,clientX:pressX+51,clientY:14});dom.flush();
  assert.equal(a.getAttribute('data-dragging'),'true','the active tab must be the one being dragged');
  // The join belongs to the active tab, so while that tab is the one being dragged it travels
  // with it instead of being hidden or left behind.
  assert.equal(join.hidden,false,'the join stays drawn while its own tab is dragged');
  const cellBox=a.getBoundingClientRect(),stripBox=strip.getBoundingClientRect();
  const left=parseFloat(join.style.left),width=parseFloat(join.style.width);
  assert.equal(Number.isNaN(left),false,'the join must have a real left offset while dragging');
  assert.ok(Math.abs(left-(cellBox.left-stripBox.left))<1,'the join must track the dragged tab: '+left+' vs '+(cellBox.left-stripBox.left));
  assert.ok(Math.abs(width-cellBox.width)<1,'the join must keep the tab width: '+width+' vs '+cellBox.width);
  dom.dispatch(a,'pointerup',{pointerId:1});dom.flush();
  assert.equal(join.hidden,false,'release must keep the join placed');
  assert.equal(a.style.transform,'','release must drop the float');
  f.ctx.dispose();
});
test('a dragged tab is not highlighted: no lift shadow and no hover fill',()=>{
  const f=mounted(),dom=f.dom,host=dom.center.firstChild;
  f.controller.open('b');f.controller.open('c');dom.flush();
  const list=host.querySelector('[role="tablist"]');list._flowX=true;list._childWidth=78;list._rowHeight=40;list._rect={left:20,top:7,width:400,height:40};
  const a=host.querySelector('[data-dsst-id="a"]').parentElement;
  host.dispatch('pointerdown',{target:a.querySelector('[data-dsst-action="open"]'),button:0,pointerId:1,clientX:59,clientY:14});
  dom.dispatch(a,'pointermove',{pointerId:1,clientX:110,clientY:14});
  assert.equal(a.getAttribute('data-dragging'),'true');
  // The CSS contract, asserted on the injected stylesheet: the hover fill is suppressed and the
  // lift shadow is gone, because the pointer stays over the tab for the whole gesture.
  const {plugin}=load();
  const dragging = plugin.CSS.split('\n').find(line => line.startsWith('.dsst-tab[data-dragging=true]{'));
  assert.ok(dragging, 'the dragged-tab rule must exist');
  assert.equal(dragging.includes('box-shadow:none'), true, 'the lift shadow must be gone');
  assert.equal(dragging.includes('box-shadow:0 3px'), false, 'no shadow may remain');
  assert.ok(plugin.CSS.includes('.dsst-tab[data-dragging=true]::before{display:none!important;background:none!important}'), 'the hover fill must be suppressed while dragging');
  dom.dispatch(a,'pointerup',{pointerId:1});dom.flush();
  f.ctx.dispose();
});
