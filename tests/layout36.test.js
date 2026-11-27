// v3.6: layers may overhang the pallet by 6 cm in total (3 cm a side), Mix layers favour FULL layers (leftover layers within 8 cm of height are merged),
// donut layouts (gaps in the middle of the pallet, corners and edges carried), the tallest stack stands innermost (row 1) at the container head
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});
const w=dom.window,d=w.document,errs=[];w.addEventListener('error',e=>errs.push(e.message));
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
w.alert=()=>{};w.confirm=()=>true;
const part=(model,o)=>Object.assign({model,description:model,qtyCarton:10,cartonD:40,cartonW:30,cartonH:25,qtyPallet:200,palletD:110,palletW:110,palletH:60,netPC:1.2,grossCarton:13,grossPallet:200},o||{});
const $=id=>d.getElementById(id);
const noOverlap=pl=>{for(let i=0;i<pl.length;i++)for(let j=i+1;j<pl.length;j++){const a=pl[i],b=pl[j];if(!(a.x+a.w<=b.x+1e-6||b.x+b.w<=a.x+1e-6||a.y+a.d<=b.y+1e-6||b.y+b.d<=a.y+1e-6))return false}return true};
const covers=(pl,x,y)=>pl.some(p=>x>=p.x&&x<=p.x+p.w&&y>=p.y&&y<=p.y+p.d);
const T=(key,model,wd,dd,h,count)=>({key,model,w:wd,d:dd,h,count});
const mixGroup=(rows)=>{w.allocations=rows.map(([m,dd,wd,h,n])=>({shipmentModel:m,packingModel:m,mixGroup:'Mix Rem 1',skidNo:'Mix Rem 1',cartonD:dd,cartonW:wd,cartonH:h,ctnNo:n,qtyPallet:n*10}));return w.calculateMixPalletLayouts()[0]};

setTimeout(()=>{
  // ================= 1. +6 cm =================
  ok(w.eval('MIX_OVER')===6&&w.eval('MIX_ENV')===116&&w.eval('MIX_H_GAP')===8,'constants: overhang 6 cm in total (3 cm a side) -> 116 x 116 envelope, height gap 8 cm');
  {const L=(wd,dd,n)=>w.mixPackOneLayer([T('q','Q',wd,dd,25,n)],{q:n});
   const r=L(30,41,60);ok(r.spanX<=116+1e-9&&r.spanY<=116+1e-9&&r.overX<=6+1e-9&&r.overY<=6+1e-9,'a full layer never leaves 116 x 116 (overhang at most 6 cm in W and in D)');
   let worst=0;[[29.6,50.5],[28.1,46.3],[35.8,52],[60.5,48],[45.4,60.8],[26.3,46.4],[57,37],[48,30],[58.4,33.8]].forEach(([a,b])=>{const q=L(b,a,60);worst=Math.max(worst,q.overX,q.overY)});
   ok(worst<=6+1e-9,'9 real carton sizes: the largest overhang in one direction is '+worst.toFixed(1)+' cm (<= 6)');
  }

  // ================= 2. donut =================
  {const L=(wd,dd,n)=>w.mixPackOneLayer([T('q','Q',wd,dd,25,n)],{q:n});
   // 29.6 x 50.5: four blocks of 2 cartons turned around an empty centre
   const r=L(50.5,29.6,60),pl=r.placements;
   ok(r.placed===8&&r.donut&&r.edgeHole<=30&&noOverlap(pl),'29.6 x 50.5: 8 cartons as four blocks of 2 around an empty centre (donut), no gap at any edge or corner (edge gap '+r.edgeHole+' cm2)');
   ok(!covers(pl,55,55)&&covers(pl,2,2)&&covers(pl,108,2)&&covers(pl,2,108)&&covers(pl,108,108),'the centre of the pallet is empty, all four corners carry cartons');
   const seeds=w.mixPinwheelSeeds([T('q','Q',50.5,29.6,25,60)],{q:60});
   ok(seeds.length>=1&&seeds.every(s=>s.length%4===0&&noOverlap(s.map(p=>({x:p.x,y:p.y,w:p.w,d:p.d})))),'donut seeds: groups of 4 identical blocks (a multiple of 4 cartons), no overlap ('+seeds.map(s=>s.length).join(', ')+' cartons)');
   ok(w.mixPinwheelSeeds([T('q','Q',50.5,29.6,25,3)],{q:3}).length===0,'fewer than 4 cartons -> no donut seed');
   // a partial layer: cartons go to the corners of the pallet face, the middle stays empty, nothing overhangs
   const p4=L(30,40,4);
   ok(p4.placed===4&&p4.donut&&p4.overhang<1e-9&&p4.spanX>=104&&!covers(p4.placements,55,55),'a partial layer of 4 cartons (40 x 30): one in each corner of the pallet, empty middle, no overhang ('+p4.spanX.toFixed(0)+' x '+p4.spanY.toFixed(0)+' cm)');
   // the ranking prefers the layout whose gaps sit in the middle: same carton count, less empty space along the pallet edge
   const e1=L(42.6,65.9,12),e2=L(40.5,30.3,40),e3=L(52.4,31.4,6);
   ok(e1.placed===4&&e1.edgeHole===0&&e1.donut,'65.9 x 42.6 cartons: 4 per layer around an empty centre, no gap at the edge (edge gap '+e1.edgeHole+' cm2)');
   ok(e2.placed===8&&e2.edgeHole<=1300,'40.5 x 30.3 cartons: 8 per layer with the gaps pulled to the middle (edge gap '+e2.edgeHole+' cm2, a plain packing leaves 1,856)');
   ok(e3.placed===6&&e3.edgeHole<=300,'52.4 x 31.4 cartons: 6 per layer, edge gap '+e3.edgeHole+' cm2 (a plain packing leaves 528)');
   // the edge gap of the chosen layout is never worse than a plain bottom-left packing with the same carton count (several partial layers)
   let better=0,tot=0;
   [[40,30,3],[40,30,5],[35.8,52,3],[35.8,52,5],[28.1,46.3,4],[28.1,46.3,6],[60.5,48,2],[57,37,3],[29.6,50.5,5],[45.2,56.7,3]].forEach(([a,b,n])=>{
     const t=[T('q','Q',b,a,25,n)],best=w.mixPackOneLayer(t,{q:n}),plain=w.mixRunLayer(t,{q:n},0);
     tot++;if(best.placed===plain.placed&&best.edgeHole<=plain.edgeHole+30)better++});
   ok(better===tot,'10 partial layers: the gaps at the edges / corners are never larger than with plain bottom-left packing ('+better+' of '+tot+')');
  }

  // ================= 3. Mix: full layers, height gap +-8 cm =================
  {let g=mixGroup([['A',50.5,29.6,30,3],['B',46.3,28.1,25,3]]);
   ok(g.valid&&g.heightGroups.length===2&&g.layers===1&&g.merged===1&&g.stack[0].layer.cartons===6,'30 cm x3 + 25 cm x3 (5 cm apart): the two incomplete layers are merged into ONE layer of 6 cartons (was 2 layers)');
   ok(g.stack[0].h===30&&Math.abs(g.stack[0].layer.hGap-5)<1e-9&&g.totalHeight===13+30,'the layer is as high as its tallest carton (30), the height gap inside it is 5 cm, pallet = 13 + 30 = '+g.totalHeight+' cm');
   g=mixGroup([['A',50.5,29.6,30,3],['B',46.3,28.1,20,3]]);
   ok(g.valid&&g.layers===2&&g.merged===0&&g.stack.every(x=>x.layer.hGap===0),'30 cm x3 + 20 cm x3 (10 cm apart, more than 8): NOT merged, 2 separate layers');
   g=mixGroup([['A',50.5,29.6,30,3],['B',46.3,28.1,22,3]]);
   ok(g.valid&&g.layers===1&&Math.abs(g.stack[0].layer.hGap-8)<1e-9,'30 cm + 22 cm (exactly 8 cm apart): merged, height gap 8 cm');
   // full layers stay pure (same height, no gap); only the leftovers are merged
   g=mixGroup([['A',50.5,29.6,30,19],['B',46.3,28.1,25,3]]);
   const full=g.stack.filter(x=>!x.partial);
   ok(g.valid&&g.layers===3&&full.length>=2&&full.slice(0,2).every(x=>x.layer.cartons===8&&x.layer.hGap===0&&x.h===30),'A x19 (30 cm) + B x3 (25 cm): 2 full layers of 8 stay pure (no gap), the 3 + 3 leftovers share ONE layer -> 3 layers (separate: 4) ('+g.stack.map(x=>x.layer.cartons+'/'+x.h).join(', ')+')');
   ok(g.stack[g.stack.length-1].partial&&g.stack[g.stack.length-1].layer.hGap>0,'the merged leftover layer is the incomplete one on top');
   ok(g.totalHeight===13+g.stack.reduce((s,x)=>s+x.h,0)&&g.cartons===22&&g.stack.reduce((s,x)=>s+x.layer.cartons,0)===22,'height = 13 + the layer heights; all 22 cartons placed once');
   // random mixes: merging never gives more layers and every carton is placed exactly once
   let seed=99;const rnd=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;
   const sizes=[[29.6,50.5],[60.5,48],[46.3,28.1],[55,49],[35.8,52],[57,37],[45.2,56.7],[40,30]];
   let bad=0,fewer=0,gapOver=0,N=40;
   for(let it=0;it<N;it++){
     const rows=[];const nt=2+Math.floor(rnd()*3);for(let i=0;i<nt;i++){const s=sizes[Math.floor(rnd()*sizes.length)];rows.push(['M'+i+'_'+it,s[0],s[1],20+Math.floor(rnd()*4)*3+Math.floor(rnd()*2),3+Math.floor(rnd()*30)])}
     const total=rows.reduce((s,r)=>s+r[4],0),gg=mixGroup(rows);
     if(!gg.valid||gg.stack.reduce((s,x)=>s+x.layer.cartons,0)!==total)bad++;
     if(gg.stack.some(x=>x.layer.hGap>8+1e-9||x.layer.placements.some(p=>p.h>x.h+1e-9)))gapOver++;
     // layers if every height were its own group
     const sep=w.eval('(function(rows){var by=new Map();rows.forEach(function(r){var k=String(r[3]);by.set(k,(by.get(k)||0)+0)});return 0})'),_=sep;
     const by=new Map();rows.forEach(r=>{(by.get(r[3])||by.set(r[3],[]).get(r[3])).push(r)});
     let sepLayers=0;by.forEach(rs=>{const ty=rs.map((r,i)=>T('k'+i,r[0],r[2],r[1],r[3],r[4])),rem={};ty.forEach(t=>rem[t.key]=t.count);let c=0;while(Object.values(rem).some(v=>v>0)&&c<80){const q=w.mixPackOneLayer(ty,rem);if(!q.placed)break;c++}sepLayers+=c});
     if(gg.layers<sepLayers)fewer++;
     if(gg.layers>sepLayers)bad++;
   }
   ok(bad===0,N+' random Mix groups: every carton placed once, never more layers than packing each height separately');
   ok(gapOver===0,'no layer holds cartons more than 8 cm apart, and no carton is taller than its layer');
   ok(fewer>=N/2,'merging within 8 cm gives fewer layers in '+fewer+' of '+N+' random groups');
  }
  // the 3D picture draws every carton at its OWN height (shorter cartons leave a gap above them)
  {const g=mixGroup([['A',50.5,29.6,30,3],['B',46.3,28.1,25,3]]),boxes=[];
   w.s3addPallet((b,c,m)=>boxes.push({b,m}),{h:g.totalHeight,units:null},g,0,0,0,{sw:.1,swv:.1,pid:1,cargoColor:()=>'#999',maxCartons:90});
   const hs=boxes.filter(x=>x.m&&x.m.k==='carton').map(x=>Math.round((x.b[5]-x.b[2])*10)/10);
   ok(hs.length===6&&hs.filter(v=>v===30).length===3&&hs.filter(v=>v===25).length===3,'3D: the 3 taller cartons are drawn 30 cm high, the 3 shorter ones 25 cm ('+hs.join(', ')+')');
   const lv=w.palletLevels({mix:true,key:'mix:mix rem 1'},[g]);
   ok(lv.parts&&lv.parts[0][0].h===30&&lv.parts[0][0].cartons===6,'the Slip levels carry the layer height (30 cm)');
  }
  // the Mix card shows the new chips
  {mixGroup([['A',50.5,29.6,30,3],['B',46.3,28.1,25,3]]);w.recalcDerived&&0;
   w.parts=[part('A',{cartonD:50.5,cartonW:29.6,cartonH:30,qtyCarton:10,qtyPallet:30}),part('B',{cartonD:46.3,cartonW:28.1,cartonH:25,qtyCarton:10,qtyPallet:30})];
   w.models=[['A',30],['B',30]].map(([m,q])=>({model:m,planQty:q,actualQty:null,packingModel:m}));w.generateAllocations();
   w.allocations.forEach(a=>{a.mixGroup='Mix Pallet 1';a.skidNo='Mix Pallet 1'});w.recalcDerived();w.renderCalc();
   const txt=$('mixCalcPanel').innerHTML;
   ok(/สูงต่าง 5 cm/.test(txt)&&/โดนัท/.test(txt),'the Mix Pallet card shows the "สูงต่าง 5 cm" and "โดนัท" chips');
   ok(/ข้างละไม่เกิน 3 cm/.test(txt)||/ข้างละไม่เกิน 3 cm/.test(d.body.innerHTML),'the overhang chip text says at most 3 cm a side');
  }

  // ================= 4. the TALLEST stack stands innermost =================
  {w.parts=[part('A',{palletH:60}),part('B',{palletH:90,grossPallet:150}),part('C',{palletH:50,grossPallet:100}),part('D',{palletH:75,grossPallet:120})];
   w.fillSelect('shipType',['20FT','40HC','Air','LCL']);
   w.models=[['A',800],['B',800],['C',800],['D',800]].map(([m,q])=>({model:m,planQty:q,actualQty:null,packingModel:m}));
   $('shipType').value='20FT';w.syncContFromShipType();$('autoStackY').checked=false;$('stackPallet').checked=true;w.manualLayout=[];w.manualStack=[];w.generateAllocations();w.renderCalc();
   const st=w.planStacking(),stacked=st.positions.filter(ps=>ps.length>1||ps[0].units),hh=ps=>ps[0].h+(ps[1]?ps[1].h:0),hs=stacked.map(hh);
   ok(stacked.length>=3&&new Set(hs).size>=2,'scenario: '+stacked.length+' stacked positions of different height ('+hs.join(', ')+' cm)');
   ok(hs.every((v,i)=>i===0||hs[i-1]>=v-1e-9),'stacked positions are ordered tallest first: row 1 (innermost, at the container head) holds the tallest ('+hs.join(' >= ')+')');
   ok(st.positions.slice(0,stacked.length).every(ps=>ps.length>1||ps[0].units)&&st.positions.slice(stacked.length).every(ps=>ps.length===1&&!ps[0].units),'stacks still come before the single pallets');
   const sc=w.buildScene(st);ok(sc.placed[0].length===2&&hh(sc.placed[0])===Math.max(...hs),'3D scene: the tallest stack is in slot 1 (nearest the head)');
   // a hand-made layout still wins
   const r1=w.palRef(st.positions[st.positions.length-1][0]);w.manualLayoutSet(0,r1);
   ok(w.palRef(w.planStacking().positions[0][0])===r1,'a hand-made layout overrides the automatic order');
   w.manualLayout=[];
  }

  ok(errs.length===0,'no script errors ('+errs.join('|')+')');
  console.log(fail?fail+' FAILED':'ALL PASSED');process.exit(fail?1:0);
},900);
