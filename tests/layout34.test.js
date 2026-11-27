// v3.4: pinwheel layers (no corner gap), 13 cm / 7 kg pallet, container size by Type Shipment, manual Stack pairs, overflow -> Stack = Y automatically
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://clc.test/'});
const w=dom.window,d=w.document,errs=[],alerts=[];w.addEventListener('error',e=>errs.push(e.message));
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
let confirmAnswer=true;w.alert=m=>alerts.push(String(m));w.confirm=m=>{alerts.push('CONFIRM: '+m);return confirmAnswer};
const part=(model,o)=>Object.assign({model,description:model,qtyCarton:10,cartonD:40,cartonW:30,cartonH:25,qtyPallet:200,palletD:110,palletW:110,palletH:125,netPC:1.2,grossCarton:13,grossPallet:260},o||{});
const $=id=>d.getElementById(id);
const setup=(ps,ms)=>{w.parts=ps;w.models=ms.map(([m,q])=>({model:m,planQty:q,actualQty:null,packingModel:m}));w.generateAllocations();w.renderCalc()};
const cov=(pl,x,y)=>pl.some(p=>x>=p.x-1e-9&&x<=p.x+p.w+1e-9&&y>=p.y-1e-9&&y<=p.y+p.d+1e-9);
const inside=pl=>pl.every(p=>p.x>=-3-1e-6&&p.y>=-3-1e-6&&p.x+p.w<=113+1e-6&&p.y+p.d<=113+1e-6);   // v3.6: a layer may overhang the 110 x 110 pallet by 6 cm in total (3 cm each side)
const noOverlap=pl=>pl.every((a,i)=>pl.every((b,j)=>j<=i||a.x+a.w<=b.x+1e-7||b.x+b.w<=a.x+1e-7||a.y+a.d<=b.y+1e-7||b.y+b.d<=a.y+1e-7));
const corners=pl=>[[1,1],[109,1],[1,109],[109,109]].every(([x,y])=>cov(pl,x,y));

setTimeout(()=>{
  // ================= 1. layers: pinwheel, never fewer cartons =================
  {const t={key:'r',model:'NVF-0459ZS02/XNJP',w:35.2,d:73.4,h:27.6,count:12};
   const r=w.mixPackOneLayer([t],{r:12});
   ok(r.placed===4&&Math.abs(r.fillPercent-85.41)<.01,'73.4 x 35.2 cartons: 4 per layer, 85.41% fill (same count and area as before)');
   ok(r.donut&&r.edgeHole<=30&&inside(r.placements)&&noOverlap(r.placements),'the layer is a pinwheel / donut (4 cartons turned 90° around an empty centre, every corner carried), inside the pallet, no overlap');
   ok(corners(r.placements),'all 4 corners of the pallet face carry a carton (no gap at the base)');
   ok(r.cogOff<.5&&r.spanArea>108*108,'load is centred ('+r.cogOff.toFixed(2)+' cm off) and spans the whole pallet face ('+r.spanArea.toFixed(0)+' cm²)');
   const y={key:'y',model:'NVF-0059ZS03/XNJP',w:40.2,d:68.8,h:27.6,count:8},ry=w.mixPackOneLayer([y],{y:8});
   ok(ry.placed===4&&ry.cogOff<.5&&corners(ry.placements)&&ry.overhang===0,'68.8 x 40.2 cartons (the yellow pallet): 4 per layer in a pinwheel, centred, corners carried');
   // a real Mix group (Pallet เศษ) of 12 cartons = 3 layers of the pinwheel
   w.allocations=[{shipmentModel:'R',packingModel:'R',mixGroup:'Mix Rem 1',skidNo:'Mix Rem 1',cartonD:73.4,cartonW:35.2,cartonH:27.6,ctnNo:12,qtyPallet:12}];
   const g=w.calculateMixPalletLayouts()[0];
   ok(g&&g.valid&&g.layers===3&&g.stack.every(L=>L.layer.placements.length===4&&corners(L.layer.placements)),'Pallet เศษ of 12 cartons: 3 layers, every layer is full-face (no layer with a gap)');
   ok(Math.abs(g.totalHeight-(13+3*27.6))<1e-9,'total height = 13 cm pallet + 3 x 27.6 = '+g.totalHeight+' cm');
   // squares / grids are untouched: never fewer cartons than the best classic layout, never smaller area
   let seed=12345;const rnd=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;let worse=0,bad=0,pin=0;
   for(let k=0;k<250;k++){
     const a=20+Math.floor(rnd()*70),b=15+Math.floor(rnd()*55),tt={key:'k',model:'K',w:a,d:b,h:20,count:30};
     if(a>110||b>110)continue;
     const classic=[0,1,2,3,4,5].map(m=>w.mixRunLayer([tt],{k:30},m)).sort((p,q)=>(q.placed-p.placed)||(q.usedArea-p.usedArea))[0];
     const now=w.mixPackOneLayer([tt],{k:30});
     if(!(now.placed>=classic.placed||(classic.placed>=5&&classic.placed%2===1&&now.placed===classic.placed-1&&now.placed%2===0)))worse++;   // at least the classic layout of the 120 x 120 envelope; one fewer only to make the layer even
     if(!inside(now.placements)||!noOverlap(now.placements))bad++;
     if(now.pinwheel)pin++;
   }
   ok(worse===0&&bad===0,'250 random carton sizes: the most cartons the envelope holds (one fewer only to make the layer even), always inside the 120 x 120 envelope without overlap ('+pin+' use the pinwheel)');
   const sq=w.mixPackOneLayer([{key:'s',model:'S',w:55,d:55,h:20,count:9}],{s:9});
   ok(sq.placed===4&&!sq.pinwheel,'square cartons (55 x 55): plain 2 x 2 grid, no pinwheel needed');
  }

  // ================= 1b. v3.5 / v3.6: full layers land on an EVEN count; a layer may overhang the pallet by 6 cm =================
  {const L=(wd,dd,n)=>{const t={key:'q',model:'Q',w:wd,d:dd,h:25,count:n};return w.mixPackOneLayer([t],{q:n})};
   const a=L(28.1,46.3,60),b=L(29.6,50.5,60);
   ok(a.placed===8&&b.placed===8,'28.1 x 46.3 and 29.6 x 50.5 cartons: 8 per full layer (an even count; the old 110 x 110 limit gave 7)');
   // 4 x 29.6 = 118.4 cm no longer fits the 116 cm envelope: the 8 cartons are laid as four blocks of 2 turned around an empty centre (a donut), 109.7 cm square
   ok(b.spanX<=116+1e-9&&b.spanY<=116+1e-9&&b.snug&&b.donut&&b.edgeHole<=30&&b.overhang<=1e-9,'29.6 x 50.5: four blocks of 2 cartons around an empty centre = '+b.spanX.toFixed(1)+' cm square, no overhang, snug and a donut');
   ok(a.overX<=6+1e-9&&a.overY<=6+1e-9&&a.spanX<=116+1e-9&&a.spanY<=116+1e-9,'28.1 x 46.3: the layer overhangs the pallet by at most 6 cm per direction ('+a.overX.toFixed(1)+' x '+a.overY.toFixed(1)+')');
   {const xs=b.placements,x0=Math.min(...xs.map(p=>p.x)),x1=Math.max(...xs.map(p=>p.x+p.w));ok(Math.abs((x0+x1)/2-55)<1e-6,'the overhang is shared: the layer is centred on the pallet (3 cm each side at most)');}
   ok(w.mixLayerCap({key:'q',model:'Q',w:28.1,d:46.3,h:25,count:1})===8,'layer capacity of the carton (used for flat / full-layer checks) is the even 8');
   const part5=L(28.1,46.3,5);ok(part5.placed===5,'a PARTIAL layer keeps every remaining carton (5 left -> 5 placed), nothing is dropped to make it even');
   ok(L(115,30,3).placed>=1&&L(117,30,3).placed===0,'a carton 115 cm wide still fits the 110 + 6 cm envelope; 117 cm does not');
   // real Part Master cartons (D x W): the share of EVEN full layers (the warehouse packs 98% of its layers even)
   const real=[[29.6,50.5],[60.5,48],[64.4,44.6],[28.1,46.3],[55,49],[48,30],[50,29.1],[45.4,60.8],[26.3,46.4],[70,37.4],[35.8,52],[29.2,50.1],[57,37],[45.2,56.7],[29.1,51.8],[46.8,28.6],[48.4,64.7],[35.9,56.1],[41,63.3],[47.2,28.3],[28.4,51.8],[36.2,26.9],[29.3,48.2],[39.1,61.8],[58.4,33.8],[52.4,32.4],[48.1,57.2],[28,49],[35.1,51.7],[46.1,57.4],[39.4,68.6],[63.8,45.3],[57.5,32.5],[54.5,32.5],[32.9,51.1],[46.6,56.8],[47,31],[49,28],[48.8,55.8],[35.1,54.6]];
   let ev=0;real.forEach(([d,wd])=>{if(L(wd,d,60).placed%2===0)ev++});
   ok(ev/real.length>=.95,'real Part Master cartons: '+ev+' of '+real.length+' full layers are even ('+Math.round(ev/real.length*100)+'%; the old packer: about 54%)');
   // a group of the SAME carton: every full layer is even, total layers do not go up
   w.allocations=[{shipmentModel:'Z',packingModel:'Z',mixGroup:'Mix Rem 1',skidNo:'Mix Rem 1',cartonD:28.1,cartonW:46.3,cartonH:25,ctnNo:30,qtyPallet:300}];
   const g=w.calculateMixPalletLayouts()[0];
   ok(g.valid&&g.stack.slice(0,-1).every(x=>x.layer.cartons%2===0)&&g.stack.reduce((s,x)=>s+x.layer.cartons,0)===30,'30 cartons: full layers 8,8,8 + 6 on top ('+g.stack.map(x=>x.layer.cartons).join(', ')+'), all 30 placed');
   // every layer is drawn inside the envelope (a layer never leaves 116 x 116) and carries its own overhang figures
   ok(g.stack.every(x=>inside(x.layer.placements)&&x.layer.overX<=6+1e-9&&x.layer.overY<=6+1e-9),'every layer sits inside the 116 x 116 envelope');
  }

  // ================= 2. pallet data: 13 cm high, 7 kg =================
  ok(w.eval('MIX_BASE_H')===13&&w.eval('PALLET_TARE_KG')===7,'pallet data: height 13 cm, weight 7 kg');
  {setup([part('P',{qtyCarton:1,qtyPallet:16,cartonD:55,cartonW:36,cartonH:27.6,palletH:13+4*27.6,grossPallet:100})],[['P',8]]);
   const a=w.allocations[0];
   ok(Math.abs(a.palletH-(13+2*27.6))<.11,'master Pallet H = 13 + 4 x 27.6: half the cartons = 2 layers -> '+a.palletH+' cm');
   ok(Math.abs(a.grossLine-(a.grossKgPallet+7))<1e-9,'tare 7 kg per physical pallet is added once');
   ok(/Base 13/.test($('mixCalcPanel').innerHTML+d.body.innerHTML),'the Mix table header says Base 13');
  }

  // ================= 3. container follows the Type Shipment =================
  ok(['20FT','20F',"20'",'20GP'].every(x=>w.contKeyOf(x)==='20FT')&&w.contKeyOf('40HC')==='40HC'&&w.contKeyOf("40' HC")==='40HC'&&w.contKeyOf('40FT')==='40FT'&&w.contKeyOf('40GP')==='40FT'&&w.contKeyOf('45HC')==='45HC'&&['Air','LCL','',null].every(x=>w.contKeyOf(x)===''),'Type Shipment names map to a container: 20F/20FT, 40HC, 40FT/GP, 45HC; Air / LCL / empty = none');
  w.fillSelect('shipType',['20FT','40HC','Air','LCL']);
  {setup([part('A')],[['A',200*12]]);
   $('shipType').value='20FT';w.syncContFromShipType();
   ok($('containerType').value==='20FT'&&$('floorCap').value==='10'&&$('contH').value==='239'&&$('floorCap').disabled&&$('contH').disabled,'Type Shipment 20FT -> container 20FT, 10 floor positions, 239 cm high (fields locked)');
   const sc20=w.buildScene(w.planStacking());
   ok(sc20.L===590&&sc20.W===235&&sc20.H===239,'3D / Sketch scene of a 20FT: 590 x 235 x 239 cm');
   $('shipType').value='40HC';w.syncContFromShipType();
   const sc40=w.buildScene(w.planStacking());
   ok($('containerType').value==='40HC'&&$('floorCap').value==='20'&&sc40.L===1203&&sc40.H===269,'Type Shipment 40HC -> 20 positions, 1203 x 235 x 269 cm');
   $('shipType').value='Air';w.syncContFromShipType();
   ok($('containerType').value==='40HC'&&$('floorCap').value==='20','Air / LCL keep the container as it is');
   // saved plans: the Sketch uses the plan's Type Shipment (old plans saved as 40HC but shipped as 20FT too)
   $('planId').value='T-20';$('shipType').value='20FT';w.syncContFromShipType();
   const p20=w.makePlan();p20.summary.containerType='40HC';p20.summary.floorCap=20;p20.summary.contH=269;   // what an old plan has stored
   const sk=w.sketchData(p20);
   ok(sk.type==='20FT'&&sk.sc.L===590&&sk.sc.H===239,'Sketch of a saved 20FT shipment draws the 20FT container ('+sk.type+' '+sk.sc.L+' x '+sk.sc.W+' x '+sk.sc.H+')');
   ok($('containerType').value==='20FT'&&$('floorCap').value==='10','the open form is put back exactly after the Sketch is computed');
   const pO=JSON.parse(JSON.stringify(p20));pO.summary.containerType='Other';pO.summary.floorCap=12;pO.summary.contH=250;pO.shipmentType='40HC';
   const skO=w.sketchData(pO);
   ok(skO.type==='Other'&&skO.sc.L===12/2*110+30&&skO.sc.H===250,'a hand-made container (Other) keeps its own size');
   const html20=w.sketchHtml(p20);
   ok(/20FT/.test(html20)&&/590/.test(html20),'the printed Sketch names the container and its length');
  }

  // ================= 4. manual Stack pairs =================
  {$('autoStackY').checked=false;$('stackPallet').checked=true;$('shipType').value='40HC';w.syncContFromShipType();
   setup([part('A'),part('B'),part('C',{grossPallet:200}),part('D',{palletH:155})],[['A',200],['B',200],['C',200],['D',200]]);
   const st0=w.planStacking();
   ok(st0.physical===4&&st0.pairs.length===0&&st0.floorUsed===4&&!!$('mstB')&&!!$('mstT'),'4 pallets on the floor, no pair; the manual-stack panel is on the page');
   $('mstB').value='solo:A#1';$('mstT').value='solo:B#1';w.manualStackAdd();
   let st=w.planStacking();
   ok(st.pairs.length===1&&st.pairs[0].manual&&st.pairs[0].bottom.rows[0].shipmentModel==='A'&&st.pairs[0].top.rows[0].shipmentModel==='B'&&st.floorUsed===3,'A (bottom) + B (top) paired by hand: 3 floor positions although nothing overflows');
   const tbl=$('simLayout').textContent;
   ok(/จับคู่เอง/.test(tbl)&&$('simLayout').querySelectorAll('table.stk tr.pair').length===1,'the stacking table shows the pair and marks it as a hand-made pair');
   ok(/Stack 1-2/.test(d.querySelector('#allocations .stkpair')?d.querySelector('#allocations').textContent:''),'the Skid Pallet No. column shows "Stack 1-2"');
   const sk=w.sketchData(w.makePlan());
   ok(sk.pairs.length===1&&sk.pairs[0].bottom===1&&sk.pairs[0].top===2,'the Sketch and 3D use the same pair (bottom #1, top #2)');
   // saved in the plan and restored
   $('planId').value='T-MAN';const pm=w.makePlan();w.plans=[pm];
   ok(Array.isArray(pm.manualStack)&&pm.manualStack.length===1&&pm.manualStack[0].bottom==='solo:A#1','the pair is stored in the plan (manualStack)');
   w.newPlan();ok(w.manualStack.length===0,'a new plan starts without hand-made pairs');
   w.loadPlan('T-MAN');ok(w.manualStack.length===1&&w.planStacking().pairs.length===1,'opening the saved plan brings the pair back');
   // works with automatic stacking switched off
   $('stackPallet').checked=false;w.renderCalc();ok(w.planStacking().pairs.length===1,'hand-made pairs stay when automatic stacking is off');
   $('stackPallet').checked=true;
   // refused / warned
   alerts.length=0;$('mstB').value='solo:A#1';$('mstT').value='solo:A#1';w.manualStackAdd();ok(alerts.some(m=>/คนละใบ/.test(m))&&w.manualStack.length===1,'the same pallet on top of itself is refused');
   alerts.length=0;w.manualStackClear();$('mstB').value='solo:D#1';$('mstT').value='solo:D#1';
   // D is 155 cm: two D pallets would be 310 cm - use D (bottom) + a second 155 cm pallet
   setup([part('A'),part('D',{palletH:155}),part('E',{palletH:155})],[['A',200],['D',200],['E',200]]);
   $('mstB').value='solo:D#1';$('mstT').value='solo:E#1';alerts.length=0;w.manualStackAdd();
   ok(alerts.some(m=>/เกินความสูงตู้/.test(m))&&w.manualStack.length===0,'155 cm + 155 cm = 310 cm is higher than the 269 cm container: refused');
   setup([part('A'),part('C',{grossPallet:200})],[['A',200],['C',200]]);
   $('mstB').value='solo:C#1';$('mstT').value='solo:A#1';alerts.length=0;confirmAnswer=false;w.manualStackAdd();
   ok(alerts.some(m=>/CONFIRM/.test(m)&&/หนักกว่า/.test(m))&&w.manualStack.length===0,'a heavier pallet on a lighter one asks first; "No" -> no pair');
   confirmAnswer=true;$('mstB').value='solo:C#1';$('mstT').value='solo:A#1';w.manualStackAdd();
   ok(w.manualStack.length===1&&/ตัวบนหนักกว่าตัวล่าง/.test($('simLayout').textContent),'"Yes" -> the pair is made and the table flags it (top heavier than bottom)');
   // a pair whose pallet disappeared is reported and ignored
   w.manualStack=[{bottom:'solo:Z#9',top:'solo:A#1'}];w.renderCalc();
   ok(w.planStacking().stale.length===1&&w.planStacking().pairs.length===0&&/No longer valid|ใช้ไม่ได้แล้ว/.test($('simLayout').textContent),'a stale pair is ignored and shown as no longer valid (can be removed)');
   w.manualStackClear();
   // manual + automatic: 4 pallets, 2 floor positions -> 2 pairs: the hand-made one is kept, the planner adds the other
   setup([part('A'),part('B'),part('C'),part('F')],[['A',200],['B',200],['C',200],['F',200]]);
   $('containerType').value='Other';$('floorCap').disabled=false;$('contH').disabled=false;$('floorCap').value=2;$('contH').value=269;
   w.manualStack=[{bottom:'solo:C#1',top:'solo:F#1'}];w.renderCalc();
   const st2=w.planStacking();
   ok(st2.pairs.length===2&&st2.pairs.filter(p=>p.manual).length===1&&st2.floorUsed===2,'manual pair kept, the planner adds the second pair: 2 / 2 positions');
   w.manualStackClear();$('shipType').value='40HC';w.syncContFromShipType();
  }

  // ================= 5. overflow -> Stack = Y automatically =================
  {$('autoStackY').checked=true;$('stackPallet').checked=true;
   $('containerType').value='Other';$('floorCap').disabled=false;$('floorCap').value=3;$('contH').disabled=false;$('contH').value=269;
   setup([part('A')],[['A',200*5]]);
   const info=w.autoStackInfo;
   ok(w.allocations.length===3&&w.allocations.every(a=>a.stack==='Y')&&w.planStacking().floorUsed<=3,'5 pallets on 3 positions: Stack = Y is set automatically ('+w.allocations.map(a=>a.stack+':'+a.qtyPallet).join(' ')+') -> '+w.planStacking().floorUsed+' / 3');
   ok(info&&info.models.join()==='A'&&info.fits&&/ระบบตั้งให้อัตโนมัติ/.test($('floorStatus').textContent)&&/Stack = Y/.test($('floorStatus').textContent),'the page says what the system set');
   ok([...d.querySelectorAll('#allocations .stack-select')].every(s=>s.value==='Y')&&$('savePlanBtn').disabled===false,'the Stack column shows Y and Save is allowed');
   // switch off
   $('autoStackY').checked=false;$('stackPallet').checked=false;w.generateAllocations();w.renderCalc();
   ok(w.allocations.every(a=>a.stack==='N')&&w.planStacking().floorUsed>3&&$('savePlanBtn').disabled===true,'switch off (and no 2-high pairing): nothing is changed, the overflow stays and Save is blocked');
   $('autoStackY').checked=true;w.onAutoStackToggle();
   ok(w.allocations.every(a=>a.stack==='Y')&&$('savePlanBtn').disabled===false&&!$('stackPallet').checked,'switch on again: Stack = Y is set; the 2-high pairing is left as the user had it because Stack = Y is enough');
   $('stackPallet').checked=true;
   // two pallets of 155 cm would be 310 cm: Stack = Y is not applied
   setup([part('Z',{palletH:155})],[['Z',200*5]]);
   ok(w.allocations.every(a=>a.stack==='N'),'a pair higher than the container (2 x 155 cm) is NOT set to Stack = Y');
   // a bigger plan: only the Models that are needed are changed
   $('floorCap').value=4;
   setup([part('A'),part('B')],[['A',200*4],['B',200*2]]);
   const yA=w.allocations.filter(a=>a.shipmentModel==='A'&&a.stack==='Y').length,yB=w.allocations.filter(a=>a.shipmentModel==='B'&&a.stack==='Y').length;
   ok(w.planStacking().floorUsed<=4&&yA>0&&yB===0,'A (4 pallets) gets Stack = Y, B (2 pallets) stays N: only as many Models as needed ('+w.planStacking().floorUsed+' / 4)');
   // 20FT is 239 cm high: two 125 cm pallets (250 cm) can not be stacked there - the system must not pretend they can
   $('shipType').value='20FT';w.syncContFromShipType();setup([part('T')],[['T',200*12]]);
   ok(w.allocations.every(a=>a.stack==='N')&&w.planStacking().floorUsed>10&&$('savePlanBtn').disabled===true,'20FT (239 cm): 2 x 125 cm = 250 cm does not fit -> not set to Stack = Y, the overflow is shown and Save is blocked');
   // container changes by Type Shipment: 12 pallets fit a 40HC but not a 20FT
   $('shipType').value='40HC';w.syncContFromShipType();$('autoStackY').checked=true;
   setup([part('A',{palletH:100})],[['A',200*12]]);
   ok(w.allocations.every(a=>a.stack==='N')&&w.planStacking().floorUsed===12,'12 pallets fit the 40HC: nothing is changed');
   $('shipType').value='20FT';w.syncContFromShipType();
   ok($('containerType').value==='20FT'&&w.allocations.some(a=>a.stack==='Y')&&w.planStacking().floorUsed<=10,'Type Shipment -> 20FT (10 positions): Stack = Y is set automatically ('+w.planStacking().floorUsed+' / 10)');
   // a plan opened from the board is never rewritten behind the user's back
   $('autoStackY').checked=true;$('shipType').value='20FT';w.syncContFromShipType();
   $('planId').value='T-OPEN';const po=w.makePlan();w.plans=[po];const snap=JSON.stringify(po.allocations);
   w.newPlan();w.loadPlan('T-OPEN');
   ok(JSON.stringify(w.allocations)===snap,'opening a saved plan does not change its rows');
  }

  ok(errs.length===0,'no script errors ('+errs.join('; ')+')');
  console.log(fail?'\n'+fail+' FAILED':'\nALL PASSED');process.exit(fail?1:0);
},900);
