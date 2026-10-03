// All data is saved in the browser (localStorage). Nothing is sent to a server.
const KEY='vaultcore-v3',C=2*Math.PI*44,$=s=>document.querySelector(s);
const uid=()=>Math.random().toString(36).slice(2,9);
const blank=()=>({extra:0,assets:[],debts:[],cores:[]});
const sample=()=>({extra:100,assets:[{id:uid(),name:'Checking account',value:4200},{id:uid(),name:'Savings account',value:12000},{id:uid(),name:'Retirement (401k)',value:38000}],
debts:[{id:uid(),name:'Student loan',balance:18000,apr:5.5,min:220},{id:uid(),name:'Credit card',balance:3200,apr:22.9,min:90}],
cores:[{id:uid(),name:'New car',type:'goal',target:15000,amount:1000,monthly:400},{id:uid(),name:'Groceries this month',type:'budget',target:600,amount:180}]});
let S=load(),tab='home',prev={},armed=null,note={};
function load(){try{const s=localStorage.getItem(KEY);if(s)return JSON.parse(s)}catch(e){}return blank()}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
const fmt=n=>(n<0?'-':'')+'$'+Math.round(Math.abs(n)).toLocaleString();
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sum=(a,k)=>a.reduce((t,x)=>t+(+x[k]||0),0);
const dateIn=m=>{const d=new Date();d.setMonth(d.getMonth()+m);return d.toLocaleDateString(undefined,{month:'long',year:'numeric'})};
const level=c=>c.type==='goal'?Math.min(1,c.amount/c.target):Math.max(0,Math.min(1,(c.target-c.amount)/c.target));
const tone=(c,p)=>c.type==='goal'?(p>=1?'done':''):(p>.5?'':p>.2?'warn':'bad');
function ring(p0,p){return `<svg viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="44" fill="none" stroke="var(--line)" stroke-width="10"/><circle class="arc" data-t="${C*(1-p)}" cx="55" cy="55" r="44" fill="none" stroke="var(--glow)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-p0)}" transform="rotate(-90 55 55)"/><text x="55" y="62" text-anchor="middle" font-size="22" font-weight="800" fill="var(--ink)" font-family="Nunito,sans-serif">${Math.round(p*100)}%</text></svg>`}
function sim(extra,method){
const d=S.debts.map(x=>({b:+x.balance,r:+x.apr||0,m:+x.min})),budget=sum(S.debts,'min')+extra;let n=0,int=0;
while(d.some(x=>x.b>.005)&&n<600){n++;
d.forEach(x=>{if(x.b>0){const i=x.b*x.r/1200;x.b+=i;int+=i}});
let left=budget;d.forEach(x=>{if(x.b>0){const p=Math.min(x.b,x.m);x.b-=p;left-=p}});
const o=d.filter(x=>x.b>.005).sort(method==='av'?(a,b)=>b.r-a.r:(a,b)=>a.b-b.b);
for(const x of o){if(left<=0)break;const p=Math.min(x.b,left);x.b-=p;left-=p}}
return{n,int,ok:n<600}}
const del=(id)=>`<button class="ghost" data-a="del" data-id="${id}">${armed===id?'Tap again to confirm':'Remove'}</button>`;
function vHome(){
const A=sum(S.assets,'value'),D=sum(S.debts,'balance'),nw=A-D,empty=!S.assets.length&&!S.debts.length&&!S.cores.length;
const start=empty?`<div class="tip"><b>Welcome! Here's how to start.</b><ol><li>Add the money you have below (bank accounts, savings).</li><li>Add anything you owe on the Debts tab.</li><li>Pick something to save for on the Goals tab.</li></ol><button class="ghost" data-a="sample">Show me an example first</button></div>`:'';
const hero=empty?'':`<div class="hero"><p class="kind">If you added it all up</p><p class="big ${nw<0?'neg':''}">${fmt(nw)}</p><p class="kind">That's what you have, minus what you owe.</p>
<div class="two"><div><span class="kind">You have</span><b>${fmt(A)}</b></div><div><span class="kind">You owe</span><b>${fmt(D)}</b></div></div></div>`;
return `${start}${hero}<h3>What you have</h3><p class="sub">Update these whenever your balances change.</p>
${S.assets.map(a=>`<div class="li"><span>${esc(a.name)}</span><input type="number" inputmode="decimal" data-f="value" data-id="${a.id}" value="${a.value}" aria-label="${esc(a.name)} amount">${del(a.id)}</div>`).join('')||'<p class="empty">Nothing added yet.</p>'}
<form class="new" onsubmit="return false"><input name="name" placeholder="Name, like Checking account" maxlength="30" aria-label="Name"><input name="v" type="number" inputmode="decimal" placeholder="How much is in it? $" aria-label="Amount"><button data-a="addAsset">Add this</button></form>
${empty?'':`<p class="wipe"><button class="ghost" data-a="wipe">${armed==='wipe'?'Tap again to erase everything':'Start over'}</button></p>`}`}
function vGoals(){
const cards=S.cores.map(c=>{const p=level(c),p0=prev[c.id]??p,g=c.type==='goal';prev[c.id]=p;
const line=g?`${fmt(c.amount)} saved of ${fmt(c.target)}`:c.amount>c.target?`Over by ${fmt(c.amount-c.target)}`:`${fmt(c.target-c.amount)} left of ${fmt(c.target)}`;
let st=note[c.id]||'';
if(!st&&g){const r=c.target-c.amount;st=r<=0?'You did it! Goal reached.':c.monthly>0?`At ${fmt(c.monthly)} a month, you'll get there around ${dateIn(Math.ceil(r/c.monthly))}.`:'Add how much you save each month to see when you will finish.'}
if(!st&&!g)st=p<=0?'You have used up this limit.':'Spending limit for the month';
return `<section class="card ${tone(c,p)}">${ring(p0,p)}<div><h2>${esc(c.name)}</h2><p class="amt">${line}</p><p class="stat">${st}</p>
<div class="row"><input type="number" inputmode="decimal" min="0" placeholder="Amount $" aria-label="Amount for ${esc(c.name)}"><button data-a="${g?'add':'spend'}" data-id="${c.id}">${g?'Add money':'I spent'}</button></div>
${g?`<div class="mo">I save <input type="number" inputmode="decimal" data-f="monthly" data-id="${c.id}" value="${c.monthly||0}" aria-label="Monthly savings"> each month</div>`:''}
<div class="row2"><button class="ghost" data-a="${g?'take':'refund'}" data-id="${c.id}">${g?'Take money out':'Undo spending'}</button>${g?'':`<button class="ghost" data-a="reset" data-id="${c.id}">New month</button>`}${del(c.id)}</div></div></section>`}).join('');
return `<h3 style="margin-top:0">Goals and limits</h3><p class="sub">Save toward something, or set a monthly limit on spending.</p>${cards||'<p class="empty">Nothing here yet. Try adding something you want to save for.</p>'}
<form class="new" onsubmit="return false"><select name="type" aria-label="What kind"><option value="goal">Save for something</option><option value="budget">Limit my spending</option></select><input name="name" placeholder="Name, like New car" maxlength="30" aria-label="Name"><input name="t" type="number" inputmode="decimal" placeholder="How much? $" aria-label="Amount"><button data-a="addCore">Create</button></form>`}
function vDebt(){
let plan='';
if(S.debts.length){const av=sim(S.extra,'av'),sn=sim(S.extra,'sn'),base=sim(0,'av'),bestA=av.int<=sn.int,bt=bestA?av:sn;
const opt=(t,d,r,b)=>`<div class="opt"><b>${t}</b>${b&&av.int!==sn.int?'<span class="tag">Saves the most</span>':''}<p class="kind">${d}</p><p>${r.ok?`Debt-free by <b>${dateIn(r.n)}</b>, with about ${fmt(r.int)} paid in interest.`:'These payments are not enough to pay this off yet.'}</p></div>`;
plan=`<h3>Your payoff plan</h3><p class="sub">Two common ways to pay things off. Both work, they just focus on different debts first.</p>
<div class="mo" style="margin:0">Extra I can pay each month <input type="number" inputmode="decimal" data-f="extra" value="${S.extra}" aria-label="Extra monthly payment"></div>
${opt('Highest interest first','Costs the least overall.',av,bestA)}${opt('Smallest balance first','Gives quick wins as debts disappear.',sn,!bestA)}
<p class="sub" style="margin-top:10px">${!bt.ok?'Try adding an extra payment, or check that the minimums are right.':base.ok&&S.extra>0?`Paying ${fmt(S.extra)} extra each month saves you about ${fmt(base.int-bt.int)} in interest.`:'Adding even a little extra each month can save you real money.'}</p>`}
return `<h3 style="margin-top:0">What you owe</h3><p class="sub">Loans, credit cards, anything with a balance. Update the balance as you pay it down.</p>
${S.debts.map(d=>`<div class="li"><div><b>${esc(d.name)}</b><small>${d.apr}% interest · ${fmt(d.min)} minimum a month</small></div><input type="number" inputmode="decimal" data-f="balance" data-id="${d.id}" value="${d.balance}" aria-label="${esc(d.name)} balance">${del(d.id)}</div>`).join('')||'<p class="empty">No debts added. If you have any, add them to get a payoff plan.</p>'}
<form class="new" onsubmit="return false"><input name="name" placeholder="Name, like Car loan" maxlength="30" aria-label="Name"><input name="b" type="number" inputmode="decimal" placeholder="How much do you still owe? $" aria-label="Balance"><input name="r" type="number" inputmode="decimal" placeholder="Interest rate % (on your statement)" aria-label="Interest rate"><input name="m" type="number" inputmode="decimal" placeholder="Minimum payment each month $" aria-label="Minimum payment"><button data-a="addDebt">Add this</button></form>${plan}`}
function render(){
document.querySelectorAll('#nav button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===tab));
$('#view').innerHTML=({home:vHome,goals:vGoals,debt:vDebt})[tab]();
document.querySelectorAll('.arc').forEach(a=>{void a.getBoundingClientRect();a.style.strokeDashoffset=a.dataset.t})}
const all=id=>[...S.assets,...S.debts,...S.cores].find(x=>x.id===id);
$('#nav').onclick=e=>{const b=e.target.closest('button');if(b){tab=b.dataset.tab;armed=null;note={};render()}};
$('#view').onchange=e=>{const i=e.target,f=i.dataset.f;if(!f)return;const v=Math.max(0,parseFloat(i.value)||0);
if(f==='extra')S.extra=v;else{const x=all(i.dataset.id);if(x)x[f]=v}save();render()};
$('#view').onclick=e=>{
const b=e.target.closest('button');if(!b||!b.dataset.a)return;
const a=b.dataset.a,id=b.dataset.id,fm=b.closest('form'),n=k=>parseFloat(fm?.[k].value);
if(a==='sample')S=sample();
else if(a==='wipe'||a==='del'){const key=a==='wipe'?'wipe':id;
if(armed===key){if(a==='wipe')S=blank();else['assets','debts','cores'].forEach(k=>S[k]=S[k].filter(x=>x.id!==id));armed=null}
else{armed=key;render();setTimeout(()=>{if(armed===key){armed=null;render()}},3000);return}}
else if(a==='addAsset'){const nm=fm.name.value.trim(),v=n('v');if(!nm||isNaN(v)){fm.name.focus();return}S.assets.push({id:uid(),name:nm,value:v})}
else if(a==='addDebt'){const nm=fm.name.value.trim(),bal=n('b'),r=n('r')||0,m=n('m');if(!nm||!(bal>0)||!(m>0)){fm.name.focus();return}S.debts.push({id:uid(),name:nm,balance:bal,apr:r,min:m})}
else if(a==='addCore'){const nm=fm.name.value.trim(),t=n('t');if(!nm||!(t>0)){fm.name.focus();return}S.cores.unshift({id:uid(),name:nm,type:fm.type.value,target:t,amount:0,monthly:0})}
else{const c=all(id);note={};
if(a==='reset')c.amount=0;
else{const inp=b.closest('.card').querySelector('.row input'),v=parseFloat(inp.value);if(!(v>0)){inp.focus();return}
c.amount=Math.max(0,c.amount+((a==='add'||a==='spend')?v:-v));
note[id]=({add:'Added ',take:'Took out ',spend:'Logged ',refund:'Undid '})[a]+fmt(v)}}
save();render()};
render();
