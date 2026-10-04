/* TINDAHAN cloud-connected app */
const SUPABASE_URL="https://sjanemubemdopybgpiwu.supabase.co";
const SUPABASE_KEY="sb_publishable_S-JYRtUXJblSAugs2_nUvg_cxRoJ4WK";
const DATA_KEY="tindahan_v2_data",SESSION_KEY="tindahan_v2_session";
let sb=null,cloudReady=false,cloudSyncing=false,currentStore=null;

const fresh=()=>({business:{name:"My Tindahan",owner:"Store Owner",phone:"",trialStart:new Date().toISOString(),plan:"trial",currency:"PHP"},products:[],sales:[],expenses:[],customers:[],payments:[],users:[]});
let db=load(),session=JSON.parse(localStorage.getItem(SESSION_KEY)||"null");

function load(){try{return JSON.parse(localStorage.getItem(DATA_KEY))||fresh()}catch{return fresh()}}
function save(){localStorage.setItem(DATA_KEY,JSON.stringify(db));if(cloudReady&&!cloudSyncing)syncToCloud().catch(()=>{})}
function money(n){return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(n)||0)}
function uid(){return crypto.randomUUID?crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{let r=Math.random()*16|0,v=c==="x"?r:r&3|8;return v.toString(16)})}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function daysLeft(){if(db.business.plan==="paid")return Math.max(0,Math.ceil((new Date(db.business.subscriptionExpiresAt||Date.now()).getTime()-Date.now())/86400000));return Math.max(0,14-Math.floor((Date.now()-new Date(db.business.trialStart).getTime())/86400000))}
function trialActive(){return daysLeft()>0}
function salesTotal(){return db.sales.reduce((a,s)=>a+(Number(s.total)||0),0)}
function costTotal(){return db.sales.reduce((a,s)=>a+(Number(s.cost)||0),0)}
function expenseTotal(){return db.expenses.reduce((a,e)=>a+(Number(e.amount)||0),0)}
function profit(){return salesTotal()-costTotal()-expenseTotal()}
function todaySales(){let d=new Date().toISOString().slice(0,10);return db.sales.filter(s=>String(s.date).slice(0,10)===d).reduce((a,s)=>a+(Number(s.total)||0),0)}
function utang(){return db.customers.reduce((a,c)=>a+(Number(c.balance)||0),0)}
function toast(m){let e=document.createElement("div");e.className="toast";e.textContent=m;document.body.appendChild(e);setTimeout(()=>e.remove(),2300)}
function closeModal(){document.getElementById("modal")?.remove()}
function modal(title,html){document.body.insertAdjacentHTML("beforeend",`<div class="modal-bg" id="modal"><div class="modal"><div class="row"><h3>${title}</h3><button class="btn ghost" onclick="closeModal()">✕</button></div>${html}</div></div>`)}

function authScreen(msg=""){
document.getElementById("app").innerHTML=`<div class="login"><div class="login-card"><div class="logo">T</div><h1>TINDAHAN</h1><p class="muted">Simple store management for sari-sari stores</p>${msg?`<div class="trial">${esc(msg)}</div>`:""}<div class="form"><div class="field"><label>Email</label><input id="ae" type="email" autocomplete="email" placeholder="you@example.com"></div><div class="field"><label>Password</label><input id="apw" type="password" autocomplete="current-password" placeholder="At least 6 characters"></div><div id="signupFields" style="display:none"><div class="field"><label>Store name</label><input id="asn" placeholder="My Tindahan"></div><div class="field"><label>Owner name</label><input id="aon" placeholder="Your name"></div></div><button class="btn primary" id="authBtn" onclick="authSubmit()">Log in</button><button class="btn secondary" onclick="toggleSignup()" id="switchBtn">Create account</button></div><p class="muted small">14-day free trial. Your store data is saved securely online.</p></div></div>`;
}

let signupMode=false;
function toggleSignup(){signupMode=!signupMode;document.getElementById("signupFields").style.display=signupMode?"block":"none";document.getElementById("authBtn").textContent=signupMode?"Create account":"Log in";document.getElementById("switchBtn").textContent=signupMode?"I already have an account":"Create account"}

async function authSubmit(){
let email=document.getElementById("ae").value.trim(),password=document.getElementById("apw").value;
if(!email||password.length<6)return toast("Enter a valid email and 6+ character password.");
let r;
if(signupMode){
let store=document.getElementById("asn").value.trim()||"My Tindahan",owner=document.getElementById("aon").value.trim()||"Store Owner";
r=await sb.auth.signUp({email,password,options:{data:{store_name:store,owner_name:owner}}})
}else r=await sb.auth.signInWithPassword({email,password});
if(r.error)return toast(r.error.message);
if(!r.data.session)return toast("Check your email to confirm your account, then log in.");
session=r.data.session;
localStorage.setItem(SESSION_KEY,JSON.stringify(session));
await bootCloud();
}

async function initSupabase(){
if(window.supabase){sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);return}
await new Promise((resolve,reject)=>{
let s=document.createElement("script");
s.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
s.onload=resolve;s.onerror=reject;document.head.appendChild(s)
});
sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
}

async function bootCloud(){
if(!session?.user?.id)return authScreen();
let {data:store,error}=await sb.from("stores").select("*").eq("owner_id",session.user.id).single();
if(error||!store){authScreen("Your account was created, but the store profile is not ready yet. Please try logging in again.");return}
currentStore=store;
db.business={name:store.store_name||"My Tindahan",owner:store.owner_name||"Store Owner",phone:store.phone||"",trialStart:store.trial_started_at,plan:store.subscription_status||"trial",subscriptionExpiresAt:store.subscription_expires_at,currency:"PHP"};
if(!trialActive()){cloudReady=false;save();route("more");return}
await loadCloudData();
cloudReady=true;
save();
route("dashboard");
}

async function loadCloudData(){
let sid=currentStore.id;
let [p,c,s,e]=await Promise.all([
sb.from("products").select("*").eq("store_id",sid),
sb.from("customers").select("*").eq("store_id",sid),
sb.from("sales").select("*").eq("store_id",sid).order("created_at",{ascending:true}),
sb.from("expenses").select("*").eq("store_id",sid).order("created_at",{ascending:true})
]);
if(p.error||c.error||s.error||e.error){toast("Cloud data could not be loaded.");return}
let sales=s.data||[];
let ids=sales.map(x=>x.id);
let items=ids.length?(await sb.from("sale_items").select("*").in("sale_id",ids)).data||[]:[];
db.products=(p.data||[]).map(x=>({id:x.id,name:x.name,category:x.category||"",cost:Number(x.cost_price)||0,price:Number(x.selling_price)||0,stock:Number(x.stock)||0,reorder:Number(x.low_stock_level)||0}));
db.customers=(c.data||[]).map(x=>({id:x.id,name:x.name,phone:x.phone||"",address:x.address||"",balance:Number(x.balance)||0}));
db.sales=sales.map(x=>({id:x.id,date:x.created_at,items:items.filter(i=>i.sale_id===x.id).map(i=>({id:i.product_id,name:i.product_name,price:Number(i.unit_price)||0,cost:Number(i.cost_price)||0,qty:Number(i.quantity)||0})),total:Number(x.total)||0,cost:items.filter(i=>i.sale_id===x.id).reduce((a,i)=>a+(Number(i.cost_price)||0)*(Number(i.quantity)||0),0),customerId:x.customer_id||"",payment:x.payment_method||"cash"}));
db.expenses=(e.data||[]).map(x=>({id:x.id,description:x.description,amount:Number(x.amount)||0,date:x.created_at}));
db.payments=[];
}

async function syncToCloud(){
if(!sb||!currentStore||!session?.user?.id||cloudSyncing||!trialActive())return;
cloudSyncing=true;
let sid=currentStore.id;
try{
await sb.from("stores").update({store_name:db.business.name,owner_name:db.business.owner,phone:db.business.phone}).eq("id",sid).eq("owner_id",session.user.id);

if(db.products.length)await sb.from("products").upsert(db.products.map(p=>({id:p.id,store_id:sid,name:p.name,category:p.category||null,selling_price:p.price,cost_price:p.cost,stock:p.stock,low_stock_level:p.reorder})),{onConflict:"id"});

if(db.customers.length)await sb.from("customers").upsert(db.customers.map(c=>({id:c.id,store_id:sid,name:c.name,phone:c.phone||null,address:c.address||null,balance:c.balance||0})),{onConflict:"id"});

if(db.expenses.length)await sb.from("expenses").upsert(db.expenses.map(e=>({id:e.id,store_id:sid,description:e.description,amount:e.amount,created_at:e.date||new Date().toISOString()})),{onConflict:"id"});

if(db.sales.length){
await sb.from("sales").upsert(db.sales.map(s=>({id:s.id,store_id:sid,customer_id:s.customerId||null,total:s.total,payment_method:s.payment||"cash",created_at:s.date||new Date().toISOString()})),{onConflict:"id"});
let rows=[];
db.sales.forEach(s=>(s.items||[]).forEach(i=>rows.push({id:crypto.randomUUID(),sale_id:s.id,product_id:i.id||null,product_name:i.name,quantity:i.qty,unit_price:i.price,cost_price:i.cost})));
if(rows.length){
await sb.from("sale_items").delete().in("sale_id",db.sales.map(s=>s.id));
await sb.from("sale_items").insert(rows);
}
}
}finally{cloudSyncing=false}
}

function nav(active){return `<div class="bottomnav"><div class="navinner">${[["dashboard","🏠","Home"],["sales","🛒","Sales"],["inventory","📦","Stock"],["customers","👥","Utang"],["more","☰","More"]].map(x=>`<button class="navbtn ${active===x[0]?"active":""}" onclick="route('${x[0]}')"><span class="navicon">${x[1]}</span>${x[2]}</button>`).join("")}</div></div>`}

function shell(title,body,active="dashboard"){document.getElementById("app").innerHTML=`<div class="app"><header class="topbar"><div><div class="brand">TINDAHAN</div><div class="sub">${esc(db.business.name)}</div></div><button class="btn secondary small" onclick="route('settings')">⚙️</button></header><main class="content"><h1 class="page-title">${title}</h1>${body}</main>${nav(active)}</div>`}

function dashboard(){
let low=db.products.filter(p=>p.stock<=p.reorder);
shell("Dashboard",`<div class="trial"><b>${db.business.plan==="paid"?"Premium":"Free trial"}</b> · ${daysLeft()} day${daysLeft()===1?"":"s"} remaining</div><div class="grid stats section"><div class="card"><div class="stat-label">Today's Sales</div><div class="stat-value money">${money(todaySales())}</div></div><div class="card"><div class="stat-label">Total Sales</div><div class="stat-value money">${money(salesTotal())}</div></div><div class="card"><div class="stat-label">Net Profit</div><div class="stat-value money profit">${money(profit())}</div></div><div class="card"><div class="stat-label">Utang</div><div class="stat-value money danger-text">${money(utang())}</div></div></div><div class="grid two section"><button class="bigaction" onclick="newSale()">🛒<b>New Sale</b><span>Record customer purchase</span></button><button class="bigaction" onclick="newProduct()">📦<b>Add Product</b><span>Update your inventory</span></button></div><div class="card section"><div class="row"><h3>Low Stock</h3><button class="btn ghost small" onclick="route('inventory')">View all</button></div>${low.length?`<div class="list">${low.map(p=>`<div class="row item"><span><b>${esc(p.name)}</b><small>${esc(p.category||"Uncategorized")}</small></span><span class="badge warn">${p.stock} left</span></div>`).join("")}</div>`:`<div class="empty">No low-stock products 🎉</div>`}</div><div class="card section"><div class="row"><h3>Quick Summary</h3><button class="btn ghost small" onclick="route('reports')">Reports</button></div><div class="grid three mini"><div><b>${db.products.length}</b><small>Products</small></div><div><b>${db.customers.length}</b><small>Customers</small></div><div><b>${db.sales.length}</b><small>Sales</small></div></div></div>`,"dashboard")
}

function sales(){
let rows=[...db.sales].reverse();
shell("Sales",`<div class="actions section"><button class="btn primary" onclick="newSale()">＋ New Sale</button><button class="btn secondary" onclick="newExpense()">＋ Expense</button></div><div class="card section"><div class="row"><b>Sales history</b><span class="muted">${rows.length} transactions</span></div>${rows.length?`<div class="table-wrap"><table class="table"><tr><th>Date</th><th>Items</th><th>Total</th><th>Profit</th></tr>${rows.map(s=>`<tr><td>${new Date(s.date).toLocaleDateString()}</td><td>${(s.items||[]).map(i=>esc(i.name)+" ×"+i.qty).join(", ")}</td><td>${money(s.total)}</td><td class="profit">${money(s.total-s.cost)}</td></tr>`).join("")}</table></div>`:`<div class="empty">No sales yet.</div>`}</div>`,"sales")
}

let saleItems=[];

function newSale(){
saleItems=[];
modal("New Sale",`<div class="form"><div class="field"><label>Product</label><select id="sp">${db.products.filter(p=>p.stock>0).map(p=>`<option value="${p.id}">${esc(p.name)} — ${money(p.price)} (${p.stock})</option>`).join("")}</select></div><div class="field"><label>Quantity</label><input id="sq" type="number" min="1" value="1"></div><button class="btn secondary" onclick="addSaleItem()">Add item</button><div id="saleItems"></div><div class="row"><b>Total</b><b id="saleTotal">${money(0)}</b></div><div class="field"><label>Customer (optional)</label><select id="sc"><option value="">Cash sale</option>${db.customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div><button class="btn primary" onclick="finishSale()">Complete Sale</button></div>`);
renderSaleItems()
}

function addSaleItem(){
let p=db.products.find(x=>x.id===document.getElementById("sp").value),q=Number(document.getElementById("sq").value);
if(!p||q<1||q>p.stock)return toast("Check product and quantity.");
let f=saleItems.find(i=>i.id===p.id);
if(f){if(f.qty+q>p.stock)return toast("Not enough stock.");f.qty+=q}
else saleItems.push({id:p.id,name:p.name,price:p.price,cost:p.cost,qty:q});
renderSaleItems()
}

function renderSaleItems(){
let e=document.getElementById("saleItems");
if(!e)return;
e.innerHTML=saleItems.length?saleItems.map(i=>`<div class="row item"><span>${esc(i.name)} × ${i.qty}</span><b>${money(i.price*i.qty)}</b></div>`).join(""):`<div class="empty">Add items above.</div>`;
document.getElementById("saleTotal").textContent=money(saleItems.reduce((a,i)=>a+i.price*i.qty,0))
}

function finishSale(){
if(!trialActive())return closeModal(),subscription();
if(!saleItems.length)return toast("Add an item.");
let customer=document.getElementById("sc").value,total=saleItems.reduce((a,i)=>a+i.price*i.qty,0),cost=saleItems.reduce((a,i)=>a+i.cost*i.qty,0);
saleItems.forEach(i=>db.products.find(p=>p.id===i.id).stock-=i.qty);
db.sales.push({id:uid(),date:new Date().toISOString(),items:[...saleItems],total,cost,customerId:customer,payment:customer?"utang":"cash"});
if(customer){let c=db.customers.find(x=>x.id===customer);c.balance=(c.balance||0)+total}
save();saleItems=[];closeModal();toast(customer?"Sale added to utang.":"Sale completed.");sales()
}

function inventory(){
shell("Inventory",`<div class="actions section"><button class="btn primary" onclick="newProduct()">＋ Product</button><button class="btn secondary" onclick="stockAdjustment()">↕ Stock</button><button class="btn secondary" onclick="scanReceipt()">🧾 Scan Receipt</button></div><div class="card section"><div class="table-wrap"><table class="table"><tr><th>Product</th><th>Price</th><th>Stock</th><th></th></tr>${db.products.map(p=>`<tr><td><b>${esc(p.name)}</b><br><span class="muted">${esc(p.category||"")}</span></td><td>${money(p.price)}</td><td><span class="badge ${p.stock<=p.reorder?"warn":"ok"}">${p.stock}</span></td><td><button class="btn secondary small" onclick="editProduct('${p.id}')">Edit</button></td></tr>`).join("")}</table></div></div><div class="card section"><h3>🧾 Scan supplier receipt</h3><p class="muted">Take a photo of a receipt and TINDAHAN will try to read the items, quantities and prices. You can review everything before stock is added.</p><button class="btn primary" onclick="scanReceipt()">Scan Receipt</button></div>`,"inventory")
}

let receiptCandidates=[];

async function loadTesseract(){
if(window.Tesseract)return window.Tesseract;
toast("Loading receipt scanner…");
await new Promise((resolve,reject)=>{
let s=document.createElement("script");
s.src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
s.onload=resolve;
s.onerror=()=>reject(new Error("OCR library could not load"));
document.head.appendChild(s);
});
return window.Tesseract;
}

function receiptInput(){
let old=document.getElementById("receiptFile");
if(old)old.remove();
let input=document.createElement("input");
input.id="receiptFile";
input.type="file";
input.accept="image/*";
input.setAttribute("capture","environment");
input.style.display="none";
input.onchange=async()=>{if(input.files?.[0])await processReceiptImage(input.files[0]);input.remove()};
document.body.appendChild(input);
input.click();
}

async function scanReceipt(){
if(!trialActive())return subscription();
receiptInput();
}

function normalizeReceiptName(s){
return String(s||"")
.toLowerCase()
.replace(/[\u2010-\u2015]/g,"-")
.replace(/[^a-z0-9\s.-]/g," ")
.replace(/\s+/g," ")
.trim();
}

function parseMoneyTokens(line){
let vals=[...String(line).matchAll(/(?:₱|PHP\s*)?(\d{1,6}(?:[.,]\d{1,2})?)/gi)]
.map(m=>Number(m[1].replace(/,/g,"")));
return vals.filter(v=>Number.isFinite(v));
}

function parseReceiptLines(text){
let lines=String(text||"")
.split(/\r?\n/)
.map(x=>x.replace(/\t+/g," ").replace(/\s+/g," ").trim())
.filter(Boolean);

let out=[];
for(let raw of lines){
let line=raw
.replace(/[|]/g," ")
.replace(/\s{2,}/g," ")
.trim();

if(line.length<3||line.length>120)continue;
let lower=line.toLowerCase();

if(/^(o\s*save|osave|total|subtotal|vat|cash|change|tendered|amount due|balance|invoice|receipt|transaction|date|time|address|tel|phone|thank|thank you|customer copy|cashier|terminal|discount|senior|pwd|vatable|vat exempt|non[- ]?vat|less|save|member|points)\b/i.test(line))continue;
if(/\b(total|subtotal|cash|change|tendered|amount due|vat|discount|receipt no|transaction no)\b/i.test(lower)&&!/\d+\s*[x×*]\s*\d/.test(line))continue;

let moneyVals=parseMoneyTokens(line);
if(!moneyVals.length)continue;

let qty=1;
let qtyMatch=line.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*[x×*]\s*(?:₱|PHP\s*)?\d/i);
if(qtyMatch)qty=Number(qtyMatch[1])||1;

let numbers=[...line.matchAll(/(?:₱|PHP\s*)?(\d{1,6}(?:[.,]\d{1,2})?)/gi)]
.map(m=>({value:Number(m[1].replace(/,/g,"")),index:m.index}));
if(!numbers.length)continue;

let total=moneyVals[moneyVals.length-1];
let unit=moneyVals.length>=2?moneyVals[moneyVals.length-2]:total;

if(qtyMatch){
unit=unit||total/qty;
}else{
let maybeQty=numbers.length>=2?numbers[numbers.length-2].value:1;
if(maybeQty>0&&maybeQty<=999&&Number.isInteger(maybeQty)&&numbers.length>=3){
qty=maybeQty;
}
if(qty>0)unit=total/qty;
if(!Number.isFinite(unit)||unit<=0)unit=total;
}

let name=line
.replace(/(?:₱|PHP\s*)?\d{1,6}(?:[.,]\d{1,2})?/gi," ")
.replace(/\s*[x×*]\s*/gi," ")
.replace(/\s+/g," ")
.trim()
.replace(/^[^A-Za-z]+/,"")
.replace(/[^A-Za-z0-9%)%.,'&+\-\/ ]+$/g,"")
.trim();

if(name.length<2)continue;
if(/^(qty|quantity|item|description|code|sku|barcode)$/i.test(name))continue;
if(total<=0||unit<=0||qty<=0||qty>9999)continue;
if(name.length>70)name=name.slice(0,70).trim();

out.push({
id:uid(),
name,
qty:Math.max(1,Math.round(qty)),
cost:Number(unit.toFixed(2)),
total:Number(total.toFixed(2)),
confidence:"check"
});
}

let seen=new Set();
return out.filter(x=>{
let key=normalizeReceiptName(x.name)+"|"+x.qty+"|"+x.total;
if(seen.has(key))return false;
seen.add(key);
return true;
});
}

function matchReceiptProduct(name){
let n=normalizeReceiptName(name);
if(!n)return null;
let exact=db.products.find(p=>normalizeReceiptName(p.name)===n);
if(exact)return exact;

let words=n.split(" ").filter(w=>w.length>=3);
let best=null,bestScore=0;
db.products.forEach(p=>{
let pn=normalizeReceiptName(p.name);
let score=0;
if(pn.includes(n)||n.includes(pn))score+=0.8;
let pw=pn.split(" ").filter(w=>w.length>=3);
let common=words.filter(w=>pw.includes(w)).length;
score+=common/Math.max(words.length,pw.length,1)*0.6;
if(score>bestScore){bestScore=score;best=p}
});
return bestScore>=0.8?best:null;
}

function receiptReviewHtml(){
return `<div class="muted small" style="margin-bottom:10px">Review the detected items before saving. Existing products are matched automatically when possible. OCR can make mistakes.</div>
<div id="receiptRows">${receiptCandidates.map((x,i)=>{
let m=matchReceiptProduct(x.name);
return `<div class="card" style="margin:8px 0;padding:10px">
<div class="field"><label>Product ${i+1}</label><input id="rn${i}" value="${esc(m?m.name:x.name)}"></div>
<div class="grid three">
<div class="field"><label>Qty</label><input id="rq${i}" type="number" min="1" step="1" value="${x.qty}"></div>
<div class="field"><label>Cost / unit</label><input id="rc${i}" type="number" min="0" step=".01" value="${x.cost}"></div>
<div class="field"><label>Match</label><div style="padding-top:10px">${m?`<span class="badge ok">Existing</span>`:`<span class="badge warn">New</span>`}</div></div>
</div>
</div>`;
}).join("")}</div>
<div class="actions"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="confirmReceiptStock()">＋ Add Stock</button></div>`;
}

async function processReceiptImage(file){
try{
closeModal();
modal("Scanning Receipt",`<div class="empty"><p id="ocrStatus">Reading receipt…</p><div class="trial">Please keep this screen open.</div></div>`);
let T=await loadTesseract();
let result=await T.recognize(file,"eng",{
logger:m=>{
if(m.status==="recognizing text"){
let pct=Math.round((m.progress||0)*100);
let e=document.getElementById("ocrStatus");
if(e)e.textContent=`Reading receipt… ${pct}%`;
}
}
});
receiptCandidates=parseReceiptLines(result.data?.text||"");
closeModal();
if(!receiptCandidates.length){
return modal("Receipt not clear",`<div class="empty"><p>TINDAHAN could not confidently find product lines on this receipt.</p><p class="muted">Try a brighter, closer photo with the whole receipt visible and the text facing the camera.</p><button class="btn primary" onclick="closeModal();scanReceipt()">Try again</button><button class="btn ghost" onclick="closeModal()">Close</button></div>`);
}
modal("Review Receipt Items",receiptReviewHtml());
}catch(e){
console.error(e);
closeModal();
toast("Receipt scanning failed. Check your internet connection and try again.");
}
}

function confirmReceiptStock(){
if(!receiptCandidates.length)return toast("No receipt items to save.");
let added=0,created=0;
receiptCandidates.forEach((x,i)=>{
let name=document.getElementById("rn"+i)?.value.trim();
let qty=Number(document.getElementById("rq"+i)?.value)||0;
let cost=Number(document.getElementById("rc"+i)?.value)||0;
if(!name||qty<=0)return;

let matched=matchReceiptProduct(name);
if(matched){
matched.stock=Number(matched.stock||0)+qty;
if(cost>0)matched.cost=cost;
added+=qty;
}else{
db.products.push({
id:uid(),
name,
category:"",
cost,
price:0,
stock:qty,
reorder:5
});
created++;
added+=qty;
}
});
save();
receiptCandidates=[];
closeModal();
inventory();
toast(`${added} stock added${created?`; ${created} new product${created===1?"":"s"} created`:""}.`);
}

function newProduct(p){
p=p||{name:"",category:"",cost:"",price:"",stock:"",reorder:5};
modal(p.id?"Edit Product":"Add Product",`<div class="form"><div class="field"><label>Product name</label><input id="pn" value="${esc(p.name)}"></div><div class="field"><label>Category</label><input id="pc" value="${esc(p.category)}"></div><div class="grid two"><div class="field"><label>Cost</label><input id="pco" type="number" step=".01" value="${p.cost}"></div><div class="field"><label>Selling price</label><input id="pp" type="number" step=".01" value="${p.price}"></div></div><div class="grid two"><div class="field"><label>Stock</label><input id="ps" type="number" value="${p.stock}"></div><div class="field"><label>Low-stock level</label><input id="pr" type="number" value="${p.reorder}"></div></div><button class="btn primary" onclick="saveProduct('${p.id||""}')">Save Product</button></div>`)
}

function saveProduct(pid){
let name=document.getElementById("pn").value.trim();
if(!name)return toast("Product name required.");
let d={name,category:document.getElementById("pc").value.trim(),cost:+document.getElementById("pco").value||0,price:+document.getElementById("pp").value||0,stock:+document.getElementById("ps").value||0,reorder:+document.getElementById("pr").value||0};
if(pid)Object.assign(db.products.find(p=>p.id===pid),d);
else db.products.push({id:uid(),...d});
save();closeModal();inventory();toast("Product saved.")
}

function editProduct(id){newProduct(db.products.find(p=>p.id===id))}

function stockAdjustment(){
modal("Stock Adjustment",`<div class="form"><div class="field"><label>Product</label><select id="ap">${db.products.map(p=>`<option value="${p.id}">${esc(p.name)} (${p.stock})</option>`).join("")}</select></div><div class="field"><label>Change (+ add / - remove)</label><input id="aq" type="number" value="1"></div><button class="btn primary" onclick="applyAdjustment()">Update</button></div>`)
}

function applyAdjustment(){
let p=db.products.find(x=>x.id===document.getElementById("ap").value),q=+document.getElementById("aq").value;
if(!p||p.stock+q<0)return toast("Invalid stock.");
p.stock+=q;save();closeModal();inventory();toast("Stock updated.")
}

function customers(){
shell("Customers & Utang",`<div class="actions section"><button class="btn primary" onclick="newCustomer()">＋ Customer</button></div><div class="card section">${db.customers.length?`<div class="table-wrap"><table class="table"><tr><th>Customer</th><th>Phone</th><th>Utang</th><th></th></tr>${db.customers.map(c=>`<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.phone||"—")}</td><td class="${c.balance>0?"danger-text":""}">${money(c.balance||0)}</td><td>${c.balance>0?`<button class="btn secondary small" onclick="payment('${c.id}')">Pay</button>`:"<span class='badge ok'>Clear</span>"}</td></tr>`).join("")}</table></div>`:`<div class="empty">No customers yet.</div>`}</div>`,"customers")
}

function newCustomer(){
modal("Add Customer",`<div class="form"><div class="field"><label>Name</label><input id="cn"></div><div class="field"><label>Phone</label><input id="cp"></div><button class="btn primary" onclick="saveCustomer()">Save Customer</button></div>`)
}

function saveCustomer(){
let n=document.getElementById("cn").value.trim();
if(!n)return toast("Name required.");
db.customers.push({id:uid(),name:n,phone:document.getElementById("cp").value.trim(),balance:0});
save();closeModal();customers()
}

function payment(id){
let c=db.customers.find(x=>x.id===id);
modal("Customer Payment",`<div class="form"><p><b>${esc(c.name)}</b> owes ${money(c.balance)}.</p><div class="field"><label>Amount</label><input id="pay" type="number" max="${c.balance}" value="${c.balance}"></div><button class="btn primary" onclick="applyPayment('${id}')">Record Payment</button></div>`)
}

function applyPayment(id){
let c=db.customers.find(x=>x.id===id),v=+document.getElementById("pay").value;
if(v<0||v>c.balance)return toast("Invalid payment.");
c.balance-=v;
db.payments.push({id:uid(),customerId:id,amount:v,date:new Date().toISOString()});
save();closeModal();customers();toast("Payment recorded.")
}

function newExpense(){
modal("Add Expense",`<div class="form"><div class="field"><label>Description</label><input id="ed"></div><div class="field"><label>Amount</label><input id="ea" type="number" step=".01"></div><button class="btn primary" onclick="saveExpense()">Save Expense</button></div>`)
}

function saveExpense(){
let d=document.getElementById("ed").value.trim(),a=+document.getElementById("ea").value;
if(!d||a<=0)return toast("Enter description and amount.");
db.expenses.push({id:uid(),description:d,amount:a,date:new Date().toISOString()});
save();closeModal();sales();toast("Expense saved.")
}

function reports(){
shell("Reports",`<div class="grid stats section"><div class="card"><div class="stat-label">Sales</div><div class="stat-value money">${money(salesTotal())}</div></div><div class="card"><div class="stat-label">Product Cost</div><div class="stat-value money">${money(costTotal())}</div></div><div class="card"><div class="stat-label">Expenses</div><div class="stat-value money">${money(expenseTotal())}</div></div><div class="card"><div class="stat-label">Net Profit</div><div class="stat-value money profit">${money(profit())}</div></div></div><div class="card section"><h3>Business health</h3><p class="muted">Profit = sales − product cost − expenses. Use this as a simple operating report; it is not formal accounting.</p></div>`,"more")
}

function more(){
shell("More",`<div class="grid two section"><button class="bigaction" onclick="route('reports')">📊<b>Reports</b><span>Sales and profit</span></button><button class="bigaction" onclick="route('settings')">⚙️<b>Settings</b><span>Store profile and data</span></button><button class="bigaction" onclick="backup()">💾<b>Backup</b><span>Download your data</span></button><button class="bigaction" onclick="subscription()">💳<b>Subscription</b><span>Trial and payment</span></button></div>`,"more")
}

function settings(){
shell("Settings",`<div class="card section"><h3>Store profile</h3><div class="form"><div class="field"><label>Store name</label><input id="bn" value="${esc(db.business.name)}"></div><div class="field"><label>Owner name</label><input id="bo" value="${esc(db.business.owner)}"></div><div class="field"><label>Phone</label><input id="bp" value="${esc(db.business.phone||"")}"></div><button class="btn primary" onclick="saveSettings()">Save</button></div></div><div class="card section"><h3>Subscription</h3><p class="muted">${db.business.plan==="paid"?"Your account is on a paid plan.":`You are on the 14-day free trial. ${daysLeft()} day(s) remaining.`}</p><button class="btn secondary" onclick="subscription()">View subscription</button></div><div class="card section"><h3>Account</h3><p class="muted">${esc(session?.user?.email||"")}</p><button class="btn danger" onclick="logout()">Log out</button></div><div class="card section"><h3>Backup</h3><button class="btn secondary" onclick="backup()">Export backup</button></div></div>`,"more")
}

function saveSettings(){
db.business.name=document.getElementById("bn").value.trim()||"My Tindahan";
db.business.owner=document.getElementById("bo").value.trim()||"Store Owner";
db.business.phone=document.getElementById("bp").value.trim();
save();toast("Saved.");settings()
}

function backup(){
let b=new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),a=document.createElement("a");
a.href=URL.createObjectURL(b);
a.download="tindahan-backup-"+new Date().toISOString().slice(0,10)+".json";
a.click();
URL.revokeObjectURL(a.href)
}

function subscription(){
modal("TINDAHAN Subscription",`<div class="card"><h3>${db.business.plan==="paid"?"Paid Plan":"14-Day Free Trial"}</h3><p>${daysLeft()} day(s) remaining.</p><p class="muted">Your account is connected to TINDAHAN cloud storage. Paid billing will be connected before public launch.</p><div class="trial">Your store data is separated by your account.</div></div><button class="btn ghost" onclick="closeModal()">Close</button>`)
}

function route(p){
if(!trialActive()&&p!=="more"&&p!=="settings"&&p!=="dashboard")return subscription();
({dashboard,sales,inventory,customers,reports,settings,more}[p]||dashboard)()
}

async function logout(){
await sb.auth.signOut();
session=null;
currentStore=null;
cloudReady=false;
localStorage.removeItem(SESSION_KEY);
authScreen("Logged out successfully.")
}

async function start(){
try{
await initSupabase();
let {data}=await sb.auth.getSession();
session=data.session||session;
if(session){
localStorage.setItem(SESSION_KEY,JSON.stringify(session));
await bootCloud()
}else authScreen()
}catch(e){
authScreen("Unable to connect to TINDAHAN cloud. Check your internet connection.")
}
}

start();
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
