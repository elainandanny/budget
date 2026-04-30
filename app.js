// ══════════════════════════════════════════════════
// CONFIG — replace with your own values to enable sync
// ══════════════════════════════════════════════════
const SUPABASE_URL = 'https://ykedfxitevfpioplirdy.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ5a2VkZnhpdGV2ZnBpb3BsaXJkeSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzc3NDY0ODIsImV4cCI6MjA5MzA0MDg4Mn0.EmfBzmig_fkITR2Uw5MPxkjvFTzwlevkTzbUCKgwI5o';

// ══════════════════════════════════════════════════
// CATEGORIES
// ══════════════════════════════════════════════════
const CATS = [
  {id:'groceries',   label:'Groceries',      emoji:'🛒', color:'#4a90d9'},
  {id:'household',   label:'Household',      emoji:'🏠', color:'#2eab6f'},
  {id:'health',      label:'Health & Meds',  emoji:'💊', color:'#e05a2b'},
  {id:'dining',      label:'Dining Out',     emoji:'🍽️', color:'#e8c840'},
  {id:'hobbies',     label:'Hobbies',        emoji:'🎯', color:'#9b5de5'},
  {id:'clothing',    label:'Clothing',       emoji:'👗', color:'#f4845f'},
  {id:'gas',         label:'Gas',            emoji:'⛽', color:'#fbbf24'},
  {id:'transport',   label:'Transport',      emoji:'🚗', color:'#60a5fa'},
  {id:'subscriptions',label:'Subscriptions', emoji:'📱', color:'#a78bfa'},
  {id:'utilities',   label:'Utilities',      emoji:'💡', color:'#34d399'},
  {id:'insurance',   label:'Insurance',      emoji:'🛡️', color:'#94a3b8'},
  {id:'housing',     label:'Housing / Rent', emoji:'🏡', color:'#fb923c'},
  {id:'entertainment',label:'Entertainment', emoji:'🎬', color:'#f472b6'},
  {id:'education',   label:'Education',      emoji:'📚', color:'#38bdf8'},
  {id:'gifts',       label:'Gifts',          emoji:'🎁', color:'#e879f9'},
  {id:'travel',      label:'Travel',         emoji:'✈️', color:'#22d3ee'},
  {id:'savings',     label:'Savings',        emoji:'🏦', color:'#86efac'},
  {id:'other',       label:'Other',          emoji:'📦', color:'#6b7280'},
];
const getCat = id => CATS.find(c=>c.id===id) || CATS[CATS.length-1];

// ══════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════
let sb=null, currentUser=null;
let transactions=[], incomeEntries=[], subscriptions=[], goals=[];
let settings={monthly_limit:0,category_budgets:{}};
let dashMonth=new Date();
let splitMode='quick', txType='expense';
let editingSubId=null;
let chartSpending=null, chartCat=null, chartIncome=null;
let chatMessages=[], chatFollowUps=[];

// ══════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════
(async function boot(){
  const demoMode = false;
  if(demoMode){
    loadLocal();
    initUI();
    return;
  }
  try{
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    const {data:{session}} = await sb.auth.getSession();
    if(session){ currentUser=session.user; await loadRemote(); showLoggedIn(); }
    else{ document.getElementById('auth-view').classList.remove('hidden'); document.getElementById('app-view').classList.add('hidden'); }
  }catch(e){ loadLocal(); initUI(); }
})();

function initUI(){
  populateCatDropdowns();
  populateStoreSuggestions();
  setDefaultDates();
  renderAll();
}

function showLoggedIn(){
  document.getElementById('logout-btn').classList.remove('hidden');
  const pill=document.getElementById('sync-status');
  pill.textContent=currentUser.email.split('@')[0];
  pill.classList.add('ok');
  initUI();
}

async function login(){
  const email=document.getElementById('auth-email').value.trim();
  const pass=document.getElementById('auth-password').value;
  const msg=document.getElementById('auth-msg');
  msg.textContent='Logging in…';
  try{
    if(!email||!pass){msg.textContent='Enter email and password.';msg.className='save-msg err';return;}
    const {data,error}=await sb.auth.signInWithPassword({email,password:pass});
    if(error)throw error;
    currentUser=data.user;
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('app-view').classList.remove('hidden');
    await loadRemote(); showLoggedIn();
  }catch(e){msg.textContent=e.message;msg.className='save-msg err';}
}

async function signup(){
  const email=document.getElementById('auth-email').value.trim();
  const pass=document.getElementById('auth-password').value;
  const msg=document.getElementById('auth-msg');
  try{
    if(!email||!pass){msg.textContent='Enter email and password.';msg.className='save-msg err';return;}
    const {error}=await sb.auth.signUp({email,password:pass});
    if(error)throw error;
    msg.textContent='Check your email to confirm!';msg.className='save-msg';
  }catch(e){msg.textContent=e.message;msg.className='save-msg err';}
}

async function logout(){
  if(sb)await sb.auth.signOut();
  currentUser=null; transactions=[]; incomeEntries=[]; subscriptions=[]; goals=[];
  document.getElementById('auth-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

// ══════════════════════════════════════════════════
// DATA
// ══════════════════════════════════════════════════
async function loadRemote(){
  const uid=currentUser.id;
  const [tx,inc,subs,gs,set]=await Promise.all([
    sb.from('transactions').select('*').eq('user_id',uid).order('date',{ascending:false}),
    sb.from('income').select('*').eq('user_id',uid).order('date',{ascending:false}),
    sb.from('subscriptions').select('*').eq('user_id',uid),
    sb.from('goals').select('*').eq('user_id',uid),
    sb.from('settings').select('*').eq('user_id',uid).single(),
  ]);
  transactions=(tx.data||[]).map(r=>({...r,splits:typeof r.splits==='string'?JSON.parse(r.splits):(r.splits||[])}));
  incomeEntries=inc.data||[];
  subscriptions=subs.data||[];
  goals=gs.data||[];
  if(set.data)settings=set.data;
}

function loadLocal(){
  try{
    transactions=JSON.parse(localStorage.getItem('ft_tx')||'[]');
    incomeEntries=JSON.parse(localStorage.getItem('ft_inc')||'[]');
    subscriptions=JSON.parse(localStorage.getItem('ft_subs')||'[]');
    goals=JSON.parse(localStorage.getItem('ft_goals')||'[]');
    settings={monthly_limit:0,category_budgets:{}, ...JSON.parse(localStorage.getItem('ft_settings')||'{"monthly_limit":0,"category_budgets":{}}')};
  }catch(e){}
}

function saveLocal(){
  localStorage.setItem('ft_tx',JSON.stringify(transactions));
  localStorage.setItem('ft_inc',JSON.stringify(incomeEntries));
  localStorage.setItem('ft_subs',JSON.stringify(subscriptions));
  localStorage.setItem('ft_goals',JSON.stringify(goals));
  localStorage.setItem('ft_settings',JSON.stringify(settings));
}

async function persist(table,data){
  if(!sb||!currentUser){saveLocal();return;}
  await sb.from(table).upsert({...data,user_id:currentUser.id});
}

async function del(table,id){
  if(!sb||!currentUser){saveLocal();return;}
  await sb.from(table).delete().eq('id',id).eq('user_id',currentUser.id);
}

// ══════════════════════════════════════════════════
// TABS
// ══════════════════════════════════════════════════
function switchTab(name){
  const names=['dashboard','add','history','budgets','subs','ai'];
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',names[i]===name));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('tab-'+name)?.classList.add('active');
  if(name==='dashboard')renderDashboard();
  if(name==='history')renderHistory();
  if(name==='budgets')renderBudgets();
  if(name==='subs')renderSubs();
  if(name==='ai'&&chatMessages.length===0)initChat();
}

function renderAll(){
  renderDashboard();
  renderRecent();
  renderHistory();
  renderBudgets();
  renderSubs();
}

function setDefaultDates(){
  const today=new Date().toISOString().split('T')[0];
  ['f-date','fi-date','s-next'].forEach(id=>{const el=document.getElementById(id);if(el&&!el.value)el.value=today;});
}

function populateCatDropdowns(){
  const opts=CATS.map(c=>`<option value="${c.id}">${c.emoji} ${c.label}</option>`).join('');
  ['f-cat-quick','s-cat','cat-budget-cat'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=opts;});
  const hc=document.getElementById('hist-cat');
  if(hc)hc.innerHTML='<option value="">All Categories</option>'+opts;
}

function populateStoreSuggestions(){
  const stores=[...new Set(transactions.map(t=>t.store).filter(Boolean))].sort();
  const dl=document.getElementById('store-dl');
  if(dl)dl.innerHTML=stores.map(s=>`<option value="${esc(s)}">`).join('');
}

// ══════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════
function changeMonth(d){dashMonth=new Date(dashMonth.getFullYear(),dashMonth.getMonth()+d,1);renderDashboard();}
function goToNow(){dashMonth=new Date();renderDashboard();}

function renderDashboard(){
  const y=dashMonth.getFullYear(),m=dashMonth.getMonth();
  const label=dashMonth.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  document.getElementById('dash-month-label').textContent=label;
  document.getElementById('dash-cat-month').textContent=label;
  document.getElementById('dash-merch-month').textContent=label;

  const monthTx=txForMonth(y,m);
  const prevTx=txForMonth(y,m-1);
  const monthInc=incForMonth(y,m);
  const spent=netSpent(monthTx);
  const prevSpent=netSpent(prevTx);
  const income=monthInc.reduce((s,i)=>s+parseFloat(i.amount||0),0);
  const saved=income-spent;
  const savePct=income>0?Math.round((saved/income)*100):0;
  const delta=spent-prevSpent;

  document.getElementById('dash-metrics').innerHTML=`
    <div class="metric" style="--accent:var(--danger)">
      <div class="metric-label">Spent</div>
      <div class="metric-value">${fmt(spent)}</div>
      <div class="metric-delta ${delta>0?'up':delta<0?'down':'neutral'}">${delta===0?'—':(delta>0?'▲':'▼')+' '+fmt(Math.abs(delta))+' vs prev'}</div>
    </div>
    <div class="metric" style="--accent:var(--success)">
      <div class="metric-label">Income</div>
      <div class="metric-value">${fmt(income)}</div>
      <div class="metric-sub">${monthInc.length} source${monthInc.length!==1?'s':''}</div>
    </div>
    <div class="metric" style="--accent:var(--blue)">
      <div class="metric-label">Net Saved</div>
      <div class="metric-value" style="color:${saved>=0?'var(--success)':'var(--danger)'}">${saved<0?'-':''}${fmt(Math.abs(saved))}</div>
      <div class="metric-sub">${savePct}% savings rate</div>
    </div>
    <div class="metric" style="--accent:var(--gold)">
      <div class="metric-label">Transactions</div>
      <div class="metric-value" style="font-size:28px;">${monthTx.length}</div>
      <div class="metric-sub">${monthTx.filter(t=>t.is_return).length} return(s)</div>
    </div>`;

  renderSavingsRing(savePct,saved,income,spent);
  renderDashBudget(spent);
  renderCatBreakdown(monthTx);
  renderTopMerchants(monthTx);
  renderInsights(monthTx,prevTx);
  renderCharts(y,m);
}

function txForMonth(y,m){
  const d=new Date(y,m,1); const yy=d.getFullYear(),mm=d.getMonth();
  return transactions.filter(t=>{const td=new Date(t.date+'T12:00:00');return td.getFullYear()===yy&&td.getMonth()===mm;});
}
function incForMonth(y,m){
  const d=new Date(y,m,1); const yy=d.getFullYear(),mm=d.getMonth();
  return incomeEntries.filter(i=>{const td=new Date(i.date+'T12:00:00');return td.getFullYear()===yy&&td.getMonth()===mm;});
}
function netSpent(txArr){return txArr.reduce((s,t)=>s+parseFloat(t.total||0)*(t.is_return?-1:1),0);}

function renderSavingsRing(pct,saved,income,spent){
  const el=document.getElementById('savings-ring-wrap');
  const r=38,circ=2*Math.PI*r,p=Math.max(0,Math.min(100,pct));
  const dash=(p/100)*circ;
  const color=pct>=20?'var(--success)':pct>=10?'var(--gold)':'var(--danger)';
  el.innerHTML=`<div class="savings-ring">
    <svg viewBox="0 0 90 90" width="90" height="90">
      <circle cx="45" cy="45" r="${r}" fill="none" stroke="var(--surface2)" stroke-width="8"/>
      <circle cx="45" cy="45" r="${r}" fill="none" stroke="${color}" stroke-width="8"
        stroke-dasharray="${dash.toFixed(1)} ${(circ-dash).toFixed(1)}" stroke-linecap="round"/>
    </svg>
    <div class="savings-ring-label">${pct}%<span class="savings-ring-sub">saved</span></div>
  </div>
  <div class="savings-stats">
    <div class="savings-stat"><span class="savings-stat-label">Income</span><span class="savings-stat-value text-success">${fmt(income)}</span></div>
    <div class="savings-stat"><span class="savings-stat-label">Expenses</span><span class="savings-stat-value text-danger">${fmt(spent)}</span></div>
    <div class="savings-stat"><span class="savings-stat-label">Net</span><span class="savings-stat-value" style="color:${saved>=0?'var(--success)':'var(--danger)'}">${saved>=0?'+':''}${fmt(saved)}</span></div>
  </div>`;
}

function renderDashBudget(spent){
  const limit=parseFloat(settings.monthly_limit||0);
  const el=document.getElementById('dash-budget');
  if(!limit){el.innerHTML=`<div class="text-muted" style="font-size:13px;">No limit set. <a href="#" onclick="switchTab('budgets');return false;" style="color:var(--gold)">Set one →</a></div>`;return;}
  const pct=Math.min(100,(spent/limit)*100);
  const cls=pct>=100?'over':pct>=80?'warn':'';
  const rem=limit-spent;
  el.innerHTML=`<div class="budget-header"><span class="budget-title">vs Monthly Limit</span><span class="budget-amounts">${fmt(spent)} / ${fmt(limit)}</span></div>
    <div class="budget-bar-wrap"><div class="budget-bar ${cls}" style="width:${pct.toFixed(1)}%"></div></div>
    <div class="budget-pct">${pct.toFixed(0)}% used · ${rem>=0?fmt(rem)+' remaining':fmt(Math.abs(rem))+' OVER budget'}</div>`;
}

function renderCatBreakdown(monthTx){
  const totals={};
  monthTx.forEach(t=>{
    const sign=t.is_return?-1:1;
    if(t.splits&&t.splits.length){
      t.splits.forEach(s=>{totals[s.cat]=(totals[s.cat]||0)+parseFloat(s.amount||0)*sign;});
    } else {
      totals['other']=(totals['other']||0)+parseFloat(t.total||0)*sign;
    }
  });
  const sorted=Object.entries(totals).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const max=sorted[0]?.[1]||1;
  const el=document.getElementById('cat-breakdown');
  if(!sorted.length){el.innerHTML='<div class="empty-state" style="padding:16px;">No spending this month.</div>';return;}
  el.innerHTML=sorted.map(([id,amt])=>{
    const cat=getCat(id);
    return `<div class="category-row">
      <span style="font-size:16px;">${cat.emoji}</span>
      <span class="cat-name">${cat.label}</span>
      <div class="cat-bar-wrap"><div class="cat-bar" style="width:${((amt/max)*100).toFixed(0)}%;background:${cat.color}"></div></div>
      <span class="cat-amount">${fmt(amt)}</span>
    </div>`;
  }).join('');
}

function renderTopMerchants(monthTx){
  const totals={};
  monthTx.forEach(t=>{if(t.store)totals[t.store]=(totals[t.store]||0)+parseFloat(t.total||0)*(t.is_return?-1:1);});
  const sorted=Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const el=document.getElementById('top-merchants');
  if(!sorted.length){el.innerHTML='<div class="empty-state" style="padding:14px;">No merchants yet.</div>';return;}
  el.innerHTML=sorted.map(([store,amt],i)=>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
      <span style="color:var(--muted);min-width:18px;font-family:var(--mono);">${i+1}</span>
      <span style="flex:1;padding:0 10px;font-weight:600;">${esc(store)}</span>
      <span class="mono">${fmt(amt)}</span>
    </div>`
  ).join('');
}

function renderInsights(monthTx,prevTx){
  const insights=[];
  const spent=netSpent(monthTx),prev=netSpent(prevTx);
  if(prev>0){const d=spent-prev,p=Math.abs(Math.round((d/prev)*100));if(Math.abs(d)>10)insights.push({icon:d>0?'📈':'📉',text:`Spent ${fmt(Math.abs(d))} (${p}%) ${d>0?'more':'less'} than last month.`});}
  const catT={};monthTx.forEach(t=>(t.splits||[]).forEach(s=>{catT[s.cat]=(catT[s.cat]||0)+parseFloat(s.amount||0);}));
  const top=Object.entries(catT).sort((a,b)=>b[1]-a[1])[0];
  if(top){const c=getCat(top[0]);insights.push({icon:c.emoji,text:`Biggest category: ${c.label} at ${fmt(top[1])}.`});}
  const rets=monthTx.filter(t=>t.is_return);
  if(rets.length)insights.push({icon:'↩️',text:`${rets.length} return${rets.length>1?'s':''} totaling ${fmt(rets.reduce((s,t)=>s+parseFloat(t.total||0),0))}.`});
  const limit=parseFloat(settings.monthly_limit||0);
  if(limit&&spent>limit)insights.push({icon:'⚠️',text:`You are ${fmt(spent-limit)} over your ${fmt(limit)} monthly budget.`});
  else if(limit&&spent/limit>0.8)insights.push({icon:'🟡',text:`${Math.round((spent/limit)*100)}% of monthly budget used — approaching limit.`});
  if(!insights.length)insights.push({icon:'💡',text:'Add more transactions to see personalized insights.'});
  document.getElementById('smart-insights').innerHTML=insights.map(i=>`<div class="insight"><div class="insight-icon">${i.icon}</div><div>${esc(i.text)}</div></div>`).join('');
}

// ══════════════════════════════════════════════════
// CHARTS
// ══════════════════════════════════════════════════
function renderCharts(y,m){
  const months=[];
  for(let i=11;i>=0;i--){const d=new Date(y,m-i,1);months.push({y:d.getFullYear(),m:d.getMonth(),label:d.toLocaleDateString('en-US',{month:'short'})});}
  const labels=months.map(mo=>mo.label);
  const spentData=months.map(mo=>Math.max(0,netSpent(txForMonth(mo.y,mo.m))));
  const incData=months.map(mo=>incForMonth(mo.y,mo.m).reduce((s,i)=>s+parseFloat(i.amount||0),0));
  const base={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#777',font:{size:10}}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#777',font:{size:10},callback:v=>'$'+v}}}};

  if(chartSpending)chartSpending.destroy();
  chartSpending=new Chart(document.getElementById('chart-spending'),{type:'bar',data:{labels,datasets:[{data:spentData,backgroundColor:'rgba(232,200,64,0.55)',borderColor:'#e8c840',borderWidth:1,borderRadius:5}]},options:base});

  const catT={};txForMonth(y,m).forEach(t=>(t.splits||[]).forEach(s=>{catT[s.cat]=(catT[s.cat]||0)+parseFloat(s.amount||0);}));
  const catE=Object.entries(catT).sort((a,b)=>b[1]-a[1]).slice(0,8);
  if(chartCat)chartCat.destroy();
  chartCat=new Chart(document.getElementById('chart-cat'),{type:'doughnut',data:{labels:catE.map(([id])=>getCat(id).label),datasets:[{data:catE.map(([,v])=>v),backgroundColor:catE.map(([id])=>getCat(id).color),borderWidth:2,borderColor:'#1a1a1f'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#777',font:{size:10},boxWidth:10,padding:7}}}}});

  if(chartIncome)chartIncome.destroy();
  chartIncome=new Chart(document.getElementById('chart-income'),{type:'bar',data:{labels,datasets:[{label:'Income',data:incData,backgroundColor:'rgba(46,171,111,0.55)',borderColor:'#2eab6f',borderWidth:1,borderRadius:4},{label:'Expenses',data:spentData,backgroundColor:'rgba(224,90,43,0.55)',borderColor:'#e05a2b',borderWidth:1,borderRadius:4}]},options:{...base,plugins:{legend:{display:true,labels:{color:'#777',font:{size:10},boxWidth:10}}}}});
}

// ══════════════════════════════════════════════════
// ADD TRANSACTION
// ══════════════════════════════════════════════════
function setTxType(type){
  txType=type;
  ['expense','return','income'].forEach(t=>document.getElementById('mode-'+t)?.classList.toggle('active',t===type));
  document.getElementById('expense-form').classList.toggle('hidden',type==='income');
  document.getElementById('income-form').classList.toggle('hidden',type!=='income');
  document.getElementById('return-link-wrap').classList.toggle('hidden',type!=='return');
  document.getElementById('expense-form-title').textContent=type==='return'?'Log Return':'New Expense';
  if(type==='return')populateReturnLink();
}

function populateReturnLink(){
  const sel=document.getElementById('f-return-link');
  const opts=transactions.filter(t=>!t.is_return).slice(0,60).map(t=>
    `<option value="${t.id}">${t.date} — ${esc(t.store||'Unknown')} — ${fmt(t.total)}</option>`
  ).join('');
  sel.innerHTML='<option value="">— No link (simple return) —</option>'+opts;
}

function setSplitMode(mode){
  splitMode=mode;
  document.getElementById('split-quick-btn').classList.toggle('active',mode==='quick');
  document.getElementById('split-split-btn').classList.toggle('active',mode==='split');
  document.getElementById('split-quick').classList.toggle('hidden',mode!=='quick');
  document.getElementById('split-detail').classList.toggle('hidden',mode!=='split');
  if(mode==='split'&&document.getElementById('split-lines').children.length===0){addSplitLine();addSplitLine();}
}

function addSplitLine(){
  const container=document.getElementById('split-lines');
  const catOpts=CATS.map(c=>`<option value="${c.id}">${c.emoji} ${c.label}</option>`).join('');
  const div=document.createElement('div');
  div.className='split-line';
  div.innerHTML=`<select class="form-select" data-role="cat" onchange="updateTally()">${catOpts}</select>
    <input class="form-input" type="number" step="0.01" placeholder="$0.00" data-role="amt" oninput="updateTally()"/>
    <button class="split-remove" onclick="this.closest('.split-line').remove();updateTally()" title="Remove">×</button>`;
  container.appendChild(div);
  updateTally();
}

function updateTally(){
  const total=parseFloat(document.getElementById('f-total').value||0);
  let alloc=0;
  document.querySelectorAll('#split-lines [data-role="amt"]').forEach(el=>{alloc+=parseFloat(el.value||0);});
  const rem=total-alloc;
  const allocEl=document.getElementById('tally-alloc');
  const remEl=document.getElementById('tally-rem');
  if(allocEl)allocEl.textContent=fmt(alloc);
  if(remEl){
    remEl.textContent=`Remaining: ${fmt(Math.abs(rem))}${rem<0?' OVER':''}`;
    remEl.className='tally-rem '+(Math.abs(rem)<0.02?'zero':rem<0?'over':'ok');
  }
}

async function saveTransaction(){
  const store=(document.getElementById('f-store').value||'').trim();
  const total=parseFloat(document.getElementById('f-total').value||0);
  const date=document.getElementById('f-date').value;
  const payment=document.getElementById('f-payment').value;
  const notes=document.getElementById('f-notes').value.trim();
  const msgEl=document.getElementById('save-msg');

  if(!date||!total){showMsg(msgEl,'Date and amount required.',true);return;}

  let splits=[];
  if(splitMode==='quick'){
    splits=[{cat:document.getElementById('f-cat-quick').value,subcat:document.getElementById('f-subcat').value.trim(),amount:total}];
  } else {
    document.querySelectorAll('#split-lines .split-line').forEach(l=>{
      const cat=l.querySelector('[data-role="cat"]').value;
      const amt=parseFloat(l.querySelector('[data-role="amt"]').value||0);
      if(amt>0)splits.push({cat,subcat:'',amount:amt});
    });
    const allocTotal=splits.reduce((s,sp)=>s+sp.amount,0);
    if(Math.abs(allocTotal-total)>0.06){showMsg(msgEl,`Split total (${fmt(allocTotal)}) ≠ amount (${fmt(total)}).`,true);return;}
  }

  const is_return=txType==='return';
  const linked_id=is_return?(document.getElementById('f-return-link').value||null):null;
  const tx={id:genId(),date,store,total,splits,payment,notes,is_return,linked_id,created_at:new Date().toISOString()};

  transactions.unshift(tx);
  document.getElementById('save-btn').disabled=true;
  showMsg(msgEl,'Saving…');
  await persist('transactions',{...tx,splits:JSON.stringify(tx.splits)});
  showMsg(msgEl,is_return?'Return logged ↩️':'Saved ✓');
  document.getElementById('save-btn').disabled=false;
  clearForm();renderAll();populateStoreSuggestions();
}

function clearForm(){
  ['f-store','f-total','f-notes','f-subcat'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('f-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('split-lines').innerHTML='';
  setSplitMode('quick');setTxType('expense');
}

async function saveIncome(){
  const date=document.getElementById('fi-date').value;
  const source=document.getElementById('fi-source').value.trim();
  const amount=parseFloat(document.getElementById('fi-amount').value||0);
  const type=document.getElementById('fi-type').value;
  const notes=document.getElementById('fi-notes').value.trim();
  const msgEl=document.getElementById('income-msg');
  if(!date||!amount){showMsg(msgEl,'Date and amount required.',true);return;}
  const entry={id:genId(),date,source,amount,type,notes,created_at:new Date().toISOString()};
  incomeEntries.unshift(entry);
  await persist('income',entry);
  showMsg(msgEl,'Income logged ✓');
  ['fi-source','fi-amount','fi-notes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderAll();
}

// ══════════════════════════════════════════════════
// RECENT
// ══════════════════════════════════════════════════
function renderRecent(){
  const el=document.getElementById('recent-list');
  const recent=transactions.slice(0,5);
  if(!recent.length){el.innerHTML='<div class="empty-state" style="padding:16px;">No transactions yet.</div>';return;}
  el.innerHTML=recent.map(t=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
    <span style="color:var(--muted);font-family:var(--mono);font-size:11px;">${t.date}</span>
    <span style="flex:1;padding:0 10px;font-weight:600;">${esc(t.store||'—')} ${(t.splits||[]).slice(0,3).map(s=>getCat(s.cat).emoji).join('')}</span>
    <span class="mono ${t.is_return?'text-muted':''}">${t.is_return?'-':''}${fmt(t.total)}</span>
  </div>`).join('');
}

// ══════════════════════════════════════════════════
// HISTORY
// ══════════════════════════════════════════════════
function renderHistory(){
  const search=(document.getElementById('hist-search')?.value||'').toLowerCase();
  const cat=document.getElementById('hist-cat')?.value||'';
  const month=document.getElementById('hist-month')?.value||'';

  let filtered=transactions.filter(t=>{
    if(search&&!t.store?.toLowerCase().includes(search)&&!t.notes?.toLowerCase().includes(search))return false;
    if(cat&&!(t.splits||[]).some(s=>s.cat===cat))return false;
    if(month&&!t.date?.startsWith(month))return false;
    return true;
  });

  const net=filtered.reduce((s,t)=>s+parseFloat(t.total||0)*(t.is_return?-1:1),0);
  document.getElementById('hist-summary').textContent=`${filtered.length} transaction${filtered.length!==1?'s':''} · ${fmt(net)} net`;

  const el=document.getElementById('hist-list');
  if(!filtered.length){el.innerHTML='<div class="empty-state"><div class="empty-state-icon">📭</div>No transactions found.</div>';return;}
  el.innerHTML=filtered.map(t=>renderTxItem(t)).join('');
}

function renderTxItem(t){
  const splits=(t.splits||[]);
  const catDots=splits.slice(0,5).map(s=>`<span class="cat-dot" style="background:${getCat(s.cat).color}"></span>`).join('');
  const catNames=splits.map(s=>getCat(s.cat).label).join(', ');
  const linked=t.linked_id?transactions.find(tx=>tx.id===t.linked_id):null;
  const linkedRets=transactions.filter(tx=>tx.linked_id===t.id&&tx.is_return);

  return `<div class="tx-item ${t.is_return?'is-return':''}" onclick="toggleTx(this)" data-id="${t.id}">
    <div class="tx-date">${t.date?.slice(5)||''}</div>
    <div>
      <div class="tx-store">${esc(t.store||'—')} ${t.is_return?'<span class="return-badge">↩ Return</span>':''}</div>
      <div class="tx-cats-row">${catDots}<span style="margin-left:2px;">${esc(catNames||'—')}</span></div>
    </div>
    <div class="tx-amount ${t.is_return?'ret':''}">${t.is_return?'-':''}${fmt(t.total)}</div>

    <div class="tx-detail">
      <div style="margin-bottom:10px;">
        ${splits.map(s=>`<div class="tx-split-row">
          <div class="tx-split-cat"><span class="cat-dot" style="background:${getCat(s.cat).color}"></span>${getCat(s.cat).emoji} ${getCat(s.cat).label}${s.subcat?' · <span style="color:var(--muted)">'+esc(s.subcat)+'</span>':''}</div>
          <span class="mono">${fmt(s.amount)}</span>
        </div>`).join('')}
      </div>
      ${t.notes?`<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">📝 ${esc(t.notes)}</div>`:''}
      ${t.payment?`<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">💳 ${esc(t.payment)}</div>`:''}
      ${linked?`<div class="tx-linked">🔗 Linked to: ${esc(linked.store||'—')} on ${linked.date} (${fmt(linked.total)})</div>`:''}
      ${linkedRets.length?`<div class="tx-linked">↩️ ${linkedRets.length} linked return${linkedRets.length>1?'s':''}: ${linkedRets.map(r=>fmt(r.total)).join(', ')}</div>`:''}
      <div class="tx-actions">
        <button class="btn btn-ghost btn-sm" onclick="logReturnFor('${t.id}');event.stopPropagation();">↩️ Log Return</button>
        <button class="btn btn-danger btn-sm" onclick="deleteTx('${t.id}');event.stopPropagation();">Delete</button>
      </div>
    </div>
  </div>`;
}

function toggleTx(el){el.classList.toggle('expanded');}

function logReturnFor(txId){
  switchTab('add');setTxType('return');
  setTimeout(()=>{const sel=document.getElementById('f-return-link');if(sel)sel.value=txId;},80);
}

async function deleteTx(id){
  if(!confirm('Delete this transaction?'))return;
  transactions=transactions.filter(t=>t.id!==id);
  await del('transactions',id);
  renderAll();
}

function clearHistFilters(){
  ['hist-search','hist-month'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('hist-cat').value='';
  renderHistory();
}

function exportCSV(){
  const rows=[['Date','Store','Total','Is Return','Linked ID','Categories','Payment','Notes']];
  transactions.forEach(t=>{
    const cats=(t.splits||[]).map(s=>`${getCat(s.cat).label}:${t.is_return?'-':''}${fmt(s.amount)}`).join('; ');
    rows.push([t.date,t.store||'',t.total,t.is_return?'Yes':'No',t.linked_id||'',cats,t.payment||'',t.notes||'']);
  });
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=`finance-${new Date().toISOString().slice(0,10)}.csv`;a.click();
}

// ══════════════════════════════════════════════════
// BUDGETS & GOALS
// ══════════════════════════════════════════════════
function renderBudgets(){
  const now=new Date();
  const monthTx=txForMonth(now.getFullYear(),now.getMonth());
  const spent=netSpent(monthTx);
  const limit=parseFloat(settings.monthly_limit||0);
  const el=document.getElementById('budget-overview');

  if(!limit){
    el.innerHTML='<div class="text-muted" style="font-size:13px;">Set a limit below to track spending.</div>';
  } else {
    const pct=Math.min(100,(spent/limit)*100);
    const cls=pct>=100?'over':pct>=80?'warn':'';
    el.innerHTML=`<div class="budget-header">
      <span class="budget-title">${now.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</span>
      <span class="budget-amounts">${fmt(spent)} / ${fmt(limit)}</span>
    </div>
    <div class="budget-bar-wrap"><div class="budget-bar ${cls}" style="width:${pct.toFixed(1)}%"></div></div>
    <div class="budget-pct">${pct.toFixed(0)}% used · ${limit-spent>=0?fmt(limit-spent)+' remaining':fmt(Math.abs(limit-spent))+' over'}</div>`;
  }

  const budgetInput=document.getElementById('budget-input');
  if(budgetInput&&!budgetInput.value&&limit)budgetInput.value=limit;

  renderCategoryBudgets(monthTx);

  // Income this month
  const monthInc=incForMonth(now.getFullYear(),now.getMonth());
  const totalInc=monthInc.reduce((s,i)=>s+parseFloat(i.amount||0),0);
  document.getElementById('income-summary-bar').innerHTML=`<div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px;">
    <span class="text-muted">Total income this month</span><span class="mono text-success">${fmt(totalInc)}</span></div>`;

  const incEl=document.getElementById('income-list');
  const allInc=incomeEntries.slice(0,12);
  if(!allInc.length){incEl.innerHTML='<div class="empty-state" style="padding:14px;">No income logged yet.</div>';}
  else incEl.innerHTML=allInc.map(i=>`<div class="income-row">
    <div><div class="income-name">${esc(i.source||'Income')}</div><div class="income-sub">${i.date} · ${i.type||''}</div></div>
    <div style="display:flex;align-items:center;gap:10px;">
      <span class="income-amount">${fmt(i.amount)}</span>
      <button class="btn btn-danger btn-sm" onclick="deleteIncome('${i.id}')">✕</button>
    </div></div>`).join('');

  renderGoals();
  renderHeatmap();
}

function getCategoryTotals(txArr){
  const totals={};
  txArr.forEach(t=>{
    const sign=t.is_return?-1:1;
    (t.splits||[]).forEach(s=>{
      totals[s.cat]=(totals[s.cat]||0)+parseFloat(s.amount||0)*sign;
    });
  });
  return totals;
}

function renderCategoryBudgets(monthTx){
  if(!settings.category_budgets)settings.category_budgets={};
  const list=document.getElementById('category-budget-list');
  if(!list)return;
  const budgets=settings.category_budgets||{};
  const totals=getCategoryTotals(monthTx);
  const entries=Object.entries(budgets).filter(([,limit])=>parseFloat(limit)>0);

  if(!entries.length){
    list.innerHTML='<div class="empty-state" style="padding:14px;">No category budgets set yet.</div>';
    return;
  }

  list.innerHTML=entries.map(([catId,limit])=>{
    const cat=getCat(catId);
    const spent=Math.max(0,parseFloat(totals[catId]||0));
    const pct=limit>0?Math.min(100,(spent/limit)*100):0;
    const cls=pct>=100?'over':pct>=80?'warn':'';
    const remaining=limit-spent;
    return `<div style="margin-bottom:14px;">
      <div class="budget-header">
        <span class="budget-title">${cat.emoji} ${cat.label}</span>
        <span class="budget-amounts">${fmt(spent)} / ${fmt(limit)}</span>
      </div>
      <div class="budget-bar-wrap"><div class="budget-bar ${cls}" style="width:${pct.toFixed(1)}%;background:${cls?'':cat.color}"></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--muted);font-family:var(--mono);">
        <span>${pct.toFixed(0)}% used · ${remaining>=0?fmt(remaining)+' left':fmt(Math.abs(remaining))+' over'}</span>
        <button class="btn btn-danger btn-sm" style="height:26px;padding:0 8px;" onclick="deleteCategoryBudget('${catId}')">Remove</button>
      </div>
    </div>`;
  }).join('');
}

async function saveBudgetLimit(){
  const msgEl=document.getElementById('budget-msg');
  const value=parseFloat(document.getElementById('budget-input').value);
  if(!Number.isFinite(value)||value<0){
    showMsg(msgEl,'Enter a valid budget amount.',true);
    return;
  }
  settings.monthly_limit=value;
  if(!settings.category_budgets)settings.category_budgets={};
  await persist('settings',settings);
  showMsg(msgEl,'Limit saved!');
  renderAll();
}

async function saveCategoryBudget(){
  const msgEl=document.getElementById('cat-budget-msg');
  const catId=document.getElementById('cat-budget-cat').value;
  const amount=parseFloat(document.getElementById('cat-budget-amount').value);
  if(!catId||!Number.isFinite(amount)||amount<0){
    showMsg(msgEl,'Enter a valid category budget.',true);
    return;
  }
  if(!settings.category_budgets)settings.category_budgets={};
  if(amount===0)delete settings.category_budgets[catId];
  else settings.category_budgets[catId]=amount;
  await persist('settings',settings);
  document.getElementById('cat-budget-amount').value='';
  showMsg(msgEl,amount===0?'Category budget removed.':'Category budget saved!');
  renderAll();
}

async function deleteCategoryBudget(catId){
  if(!settings.category_budgets)return;
  delete settings.category_budgets[catId];
  await persist('settings',settings);
  renderAll();
}

async function deleteIncome(id){
  if(!confirm('Delete?'))return;
  incomeEntries=incomeEntries.filter(i=>i.id!==id);
  await del('income',id);renderAll();
}

let goalFormOpen=false;
function toggleGoalForm(){
  goalFormOpen=!goalFormOpen;
  document.getElementById('goal-form').classList.toggle('hidden',!goalFormOpen);
}

async function saveGoal(){
  const name=document.getElementById('g-name').value.trim();
  const target=parseFloat(document.getElementById('g-target').value||0);
  const current=parseFloat(document.getElementById('g-current').value||0);
  const date=document.getElementById('g-date').value;
  const msgEl=document.getElementById('goal-msg');
  if(!name||!Number.isFinite(target)||target<=0){showMsg(msgEl,'Name and target greater than 0 required.',true);return;}
  if(!Number.isFinite(current)||current<0){showMsg(msgEl,'Saved amount must be 0 or more.',true);return;}
  const goal={id:genId(),name,target,current,target_date:date};
  goals.push(goal);
  await persist('goals',goal);
  showMsg(msgEl,'Goal saved 🎯');
  toggleGoalForm();
  renderGoals();
}

function renderGoals(){
  const el=document.getElementById('goals-list');
  if(!goals.length){el.innerHTML='<div class="empty-state" style="padding:14px;">No goals yet.</div>';return;}
  el.innerHTML=goals.map(g=>{
    const pct=Math.min(100,(g.current/g.target)*100);
    const rem=g.target-g.current;
    return `<div class="goal-item">
      <div class="budget-header"><span class="budget-title">🎯 ${esc(g.name)}</span><span class="budget-amounts">${fmt(g.current)} / ${fmt(g.target)}</span></div>
      <div class="budget-bar-wrap"><div class="budget-bar" style="width:${pct.toFixed(0)}%;background:var(--blue)"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:4px;">
        <span>${pct.toFixed(0)}%${g.target_date?' · Target: '+g.target_date:''}</span>
        <span>${fmt(rem)} to go</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button class="btn btn-ghost btn-sm" onclick="updateGoalProgress('${g.id}')">Update Progress</button>
        <button class="btn btn-danger btn-sm" onclick="deleteGoal('${g.id}')">Delete</button>
      </div>
    </div>`;
  }).join('<hr class="divider">');
}

async function updateGoalProgress(id){
  const g=goals.find(g=>g.id===id);if(!g)return;
  const val=prompt(`Current saved for "${g.name}":`,g.current);
  if(val===null)return;
  g.current=parseFloat(val)||0;
  await persist('goals',g);renderGoals();
}

async function deleteGoal(id){
  if(!confirm('Delete goal?'))return;
  goals=goals.filter(g=>g.id!==id);await del('goals',id);renderGoals();
}

function renderHeatmap(){
  const year=new Date().getFullYear();
  document.getElementById('heatmap-year').textContent=year;
  const monthAmts=Array.from({length:12},(_,i)=>Math.max(0,netSpent(txForMonth(year,i))));
  const max=Math.max(...monthAmts,1);
  const el=document.getElementById('heatmap-grid');
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  el.innerHTML=monthAmts.map((amt,i)=>{
    const p=amt/max;
    const bg=p>0?`rgba(232,200,64,${(0.15+p*0.85).toFixed(2)})`:'var(--surface2)';
    return `<div class="heatmap-cell" style="background:${bg}" title="${months[i]}: ${fmt(amt)}"></div>`;
  }).join('');
}

// ══════════════════════════════════════════════════
// SUBSCRIPTIONS
// ══════════════════════════════════════════════════
function subMonthly(sub){
  const amt=parseFloat(sub.amount||0);
  if(sub.cycle==='monthly')return amt;
  if(sub.cycle==='annual')return amt/12;
  if(sub.cycle==='weekly')return amt*4.33;
  if(sub.cycle==='quarterly')return amt/3;
  return amt;
}

function renderSubs(){
  const monthly=subscriptions.reduce((s,sub)=>s+subMonthly(sub),0);
  document.getElementById('sub-monthly').textContent=fmt(monthly);
  document.getElementById('sub-annual').textContent=fmt(monthly*12);

  const grid=document.getElementById('sub-grid');
  if(!subscriptions.length){grid.innerHTML='<div class="empty-state"><div class="empty-state-icon">📱</div>No subscriptions yet.</div>';return;}
  grid.innerHTML=subscriptions.map(s=>{
    const cat=getCat(s.cat);
    const nextDate=s.next_date?new Date(s.next_date+'T12:00:00'):null;
    const daysUntil=nextDate?Math.ceil((nextDate-new Date())/86400000):null;
    const urgentStyle=daysUntil!==null&&daysUntil<=7?'color:var(--danger)':'color:var(--muted)';
    return `<div class="sub-card">
      <div class="sub-actions-btns">
        <button class="btn btn-ghost btn-sm" style="height:28px;padding:0 8px;" onclick="editSub('${s.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" style="height:28px;padding:0 8px;" onclick="deleteSub('${s.id}')">✕</button>
      </div>
      <div class="sub-card-name">${esc(s.name)}</div>
      <div class="sub-card-amount">${fmt(s.amount)}</div>
      <div class="sub-card-cycle">${s.cycle} · ${fmt(subMonthly(s))}/mo</div>
      <div class="sub-card-cat">${cat.emoji} ${cat.label}</div>
      ${daysUntil!==null?`<div class="sub-card-next" style="${urgentStyle}">Next: ${s.next_date} (${daysUntil>=0?'in '+daysUntil+'d':'overdue'})</div>`:''}
    </div>`;
  }).join('');

  const creepEl=document.getElementById('sub-creep');
  if(monthly>150)creepEl.innerHTML=`<div class="insight" style="margin-top:0;"><div class="insight-icon">📊</div><div>Your ${subscriptions.length} subscriptions cost <strong>${fmt(monthly)}/mo</strong> (${fmt(monthly*12)}/yr). Review for services you may not use.</div></div>`;
  else creepEl.innerHTML='';
}

async function saveSubscription(){
  const name=document.getElementById('s-name').value.trim();
  const amount=parseFloat(document.getElementById('s-amount').value||0);
  const cycle=document.getElementById('s-cycle').value;
  const cat=document.getElementById('s-cat').value;
  const next=document.getElementById('s-next').value;
  const msgEl=document.getElementById('sub-msg');
  if(!name||!amount){showMsg(msgEl,'Name and amount required.',true);return;}

  if(editingSubId){
    const sub=subscriptions.find(s=>s.id===editingSubId);
    Object.assign(sub,{name,amount,cycle,cat,next_date:next});
    await persist('subscriptions',sub);
    editingSubId=null;
    document.getElementById('sub-form-title').textContent='Add Subscription';
    document.getElementById('sub-save-btn').textContent='Add Subscription';
    document.getElementById('sub-cancel-btn').classList.add('hidden');
  } else {
    const sub={id:genId(),name,amount,cycle,cat,next_date:next};
    subscriptions.push(sub);await persist('subscriptions',sub);
  }
  showMsg(msgEl,'Saved!');
  ['s-name','s-amount','s-next'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderSubs();
}

function editSub(id){
  const s=subscriptions.find(s=>s.id===id);if(!s)return;
  editingSubId=id;
  document.getElementById('s-name').value=s.name;
  document.getElementById('s-amount').value=s.amount;
  document.getElementById('s-cycle').value=s.cycle;
  document.getElementById('s-cat').value=s.cat;
  document.getElementById('s-next').value=s.next_date||'';
  document.getElementById('sub-form-title').textContent='Edit Subscription';
  document.getElementById('sub-save-btn').textContent='Update';
  document.getElementById('sub-cancel-btn').classList.remove('hidden');
}

function cancelSubEdit(){
  editingSubId=null;
  ['s-name','s-amount','s-next'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('sub-form-title').textContent='Add Subscription';
  document.getElementById('sub-save-btn').textContent='Add Subscription';
  document.getElementById('sub-cancel-btn').classList.add('hidden');
}

async function deleteSub(id){
  if(!confirm('Remove subscription?'))return;
  subscriptions=subscriptions.filter(s=>s.id!==id);
  await del('subscriptions',id);renderSubs();
}

// ══════════════════════════════════════════════════
// AI CHAT
// ══════════════════════════════════════════════════
function initChat(){
  chatMessages=[{role:'system',content:'Ask me anything about your finances!'}];
  renderChat();
}

function handleChatKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();askAI();}}

async function askAI(){
  const input=document.getElementById('chat-q');
  const btn=document.getElementById('chat-btn');
  const q=(input?.value||'').trim();
  if(!q)return;
  chatMessages.push({role:'user',content:q});
  input.value='';btn.disabled=true;btn.textContent='…';chatFollowUps=[];
  const thinking={role:'assistant',content:'__thinking__'};
  chatMessages.push(thinking);renderChat();

  try{
    const systemPrompt=`You are a personal finance assistant. The user's financial data:
${buildContext()}
Answer clearly and conversationally. Use specific numbers. Do not use "Summary:" or "Details:" labels. Format dollar amounts with $ signs.`;

    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',max_tokens:1000,
        system:systemPrompt,
        messages:chatMessages.filter(m=>m.role!=='system'&&m.content!=='__thinking__').map(m=>({role:m.role,content:m.content}))
      })
    });
    const data=await res.json();
    thinking.content=data?.content?.[0]?.text||'Could not generate a response.';
    genFollowUps(q,thinking.content);
  }catch(e){thinking.content='Unable to connect to AI. Please check configuration.';}

  btn.disabled=false;btn.textContent='Send';
  chatMessages[chatMessages.length-1]=thinking;renderChat();
}

function buildContext(){
  const now=new Date();
  const mTx=txForMonth(now.getFullYear(),now.getMonth());
  const mInc=incForMonth(now.getFullYear(),now.getMonth());
  const spent=netSpent(mTx);
  const income=mInc.reduce((s,i)=>s+parseFloat(i.amount||0),0);
  const catT={};transactions.forEach(t=>(t.splits||[]).forEach(s=>{catT[s.cat]=(catT[s.cat]||0)+parseFloat(s.amount||0)*(t.is_return?-1:1);}));
  const topStores={};transactions.forEach(t=>{if(t.store)topStores[t.store]=(topStores[t.store]||0)+parseFloat(t.total||0)*(t.is_return?-1:1);});
  return `Month: ${now.toLocaleDateString('en-US',{month:'long',year:'numeric'})}
Spent this month: $${spent.toFixed(2)} | Income: $${income.toFixed(2)} | Budget limit: $${settings.monthly_limit||'not set'}
Total transactions: ${transactions.length} | Returns: ${transactions.filter(t=>t.is_return).length}
Subscriptions: ${subscriptions.length} (~$${subscriptions.reduce((s,sub)=>s+subMonthly(sub),0).toFixed(2)}/mo)
Top categories all-time: ${Object.entries(catT).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,v])=>`${getCat(id).label}:$${v.toFixed(0)}`).join(', ')}
Top stores all-time: ${Object.entries(topStores).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([s,v])=>`${s}:$${v.toFixed(0)}`).join(', ')}
Recent: ${transactions.slice(0,8).map(t=>`${t.date} ${t.store||'?'} $${t.total}${t.is_return?' (return)':''}`).join('; ')}`;
}

async function genFollowUps(q,answer){
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:200,
        messages:[{role:'user',content:`Finance Q&A follow-ups. Give 3 short questions (under 8 words). JSON array only, no markdown.
Q: ${q}
A: ${answer.slice(0,200)}`}]})
    });
    const data=await res.json();
    const text=data?.content?.[0]?.text||'[]';
    const match=text.match(/\[[\s\S]*\]/);
    if(match){chatFollowUps=JSON.parse(match[0]).slice(0,3).map(s=>String(s).trim());renderChat();}
  }catch(e){}
}

function renderChat(){
  const win=document.getElementById('chat-window');if(!win)return;
  const lastIdx=[...chatMessages].map((m,i)=>({m,i})).filter(({m})=>m.role==='assistant'&&m.content&&m.content!=='__thinking__').pop()?.i??-1;
  win.innerHTML=chatMessages.map((m,idx)=>{
    if(m.role==='system')return `<div class="chat-msg system">${esc(m.content)}</div>`;
    const thinking=m.content==='__thinking__';
    const bubble=thinking?`<div class="chat-thinking"><span></span><span></span><span></span></div>`:fmtChat(m.content,m.role);
    const isLast=idx===lastIdx;
    const fups=isLast&&chatFollowUps.length?`<div class="chat-followups">${chatFollowUps.map(q=>`<button class="chat-followup" data-hint="${esc(q)}">${esc(q)}</button>`).join('')}</div>`:'';
    return `<div class="chat-bubble-wrap ${m.role}"><div class="chat-label">${m.role==='user'?'You':'AI'}</div><div class="chat-msg ${m.role}">${bubble}</div>${fups}</div>`;
  }).join('');
  win.scrollTop=win.scrollHeight;
}

function fmtChat(text,role){
  if(role!=='assistant')return esc(text);

  let t=text.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  t=t.replace(/(Summary|Details)\s*:\s*/gi,'');
  t=t.replace(/^[-*_]{3,}\s*$/gm,'');
  t=t.replace(/([^\n])\n([^\n])/g,'$1\n\n$2');
  t=t.replace(/\n{3,}/g,'\n\n');

  return t.trim().split(/\n{2,}/).map(block=>{
    const trimmed=block.trim();
    if(!trimmed)return'';
    const lines=trimmed.split('\n');
    const isList=lines.length>1&&lines.every(l=>/^\s*([•●\-*]|\d+[.):])/.test(l));

    if(isList)return`<ul style="margin:4px 0 8px 16px;display:flex;flex-direction:column;gap:4px;">${lines.map(l=>`<li>${esc(l.replace(/^\s*([•●\-*]|\d+[.):]\s*)/,'').trim()).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/(\$[\d,]+(?:\.\d+)?)/g,'<strong style="color:var(--gold)">$1</strong>')}</li>`).join('')}</ul>`;

    return`<p>${esc(trimmed).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/(\$[\d,]+(?:\.\d+)?)/g,'<strong style="color:var(--gold)">$1</strong>')}</p>`;
  }).join('');
}

// ══════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════
function fmt(n){const v=parseFloat(n)||0;const sign=v<0?'-':'';return sign+'$'+Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function genId(){return Date.now().toString(36)+Math.random().toString(36).slice(2);}
function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function showMsg(el,msg,isErr=false){if(!el)return;el.textContent=msg;el.className='save-msg'+(isErr?' err':'');if(!isErr)setTimeout(()=>{el.textContent='';},3000);}

document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-hint]');
  if(btn){const hint=btn.getAttribute('data-hint');if(hint){const inp=document.getElementById('chat-q');if(inp)inp.value=hint;askAI();}}
});
