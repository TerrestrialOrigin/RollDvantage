/* eslint-disable */
// @ts-nocheck
import { generateDungeon } from 'auto-stuff-generator';

/* ============================================================
   AUTO-DUNGEON — map renderer + editor (app/UI layer).
   ------------------------------------------------------------
   Architecture:
     1. generateDungeon(seed)  -> a self-contained DUNGEON JSON object.
                                  Procedural generation (the RPGGen engine,
                                  its data, and the dungeon layout) now lives
                                  in the `auto-stuff-generator` library; this
                                  module only renders/edits that object.
     2. renderDungeon(json)    -> draws both maps from that object.
     3. save / load            -> the JSON is the source of truth and
                                  can be downloaded or re-opened.
   A fresh dungeon is generated on every page load. Maps are drawn
   from simple primitives (rect / line / circle / triangle / square)
   keyed to a printed legend.
   ============================================================ */

export function initDungeon(): void {

  /* ============================================================
     RENDERING  ->  draws everything from a dungeon JSON object
     ============================================================ */
  var FLOOR='oklch(0.928 0.016 82)', GRID='oklch(0.74 0.03 78 / 0.40)',
      WALL='oklch(0.30 0.02 60)', INK='oklch(0.28 0.018 60)',
      GOLD='oklch(0.52 0.084 70)', GHALO='oklch(0.952 0.014 84)',
      SECRET_FILL='oklch(0.905 0.05 80)';
  var OUT = {down:'up', up:'down', right:'left', left:'right'};

  function tri(cx,cy,dir,size,fill,stroke,sw){
    var p;
    if(dir==='down')  p=[cx,cy+size, cx-size,cy-size*0.7, cx+size,cy-size*0.7];
    else if(dir==='up') p=[cx,cy-size, cx-size,cy+size*0.7, cx+size,cy+size*0.7];
    else if(dir==='right') p=[cx+size,cy, cx-size*0.7,cy-size, cx-size*0.7,cy+size];
    else p=[cx-size,cy, cx+size*0.7,cy-size, cx+size*0.7,cy+size];
    return '<polygon points="'+p.join(' ')+'" fill="'+(fill||'none')+'" stroke="'+(stroke||'none')+'" stroke-width="'+(sw||0)+'" stroke-linejoin="round"/>';
  }
  function halo(cx,cy,r){ return '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+GHALO+'" opacity="0.92"/>'; }

  function letterFor(i){ var s=''; i=i|0; do{ s=String.fromCharCode(65+(i%26))+s; i=Math.floor(i/26)-1; }while(i>=0); return s; }
  function refBadge(cx,cy,letter){
    return '<g class="refbadge"><circle cx="'+cx+'" cy="'+cy+'" r="10.5" fill="'+GHALO+'" stroke="'+GOLD+'" stroke-width="1.8"/>'+
           '<text x="'+cx+'" y="'+(cy+4.8)+'" class="ref-letter">'+letter+'</text></g>';
  }

  function symbol(m, cx, cy){
    var g='';
    switch(m.type){
      case 'entrance':
        g = tri(cx,cy,m.dir,8,GOLD); break;
      case 'exit':
        g = tri(cx,cy,OUT[m.dir]||'up',8,'none',INK,2); break;
      case 'trap':
        g = '<circle cx="'+cx+'" cy="'+cy+'" r="7.5" fill="'+GHALO+'" stroke="'+INK+'" stroke-width="1.8"/>'+
            '<path d="M'+(cx-3.4)+' '+(cy-3.4)+'l6.8 6.8 M'+(cx+3.4)+' '+(cy-3.4)+'l-6.8 6.8" stroke="'+INK+'" stroke-width="1.8" stroke-linecap="round"/>';
        break;
      case 'monster':
        g = halo(cx,cy,8)+'<circle cx="'+cx+'" cy="'+cy+'" r="6" fill="'+GOLD+'"/>'; break;
      case 'boss':
        g = halo(cx,cy,12)+
            '<circle cx="'+cx+'" cy="'+cy+'" r="10" fill="none" stroke="'+INK+'" stroke-width="2"/>'+
            '<rect x="'+(cx-5.3)+'" y="'+(cy-5.3)+'" width="10.6" height="10.6" fill="'+GOLD+'" transform="rotate(45 '+cx+' '+cy+')"/>';
        break;
      case 'treasure':
        g = halo(cx,cy,9)+
            '<rect x="'+(cx-7)+'" y="'+(cy-5)+'" width="14" height="10" rx="1.4" fill="oklch(0.86 0.07 82)" stroke="'+INK+'" stroke-width="1.6"/>'+
            '<path d="M'+(cx-7)+' '+(cy-1)+'h14" stroke="'+INK+'" stroke-width="1.4"/>'+
            '<rect x="'+(cx-1.4)+'" y="'+(cy-2.2)+'" width="2.8" height="3.4" fill="'+INK+'"/>';
        break;
      case 'secret':
        g = '<circle cx="'+cx+'" cy="'+cy+'" r="8" fill="'+GHALO+'" stroke="'+GOLD+'" stroke-width="1.6" stroke-dasharray="3 2.4"/>'+
            '<text x="'+cx+'" y="'+(cy+4.2)+'" class="mk-letter mk-gold">S</text>';
        break;
      case 'other':
        g = halo(cx,cy,9)+
            '<rect x="'+(cx-7.5)+'" y="'+(cy-7.5)+'" width="15" height="15" fill="oklch(0.9 0.03 84)" stroke="'+INK+'" stroke-width="2" stroke-linejoin="round"/>';
        break;
    }
    if(m.ref) g += refBadge(cx + (m.type==='boss'?14:12), cy - (m.type==='boss'?13:11), m.ref);
    return '<g class="mk">'+g+'</g>';
  }

  function buildSVG(d, opts){
    var gw=d.grid.gw, gh=d.grid.gh, cell=d.grid.cell, base=d.floor;
    var sf = (opts.secret && d.secretFloor) ? d.secretFloor : null;
    function isEff(x,y){ return x>=0&&y>=0&&x<gw&&y<gh && (base[y][x]===1 || (sf && sf[y][x]===1)); }
    var W=gw*cell, H=gh*cell, s='';

    s+='<svg viewBox="0 0 '+W+' '+H+'" class="dmap" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';

    // floor + grid (base, on both maps)
    var rects='';
    for(var fy=0;fy<gh;fy++) for(var fx=0;fx<gw;fx++){
      if(base[fy][fx]===1) rects+='<rect x="'+(fx*cell)+'" y="'+(fy*cell)+'" width="'+cell+'" height="'+cell+'" fill="'+FLOOR+'" stroke="'+GRID+'" stroke-width="0.5"/>';
    }
    // secret floor (DM only) — faint gold tint
    if(sf){
      for(var gy=0;gy<gh;gy++) for(var gx=0;gx<gw;gx++){
        if(sf[gy][gx]===1 && base[gy][gx]!==1)
          rects+='<rect x="'+(gx*cell)+'" y="'+(gy*cell)+'" width="'+cell+'" height="'+cell+'" fill="'+SECRET_FILL+'" stroke="'+GRID+'" stroke-width="0.5"/>';
      }
    }
    s+='<g class="floor">'+rects+'</g>';

    // walls — from the effective grid (base ∪ secret on the DM map)
    var wallD='';
    for(var y=0;y<gh;y++) for(var x=0;x<gw;x++){
      if(!isEff(x,y)) continue;
      var px=x*cell, py=y*cell;
      if(!isEff(x,y-1)) wallD+='M'+px+' '+py+'h'+cell;
      if(!isEff(x,y+1)) wallD+='M'+px+' '+(py+cell)+'h'+cell;
      if(!isEff(x-1,y)) wallD+='M'+px+' '+py+'v'+cell;
      if(!isEff(x+1,y)) wallD+='M'+(px+cell)+' '+py+'v'+cell;
    }
    s+='<path class="walls" d="'+wallD+'" fill="none" stroke="'+WALL+'" stroke-width="2.4" stroke-linecap="square"/>';

    // secret overlays (DM only): dashed gold passage centerlines + room outlines
    if(opts.secret){
      (d.secretPaths||[]).forEach(function(sp){
        var dd;
        if(sp.x1!==undefined){
          dd='M'+(sp.x1*cell+cell/2)+' '+(sp.y1*cell+cell/2)+'L'+(sp.x2*cell+cell/2)+' '+(sp.y2*cell+cell/2);
        } else { // legacy L-schema files
          var ax=sp.ax*cell+cell/2, ay=sp.ay*cell+cell/2, bx=sp.bx*cell+cell/2, by=sp.by*cell+cell/2;
          dd = sp.horizFirst ? ('M'+ax+' '+ay+'L'+bx+' '+ay+'L'+bx+' '+by)
                             : ('M'+ax+' '+ay+'L'+ax+' '+by+'L'+bx+' '+by);
        }
        s+='<path d="'+dd+'" fill="none" stroke="'+GOLD+'" stroke-width="2.4" stroke-dasharray="5 4" stroke-linejoin="round" stroke-linecap="round" opacity="0.95"/>';
      });
      (d.secretRooms||[]).forEach(function(r){
        s+='<rect x="'+(r.x*cell+3)+'" y="'+(r.y*cell+3)+'" width="'+(r.w*cell-6)+'" height="'+(r.h*cell-6)+'" fill="none" stroke="'+GOLD+'" stroke-width="1.6" stroke-dasharray="5 4" opacity="0.85"/>';
      });
    }

    // markers
    var ms = opts.dmMarkers ? d.markers : d.markers.filter(function(m){ return m.type==='entrance'; });
    ms.forEach(function(m){ s+=symbol(m, m.x*cell+cell/2, m.y*cell+cell/2); });

    // room reference letters (DM only)
    if(opts.dmMarkers){
      (d.rooms||[]).concat(d.secretRooms||[]).forEach(function(r){
        if(r.ref) s += refBadge((r.x+0.5)*cell, (r.y+0.5)*cell, r.ref);
      });
      (d.corridorNotes||[]).forEach(function(n){
        if(n.ref) s += refBadge(n.x*cell+cell/2, n.y*cell+cell/2, n.ref);
      });
    }

    // compass
    var ccx=W-26, ccy=30;
    s+='<g class="compass"><line x1="'+ccx+'" y1="'+(ccy+14)+'" x2="'+ccx+'" y2="'+(ccy-12)+'" stroke="'+INK+'" stroke-width="1.6"/>'+
       tri(ccx,ccy-12,'up',6,INK)+'<text x="'+ccx+'" y="'+(ccy-18)+'" class="mk-cap">N</text></g>';

    s+='</svg>';
    return s;
  }

  function setHTML(id,html){ var el=document.getElementById(id); if(el) el.innerHTML=html; }
  function setText(id,t){ var el=document.getElementById(id); if(el) el.textContent=t; }

  function renderDungeon(d){
    setHTML('dm-map', buildSVG(d,{secret:true, dmMarkers:true}));
    setHTML('player-map', buildSVG(d,{secret:false, dmMarkers:false}));

    setText('dungeon-name-dm', d.name);
    setText('dungeon-name-pl', d.name);
    setText('depth-dm', d.depth);
    setText('depth-pl', d.depth);
    setText('dm-subtitle', "Game Master's Map" + (d.genre ? ' (genre: '+d.genre+')' : '') + (d.tone ? ' (tone: '+d.tone+')' : ''));
    setText('pl-flavor', d.flavor || '');

    setText('tally-rooms', d.tally.rooms);
    setText('tally-foes', d.tally.foes);
    setText('tally-traps', d.tally.traps);
    setText('tally-loot', d.tally.loot);
    setText('tally-secret', d.tally.secret);

    var seedStr = (d.seed>>>0).toString(16).toUpperCase();
    document.querySelectorAll('.seed-val').forEach(function(el){ el.textContent = seedStr; });
    updateFootNames();
  }

  function updateFootNames(){
    var nm = (current && current.name) ? current.name : '';
    document.querySelectorAll('.foot-name').forEach(function(el){ el.textContent = nm; });
  }

  /* ---- annotations & the Contents Key ---- */
  function typeLabel(t){ return {monster:'Monster',boss:'Boss',treasure:'Treasure',trap:'Trap',secret:'Secret Passage',other:'Other'}[t]||'Mark'; }
  function rawLabel(e){
    if(e.kind==='marker') return typeLabel(e.o.type);
    if(e.kind==='sroom')  return 'Secret Chamber';
    if(e.kind==='room')   return 'Chamber';
    if(e.kind==='corridor') return (current.secretFloor && current.secretFloor[e.o.y] && current.secretFloor[e.o.y][e.o.x]===1) ? 'Secret Passage' : 'Corridor';
    return 'Note';
  }
  function entryLabel(e){ return e.o.label || rawLabel(e); }

  function relabel(){
    if(!current) return [];
    var ann=[];
    (current.markers||[]).forEach(function(m){ if(m.note||m.label) ann.push({o:m,kind:'marker'}); });
    (current.rooms||[]).forEach(function(r){ if(r.note||r.label) ann.push({o:r,kind:'room'}); });
    (current.secretRooms||[]).forEach(function(r){ if(r.note||r.label) ann.push({o:r,kind:'sroom'}); });
    (current.corridorNotes||[]).forEach(function(n){ if(n.note||n.label) ann.push({o:n,kind:'corridor'}); });
    ann.sort(function(a,b){ return (a.o.seq||0)-(b.o.seq||0); });
    var mx=-1;
    ann.forEach(function(e,i){ e.o.ref=letterFor(i); if((e.o.seq||0)>mx) mx=(e.o.seq||0); });
    if(current._seq==null || current._seq<=mx) current._seq=mx+1;
    return ann;
  }

  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function renderContentsKey(ann){
    var container=document.getElementById('contents-key');
    if(!container) return;
    container.innerHTML='';
    if(!ann || !ann.length) return;

    function newPage(){
      var wrap=document.createElement('div'); wrap.className='page-wrap';
      var page=document.createElement('section'); page.className='page sheet';
      page.setAttribute('data-screen-label','Contents Key');
      page.innerHTML =
        '<div class="frame">'+
          '<header class="sec-head map-head">'+
            '<div class="numeral">&#10070;</div>'+
            '<h2>Contents Key</h2>'+
            '<p class="sec-sub">What lies within, kept by the cartographer&rsquo;s letters</p>'+
            '<div class="sec-divider"><span class="ln"></span><span class="dot"></span><span class="ln rev"></span></div>'+
          '</header>'+
          '<div class="ck-grid"></div>'+
          '<div class="page-foot">&#10070;&ensp;<span class="foot-name"></span>&ensp;&#10070;</div>'+
        '</div>';
      wrap.appendChild(page); container.appendChild(wrap);
      return page;
    }
    function boxFor(e){
      var t=document.createElement('div');
      t.innerHTML='<div class="ck-box"><div class="ck-letter">'+e.o.ref+'</div>'+
        '<div class="ck-body"><div class="ck-type">'+esc(entryLabel(e))+'</div>'+
        '<div class="ck-text">'+esc(e.o.note||'')+'</div></div></div>';
      return t.firstChild;
    }

    var page=newPage(), frame=page.querySelector('.frame'), grid=page.querySelector('.ck-grid');

    /* small screens: skip pagination — one page, single column, every box in order.
       (Big screens & print keep the measured multi-page layout below.) */
    if(window.matchMedia('(max-width:700px)').matches){
      for(var m=0;m<ann.length;m++) grid.appendChild(boxFor(ann[m]));
      updateFootNames();
      window.dispatchEvent(new Event('resize'));
      return;
    }

    for(var i=0;i<ann.length;i++){
      var box=boxFor(ann[i]);
      grid.appendChild(box);
      var avail = frame.clientHeight - grid.offsetTop - 46;   // reserve room for the running foot
      if(grid.children.length>1 && grid.scrollHeight > avail){ // overflowed -> push this box to a fresh page
        grid.removeChild(box);
        page=newPage(); frame=page.querySelector('.frame'); grid=page.querySelector('.ck-grid');
        grid.appendChild(box);
      }
    }

    var pages=container.querySelectorAll('.page');
    if(pages.length>1) pages.forEach(function(pg,idx){
      pg.setAttribute('data-screen-label','Contents Key '+(idx+1));
      var h=pg.querySelector('h2'); if(h) h.textContent='Contents Key '+(idx+1);
    });
    updateFootNames();
    window.dispatchEvent(new Event('resize')); // let chronicle.js scale the new pages
  }

  /* re-render the Contents Key when crossing the small/large breakpoint, so the
     DOM matches the layout for the current width (continuous on mobile, paginated
     on desktop & for printing) */
  (function(){
    var mq=window.matchMedia('(max-width:700px)');
    var handler=function(){ if(current) renderContentsKey(relabel()); };
    if(mq.addEventListener) mq.addEventListener('change', handler);
    else if(mq.addListener) mq.addListener(handler);
  })();

  function refresh(){
    var ann = current ? relabel() : [];
    renderDungeon(current);
    renderContentsKey(ann);
    dirty=true;
    recordHistory();
  }

  /* ---- undo / redo ----
     refresh() is the single chokepoint after every map mutation, so we snapshot
     `current` there. Undo/redo restore a snapshot and re-render without recording. */
  var history=[], histIdx=-1, restoring=false; var HIST_MAX=80;
  function recordHistory(){
    if(restoring || !current) return;
    var snap=JSON.stringify(current);
    if(histIdx>=0 && history[histIdx]===snap) return;   // nothing actually changed
    history=history.slice(0, histIdx+1);                // drop any redo branch
    history.push(snap);
    if(history.length>HIST_MAX){ history.shift(); }
    histIdx=history.length-1;
    updateUndoRedoUI();
  }
  function restoreHistory(idx){
    if(idx<0 || idx>=history.length) return;
    restoring=true;
    histIdx=idx;
    current=JSON.parse(history[idx]);
    refresh();
    restoring=false;
    dirty=true;
    updateUndoRedoUI();
  }
  function undo(){ if(histIdx>0) restoreHistory(histIdx-1); }
  function redo(){ if(histIdx<history.length-1) restoreHistory(histIdx+1); }
  function updateUndoRedoUI(){
    var u=document.getElementById('btn-undo'), r=document.getElementById('btn-redo');
    if(u) u.disabled = !(histIdx>0);
    if(r) r.disabled = !(histIdx<history.length-1);
  }

  /* ============================================================
     STATE + CONTROLS
     ============================================================ */
  var current = null, dirty=false;
  var MINL = 1, MAXL = 6;
  function clampL(v){ return Math.max(MINL, Math.min(MAXL, v)); }
  var level = clampL(parseInt(localStorage.getItem('dungeon_level') || '3', 10) || 3);

  function updateLevelUI(){
    var n = document.getElementById('lvl-num'); if(n) n.textContent = level;
    var down = document.getElementById('lvl-down'), up = document.getElementById('lvl-up');
    if(down) down.classList.toggle('off', level<=MINL);
    if(up)   up.classList.toggle('off', level>=MAXL);
  }

  function newDungeon(mode){
    current = generateDungeon((Math.random()*0xFFFFFFFF)>>>0, level, mode||'full');
    refresh();
    dirty=false;
  }

  function setLevel(v){
    level = clampL(v);
    localStorage.setItem('dungeon_level', level);
    updateLevelUI();
    newDungeon();
  }

  function saveDungeon(){
    if(!current) return;
    var json = JSON.stringify(current, null, 2);
    var blob = new Blob([json], {type:'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var slug = (current.name||'dungeon').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    a.href = url;
    a.download = slug + '-' + (current.seed>>>0).toString(16).toUpperCase() + '.dungeon';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
  }

  function loadFile(file){
    var reader = new FileReader();
    reader.onload = function(){
      try{
        var d = JSON.parse(reader.result);
        if(!d || !d.grid || !d.floor || !d.markers) throw new Error('bad');
        current = d;
        if(d.level){ level = clampL(d.level|0); localStorage.setItem('dungeon_level', level); updateLevelUI(); }
        refresh();
        dirty=false;
      }catch(err){
        alert('That file is not a valid RollDvantage dungeon file.');
      }
    };
    reader.readAsText(file);
  }

  /* ---- init (runs after the DOM above this script exists) ---- */
  updateLevelUI();
  newDungeon();

  var nb = document.getElementById('btn-new');
  var pendingMode='full';
  function startGenerate(mode){ pendingMode=mode; closeGenMenu(); if(dirty) openGenWarn(); else newDungeon(mode); }
  var genMenu=null;
  function closeGenMenu(){ if(genMenu){ genMenu.remove(); genMenu=null; document.removeEventListener('pointerdown', genMenuOutside, true); } }
  function genMenuOutside(e){ if(genMenu && !genMenu.contains(e.target) && e.target!==nb) closeGenMenu(); }
  function openGenMenu(){
    closeGenMenu();
    var m=document.createElement('div'); m.className='cell-menu gen-menu';
    [['Map only','empty'],['Map + Markers','full'],['Map + Markers + Monsters &amp; Loot','detailed']].forEach(function(o){
      var b=document.createElement('button'); b.innerHTML='<span class="ck"></span>'+o[0];
      b.addEventListener('click', function(){ startGenerate(o[1]); });
      m.appendChild(b);
    });
    document.body.appendChild(m); genMenu=m;
    var r=nb.getBoundingClientRect();
    m.style.left=Math.max(8, Math.min(r.left, window.innerWidth-m.offsetWidth-8))+'px';
    m.style.top=Math.max(8, r.top - m.offsetHeight - 8)+'px';
    setTimeout(function(){ document.addEventListener('pointerdown', genMenuOutside, true); }, 0);
  }
  if(nb) nb.addEventListener('click', openGenMenu);

  var genWarn=document.getElementById('gen-warn');
  function openGenWarn(){ if(genWarn) genWarn.hidden=false; }
  function closeGenWarn(){ if(genWarn) genWarn.hidden=true; }
  if(genWarn){
    genWarn.querySelector('.note-backdrop').addEventListener('click', closeGenWarn);
    document.getElementById('gw-cancel').addEventListener('click', closeGenWarn);
    document.getElementById('gw-save').addEventListener('click', function(){ closeGenWarn(); saveDungeon(); newDungeon(pendingMode); });
    document.getElementById('gw-discard').addEventListener('click', function(){ closeGenWarn(); newDungeon(pendingMode); });
  }

  var ld = document.getElementById('lvl-down');
  if(ld) ld.addEventListener('click', function(){ setLevel(level-1); });
  var lu = document.getElementById('lvl-up');
  if(lu) lu.addEventListener('click', function(){ setLevel(level+1); });

  var btnUndo=document.getElementById('btn-undo');
  if(btnUndo) btnUndo.addEventListener('click', undo);
  var btnRedo=document.getElementById('btn-redo');
  if(btnRedo) btnRedo.addEventListener('click', redo);
  window.addEventListener('keydown', function(e){
    if(!(e.ctrlKey || e.metaKey) || e.altKey) return;
    var ae=document.activeElement;                       // never hijack text editing
    if(ae && (ae.isContentEditable || ae.tagName==='INPUT' || ae.tagName==='TEXTAREA')) return;
    var k=e.key.toLowerCase();
    if(k==='z' && !e.shiftKey){ e.preventDefault(); undo(); }
    else if(k==='y' || (k==='z' && e.shiftKey)){ e.preventDefault(); redo(); }
  });

  var sb = document.getElementById('btn-save');
  if(sb) sb.addEventListener('click', saveDungeon);

  // PDF export: switch to the print-ready bleed layout and use the browser's print-to-PDF,
  // so text stays real (selectable, crisp at any zoom) and the map stays vector.
  function cleanupBleed(){
    document.documentElement.classList.remove('pdf-bleed');
    var st=document.getElementById('bleed-page-style'); if(st) st.remove();
  }
  var btnExport=document.getElementById('btn-export');
  if(btnExport) btnExport.addEventListener('click', function(){
    cleanupBleed();
    var st=document.createElement('style'); st.id='bleed-page-style';
    st.textContent='@page{ size:8.75in 11.25in; margin:0; }';
    document.head.appendChild(st);
    document.documentElement.classList.add('pdf-bleed');
    setTimeout(function(){ window.print(); }, 60);
  });
  window.addEventListener('afterprint', cleanupBleed);

  var lb = document.getElementById('btn-load');
  var fi = document.getElementById('file-load');
  if(lb && fi){
    lb.addEventListener('click', function(){ fi.click(); });
    fi.addEventListener('change', function(){
      if(fi.files && fi.files[0]) loadFile(fi.files[0]);
      fi.value = '';
    });
  }

  /* legend icons — static; entrance & exit triangles both point up */
  document.querySelectorAll('[data-icon]').forEach(function(el){
    var t=el.getAttribute('data-icon');
    var demo = { entrance:{type:'entrance',dir:'up'}, exit:{type:'exit',dir:'down'},
                 trap:{type:'trap'}, monster:{type:'monster'}, boss:{type:'boss'},
                 treasure:{type:'treasure'}, secret:{type:'secret'}, other:{type:'other'} }[t];
    el.innerHTML = '<svg viewBox="0 0 30 30" class="legend-svg" xmlns="http://www.w3.org/2000/svg">'+symbol(demo,15,15)+'</svg>';
  });

  /* click-to-edit: keep the DM & player copies in sync and fold edits
     into the dungeon object so Save JSON captures them */
  function wireEditable(aId, bId, field){
    var a=document.getElementById(aId), b=document.getElementById(bId);
    if(!a||!b) return;
    function onInput(src, dst){
      return function(){
        if(current) current[field] = src.textContent.trim();
        dirty=true;
        if(document.activeElement !== dst) dst.textContent = src.textContent;
        if(field==='name') updateFootNames();
      };
    }
    a.addEventListener('input', onInput(a,b));
    b.addEventListener('input', onInput(b,a));
    [a,b].forEach(function(el){
      el.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); el.blur(); } });
      el.addEventListener('blur', function(){ if(current) current[field]=el.textContent.trim(); });
    });
  }
  wireEditable('dungeon-name-dm', 'dungeon-name-pl', 'name');
  wireEditable('depth-dm', 'depth-pl', 'depth');

  // editable + deletable random closing flourish on the player map
  var flav=document.getElementById('pl-flavor');
  if(flav){
    flav.addEventListener('input', function(){ if(current) current.flavor=flav.textContent; dirty=true; });
    flav.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); flav.blur(); } });
    flav.addEventListener('blur', function(){ if(current) current.flavor=flav.textContent.trim(); });
  }

  // double-click a Contents Key entry to edit it (same dialog as on the map)
  function findAnnByRef(ref){
    var ann=relabel();
    for(var i=0;i<ann.length;i++){ if(ann[i].o.ref===ref) return ann[i]; }
    return null;
  }
  var ckContainer=document.getElementById('contents-key');
  if(ckContainer) ckContainer.addEventListener('click', function(e){
    var box=e.target.closest ? e.target.closest('.ck-box') : null; if(!box || !current) return;
    var letterEl=box.querySelector('.ck-letter'); if(!letterEl) return;
    var entry=findAnnByRef(letterEl.textContent.trim()); if(!entry) return;
    openNote(entry.o, entry.kind, entry.kind==='corridor' ? current.corridorNotes : null);
  });

  // suppress the browser's native right-click menu (it would cover our context menu); keep it in text fields
  document.addEventListener('contextmenu', function(e){
    var t=e.target;
    if(t && (t.tagName==='TEXTAREA' || t.tagName==='INPUT' || t.isContentEditable)) return;
    e.preventDefault();
  });

  /* ============================================================
     DRAG-TO-PLACE — drag a legend icon onto a DM-map square
     ============================================================ */
  function dmSvg(){ var w=document.getElementById('dm-map'); return w ? w.querySelector('svg') : null; }

  function iconSVG(type){
    var demo = { entrance:{type:'entrance',dir:'up'}, exit:{type:'exit',dir:'down'},
                 trap:{type:'trap'}, monster:{type:'monster'}, boss:{type:'boss'},
                 treasure:{type:'treasure'}, secret:{type:'secret'}, other:{type:'other'} }[type];
    return '<svg viewBox="0 0 30 30" width="32" height="32" xmlns="http://www.w3.org/2000/svg">'+symbol(demo,15,15)+'</svg>';
  }

  function cellFromClient(svg, cx, cy){
    var rect = svg.getBoundingClientRect();
    if(!rect.width || !rect.height || !current) return null;
    var W = current.grid.gw*current.grid.cell, H = current.grid.gh*current.grid.cell;
    var x = Math.floor((cx-rect.left)/rect.width  * W / current.grid.cell);
    var y = Math.floor((cy-rect.top )/rect.height * H / current.grid.cell);
    var inside = cx>=rect.left && cx<=rect.right && cy>=rect.top && cy<=rect.bottom;
    if(x<0||y<0||x>=current.grid.gw||y>=current.grid.gh) return null;
    return { x:x, y:y, inside:inside, rect:rect, scale:rect.width/W };
  }
  function placeable(x,y){
    if(!current) return false;
    if(current.floor[y] && current.floor[y][x]===1) return true;
    if(current.secretFloor && current.secretFloor[y] && current.secretFloor[y][x]===1) return true;
    return false;
  }
  function edgeDir(x,y){ // boundary-side dir, matching how generation stores entrance/exit
    var gw=current.grid.gw, gh=current.grid.gh, best='down', bv=y;
    if(gh-1-y < bv){ bv=gh-1-y; best='up'; }
    if(x       < bv){ bv=x;       best='right'; }
    if(gw-1-x  < bv){ bv=gw-1-x;  best='left'; }
    return best;
  }

  var drag=null; // { mode:'place'|'move', type, index, ghost, hl, target, armed, sx, sy }

  function showTarget(c){
    var px=current.grid.cell*c.scale, h=drag.hl;
    h.style.display='block';
    h.style.left=(c.rect.left + c.x*current.grid.cell*c.scale)+'px';
    h.style.top =(c.rect.top  + c.y*current.grid.cell*c.scale)+'px';
    h.style.width=px+'px'; h.style.height=px+'px';
  }
  function arm(){
    drag.armed=true;
    document.body.appendChild(drag.ghost);
    document.body.appendChild(drag.hl);
    document.body.style.cursor='grabbing';
  }
  function onMove(e){
    if(!drag) return;
    if(!drag.armed){
      var dx=e.clientX-drag.sx, dy=e.clientY-drag.sy;
      if(dx*dx+dy*dy < 16) return;   // ignore <4px jitter so a plain click isn't a move
      arm();
    }
    drag.ghost.style.left=e.clientX+'px'; drag.ghost.style.top=e.clientY+'px';
    var svg=dmSvg(), c=svg ? cellFromClient(svg,e.clientX,e.clientY) : null;
    if(c && c.inside && placeable(c.x,c.y)){ showTarget(c); drag.target=c; }
    else { drag.hl.style.display='none'; drag.target=null; }
  }
  function onUp(){
    if(!drag) return;
    var d=drag; cleanup();
    if(d.mode==='move' && !d.armed) return;     // a simple click on a mark = no-op
    var c=d.target;
    if(!c || !current) return;
    if(d.mode==='place'){
      if(d.type==='secret'){ convertSecretAt(c.x,c.y); return; }   // (S) converts a corridor/room to secret
      var m={ type:d.type, x:c.x, y:c.y, placed:true };
      if(d.type==='entrance'||d.type==='exit') m.dir=edgeDir(c.x,c.y);
      current.markers.push(m);
    } else {
      var mk=current.markers[d.index];
      if(mk){
        if(mk.type==='secret'){
          // the (S) badge IS the secret status — dragging it must MOVE the secret,
          // not just the icon: un-hide where it came from, hide where it lands.
          var ox=mk.x, oy=mk.y;
          var alreadySecret = current.secretFloor && current.secretFloor[c.y] && current.secretFloor[c.y][c.x]===1;
          var canConvert = !alreadySecret && (roomIndexAt(c.x,c.y)>=0 || isCorridorCell(c.x,c.y));
          if(canConvert){
            unconvertSecret(ox,oy);    // restore the old room/passage to a visible one
            convertSecretAt(c.x,c.y);  // make the dropped-on room/corridor secret (re-places the badge)
          }
          return;                      // both helpers call refresh(); a bad drop leaves the secret untouched
        }
        mk.x=c.x; mk.y=c.y; if(mk.type==='entrance'||mk.type==='exit') mk.dir=edgeDir(c.x,c.y);
      }
    }
    refresh();
  }
  function cleanup(){
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.body.style.cursor='';
    if(drag){ if(drag.ghost) drag.ghost.remove(); if(drag.hl) drag.hl.remove(); }
    drag=null;
  }
  function startDrag(opts, e){
    if(drag) cleanup();
    var ghost=document.createElement('div'); ghost.className='drag-ghost'; ghost.innerHTML=iconSVG(opts.type);
    var hl=document.createElement('div'); hl.className='drag-cell'; hl.style.display='none';
    drag={ mode:opts.mode, type:opts.type, index:(opts.index==null?-1:opts.index),
           ghost:ghost, hl:hl, target:null, armed:false, sx:e.clientX, sy:e.clientY };
    if(opts.mode==='place'){ arm(); onMove(e); }   // legend drag: grab immediately
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function markerAtCell(x,y){
    if(!current) return -1;
    for(var i=current.markers.length-1;i>=0;i--){ var m=current.markers[i]; if(m.x===x && m.y===y) return i; }
    return -1;
  }

  // legend icons -> place a new mark
  document.querySelectorAll('.legend-item').forEach(function(item){
    var icon=item.querySelector('[data-icon]'); if(!icon) return;
    item.addEventListener('pointerdown', function(e){
      e.preventDefault();
      startDrag({ mode:'place', type:icon.getAttribute('data-icon') }, e);
    });
  });

  // marks already on the map -> drag to move, double-click to annotate, right-click to delete
  var dmWrap=document.getElementById('dm-map');
  if(dmWrap){
    dmWrap.addEventListener('pointerdown', function(e){
      if(mode) return;                         // structure-editing mode takes over
      if(e.button!==0) return;                 // left button only
      var svg=dmSvg(); if(!svg || !current) return;
      var c=cellFromClient(svg, e.clientX, e.clientY); if(!c || !c.inside) return;
      var idx=markerAtCell(c.x, c.y);
      if(idx<0) return;                         // empty square — leave it alone
      startDrag({ mode:'move', type:current.markers[idx].type, index:idx }, e);
    });
    dmWrap.addEventListener('contextmenu', function(e){
      e.preventDefault();   // never show the browser menu over the map
      if(mode==='corridor'){ corridorStart=null; clearPreview(); }
      // (single right-click item-deletion is handled on pointerup in the default tool)
    });
    dmWrap.addEventListener('dblclick', function(e){
      if(mode) return;
      var svg=dmSvg(); if(!svg || !current) return;
      var c=cellFromClient(svg, e.clientX, e.clientY); if(!c || !c.inside) return;
      var m=annotatableMarkerAt(c.x, c.y);
      if(m){ openNote(m, 'marker'); return; }
      var r=roomAt(c.x, c.y);
      if(r){ openNote(r.o, r.kind); return; }
      // corridor / secret passage -> a loose note keyed to that square
      if(isBaseFloor(c.x,c.y) || (current.secretFloor && current.secretFloor[c.y] && current.secretFloor[c.y][c.x]===1)){
        if(!current.corridorNotes) current.corridorNotes=[];
        var cn=null;
        for(var i=0;i<current.corridorNotes.length;i++){ var n=current.corridorNotes[i]; if(n.x===c.x && n.y===c.y){ cn=n; break; } }
        openNote(cn || { x:c.x, y:c.y }, 'corridor', current.corridorNotes);
      }
    });
  }

  /* ============================================================
     STRUCTURE EDITING — add rooms & corridors
     ============================================================ */
  var mode=null, corridorStart=null, roomDraw=null, delDraw=null, addDraw=null, rdelDraw=null;

  function cellClamped(svg, cx, cy){
    var rect=svg.getBoundingClientRect();
    if(!rect.width || !rect.height || !current) return null;
    var W=current.grid.gw*current.grid.cell, H=current.grid.gh*current.grid.cell;
    var x=Math.floor((cx-rect.left)/rect.width *W/current.grid.cell);
    var y=Math.floor((cy-rect.top )/rect.height*H/current.grid.cell);
    x=Math.max(0,Math.min(current.grid.gw-1,x));
    y=Math.max(0,Math.min(current.grid.gh-1,y));
    return {x:x,y:y};
  }
  function isBaseFloor(x,y){ return current.floor[y] && current.floor[y][x]===1; }
  function corridorCells(ax,ay,bx,by){
    var cells=[], xx, yy;
    if(Math.abs(bx-ax) >= Math.abs(by-ay)){       // longer axis first
      for(xx=Math.min(ax,bx);xx<=Math.max(ax,bx);xx++) cells.push([xx,ay]);
      for(yy=Math.min(ay,by);yy<=Math.max(ay,by);yy++) cells.push([bx,yy]);
    } else {
      for(yy=Math.min(ay,by);yy<=Math.max(ay,by);yy++) cells.push([ax,yy]);
      for(xx=Math.min(ax,bx);xx<=Math.max(ax,bx);xx++) cells.push([xx,by]);
    }
    return cells;
  }

  function fxGroup(){
    var svg=dmSvg(); if(!svg) return null;
    var g=svg.querySelector('#mapfx');
    if(!g){ g=document.createElementNS('http://www.w3.org/2000/svg','g'); g.setAttribute('id','mapfx'); svg.appendChild(g); }
    return g;
  }
  function clearPreview(){ var svg=dmSvg(); if(svg){ var g=svg.querySelector('#mapfx'); if(g) g.remove(); } }
  function drawRoomPreview(x0,y0,x1,y1){
    var g=fxGroup(); if(!g) return; var cell=current.grid.cell;
    var ax=Math.min(x0,x1),ay=Math.min(y0,y1),bx=Math.max(x0,x1),by=Math.max(y0,y1);
    g.innerHTML='<rect x="'+(ax*cell)+'" y="'+(ay*cell)+'" width="'+((bx-ax+1)*cell)+'" height="'+((by-ay+1)*cell)+'" fill="oklch(0.66 0.094 78 / .22)" stroke="oklch(0.52 0.084 70)" stroke-width="2" stroke-dasharray="6 4"/>';
  }
  function drawCorridorPreview(cells){
    var g=fxGroup(); if(!g) return; var cell=current.grid.cell, s='';
    cells.forEach(function(c){ s+='<rect x="'+(c[0]*cell)+'" y="'+(c[1]*cell)+'" width="'+cell+'" height="'+cell+'" fill="oklch(0.66 0.094 78 / .3)" stroke="oklch(0.52 0.084 70)" stroke-width="1"/>'; });
    g.innerHTML=s;
  }
  function drawDeletePreview(x0,y0,x1,y1){
    var g=fxGroup(); if(!g) return; var cell=current.grid.cell;
    var ax=Math.min(x0,x1),ay=Math.min(y0,y1),bx=Math.max(x0,x1),by=Math.max(y0,y1);
    g.innerHTML='<rect x="'+(ax*cell)+'" y="'+(ay*cell)+'" width="'+((bx-ax+1)*cell)+'" height="'+((by-ay+1)*cell)+'" fill="oklch(0.55 0.16 30 / .25)" stroke="oklch(0.5 0.15 32)" stroke-width="2" stroke-dasharray="6 4"/>';
  }

  function commitRoom(x0,y0,x1,y1){
    var ax=Math.min(x0,x1),ay=Math.min(y0,y1),bx=Math.max(x0,x1),by=Math.max(y0,y1);
    for(var y=ay;y<=by;y++) for(var x=ax;x<=bx;x++){ if(current.floor[y]) current.floor[y][x]=1; }
    var w=bx-ax+1, h=by-ay+1, maxId=0;
    (current.rooms||[]).forEach(function(r){ if((r.id||0)>maxId) maxId=r.id||0; });
    current.rooms.push({ x:ax, y:ay, w:w, h:h, cx:Math.floor(ax+w/2), cy:Math.floor(ay+h/2), id:maxId+1 });
    refresh();
  }
  function commitCorridor(ax,ay,bx,by){
    corridorCells(ax,ay,bx,by).forEach(function(c){ if(current.floor[c[1]]) current.floor[c[1]][c[0]]=1; });
    refresh();
  }
  function cellAlive(x,y){ return (current.floor[y]&&current.floor[y][x]===1) || (current.secretFloor&&current.secretFloor[y]&&current.secretFloor[y][x]===1); }
  function gridHasRoomCell(r,grid){ for(var y=r.y;y<r.y+r.h;y++) for(var x=r.x;x<r.x+r.w;x++){ if(grid[y]&&grid[y][x]===1) return true; } return false; }
  function commitDelete(x0,y0,x1,y1){
    var ax=Math.min(x0,x1),ay=Math.min(y0,y1),bx=Math.max(x0,x1),by=Math.max(y0,y1);
    var gw=current.grid.gw, del={};
    for(var y=ay;y<=by;y++) for(var x=ax;x<=bx;x++){
      if(current.floor[y]) current.floor[y][x]=0;
      if(current.secretFloor && current.secretFloor[y]) current.secretFloor[y][x]=0;
      del[y*gw+x]=true;
    }
    current.markers = (current.markers||[]).filter(function(m){ return !del[m.y*gw+m.x]; });
    if(current.corridorNotes) current.corridorNotes = current.corridorNotes.filter(function(n){ return !del[n.y*gw+n.x]; });
    current.rooms   = (current.rooms||[]).filter(function(r){ return gridHasRoomCell(r,current.floor); });
    if(current.secretFloor) current.secretRooms = (current.secretRooms||[]).filter(function(r){ return gridHasRoomCell(r,current.secretFloor); });
    if(current.secretPaths) current.secretPaths = current.secretPaths.filter(function(p){ if(p.x1==null) return true; return cellAlive(p.x1,p.y1) && cellAlive(p.x2,p.y2); });
    refresh();
  }

  function roomIndexAt(x,y){
    var R=current.rooms||[];
    for(var i=0;i<R.length;i++){ var r=R[i]; if(x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h) return i; }
    return -1;
  }
  function isCorridorCell(x,y){ return current.floor[y] && current.floor[y][x]===1 && roomIndexAt(x,y)<0; }
  function secretRoomIndexAt(x,y){
    var S=current.secretRooms||[];
    for(var i=0;i<S.length;i++){ var r=S[i]; if(x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h) return i; }
    return -1;
  }
  function isSecretCorridorCell(x,y){ return current.secretFloor && current.secretFloor[y] && current.secretFloor[y][x]===1 && secretRoomIndexAt(x,y)<0; }
  // the straight run through (dx,dy) for a given cell test: stops at a turn, junction, room, or dead end
  function straightRunF(dx,dy,isCell){
    function C(x,y){ return isCell(x,y); }
    var L=C(dx-1,dy),R=C(dx+1,dy),U=C(dx,dy-1),Dn=C(dx,dy+1), horiz;
    if((L||R)&&!(U||Dn)) horiz=true;
    else if((U||Dn)&&!(L||R)) horiz=false;
    else if(L&&R) horiz=true;
    else if(U&&Dn) horiz=false;
    else return { cells:[[dx,dy]], horiz:true };
    var cells=[[dx,dy]], x, y;
    if(horiz){
      for(x=dx+1; C(x,dy) && !(C(x,dy-1)||C(x,dy+1)); x++) cells.push([x,dy]);
      for(x=dx-1; C(x,dy) && !(C(x,dy-1)||C(x,dy+1)); x--) cells.push([x,dy]);
    } else {
      for(y=dy+1; C(dx,y) && !(C(dx-1,y)||C(dx+1,y)); y++) cells.push([dx,y]);
      for(y=dy-1; C(dx,y) && !(C(dx-1,y)||C(dx+1,y)); y--) cells.push([dx,y]);
    }
    return { cells:cells, horiz:horiz };
  }
  function straightRun(dx,dy){ return straightRunF(dx,dy,isCorridorCell); }
  function ensureSecretFloor(){
    if(!current.secretFloor){
      var g=[]; for(var y=0;y<current.grid.gh;y++) g.push(new Array(current.grid.gw).fill(0));
      current.secretFloor=g;
    }
  }
  // drop the (S) icon: turn a room into a secret room, or a corridor into a secret passage
  function convertSecretAt(x,y){
    if(!current) return;
    if(current.secretFloor && current.secretFloor[y] && current.secretFloor[y][x]===1) return; // already secret
    var ri=roomIndexAt(x,y);
    if(ri<0 && !isCorridorCell(x,y)) return;            // only rooms or corridors convert
    ensureSecretFloor();
    if(ri>=0){
      var R=current.rooms[ri];
      for(var yy=R.y;yy<R.y+R.h;yy++) for(var xx=R.x;xx<R.x+R.w;xx++){
        if(current.floor[yy] && current.floor[yy][xx]===1){ current.floor[yy][xx]=0; current.secretFloor[yy][xx]=1; }
      }
      current.rooms.splice(ri,1);
      current.secretRooms = current.secretRooms || [];
      current.secretRooms.push(R);                      // keeps any note/letter; dashed outline marks it secret
    } else {
      var run=straightRun(x,y), minX=1e9,maxX=-1,minY=1e9,maxY=-1;
      run.cells.forEach(function(c){
        current.floor[c[1]][c[0]]=0; current.secretFloor[c[1]][c[0]]=1;
        if(c[0]<minX)minX=c[0]; if(c[0]>maxX)maxX=c[0]; if(c[1]<minY)minY=c[1]; if(c[1]>maxY)maxY=c[1];
      });
      current.secretPaths = current.secretPaths || [];
      if(run.horiz) current.secretPaths.push({ x1:minX, y1:y, x2:maxX, y2:y });   // dashed centerline
      else          current.secretPaths.push({ x1:x, y1:minY, x2:x, y2:maxY });
      var mid=run.cells[Math.floor(run.cells.length/2)];
      current.markers.push({ type:'secret', x:mid[0], y:mid[1], placed:true });   // 'S' badge
    }
    refresh();
  }

  // reverse of convertSecretAt: bring a secret room / passage back to a visible one
  function unconvertSecret(x,y){
    if(!current.secretFloor) return;
    var si=secretRoomIndexAt(x,y), gw=current.grid.gw;
    if(si>=0){
      var R=current.secretRooms[si];
      for(var yy=R.y;yy<R.y+R.h;yy++) for(var xx=R.x;xx<R.x+R.w;xx++){ if(current.secretFloor[yy][xx]===1){ current.secretFloor[yy][xx]=0; current.floor[yy][xx]=1; } }
      current.secretRooms.splice(si,1);
      current.rooms.push(R);
      var inR=function(mx,my){ return mx>=R.x&&mx<R.x+R.w&&my>=R.y&&my<R.y+R.h; };
      current.markers=current.markers.filter(function(m){ return !(m.type==='secret' && inR(m.x,m.y)); });
      current.secretPaths=(current.secretPaths||[]).filter(function(p){ if(p.x1==null) return true; return !(inR(p.x1,p.y1)||inR(p.x2,p.y2)); });
      refresh(); return;
    }
    var run=straightRunF(x,y,isSecretCorridorCell).cells, set={};
    run.forEach(function(c){ current.secretFloor[c[1]][c[0]]=0; current.floor[c[1]][c[0]]=1; set[c[1]*gw+c[0]]=1; });
    current.markers=current.markers.filter(function(m){ return !(m.type==='secret' && set[m.y*gw+m.x]); });
    current.secretPaths=(current.secretPaths||[]).filter(function(p){ if(p.x1==null) return true;
      return (current.secretFloor[p.y1]&&current.secretFloor[p.y1][p.x1]===1) || (current.secretFloor[p.y2]&&current.secretFloor[p.y2][p.x2]===1); });
    refresh();
  }

  function featureAt(x,y){
    var mi=markerAtCell(x,y);
    if(mi>=0 && current.markers[mi].type!=='secret') return { kind:'marker', idx:mi, marker:current.markers[mi] };
    var ri=roomIndexAt(x,y);          if(ri>=0) return { kind:'room', room:current.rooms[ri] };
    var si=secretRoomIndexAt(x,y);    if(si>=0) return { kind:'secret-room', room:current.secretRooms[si] };
    if(isBaseFloor(x,y)) return { kind:'corridor' };
    if(current.secretFloor && current.secretFloor[y] && current.secretFloor[y][x]===1) return { kind:'secret-corridor' };
    return null;
  }
  function featureBBox(f,gx,gy){
    if(f.kind==='room'||f.kind==='secret-room'){ var r=f.room; return { ax:r.x, ay:r.y, bx:r.x+r.w-1, by:r.y+r.h-1 }; }
    var run=(f.kind==='corridor') ? straightRun(gx,gy).cells : straightRunF(gx,gy,isSecretCorridorCell).cells;
    var ax=1e9,ay=1e9,bx=-1,by=-1;
    run.forEach(function(c){ if(c[0]<ax)ax=c[0]; if(c[0]>bx)bx=c[0]; if(c[1]<ay)ay=c[1]; if(c[1]>by)by=c[1]; });
    return { ax:ax, ay:ay, bx:bx, by:by };
  }

  // ---- right-click context menu ----
  var cellMenu=null;
  function closeCellMenu(){
    if(cellMenu){ cellMenu.remove(); cellMenu=null; document.removeEventListener('pointerdown', menuOutside, true); }
  }
  function menuOutside(e){ if(cellMenu && !cellMenu.contains(e.target)) closeCellMenu(); }
  function openCellMenu(gx,gy,clientX,clientY){
    closeCellMenu();
    var f=featureAt(gx,gy); if(!f) return;
    var items=[];
    if(f.kind==='marker'){
      items.push({ label:'Delete', danger:true, act:function(){ current.markers.splice(f.idx,1); refresh(); } });
      [['monster','Monster'],['boss','Boss'],['treasure','Treasure'],['trap','Trap'],['entrance','Entrance'],['exit','Exit'],['other','Other']]
        .forEach(function(t,i){
          var cur=(t[0]===f.marker.type);
          items.push({ label:t[1], check:cur, sep:(i===0), act: cur ? null : function(){ f.marker.type=t[0]; if(t[0]==='entrance'||t[0]==='exit') f.marker.dir=edgeDir(f.marker.x,f.marker.y); refresh(); } });
        });
    } else {
      var bb=featureBBox(f,gx,gy);
      items.push({ label:'Delete', danger:true, act:function(){ commitDelete(bb.ax,bb.ay,bb.bx,bb.by); } });
      if(f.kind==='room'||f.kind==='corridor') items.push({ label:'Make Secret', act:function(){ convertSecretAt(gx,gy); } });
      else items.push({ label:'Make Not Secret', act:function(){ unconvertSecret(gx,gy); } });
      [['monster','Monster'],['boss','Boss'],['treasure','Treasure'],['trap','Trap'],['entrance','Entrance'],['exit','Exit'],['other','Other']]
        .forEach(function(t,i){
          items.push({ label:t[1]+' (add)', sep:(i===0), act:function(){
            var nm={ type:t[0], x:gx, y:gy, placed:true };
            if(t[0]==='entrance'||t[0]==='exit') nm.dir=edgeDir(gx,gy);
            current.markers.push(nm); refresh();
          } });
        });
    }
    var m=document.createElement('div'); m.className='cell-menu';
    items.forEach(function(it){
      var b=document.createElement('button');
      var cls=[]; if(it.danger) cls.push('danger'); if(it.sep) cls.push('sep'); if(it.check) cls.push('checked');
      if(cls.length) b.className=cls.join(' ');
      b.innerHTML='<span class="ck">'+(it.check?'&#10003;':'')+'</span>'+it.label;
      b.addEventListener('click', function(){ closeCellMenu(); if(it.act) it.act(); });
      m.appendChild(b);
    });
    document.body.appendChild(m); cellMenu=m;
    var vw=window.innerWidth, vh=window.innerHeight;
    m.style.left=Math.max(8, Math.min(clientX, vw-m.offsetWidth-8))+'px';
    m.style.top =Math.max(8, Math.min(clientY, vh-m.offsetHeight-8))+'px';
    setTimeout(function(){ document.addEventListener('pointerdown', menuOutside, true); }, 0);
  }

  function updateModeHint(){
    var el=document.getElementById('mode-hint'); if(!el) return;
    if(mode==='room'){ el.textContent='Add Room: drag a rectangle across the squares. Esc to finish.'; el.hidden=false; }
    else if(mode==='corridor'){ el.textContent='Add Corridor: click a square to start, click again to set the end. Esc to finish.'; el.hidden=false; }
    else if(mode==='delete'){ el.textContent='Delete: click a square, or drag a rectangle, to erase. Esc to finish.'; el.hidden=false; }
    else { el.hidden=true; }
  }
  function setMode(m){
    mode = (mode===m) ? null : m;
    corridorStart=null; roomDraw=null; delDraw=null; clearPreview();
    var b1=document.getElementById('btn-room'), b2=document.getElementById('btn-corridor'), b3=document.getElementById('btn-delete');
    if(b1) b1.classList.toggle('active', mode==='room');
    if(b2) b2.classList.toggle('active', mode==='corridor');
    if(b3) b3.classList.toggle('active', mode==='delete');
    document.body.classList.toggle('mode-active', !!mode);
    updateModeHint();
  }

  var btnRoom=document.getElementById('btn-room'); if(btnRoom) btnRoom.addEventListener('click', function(){ setMode('room'); });
  var btnCorr=document.getElementById('btn-corridor'); if(btnCorr) btnCorr.addEventListener('click', function(){ setMode('corridor'); });
  var btnDel=document.getElementById('btn-delete'); if(btnDel) btnDel.addEventListener('click', function(){ setMode('delete'); });
  window.addEventListener('keydown', function(e){ if(e.key==='Escape'){ closeCellMenu(); closeGenMenu(); closeGenWarn(); if(mode) setMode(null); } });

  if(dmWrap){
    function roomMove(e){
      if(!roomDraw) return;
      var svg=dmSvg(); var c=cellClamped(svg, e.clientX, e.clientY); if(!c) return;
      roomDraw.cx=c.x; roomDraw.cy=c.y; drawRoomPreview(roomDraw.sx,roomDraw.sy,c.x,c.y);
    }
    function roomUp(){
      window.removeEventListener('pointermove', roomMove);
      window.removeEventListener('pointerup', roomUp);
      if(!roomDraw) return;
      var rd=roomDraw; roomDraw=null; clearPreview();
      commitRoom(rd.sx,rd.sy,rd.cx,rd.cy);
    }
    dmWrap.addEventListener('pointerdown', function(e){      // room: rubber-band rectangle
      if(mode!=='room' || e.button!==0) return;
      var svg=dmSvg(); var c=cellClamped(svg, e.clientX, e.clientY); if(!c) return;
      e.preventDefault();
      roomDraw={ sx:c.x, sy:c.y, cx:c.x, cy:c.y };
      drawRoomPreview(c.x,c.y,c.x,c.y);
      window.addEventListener('pointermove', roomMove);
      window.addEventListener('pointerup', roomUp);
    });
    dmWrap.addEventListener('click', function(e){           // corridor: click start, click end
      if(mode!=='corridor') return;
      var svg=dmSvg(); var c=cellFromClient(svg, e.clientX, e.clientY);
      if(!corridorStart){
        if(!c || !c.inside || !isBaseFloor(c.x,c.y)) return;   // must begin on an existing square
        corridorStart={ x:c.x, y:c.y };
        drawCorridorPreview([[c.x,c.y]]);
      } else {
        var end=(c && c.inside) ? c : cellClamped(svg, e.clientX, e.clientY); if(!end) return;
        commitCorridor(corridorStart.x, corridorStart.y, end.x, end.y);
        corridorStart=null; clearPreview();
      }
    });
    dmWrap.addEventListener('mousemove', function(e){
      if(mode!=='corridor' || !corridorStart) return;
      var svg=dmSvg(); var c=cellClamped(svg, e.clientX, e.clientY); if(!c) return;
      drawCorridorPreview(corridorCells(corridorStart.x, corridorStart.y, c.x, c.y));
    });

    // delete: click a square or drag a rectangle to erase
    function delMove(e){
      if(!delDraw) return;
      var svg=dmSvg(); var c=cellClamped(svg, e.clientX, e.clientY); if(!c) return;
      delDraw.cx=c.x; delDraw.cy=c.y; drawDeletePreview(delDraw.sx,delDraw.sy,c.x,c.y);
    }
    function delUp(){
      window.removeEventListener('pointermove', delMove);
      window.removeEventListener('pointerup', delUp);
      if(!delDraw) return;
      var d=delDraw; delDraw=null; clearPreview();
      commitDelete(d.sx,d.sy,d.cx,d.cy);
    }
    dmWrap.addEventListener('pointerdown', function(e){
      if(mode!=='delete' || e.button!==0) return;
      var svg=dmSvg(); var c=cellClamped(svg, e.clientX, e.clientY); if(!c) return;
      e.preventDefault();
      delDraw={ sx:c.x, sy:c.y, cx:c.x, cy:c.y };
      drawDeletePreview(c.x,c.y,c.x,c.y);
      window.addEventListener('pointermove', delMove);
      window.addEventListener('pointerup', delUp);
    });

    /* ----- DEFAULT TOOL (no mode active) ----- */
    /* left-drag: add a corridor (from an existing square) or a room (from empty space) */
    function addMove(e){
      if(!addDraw) return;
      if(!addDraw.armed){ var dx=e.clientX-addDraw.dsx, dy=e.clientY-addDraw.dsy; if(dx*dx+dy*dy<16) return; addDraw.armed=true; }
      var svg=dmSvg(); var c=cellClamped(svg, e.clientX, e.clientY); if(!c) return;
      addDraw.cx=c.x; addDraw.cy=c.y;
      if(addDraw.kind==='corridor') drawCorridorPreview(corridorCells(addDraw.sx,addDraw.sy,c.x,c.y));
      else drawRoomPreview(addDraw.sx,addDraw.sy,c.x,c.y);
    }
    function addUp(){
      window.removeEventListener('pointermove', addMove);
      window.removeEventListener('pointerup', addUp);
      if(!addDraw) return;
      var a=addDraw; addDraw=null; clearPreview();
      if(!a.armed) return;   // a plain click adds nothing (reserved)
      if(a.kind==='corridor') commitCorridor(a.sx,a.sy,a.cx,a.cy);
      else commitRoom(a.sx,a.sy,a.cx,a.cy);
    }
    dmWrap.addEventListener('pointerdown', function(e){
      if(mode || e.button!==0) return;
      var svg=dmSvg(); var ins=cellFromClient(svg, e.clientX, e.clientY); if(!ins || !ins.inside) return;
      if(markerAtCell(ins.x, ins.y)>=0) return;   // on a mark -> the move handler takes over
      addDraw={ kind: isBaseFloor(ins.x,ins.y) ? 'corridor' : 'room',
                sx:ins.x, sy:ins.y, cx:ins.x, cy:ins.y, armed:false, dsx:e.clientX, dsy:e.clientY };
      window.addEventListener('pointermove', addMove);
      window.addEventListener('pointerup', addUp);
    });

    /* right-drag: erase a rectangle; single right-click: erase the item on a square (keep the square) */
    function rdelMove(e){
      if(!rdelDraw) return;
      if(!rdelDraw.armed){ var dx=e.clientX-rdelDraw.dsx, dy=e.clientY-rdelDraw.dsy; if(dx*dx+dy*dy<16) return; rdelDraw.armed=true; }
      var svg=dmSvg(); var c=cellClamped(svg, e.clientX, e.clientY); if(!c) return;
      rdelDraw.cx=c.x; rdelDraw.cy=c.y; drawDeletePreview(rdelDraw.sx,rdelDraw.sy,c.x,c.y);
    }
    function rdelUp(){
      window.removeEventListener('pointermove', rdelMove);
      window.removeEventListener('pointerup', rdelUp);
      if(!rdelDraw) return;
      var a=rdelDraw; rdelDraw=null; clearPreview();
      if(a.armed){ commitDelete(a.sx,a.sy,a.cx,a.cy); }            // dragged -> erase rectangle + its contents
      else { openCellMenu(a.sx, a.sy, a.dsx, a.dsy); }              // single right-click -> context menu
    }
    dmWrap.addEventListener('pointerdown', function(e){
      if(mode || e.button!==2) return;
      var svg=dmSvg(); var c=cellClamped(svg, e.clientX, e.clientY); if(!c) return;
      rdelDraw={ sx:c.x, sy:c.y, cx:c.x, cy:c.y, armed:false, dsx:e.clientX, dsy:e.clientY };
      window.addEventListener('pointermove', rdelMove);
      window.addEventListener('pointerup', rdelUp);
    });
  }

  /* ---- annotation hit-tests + dialog ---- */
  var ANNOT={ monster:1, boss:1, treasure:1, trap:1, secret:1, other:1 };
  function annotatableMarkerAt(x,y){
    for(var i=current.markers.length-1;i>=0;i--){ var m=current.markers[i]; if(m.x===x && m.y===y && ANNOT[m.type]) return m; }
    return null;
  }
  function roomAt(x,y){
    var R=current.rooms||[];
    for(var i=0;i<R.length;i++){ var r=R[i]; if(x>=r.x && x<r.x+r.w && y>=r.y && y<r.y+r.h) return {o:r,kind:'room'}; }
    var S=current.secretRooms||[];
    for(var j=0;j<S.length;j++){ var s=S[j]; if(x>=s.x && x<s.x+s.w && y>=s.y && y<s.y+s.h) return {o:s,kind:'sroom'}; }
    return null;
  }

  var noteTarget=null, noteList=null;
  var modal=document.getElementById('note-modal');
  var elRef=document.getElementById('note-ref'), elKind=document.getElementById('note-kind'),
      elText=document.getElementById('note-text'), elDel=document.getElementById('note-delete');
  function openNote(o, kind, list){
    if(!modal) return;
    noteTarget=o; noteList=list||null;
    var ann=relabel();
    elKind.contentEditable = 'true';                      // every title is editable now
    elKind.classList.add('editable');
    elKind.setAttribute('data-ph', rawLabel({o:o, kind:kind}));   // placeholder = the default type label
    elKind.textContent = o.label || '';
    elRef.textContent  = o.ref || letterFor(ann.length);
    elText.value = o.note || '';
    elDel.style.display = (o.note||o.label) ? '' : 'none';
    modal.hidden=false;
    setTimeout(function(){ elText.focus(); }, 30);
  }
  function closeNote(){ if(modal) modal.hidden=true; noteTarget=null; noteList=null; }
  function saveNote(){
    if(!noteTarget) return;
    var t=elText.value.trim();
    var lbl=elKind.textContent.trim();
    if(lbl) noteTarget.label=lbl; else delete noteTarget.label;   // blank title -> falls back to the default
    if(!t && !lbl){ removeNote(); return; }                       // nothing at all -> drop the entry
    noteTarget.note=t;
    if(noteTarget.seq==null){ noteTarget.seq=(current._seq||0); current._seq=(current._seq||0)+1; }
    if(noteList && noteList.indexOf(noteTarget)<0) noteList.push(noteTarget);   // loose notes (corridors) join their list on save
    closeNote(); refresh();
  }
  function removeNote(){
    if(noteTarget){
      delete noteTarget.note; delete noteTarget.seq; delete noteTarget.ref; delete noteTarget.label;
      if(noteList){ var i=noteList.indexOf(noteTarget); if(i>=0) noteList.splice(i,1); }
    }
    closeNote(); refresh();
  }
  if(modal){
    document.getElementById('note-save').addEventListener('click', saveNote);
    elDel.addEventListener('click', removeNote);
    document.getElementById('note-cancel').addEventListener('click', closeNote);
    modal.querySelector('.note-backdrop').addEventListener('click', closeNote);
    elText.addEventListener('keydown', function(e){
      if(e.key==='Enter' && (e.metaKey||e.ctrlKey)){ e.preventDefault(); saveNote(); }
      else if(e.key==='Escape'){ e.preventDefault(); closeNote(); }
    });
    elKind.addEventListener('keydown', function(e){
      if(e.key==='Enter'){ e.preventDefault(); elText.focus(); }
      else if(e.key==='Escape'){ e.preventDefault(); closeNote(); }
    });
  }
}
