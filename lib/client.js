// One client, one native conversation. The strip never owns either sidebar.
window.__ModuleLoader__.load({
  id: 'dsh-session-tabs',
  factory: (require) => {
    var React = require('react');
    var KEY = 'dsh-session-tabs.v1', PREFS_KEY = 'dsh-session-tabs.prefs.v1', GLOBAL = '__dshSessionTabs', SOURCE = 'dsh-session-tabs';
    // One page load collapses the left column at most once. The marker lives on `window`, not in
    // module scope: a live patch reload re-evaluates this whole bundle (so module state resets)
    // but keeps the page, and re-collapsing then would close a column the reader had opened by
    // hand. It is deliberately NOT removed on dispose for the same reason — the point is that
    // this page load already acted on the preference.
    var BOOT_MARK = '__dshSessionTabsBootCollapsed';
    function bootDone(win){return win?.[BOOT_MARK]===true;}
    function markBootDone(win){try{win[BOOT_MARK]=true;}catch(_){}}
    var WORDS = {
      zh: {tabs:'会话标签',new:'新会话',close:'关闭标签',closed:'恢复刚关闭的标签',native:'原生视图',enable:'显示会话标签',openRight:'打开右侧边栏',running:'运行中',pending:'等待确认',done:'已完成 · 未读',idle:'空闲',loading:'正在连接',archived:'已归档，请先在左栏恢复',unavailable:'会话暂不可用',failed:'无法打开会话',collapseOnStart:'启动时收起左侧栏',hint:'拖动调整顺序；Alt + Shift + 方向键移动标签；标签栏内 ⌘/Ctrl + Shift + T 恢复关闭的标签'},
      en: {tabs:'Session tabs',new:'New session',close:'Close tab',closed:'Reopen closed tab',native:'Native view',enable:'Show session tabs',openRight:'Open right sidebar',running:'Running',pending:'Needs attention',done:'Completed · unread',idle:'Idle',loading:'Connecting',archived:'Archived: restore it in the sidebar first',unavailable:'Session unavailable',failed:'Could not open session',collapseOnStart:'Open with the left sidebar collapsed',hint:'Drag to reorder; Alt + Shift + arrows move a tab; Cmd/Ctrl + Shift + T reopens a tab while this strip has focus'}
    };
    var CSS = `
[data-dsh-session-tabs-column]{min-height:0}
[data-dsh-session-tabs-main]{flex:1 1 0!important;min-height:0!important;height:auto!important}
.dsst-host{--dsst-page:var(--dsw-alias-bg-base);--dsst-line:var(--dsw-alias-border-l3);--dsst-hover:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,var(--dsst-page));--dsst-strip:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,var(--dsst-page));box-sizing:border-box;flex:0 0 auto;min-width:0;max-width:100%;color:var(--dsw-alias-label-primary);background:var(--dsst-strip);font-family:inherit;font-size:14px;line-height:20px;-webkit-app-region:no-drag;padding-inline-start:var(--dsst-leading,var(--dsh-frame-leading-clearance,0px))}
.dsst-host[hidden]{display:none!important}
.dsst-strip{box-sizing:border-box;display:flex;min-width:0;align-items:stretch;height:47px;padding:7px 8px 0 12px;border-bottom:1px solid var(--dsst-line);position:relative}
html[data-platform=darwin] .dsst-strip{height:48px}
.dsst-list{display:flex;flex:0 1 auto;min-width:0;gap:2px;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none}
.dsst-list::-webkit-scrollbar{display:none}
.dsst-spacer{flex:1;min-width:4px}
.dsst-panels{display:flex;align-items:center;align-self:flex-start;flex:0 0 auto;gap:4px;height:28px;margin-top:3px;margin-inline-end:-2px;padding:0 0 0 2px}
.dsst-panel-button{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:28px;height:28px;padding:0;color:var(--dsw-alias-label-secondary)!important}
.dsst-panel-button[data-dsst-action=bottom]{border-radius:50%}
/* Direct-child only: the bottom glyph arrives inside a rotated wrapper span that already
   declares its own size, and an inner svg rule would inflate it past that box. */
.dsst-panel-button[data-dsst-action=bottom]>svg{width:16px;height:16px}
.dsst-panel-button[data-dsst-action=right] svg{width:15px;height:15px}
.dsst-panel-button[hidden]{display:none!important}
.dsst-panel-button:disabled{opacity:.4;cursor:default}
.dsst-right-slot{display:flex;flex:0 0 28px;width:28px;height:28px}
.dsst-panel-button[aria-pressed=true]{background:var(--dsst-hover)}
[data-dsh-session-tabs-native-hidden]{display:none!important}
/* The right-sidebar opener plays a second role outside this plugin: dsh-better-sidebar's
   blank-session dock measures its rect to place its own fallback button (dock-fallback.tsx
   anchors on [data-sidebar-right-expand]). A display:none element measures 0x0, so that
   fallback escaped to the traffic-light corner (top 4, left 88 on darwin). Keep the opener a
   *ghost*: painted away and click-transparent, but still laid out, so its rect survives. */
[data-dsh-session-tabs-native-ghost]{visibility:hidden!important;pointer-events:none!important}
/* The frame's chrome seat belongs to the host, but its glyph sits in a 28px flex button with no
   size rule of its own: a theme that forces svg height to auto (or a larger inherited font size)
   turns it into a portrait rectangle whose top edge climbs into the active tab's corner arc,
   which reads as two icons overlapping. Pin the box instead of trusting the intrinsic
   attributes. Scoped with :has() to the case where this plugin owns the row — the column marker
   is written exactly while the strip is on screen — so native mode keeps the host's own metrics
   and no other plugin's icon in the same seat is resized. */
html:has([data-dsh-session-tabs-column]) [data-shell-leading] button>svg{width:16px;height:16px!important;flex:0 0 auto}
.dsst-tab{box-sizing:border-box;display:flex;flex:0 0 auto;align-items:center;position:relative;min-width:78px;max-width:210px;padding:0 5px 0 10px;color:var(--dsw-alias-label-secondary);border:1px solid transparent;border-radius:16px 16px 0 0;z-index:0}
.dsst-tab[data-active=true]{background:var(--dsst-page);color:var(--dsw-alias-label-primary);border-color:var(--dsst-line);border-bottom-color:var(--dsst-page);box-shadow:0 -2px 5px color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);z-index:1}
.dsst-host[data-dsst-drag=on] .dsst-list{overflow:visible}
/* A dragged tab shows no highlight at all: the movement is the feedback. Suppressing the hover
   fill matters because the pointer stays over the tab for the whole gesture, so the hover rule
   below would otherwise keep it lit up from press to release. */
.dsst-tab[data-dragging=true]{z-index:3;cursor:grabbing;transition:none;will-change:transform;box-shadow:none}
.dsst-tab[data-dragging=true]::before{display:none!important;background:none!important}
.dsst-tab[data-active=false]:is(:hover,:focus-within)::before{content:"";position:absolute;inset:3px 3px 4px;border-radius:12px;background:var(--dsst-hover);pointer-events:none}
.dsst-tab>button{position:relative;z-index:1}
.dsst-host button,.dsst-mode-button{font:inherit;color:inherit;border:0;background:transparent;border-radius:6px;cursor:pointer;-webkit-app-region:no-drag}
.dsst-host button:hover:not(.dsst-select):not(.dsst-close){background:var(--dsst-hover)}
.dsst-mode-button:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsst-host button.dsst-select:is(:hover,:active,:focus){background:transparent}
.dsst-tab[data-active=false] .dsst-close:hover{background:transparent}
.dsst-tab[data-active=true] .dsst-close:hover{background:var(--dsst-hover);border-radius:50%}
.dsst-host button:focus-visible,.dsst-mode-button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.dsst-select{display:flex;gap:7px;align-items:center;flex:1;min-width:0;height:100%;padding:0 12px 0 0}
.dsst-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}
.dsst-dot{width:14px;text-align:center;flex:0 0 auto;color:var(--dsw-alias-label-tertiary)}
.dsst-dot[data-status=idle]{display:none}
.dsst-dot[data-status=running]{color:var(--dsw-alias-state-business-primary)}
.dsst-dot[data-status=pending]{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-state-business-primary))}
.dsst-dot[data-status=done]{color:var(--dsw-alias-state-success-primary,var(--dsw-alias-state-business-primary))}
.dsst-close{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:25px;height:25px;padding:0;color:var(--dsw-alias-label-secondary)!important}
.dsst-close svg{width:14px;height:14px}
.dsst-tab[data-active=false] .dsst-close{opacity:.65}
.dsst-tab:is(:hover,:focus-within) .dsst-close{opacity:1}
.dsst-tools{display:flex;align-items:center;flex:0 0 auto;padding:0 4px}
.dsst-tools>button{display:flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;color:var(--dsw-alias-label-secondary)}
.dsst-tools svg{width:18px;height:18px}
.dsst-join{position:absolute;bottom:-1px;height:12px;pointer-events:none;z-index:3}
.dsst-join[hidden],.dsst-tail[hidden]{display:none!important}
.dsst-join-base{position:absolute;inset:auto 0 0;height:2px;background:var(--dsst-page)}
.dsst-tail{position:absolute;bottom:0;width:13px;height:13px}
.dsst-tail-left{left:-12px;background:radial-gradient(circle at left top,transparent calc(12px - .8px),var(--dsst-line) 12px,var(--dsst-page) calc(12px + .8px))}
.dsst-tail-right{right:-12px;background:radial-gradient(circle at right top,transparent calc(12px - .8px),var(--dsst-line) 12px,var(--dsst-page) calc(12px + .8px))}
.dsst-notice{padding:5px 10px;font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dsst-notice[hidden]{display:none!important}
.dsst-mode-button{display:flex;align-items:center;justify-content:center;padding:4px;width:32px;height:32px;flex:0 0 auto}
.dsst-mode-button svg{display:block;width:18px;height:18px}
`;
    function validId(id) {return typeof id==='string'&&id.length>0&&id.length<=512&&!/[\u0000-\u001f]/.test(id);}
    function parse(raw) {
      var value;try{value=typeof raw==='string'?JSON.parse(raw):raw;}catch(_){value=null;}
      if(!value||value.version!==1)return {version:1,enabled:true,ids:[],active:null};
      var ids=[...new Set((Array.isArray(value.ids)?value.ids:[]).filter(validId))].slice(0,200);
      return {version:1,enabled:value.enabled!==false,ids:ids,active:ids.includes(value.active)?value.active:null};
    }
    function serial(s){return JSON.stringify({version:1,enabled:s.enabled,ids:s.ids,active:s.active});}
    function current(list){return Object.keys(list.byId||{}).find(id=>(list.byId[id].retainedBy?.mainView||0)>0)||null;}
    // Start-up preferences live in their own key, not in the tab list's: they describe how the
    // window opens, not which sessions are remembered, so a corrupted tab list must never take
    // them down (and vice versa). Every read is defensive — an unusable storage object (private
    // mode, quota, a throwing getter) degrades to the documented default rather than blocking
    // the boot.
    function parsePrefs(raw){
      var value;try{value=typeof raw==='string'?JSON.parse(raw):raw;}catch(_){value=null;}
      // Default is the host's own behaviour: the left column opens expanded.
      if(!value||typeof value!=='object'||value.version!==1)return {version:1,collapseSidebar:false};
      return {version:1,collapseSidebar:value.collapseSidebar===true};
    }
    function serialPrefs(p){return JSON.stringify({version:1,collapseSidebar:p.collapseSidebar===true});}
    function readPrefs(ls){try{return parsePrefs(ls?.getItem(PREFS_KEY));}catch(_){return parsePrefs(null);}}
    function writePrefs(ls,p){try{ls?.setItem(PREFS_KEY,serialPrefs(p));}catch(_){}}
    function createController(ctx,options){
      options=options||{};var ls=options.storage,state;
      try{state=parse(ls?.getItem(KEY));}catch(_){state=parse(null);}
      var savedActive=options.restoreActive===false?null:state.active;
      var refs=new Map(),observers=new Set(),disposers=[],closed=[],saveTimer=null;
      var list=ctx.sessions.list.getSnapshot(),suppressed=null,syncing=false,again=false,alive=true,notice='',lastMain=null,restored=false,pendingNew=false;
      var changed=options.changed||function(){},getLang=options.lang||function(){return 'en';};
      function words(){return WORDS[getLang()]||WORDS.en;}
      function saveNow(){try{ls?.setItem(KEY,serial(state));}catch(_){}}
      function persist(){if(!ls||saveTimer!==null)return;saveTimer=setTimeout(()=>{saveTimer=null;saveNow();},50);}
      function emit(){observers.forEach(fn=>{try{fn();}catch(_){}});changed();}
      function status(id){
        var live=ctx.uiSession.sessionStatus.getSnapshot().get(id);
        if(live?.pendingInteraction)return 'pending';
        if(live?.running||list.byId[id]?.running)return 'running';
        if(live?.completionUnread)return 'done';
        return list.byId[id]?'idle':'loading';
      }
      function archived(id){return (ctx.workspaces.list.getSnapshot().archivedSessionIds||[]).includes(id);}
      // A blank 新会话 is a tab only while it is the session on screen: `+` must visibly do
      // something, but an empty session that was never used must not keep a slot after the
      // reader moves on. So a blank is shown exactly when it is the main view (or already has
      // work), and switching away retires it — that is the half of "earned" that matters,
      // without also swallowing the explicit `+` intent.
      function shown(id){
        var row=list.byId[id];if(!row)return false;
        if(!row.blank)return true;
        if(id===lastMain)return true;
        var live=status(id);return live==='running'||live==='pending';
      }
      function release(id){var ref=refs.get(id);refs.delete(id);if(ref)try{ref.release();}catch(_){}}
      // Ask the host for a fresh blank session. `startSession` publishes a new session list
      // synchronously, which re-enters `sync`; `pendingNew` makes the second pass a no-op instead
      // of asking for another blank (and another, and another).
      function startBlank(){
        pendingNew=true;
        try{ctx.uiWorkspace.startSession();}
        catch(_){notice=words().failed;emit();}
        finally{pendingNew=false;}
      }
      function retain(id){
        if(refs.has(id)||!list.byId[id])return;
        refs.set(id,null); // retain publishes counts synchronously
        try{var ref=ctx.sessions.retain(id,{source:SOURCE});refs.set(id,ref);ref.ready.catch(()=>{if(alive){notice=words().unavailable;emit();}});}
        catch(_){refs.delete(id);notice=words().unavailable;}
      }
      function navigate(id){
        if(!validId(id)||!list.byId[id]){notice=words().unavailable;emit();return false;}
        if(archived(id)){notice=words().archived;emit();return false;}
        // No retain here: the opened session immediately becomes the main view, and the synchronous
        // retainedBy publish would re-render the whole sidebar on the click path. sync() adds the
        // background-keepalive ref once the native navigation has settled.
        try{ctx.uiWorkspace.openSession(id);return true;}catch(_){notice=words().failed;emit();return false;}
      }
      function sync(){
        if(!alive)return;if(syncing){again=true;return;}syncing=true;
        try{do{
          again=false;list=ctx.sessions.list.getSnapshot();var id=current(list);
          if(suppressed&&id!==suppressed)suppressed=null;
          var switching=!!id&&id!==suppressed;
          // Adopt the new main view BEFORE pruning, because `shown` decides a blank's fate from
          // "is this the session on screen". Judging against the session it replaced would retire
          // the fresh `+` tab in the same pass that created it.
          if(switching)lastMain=id;
          if(list.phase==='ready'){var filtered=state.ids.filter(s=>!!list.byId[s]&&!archived(s)&&shown(s));if(filtered.length!==state.ids.length){state.ids=filtered;persist();}}
          if(switching){
            // A blank becomes the main view and earns its tab on the spot; it keeps it only until
            // the reader moves to another session (see `shown`).
            if(state.enabled){if(shown(id)&&!state.ids.includes(id)){state.ids.push(id);persist();}retain(id);}
            if(state.active!==id){state.active=id;persist();}
          }
          // Nothing holds `mainView` any more: the reader deleted the session on screen (the host
          // answers with `clearMain`), or the host dropped it. Leaving `lastMain` on that id would
          // keep a dead session selected — the strip would show no tab for the blank page the
          // host is now rendering, and closing/arrow-key logic would keep targeting the ghost.
          //
          // The host leaves an empty 新会话 page behind, and that page is not a session, so no tab
          // can point at it. Start a real blank instead, so the row and the page agree: the strip
          // selects it and the host renders the same draft. Guarded to the case where the page is
          // genuinely sessionless (`!id`) — an ordinary switch never reaches here.
          if(!id&&lastMain&&!list.byId[lastMain]){lastMain=null;if(state.enabled&&!pendingNew){startBlank();}}
          if(!restored&&list.phase==='ready'){restored=true;if(savedActive&&state.enabled&&state.ids.includes(savedActive)&&id!==savedActive)navigate(savedActive);}
          // Keepalive refs belong to tabs, running work, and the session on screen. A blank
          // 新会话 that is off screen earns no tab, so without the last clause it would be
          // retained and released on every sync — a retain/release loop that re-published counts
          // forever.
          for(var retained of [...refs.keys()]){var busy=status(retained)==='running'||status(retained)==='pending';if(!list.byId[retained]||(retained!==lastMain&&!state.ids.includes(retained)&&!busy))release(retained);}
        }while(again);}finally{syncing=false;}emit();
      }
      disposers.push(ctx.sessions.list.subscribe(sync),ctx.uiSession.sessionStatus.subscribe(sync),ctx.workspaces.list.subscribe(sync),ctx.layout.panelInfo.subscribe(emit));
      var api={
        words:words,status:status,
        snapshot:()=>({enabled:state.enabled,ids:state.ids.slice(),active:lastMain,notice:notice,panel:ctx.layout.panelInfo.getSnapshot().activePanelId,rows:state.ids.map(id=>({id,title:list.byId[id]?.blank?words().new:list.byId[id]?.displayTitle||list.byId[id]?.title||id,status:status(id)})),retained:refs.size}),
        subscribe:fn=>{observers.add(fn);return()=>observers.delete(fn);},
        open:id=>{notice='';if(!state.ids.includes(id)&&validId(id)&&shown(id)){state.ids.push(id);persist();}return navigate(id);},
        close:id=>{
          var index=state.ids.indexOf(id);if(index<0)return false;suppressed=id===lastMain?id:suppressed;
          state.ids.splice(index,1);closed=closed.filter(x=>x!==id);closed.push(id);closed=closed.slice(-20);persist();
          if(id===lastMain){var next=state.ids[Math.min(index,state.ids.length-1)];if(next)navigate(next);else if(!list.byId[id]?.blank){try{ctx.uiWorkspace.startSession();}catch(_){notice=words().failed;}}}
          sync();return true;
        },
        reopen:()=>{var id=closed.pop();return id?api.open(id):false;},
        reorder:(id,before)=>{if(id===before||!state.ids.includes(id)||!state.ids.includes(before))return false;state.ids.splice(state.ids.indexOf(id),1);state.ids.splice(state.ids.indexOf(before),0,id);persist();emit();return true;},
        // Land the tab at a slot in the current order. `index` counts the OTHER tabs, so it is
        // the tab's final position once it is lifted out; idempotent by design, because a pointer
        // drag calls this on every move and returning false for a no-op keeps the render quiet.
        place:(id,index)=>{var from=state.ids.indexOf(id);if(from<0)return false;var to=Math.max(0,Math.min(index,state.ids.length-1));if(to===from)return false;state.ids.splice(from,1);state.ids.splice(to,0,id);persist();emit();return true;},
        move:(id,offset)=>{var i=state.ids.indexOf(id),j=i+offset;if(i<0||j<0||j>=state.ids.length)return false;state.ids.splice(i,1);state.ids.splice(j,0,id);persist();emit();return true;},
        newSession:()=>{notice='';suppressed=null;try{ctx.uiWorkspace.startSession();sync();}catch(_){notice=words().failed;emit();}},
        setEnabled:value=>{state.enabled=!!value;persist();if(state.enabled)sync();emit();},
        external:raw=>{var next=parse(raw);state.ids=[...new Set([...next.ids,...state.ids])];state.enabled=next.enabled;state.active=lastMain;if(lastMain&&!state.ids.includes(lastMain))state.ids.push(lastMain);sync();},
        dismiss:()=>{notice='';emit();},sync:sync,
        dispose:()=>{if(!alive)return;alive=false;if(saveTimer!==null){clearTimeout(saveTimer);saveTimer=null;saveNow();}disposers.forEach(fn=>fn());disposers=[];for(var id of [...refs.keys()])release(id);observers.clear();}
      };
      sync();return api;
    }
    function install(ctx){
      var alive=true,observer,nativeObserver,resizeObserver,timer=null,bootTimer=null,host,center,mainBody,style,ctrl;
      var strip,list,tools,join,joinLeft,joinRight,notice,panels,scrollJoin=null,drag=null,suppressClick=false,lastSignature='',cells=new Map(),hiddenNative=new Set(),hostNewHidden=null,ghosted=null;
      var panelBindings={bottom:null,right:null},panelButtons={},panelIcons={};
      var stats={renders:0,totalMs:0,maxMs:0},lastRevealed=null;
      var panel=ctx.layout.panelInfo,local;try{local=window.localStorage;}catch(_){local=null;}
      // Start-up preference: collapse the left column on boot. Read once here so a preference
      // flip later in the session cannot retroactively close a column the reader is using; the
      // toggle below re-reads only when the reader asks it to act.
      var prefs=readPrefs(local);
      function lang(){return String(document.documentElement.lang||navigator.language||'en').startsWith('zh')?'zh':'en';}
      function now(){return window.performance?.now?.()??Date.now();}
      function attr(el,key,value){value=String(value);if(el.getAttribute(key)!==value)el.setAttribute(key,value);}
      function refresh(){if(!alive||!ctrl)return;if(timer!==null){clearTimeout(timer);timer=null;}var start=now();mount();render();collapseOnBoot();var elapsed=now()-start;stats.renders++;stats.totalMs+=elapsed;stats.maxMs=Math.max(stats.maxMs,elapsed);}
      function schedule(){if(!alive||timer!==null)return;timer=setTimeout(()=>{timer=null;refresh();},16);}
      // ── Start-up: collapse the left column ────────────────────────────────────────────────
      //
      // The host keeps the left column's width in memory only: `ui-layout`'s store `init`
      // hard-codes `sidebar: 280`, so every page load re-expands it and there is no host setting
      // to change that. The only lever it exposes is `ctx.layout.toggleSidebar()` — a blind
      // toggle with no "collapse" action and no readable state.
      //
      // That is why the decision is made from the DOM instead of from a getter: the frame
      // publishes `data-sidebar-collapsed` on its grid container whenever the column is shut
      // (narrow viewports included, where it means "rail not expanded"). Absent = expanded.
      // Collapse only when it is genuinely open, so a second apply (live patch reload, HMR) can
      // never turn an already-collapsed column back on.
      //
      // The frame is resolved as the nearest ancestor shared by the main and sidebar slots, so
      // this does not depend on how deeply either slot is nested (the host wraps the sidebar in
      // its own column div, and `mount()` climbs a different number of levels for the center).
      // An absent frame means "not committed yet", which must NOT be read as expanded — and a
      // detached one counts as absent for the same reason.
      function frameNode(){
        var main=document.querySelector('#root [data-slot="main"]'),side=document.querySelector('#root [data-slot="sidebar"]');
        if(!main||!side)return null;
        var node=main.parentElement;
        while(node){if(node.contains?.(side))return node.isConnected===false?null:node;node=node.parentElement;}
        return null;
      }
      function sidebarCollapsed(){
        var frame=frameNode();
        if(!frame)return null;
        return frame.hasAttribute('data-sidebar-collapsed');
      }
      function collapseOnBoot(){
        if(bootDone(window)||!alive||!prefs.collapseSidebar)return;
        var collapsed=sidebarCollapsed();
        if(collapsed===null)return; // frame not committed yet — retried by the boot timer
        markBootDone(window);
        if(collapsed)return; // already shut (narrow viewport, or a reader's own click beat us)
        try{ctx.layout.toggleSidebar();}catch(_){/* host service not ready; the preference just does not apply */}
        schedule();
      }
      // Retry the boot collapse while the frame is still absent, then give up: an unbounded poll
      // would keep touching the DOM in a host that never commits a frame (and on every page it
      // would race the reader's own toggle). 40 × 50 ms covers a cold boot on a loaded machine;
      // the mount observer below also re-attempts, so a late frame is still caught.
      function armBootCollapse(){
        if(bootDone(window)||!prefs.collapseSidebar)return;
        var tries=0;
        function attempt(){
          bootTimer=null;
          if(!alive||bootDone(window))return;
          collapseOnBoot();
          if(bootDone(window)||++tries>40)return;
          bootTimer=setTimeout(attempt,50);
        }
        attempt();
      }
      function stopBootCollapse(){if(bootTimer!==null){clearTimeout(bootTimer);bootTimer=null;}}
      ctrl=createController(ctx,{storage:local,lang:lang,changed:()=>{if(host&&ctrl)schedule();}});
      var global={snapshot:()=>({...ctrl.snapshot(),prefs:{...prefs}}),enable:value=>{ctrl.setEnabled(value);refresh();},metrics:()=>({...stats}),dispose:dispose,
        // Read-only view of the live gesture, so a real GUI can be inspected instead of guessed at.
        drag:()=>drag&&{id:drag.id,active:drag.active,x:drag.x,y:drag.y,pointer:drag.pointer},suppressClick:()=>suppressClick,
        // The start-up preference, readable and writable without digging into localStorage — the
        // same call the footer toggle makes, so a scripted check can drive it.
        collapseOnStart:value=>{prefs=parsePrefs({version:1,collapseSidebar:value});writePrefs(local,prefs);return prefs.collapseSidebar;}};window[GLOBAL]=global;
      function unmark(){center?.removeAttribute('data-dsh-session-tabs-column');mainBody?.removeAttribute('data-dsh-session-tabs-main');center=null;mainBody=null;}
      function button(label,text,attrs){var b=document.createElement('button');b.type='button';b.setAttribute('aria-label',label);b.title=label;b.textContent=text;Object.keys(attrs||{}).forEach(k=>b.setAttribute(k,attrs[k]));return b;}
      function glyphButton(kind,attrs){var b=button('','',attrs);b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="'+(kind==='plus'?'M12 5v14M5 12h14':'M6 6l12 12M18 6L6 18')+'"/></svg>';return b;}
      function revealActive(){if(alive&&host&&!host.hidden)cells.get(ctrl.snapshot().active)?.cell.scrollIntoView?.({block:'nearest',inline:'nearest'});}
      // Draw outside the scrolling list so its overflow cannot clip the reverse corners.
      function placeJoin(force){
        if(!alive||!join)return;
        // While the active tab is being dragged the gesture code owns the join: it re-places it
        // right after each move, from the floating box. Any other caller (a coalesced render, the
        // resize observer, the list's scroll handler) can land between "clear the transform" and
        // "re-anchor it", when the box reads as the layout slot instead of the float, and would
        // snap the join back onto the gap. Only the gesture may measure during that window.
        if(!force&&drag&&drag.active&&drag.cell===cells.get(ctrl.snapshot().active)?.cell)return;
        var active=cells.get(ctrl.snapshot().active)?.cell;
        if(host.hidden||!active?.getBoundingClientRect){join.hidden=true;return;}
        var a=active.getBoundingClientRect(),v=list.getBoundingClientRect(),bar=strip.getBoundingClientRect();
        var floating=drag&&drag.active&&drag.cell===active;
        // Normally the join is clipped to the scroll viewport, because a tab scrolled out of
        // view should not paint a stray line. While its own tab is being dragged the join must
        // follow it wherever the pointer goes, so the clip is skipped for that gesture only.
        // Bounds are derived from left+width rather than read from the rect's own right/bottom,
        // so a caller that only supplies a position still gets a correct width.
        var aLeft=a.left,aRight=a.left+a.width,vLeft=v.left,vRight=v.left+v.width;
        var left=floating?aLeft:Math.max(aLeft,vLeft),right=floating?aRight:Math.min(aRight,vRight);
        join.hidden=right<=left||a.height===0;
        if(join.hidden)return;join.style.left=(left-bar.left)+'px';join.style.width=(right-left)+'px';
        joinLeft.hidden=floating?false:aLeft<vLeft-.5;joinRight.hidden=floating?false:aRight>vRight+.5;
      }
      function chrome(){
        host=document.createElement('div');host.className='dsst-host';host.setAttribute('data-dsh-session-tabs','');bindHost();
        strip=document.createElement('div');strip.className='dsst-strip';
        list=document.createElement('div');list.className='dsst-list';list.setAttribute('role','tablist');
        // Named so add/remove match, and wrapped so the scroll event object is never mistaken
        // for placeJoin's `force` argument.
        scrollJoin=()=>placeJoin();
        list.addEventListener('scroll',scrollJoin,{passive:true});
        if(typeof ResizeObserver!=='undefined'){resizeObserver=new ResizeObserver(()=>{applyLeadingInset();revealActive();placeJoin();});resizeObserver.observe(list);resizeObserver.observe(strip);var seat=document.querySelector('[data-shell-leading]');if(seat)resizeObserver.observe(seat);}
        tools=document.createElement('div');tools.className='dsst-tools';
        tools.append(glyphButton('plus',{'data-dsst-action':'new'}));
        var spacer=document.createElement('div');spacer.className='dsst-spacer';
        panels=document.createElement('div');panels.className='dsst-panels';
        for(var kind of ['bottom','right']){var b=button('','',{'data-dsst-action':kind});b.className='dsst-panel-button';b.hidden=true;panelButtons[kind]=b;if(kind==='right'){var rightSlot=document.createElement('div');rightSlot.className='dsst-right-slot';rightSlot.setAttribute('data-dsst-right-slot','');rightSlot.append(b);panels.append(rightSlot);}else panels.append(b);}
        strip.append(list,tools,spacer,panels);host.append(strip);
        join=document.createElement('div');join.className='dsst-join';join.hidden=true;join.setAttribute('aria-hidden','true');
        joinLeft=document.createElement('span');joinLeft.className='dsst-tail dsst-tail-left';
        joinRight=document.createElement('span');joinRight.className='dsst-tail dsst-tail-right';
        var base=document.createElement('span');base.className='dsst-join-base';join.append(joinLeft,base,joinRight);strip.append(join);
        notice=document.createElement('div');notice.className='dsst-notice';notice.setAttribute('role','status');host.append(notice);
      }
      function mount(){
        var slot=document.querySelector('#root [data-slot="main"]');if(!slot||!slot.parentElement)return;
        var column=slot.parentElement;while(column.hasAttribute('data-slot')&&column.parentElement)column=column.parentElement;
        if(center!==column){unmark();center=column;}
        if(!host)chrome();if(host.parentElement!==center)center.insertBefore(host,center.firstChild);
        var visible=ctrl.snapshot().enabled&&panel.getSnapshot().activePanelId===null;if(host.hidden!==!visible)host.hidden=!visible;
        if(visible){
          center.setAttribute('data-dsh-session-tabs-column','');
          // A retained body needs no style read on every session/status notification.
          if(!mainBody||!slot.contains(mainBody)){mainBody?.removeAttribute('data-dsh-session-tabs-main');var next=slot.firstElementChild;while(next&&window.getComputedStyle(next).display==='contents')next=next.firstElementChild;mainBody=next;}
          mainBody?.setAttribute('data-dsh-session-tabs-main','');
        }else{mainBody?.removeAttribute('data-dsh-session-tabs-main');mainBody=null;center.removeAttribute('data-dsh-session-tabs-column');}
      }
      function nativeSources(){
        var root=document.querySelector('#root [data-slot="main"]'),id=ctrl.snapshot().active;
        function foreground(b){return !b.closest('[hidden]')&&!b.closest('[aria-hidden="true"]');}
        var bottom=[...(root?.querySelectorAll('[data-dsh-bottom-toggle]')||[])].find(foreground)||null;
        var right=[...(root?.querySelectorAll('[data-sidebar-right-expand]')||[])].find(foreground)||null;
        var rightOpener=right;
        var rightPanel=[...document.querySelectorAll('[data-sidebar-right-panel]')].find(p=>p.getAttribute('data-sidebar-right-session')===id&&!p.closest('[hidden]'))||null;
        // The native panel state outranks opener presence during React/animation handoffs.
        if(rightPanel?.hasAttribute('data-sidebar-right-open'))right=null;
        return {bottom:bottom,right:right,rightPanel:rightPanel,rightOpener:rightOpener};
      }
      function restoreNative(){
        hiddenNative.forEach(b=>b.removeAttribute('data-dsh-session-tabs-native-hidden'));hiddenNative.clear();
        if(hostNewHidden){hostNewHidden.removeAttribute('data-dsh-session-tabs-native-hidden');hostNewHidden=null;}
        if(ghosted){ghosted.removeAttribute('data-dsh-session-tabs-native-ghost');ghosted=null;}
      }
      // Clone the glyph's *container*, not the bare <svg>. The bottom toggle is the native
      // panel mark rotated -90°, and dsh-better-sidebar puts that rotation in an inline
      // `transform` on a wrapper span around the svg (icons.tsx: IconPanelBottomOutline16).
      // Copying only the svg drops the rotation, so the proxy showed an unrotated left-panel
      // glyph — while the right opener came out fine, because its mirroring is a `scaleX(-1)`
      // class on the svg itself and survives either way.
      function iconNode(source){
        var svg=source.querySelector('svg'),children=source.children||[];
        for(var i=0;i<children.length;i++){var child=children[i];if(child===svg||child.contains?.(svg))return child;}
        return svg;
      }
      function syncIcon(kind,source,b){
        var icon=iconNode(source),iconKey=icon?.outerHTML||icon||source;
        if(panelIcons[kind]!==iconKey){panelIcons[kind]=iconKey;b.replaceChildren();if(icon)b.append(icon.cloneNode(true));else b.textContent=kind==='right'?'▥':'▤';}
      }
      // The frame's window-chrome seat (`shell.leading`) holds the host's own sidebar-toggle and
      // New Session buttons whenever macOS has the sidebar collapsed. The strip already offers
      // New Session itself, so that row ends up with two identical `+` targets. Hide only the
      // host's New Session button: the sidebar toggle beside it is the sole way to reopen a
      // collapsed sidebar and must stay.
      //
      // Neither button carries a data attribute and both class names are build-hashed, so
      // identity comes from the glyph instead: the New Session icon is a speech bubble with a
      // plus (`M8 5V11` / `M5 8H11` inside a rounded outline), while the sidebar toggle is the
      // panel-left rectangle (`M13.5 1.5H2.5...M8 1.5V14.5`). Matching on the label is not an
      // option — it is localized and changes with the UI language.
      var NEW_CHAT_GLYPH='M8 5V11';
      function hostNewSession(){
        var seat=document.querySelector('[data-shell-leading]');
        if(!seat)return null;
        var buttons=[...(seat.querySelectorAll('button')||[])];
        return buttons.find(b=>(b.querySelector('svg')?.outerHTML||'').includes(NEW_CHAT_GLYPH))||null;
      }
      // The host reserves a fixed `--dsh-frame-leading-clearance` (160px, 84px fullscreen) for
      // that seat — it measures the seat's band including the New Session button. Once that
      // button is hidden the reservation no longer matches what is actually there, leaving a
      // visible gap. Re-derive it from the seat's live geometry: the seat is absolutely
      // positioned, so its own width only covers what it still draws.
      function leadingInset(){
        var seat=document.querySelector('[data-shell-leading]');
        if(!seat)return 0;
        var frame=seat.parentElement,box=seat.getBoundingClientRect(),frameBox=frame?.getBoundingClientRect();
        if(!frameBox||!box.width)return 0;
        var end=box.right-frameBox.left;
        return Math.max(0,Math.round(end));
      }
      function syncPanels(){
        if(!alive||!panels)return;
        var visible=!host.hidden,sources=visible?nativeSources():{bottom:null,right:null};
        var changed=sources.bottom!==panelBindings.bottom||sources.right!==panelBindings.right;
        if(changed){nativeObserver?.disconnect();for(var kind of ['bottom','right']){var source=sources[kind];if(source)nativeObserver?.observe(source,{attributes:true,attributeFilter:['aria-label','aria-pressed','disabled']});}panelBindings=sources;}
        var hiddenNow=new Set();if(sources.rightOpener)hiddenNow.add(sources.rightOpener);
        for(var kind of ['bottom','right']){
          var source=sources[kind],b=panelButtons[kind],rightPanel=sources.rightPanel;
          if(kind==='right'&&!source&&rightPanel&&!panelIcons.right){var collapse=rightPanel.querySelector('[data-sidebar-right-toggle]');if(collapse)syncIcon(kind,collapse,b);}
          var waiting=kind==='right'&&!source&&rightPanel&&!rightPanel.hasAttribute('data-sidebar-right-open')&&!!panelIcons.right;
          b.hidden=!source&&!waiting;b.disabled=!source||!!source.disabled;attr(b,'data-dsst-pending',!!waiting);
          if(!source){if(waiting){var opening=ctrl.words().openRight;attr(b,'aria-label',opening);attr(b,'aria-pressed',false);b.title=opening;}continue;}
          var label=source.getAttribute('aria-label')||source.title||'';attr(b,'aria-label',label);b.title=label;b.disabled=!!source.disabled;
          var pressed=kind==='right'?!source.hasAttribute('data-sidebar-right-expand'):source.getAttribute('aria-pressed')==='true';attr(b,'aria-pressed',pressed);
          syncIcon(kind,source,b);
          // Leave the right panel's own collapse control in its original place.
          if(kind==='bottom'||source.hasAttribute('data-sidebar-right-expand'))hiddenNow.add(source);
        }
        hiddenNative.forEach(b=>{if(!hiddenNow.has(b))b.removeAttribute('data-dsh-session-tabs-native-hidden');});
        // The right opener is only *suppressed* here (the strip draws its own proxy), but it is
        // also dsh-better-sidebar's measurement anchor: display:none zeroes its rect and that
        // plugin's blank-session dock then lands on the traffic lights. Ghost it instead —
        // invisible and unclickable, yet still measurable at its true spot. A stale opener (the
        // panel already reports open) is no anchor and the dock renders nothing then, so it
        // keeps the plain hide.
        var ghostNow=sources.rightOpener&&sources.rightOpener===sources.right?sources.rightOpener:null;
        if(ghostNow)hiddenNow.delete(ghostNow);
        hiddenNow.forEach(b=>{if(!b.hasAttribute('data-dsh-session-tabs-native-hidden'))b.setAttribute('data-dsh-session-tabs-native-hidden','');});hiddenNative=hiddenNow;
        if(ghosted&&ghosted!==ghostNow)ghosted.removeAttribute('data-dsh-session-tabs-native-ghost');
        if(ghostNow&&!ghostNow.hasAttribute('data-dsh-session-tabs-native-ghost'))ghostNow.setAttribute('data-dsh-session-tabs-native-ghost','');ghosted=ghostNow;
        // The duplicate `+` is suppressed only while the strip is actually showing; native mode
        // hands the row back to the host untouched. Tracked separately from hiddenNative because
        // this control lives in the frame's chrome seat, not in the conversation header.
        var hostNew=visible?hostNewSession():null;
        if(hostNewHidden&&hostNewHidden!==hostNew)hostNewHidden.removeAttribute('data-dsh-session-tabs-native-hidden');
        hostNewHidden=hostNew;
        if(hostNewHidden&&!hostNewHidden.hasAttribute('data-dsh-session-tabs-native-hidden'))hostNewHidden.setAttribute('data-dsh-session-tabs-native-hidden','');
        applyLeadingInset(visible);
      }
      // Reserve exactly what the seat still draws, not the host's fixed band. Measured after the
      // hide above, so the number reflects the row as it now stands.
      //
      // Only while the strip is the thing on screen: in native mode the host owns the row and its
      // own `--dsh-frame-leading-clearance` must stand untouched. Leaving an override behind would
      // silently shrink the reservation the host made for its own controls.
      function applyLeadingInset(visible){
        if(!host)return;
        var showing=visible===void 0?!(ctrl.snapshot().enabled===false||host.hidden):visible;
        var inset=showing?leadingInset():0;
        if(inset>0)host.style.setProperty('--dsst-leading',inset+'px');
        else host.style.removeProperty('--dsst-leading');
      }
      function createCell(row){
        // Not `draggable`: a native HTML5 drag would take the gesture over and stop delivering
        // pointermove, which is the whole mechanism the pointer reorder below relies on.
        var cell=document.createElement('div');cell.className='dsst-tab';cell.setAttribute('data-dsst-tab',row.id);
        var select=button('','',{'data-dsst-action':'open','data-dsst-id':row.id,role:'tab'});select.className='dsst-select';
        var dot=document.createElement('span');dot.className='dsst-dot';dot.setAttribute('aria-hidden','true');
        var label=document.createElement('span');label.className='dsst-title';select.append(dot,label);
        var close=glyphButton('close',{'data-dsst-action':'close','data-dsst-id':row.id});close.className='dsst-close';cell.append(select,close);
        return {cell,select,dot,label,close};
      }
      function render(){
        if(!host)return;var s=ctrl.snapshot(),w=ctrl.words(),signature=JSON.stringify([s.enabled,s.rows,s.active,s.notice,lang()]),changed=signature!==lastSignature;
        if(changed){
          lastSignature=signature;attr(host,'aria-label',w.tabs);attr(list,'aria-label',w.tabs);list.title=w.hint;
          var keep=new Set(s.ids),focus=document.activeElement;
          for(var [id,entry] of cells){if(!keep.has(id)){entry.cell.remove();cells.delete(id);}}
          var cursor=list.firstChild;
          s.rows.forEach(row=>{
            var e=cells.get(row.id);if(!e){e=createCell(row);cells.set(row.id,e);}
            attr(e.cell,'data-active',row.id===s.active);attr(e.select,'aria-selected',row.id===s.active);
            var label=row.title+' — '+w[row.status];attr(e.select,'aria-label',label);e.select.title=label;
            attr(e.dot,'data-status',row.status);var mark=({running:'●',pending:'!',done:'✓',loading:'…',idle:'○'})[row.status];if(e.dot.textContent!==mark)e.dot.textContent=mark;
            if(e.label.textContent!==row.title)e.label.textContent=row.title;
            var close=w.close+': '+row.title;attr(e.close,'aria-label',close);e.close.title=close;
            if(e.cell!==cursor)list.insertBefore(e.cell,cursor);cursor=e.cell.nextSibling;
          });
          var plus=tools.querySelector('[data-dsst-action="new"]');attr(plus,'aria-label',w.new);plus.title=w.new;
          notice.hidden=!s.notice;if(notice.textContent!==s.notice)notice.textContent=s.notice;
          if(focus&&host.contains(focus)&&document.activeElement!==focus)focus.focus({preventScroll:true});
        }
        syncPanels();
        if(s.active!==lastRevealed){lastRevealed=s.active;revealActive();}
        // During a drag the gesture code owns the join's position: it re-places it right after
        // each move, from the cell's live (floating) box. A render that ran in between would
        // measure the same box and agree, but a coalesced render landing after the transform
        // was cleared for a re-anchor would briefly place it at the layout slot instead.
        if(changed&&!(drag&&drag.active))placeJoin();
      }
      function bindHost(){
        host.addEventListener('click',e=>{
          // A press that travelled is a reorder, never a selection.
          if(suppressClick){suppressClick=false;e.stopPropagation?.();e.preventDefault?.();return;}
          var b=e.target.closest('[data-dsst-action]');if(!b||!host.contains(b)||b.disabled)return;var action=b.getAttribute('data-dsst-action'),id=b.getAttribute('data-dsst-id');
          if(action==='open')ctrl.open(id);else if(action==='close')ctrl.close(id);else if(action==='new')ctrl.newSession();
          else if(action==='bottom'||action==='right'){var source=nativeSources()[action];if(source&&!source.disabled)source.click();schedule();return;}
          refresh();
        });
        host.addEventListener('keydown',e=>{if(e.isComposing||e.keyCode===229)return;if((e.metaKey||e.ctrlKey)&&e.shiftKey&&String(e.key).toLowerCase()==='t'){e.preventDefault();ctrl.reopen();refresh();return;}var b=e.target.closest('[data-dsst-action="open"]');if(!b)return;var id=b.getAttribute('data-dsst-id'),ids=ctrl.snapshot().ids,i=ids.indexOf(id),delta=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(!delta)return;e.preventDefault();if(e.altKey&&e.shiftKey)ctrl.move(id,delta);else ctrl.open(ids[(i+delta+ids.length)%ids.length]);refresh();});
        // Pointer reorder: a drag is a press that travels, not an HTML5 drag session. The cells
        // move under the pointer while it moves (the browser reflow is the feedback), and only a
        // press that stayed put counts as a click. Native drag-and-drop showed a ghost image and
        // reordered on release, which is what made the strip feel unlike a browser's.
        // Belt and braces: a native drag started by anything upstream would swallow the
        // pointermove stream, so refuse it inside the strip.
        host.addEventListener('dragstart',e=>{if(e.target.closest?.('[data-dsst-tab]'))e.preventDefault();});
        host.addEventListener('pointerdown',e=>{
          if(e.button!==undefined&&e.button!==0)return;
          var cell=e.target.closest('[data-dsst-tab]');if(!cell||e.target.closest('.dsst-close'))return;
          // Where inside the tab the press landed, captured at press time: computing it when the
          // gesture activates would be wrong for a fast drag, whose first move is already far
          // from the press point.
          var rect=cell.getBoundingClientRect?.();
          // How far into the tab the press landed. The float keeps that point under the cursor.
          drag={id:cell.getAttribute('data-dsst-tab'),cell:cell,x:e.clientX,y:e.clientY,active:false,pointer:e.pointerId,grab:rect?e.clientX-rect.left:0,lastX:e.clientX,rightward:true};
        });
      }
      // Where the dragged tab would land: the first neighbour it covers by more than half.
      // Comparing the two tabs' centres is NOT the same threshold: with equal widths that
      // needs a full tab-width of travel, so the dragged tab has to sit exactly on top of its
      // neighbour before anything moves — which reads as "nothing happens until I shove it all
      // the way past". Half-covered is the threshold people actually expect, and it is the one
      // the leading edge expresses: the dragged tab's right edge passing the neighbour's
      // centre means half of the neighbour is hidden.
      function dropIndex(){
        var others=[...list.children].filter(c=>c!==drag.cell);
        var rect=drag.cell.getBoundingClientRect?.();
        if(!rect)return 0;
        var lead=drag.rightward?rect.right:rect.left,i=0;
        for(;i<others.length;i++){
          var o=others[i].getBoundingClientRect?.();
          if(!o)continue;
          // Same test in both directions: the leading edge has not yet reached this
          // neighbour's centre, so the tab still belongs in front of it. Moving left, the
          // leading edge is the left one, and reaching a neighbour's centre is the mirror of
          // the same half-covered condition.
          var mid=o.left+o.width/2;
          if(lead<mid)break;
        }
        return i;
      }
      // Put the dragged cell under the pointer: its layout slot, plus whatever translation puts
      // the grab point back under the cursor. Derived from layout every time (the transform is
      // cleared first), so it is idempotent and cannot drift over a long gesture.
      function floatCell(x){
        drag.cell.style.transform='';
        var slot=drag.cell.getBoundingClientRect?.().left;
        if(slot===undefined)return;
        // The tab's left edge should land at `x - grab`, so the translation is the distance
        // from the layout slot to that point — not the pointer's raw movement.
        drag.cell.style.transform='translateX('+(x-drag.grab-slot)+'px)';
      }
      function dragMove(e){
        if(!drag)return;
        var x=e.clientX??0;
        if(!drag.active){
          var dx=Math.abs(x-drag.x),dy=Math.abs((e.clientY??0)-drag.y);
          // A mostly-vertical press stays a press: the strip scrolls sideways, so only a
          // sideways-intent gesture takes the tab over.
          if(dx<4&&dy<4)return;if(dy>dx&&dy>12)return;
          drag.active=true;suppressClick=true;attr(drag.cell,'data-dragging','true');
          // The list scrolls horizontally, so its overflow would clip a tab floating past its
          // edge; the strip needs no scrolling mid-gesture, so let the cell escape for now.
          attr(host,'data-dsst-drag','on');
          try{drag.cell.setPointerCapture?.(drag.pointer);}catch(_){}
        }
        if(e.cancelable!==false)e.preventDefault?.();
        // Which way the tab is travelling decides which edge leads, and therefore which
        // neighbour it has half-covered. One pixel of movement is enough to keep the last
        // direction, so a wobble cannot flip the threshold under the pointer.
        if(x!==drag.lastX)drag.rightward=x>drag.lastX;drag.lastX=x;
        // Float the tab onto the pointer first, then judge the swap from where it now sits:
        // the gesture has to follow what the eye sees, and clearing the transform before
        // measuring gives the layout position the translate is relative to.
        floatCell(x);
        // Reorder the OTHER cells so they open a gap at the slot the tab has reached.
        var index=dropIndex();
        if(ctrl.place(drag.id,index)){
          var others=[...list.children].filter(c=>c!==drag.cell);
          list.insertBefore(drag.cell,others[index]||null);
          // The cell jumped to a new slot; re-derive the float from that slot. Every move is
          // computed from the layout position alone, never from the previous float, so a long
          // drag cannot accumulate drift.
          floatCell(x);
        }
        // The join is drawn from the active cell's box, so it must be re-measured after the
        // float settled. It is placed from the cell's own geometry rather than re-read, because
        // a re-read here can still see the layout slot on some layout schedules.
        placeJoin(true);
      }
      function dragEnd(){
        if(!drag)return;
        var cell=drag.cell,wasActive=drag.active;
        // Drop the gesture state first: placeJoin refuses to measure while a float is in
        // progress, so re-placing it before this would leave the join hidden.
        drag=null;
        if(!wasActive)return;
        cell.removeAttribute('data-dragging');
        host.removeAttribute('data-dsst-drag');
        // Land: drop the float so the tab settles into the gap it opened for itself.
        cell.style.transform='';
        // The join is measured from the active cell's on-screen box, which the float had
        // displaced; without this it stays drawn at the old spot until the next unrelated
        // render — the strip looks broken until something else triggers a refresh.
        placeJoin();
        // A transform clear is applied by the next layout pass, so measure once more after it.
        // rAF is absent in some test/headless harnesses, hence the guarded call.
        var raf=window.requestAnimationFrame;
        if(typeof raf==='function')raf(()=>{if(alive)placeJoin();});
        setTimeout(()=>{suppressClick=false;},0);
      }
      // Move and release ride on the document, not the strip: a fast drag leaves the cell
      // (and even the strip) before the pointer is released, and a capture that silently
      // fails must not strand the tab mid-drag.
      function onPointerMove(e){if(drag)dragMove(e);}
      function onPointerUp(){dragEnd();}
      function onPointerCancel(){dragEnd();}
      style=document.createElement('style');style.setAttribute('data-plugin','dsh-session-tabs');style.setAttribute('data-plugin-css','dsh-session-tabs/style');style.textContent=CSS;document.head.append(style);
      function hasControl(node){return ['data-dsh-bottom-toggle','data-sidebar-right-expand','data-sidebar-right-toggle','data-sidebar-right-panel'].some(key=>node.hasAttribute?.(key)||node.querySelector?.('['+key+']'));}
      observer=new MutationObserver(records=>{
        // When React swaps the conversation tree the previously marked body is detached first;
        // without its flex override the strip pushes the composer below the fold until the next
        // coalesced refresh. Re-mark synchronously to keep the switch to a single layout state.
        // A global page can unmount chat entirely. Ignore our own hidden mutations here: they
        // must not synchronously mount a detached body again and starve the renderer.
        if(mainBody&&!mainBody.isConnected&&records.some(r=>!host||!(r.target===host||host.contains(r.target)))){try{mount();}catch(_){}}
        // React can switch visibility/state without inserting a new node. Sync panel controls
        // in this microtask; the tab render can stay coalesced and streaming stays ignored.
        if(records.some(r=>{
          var node=r.target;if(host&&(node===host||host.contains(node)))return false;
          if(r.type==='attributes')return hasControl(node);
          if(['data-dsh-bottom-toggle','data-sidebar-right-expand','data-sidebar-right-toggle','data-sidebar-right-panel'].some(key=>node.hasAttribute?.(key)))return true;
          if(node.closest?.('[data-slot="conversation.session.header.corner"]')||node.closest?.('[data-slot="conversation.session.header.utilities"]'))return true;
          return [...(r.addedNodes||[]),...(r.removedNodes||[])].some(hasControl);
        }))syncPanels();
        if(records.some(r=>{
          if(host&&(r.target===host||host.contains(r.target)))return false;
          if(mainBody&&(r.target===mainBody||mainBody.contains(r.target))){
            if(r.target.closest?.('[data-slot="conversation.session.header.corner"]')||r.target.closest?.('[data-slot="conversation.session.header.utilities"]'))return true;
            return [...(r.addedNodes||[]),...(r.removedNodes||[])].some(hasControl);
          }
          return true;
        }))schedule();
      });observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-hidden','data-sidebar-right-open','data-sidebar-right-session','data-conversation-session']});observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
      nativeObserver=new MutationObserver(()=>{if(alive)syncPanels();});
      function storageEvent(e){if(e.key===KEY&&(!e.storageArea||e.storageArea===local))ctrl.external(e.newValue);}
      window.addEventListener('storage',storageEvent);
      window.addEventListener('pointermove',onPointerMove,{passive:true});
      window.addEventListener('pointerup',onPointerUp);
      window.addEventListener('pointercancel',onPointerCancel);
      refresh();
      armBootCollapse();
      function ModeGlyph(){return React.createElement('svg',{viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':'true'},React.createElement('rect',{x:3,y:3,width:18,height:18,rx:2}),React.createElement('path',{d:'M3 9h18M9 9v12'}));}
      // The start-up preference is a checkbox in the sidebar footer, beside the native/tabs
      // switch: the host exposes no setting for it, so without a control here the preference
      // would be a localStorage key only a developer could change.
      var slotDispose=ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({name:'sidebar.footer.action',id:'dsh-session-tabs:mode',order:80},function ModeToggle(){
        var pair=React.useState(0);React.useEffect(()=>ctrl.subscribe(()=>pair[1](n=>n+1)),[]);
        var w=ctrl.words(),enabled=ctrl.snapshot().enabled,label=enabled?w.native:w.enable;
        return React.createElement('button',{type:'button',className:'dsst-mode-button','data-dsst-mode':'','aria-label':label,'aria-pressed':enabled,title:label,onClick:()=>ctrl.setEnabled(!ctrl.snapshot().enabled)},React.createElement(ModeGlyph));
      }));
      var bootSlotDispose=ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({name:'sidebar.footer.action',id:'dsh-session-tabs:boot',order:81},function BootCollapseToggle(){
        var pair=React.useState(prefs.collapseSidebar);var w=ctrl.words();
        var label=w.collapseOnStart;
        return React.createElement('button',{type:'button',className:'dsst-mode-button','data-dsst-boot-collapse':'','aria-label':label,'aria-pressed':pair[0],title:label,onClick:()=>{
          var next=!prefs.collapseSidebar;
          prefs=parsePrefs({version:1,collapseSidebar:next});writePrefs(local,prefs);
          // Acting on the toggle applies the preference now as well: turning it on collapses the
          // column (that is what "open collapsed" means to the reader asking for it), turning it
          // off only forgets the intent and leaves the column as it stands.
          if(next&&!sidebarCollapsed()){try{ctx.layout.toggleSidebar();}catch(_){}schedule();}
          pair[1](next);
        }},React.createElement(CollapseGlyph));}));
      function CollapseGlyph(){return React.createElement('svg',{viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':'true'},React.createElement('rect',{x:3,y:3,width:18,height:18,rx:2}),React.createElement('path',{d:'M9 3v18'}),React.createElement('path',{d:'M14 12h4'}));}
      function dispose(){if(!alive)return;alive=false;stopBootCollapse();if(timer!==null)clearTimeout(timer);observer?.disconnect();nativeObserver?.disconnect();resizeObserver?.disconnect();if(scrollJoin)list?.removeEventListener('scroll',scrollJoin);restoreNative();slotDispose?.();bootSlotDispose?.();ctrl.dispose();host?.remove();style?.remove();unmark();cells.clear();window.removeEventListener('storage',storageEvent);window.removeEventListener('pointermove',onPointerMove,{passive:true});window.removeEventListener('pointerup',onPointerUp);window.removeEventListener('pointercancel',onPointerCancel);if(window[GLOBAL]===global)delete window[GLOBAL];}
      return dispose;
    }

    function apply(ctx){if(window[GLOBAL])return;try{ctx.effect(()=>install(ctx),'dsh-session-tabs: native center strip');}catch(error){window[GLOBAL]?.dispose();ctx.logger?.warn('Session tabs could not attach; native UI remains available: '+String(error));}}
    return {apply:apply,inject:['slots','sessions','uiWorkspace','uiSession','layout','workspaces'],createController:createController,parse:parse,serialize:serial,parsePrefs:parsePrefs,serialPrefs:serialPrefs,current:current,CSS:CSS,storageKey:KEY};
  }
});
