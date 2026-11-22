const DB_NAME="DiegoCocinaCasaDB", DB_VERSION=1;
const PAYMENT_METHODS=["Efectivo","Transferencia con llaves","Nequi","Otros medios de pago"];
let db, products=[], sales=[], photoData="";
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(n||0);
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains("products"))d.createObjectStore("products",{keyPath:"id"});if(!d.objectStoreNames.contains("sales"))d.createObjectStore("sales",{keyPath:"id"});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function store(name,mode="readonly"){return db.transaction(name,mode).objectStore(name);}
function all(name){return new Promise((res,rej)=>{const r=store(name).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
function put(name,obj){return new Promise((res,rej)=>{const r=store(name,"readwrite").put(obj);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
function del(name,id){return new Promise((res,rej)=>{const r=store(name,"readwrite").delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
function normalizeSale(s){if(!Array.isArray(s.payments)){s.payments=s.payment==="Pagado"?[{id:`legacy-${s.id}`,date:s.date||today(),created:s.created||Date.now(),amount:Number(s.total)||0,method:"No especificado",note:"Pago registrado en la versión anterior"}]:[];}s.payments=s.payments.map(p=>({...p,amount:Number(p.amount)||0}));s.payment=saleStatus(s);return s;}
function paidAmount(s){return (s.payments||[]).reduce((a,p)=>a+(Number(p.amount)||0),0);}
function balance(s){return Math.max(0,(Number(s.total)||0)-paidAmount(s));}
function saleStatus(s){const paid=paidAmount(s);return paid<=0?"Pendiente":paid+0.0001>=(Number(s.total)||0)?"Pagado":"Abonado";}
async function refresh(){products=await all("products");sales=(await all("sales")).map(normalizeSale);for(const s of sales)await put("sales",s);renderAll();}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600);}
function go(view){document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===view));document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("selected",b.dataset.view===view));window.scrollTo(0,0);if(view==="reports")renderReports();}
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.view)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.go)));
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
$("todayLabel").textContent=new Intl.DateTimeFormat("es-CO",{day:"numeric",month:"short",year:"numeric"}).format(new Date());
$("saleDate").value=today();$("reportFrom").value=today().slice(0,7)+"-01";$("reportTo").value=today();
function statusClass(s){return s==="Disponible"?"available":s==="Agotado"?"soldout":"soon";}
function renderAll(){renderDashboard();renderProducts();renderInventory();renderClients();renderHistory();populateSelects();renderReports();}
function renderDashboard(){
 const total=sales.reduce((a,s)=>a+s.total,0),paid=sales.reduce((a,s)=>a+paidAmount(s),0),pending=sales.reduce((a,s)=>a+balance(s),0),units=products.reduce((a,p)=>a+p.stock,0);
 $("statSales").textContent=money(total);$("statPaid").textContent=money(paid);$("statPending").textContent=money(pending);$("statUnits").textContent=units;
 const recent=[...sales].sort((a,b)=>b.created-a.created).slice(0,4);$("recentSales").className="stack"+(recent.length?"":" empty");
 $("recentSales").innerHTML=recent.length?recent.map(s=>`<div class="row-card"><div><strong>${esc(s.product)}</strong><small>${esc(s.client||"Cliente sin nombre")} · ${esc(s.date)}</small></div><div class="row-actions"><strong>${money(s.total)}</strong><span class="pill ${saleStatus(s)==="Pagado"?"available":saleStatus(s)==="Abonado"?"soon":"soldout"}">${saleStatus(s)}</span></div></div>`).join(""):"Todavía no hay ventas registradas.";
 const list=products.slice(0,5);$("availabilityList").className="stack"+(list.length?"":" empty");$("availabilityList").innerHTML=list.length?list.map(p=>`<div class="row-card"><div><strong>${esc(p.name)}</strong><small>${p.stock} unidades · ${money(p.price)}</small></div><span class="pill ${statusClass(p.status)}">${esc(p.status)}</span></div>`).join(""):"Agrega tu primer producto para comenzar.";
}
function renderProducts(){const el=$("productList");el.className="product-grid"+(products.length?"":" empty");el.innerHTML=products.length?products.map(p=>`<article class="product-card"><div class="product-photo" ${p.photo?`style="background-image:url('${p.photo}')"`:""}>${p.photo?"":"Fotografía del producto"}</div><div class="product-body"><h3>${esc(p.name)}</h3><p>${esc(p.description||"Sin descripción")}</p><div class="price">${money(p.price)}</div><div class="card-foot"><span class="pill ${statusClass(p.status)}">${esc(p.status)}</span><button class="small-btn" data-edit="${p.id}">Editar</button></div><div class="card-foot"><small class="muted">${p.stock} unidades</small><button class="small-btn" data-delete="${p.id}">Eliminar</button></div></div></article>`).join(""):"Aún no has agregado productos.";el.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editProduct(Number(b.dataset.edit)));el.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteProduct(Number(b.dataset.delete)));}
function renderInventory(){$("inventoryList").className="stack"+(products.length?"":" empty");$("inventoryList").innerHTML=products.length?products.map(p=>`<div class="row-card"><div><strong>${esc(p.name)}</strong><small>${esc(p.status)} · ${money(p.price)}</small></div><div class="row-actions"><strong>${p.stock} un.</strong><button class="small-btn" data-add="${p.id}">＋ Stock</button></div></div>`).join(""):"No hay productos en inventario.";$("inventoryList").querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>{$("stockProduct").value=b.dataset.add;$("stockQty").focus();});}
function renderClients(){const map=new Map();sales.forEach(s=>{const name=(s.client||"").trim();if(!name)return;const v=map.get(name)||{total:0,paid:0,pending:0,count:0};v.total+=Number(s.total)||0;v.paid+=paidAmount(s);v.pending+=balance(s);v.count++;map.set(name,v);});const entries=[...map.entries()].sort((a,b)=>b[1].pending-a[1].pending);$("clientList").className="stack"+(entries.length?"":" empty");$("clientList").innerHTML=entries.length?entries.map(([name,v])=>`<article class="panel"><h3>${esc(name)}</h3><p class="muted">${v.count} pedido(s) · Total comprado: <strong>${money(v.total)}</strong></p><div class="row-card"><span>Abonado</span><strong>${money(v.paid)}</strong></div><div class="row-card"><span>Saldo pendiente</span><strong>${money(v.pending)}</strong></div></article>`).join(""):"Los clientes aparecerán al registrar sus pedidos.";}
function renderHistory(){const q=$("historySearch").value.toLowerCase();const list=[...sales].sort((a,b)=>b.created-a.created).filter(s=>(s.client+" "+s.product).toLowerCase().includes(q));$("historyList").className="stack"+(list.length?"":" empty");$("historyList").innerHTML=list.length?list.map(s=>`<article class="panel"><div class="row-card" style="padding:0;border:0"><div><strong>${esc(s.product)}</strong><small>${esc(s.client||"Cliente sin nombre")} · ${esc(s.date)}</small></div><span class="pill ${saleStatus(s)==="Pagado"?"available":saleStatus(s)==="Abonado"?"soon":"soldout"}">${saleStatus(s)}</span></div><p class="muted">${s.qty} × ${money(s.unitPrice)} = <strong>${money(s.total)}</strong></p><div class="row-card"><span>Abonado: ${money(paidAmount(s))}</span><strong>Saldo: ${money(balance(s))}</strong></div><div class="row-actions history-actions"><button class="small-btn" data-detail="${s.id}">Ver abonos (${s.payments.length})</button>${balance(s)>0?`<button class="small-btn" data-payment="${s.id}">＋ Registrar abono</button>`:""}</div></article>`).join(""):"No hay operaciones que coincidan.";$("historyList").querySelectorAll("[data-payment]").forEach(b=>b.onclick=()=>openPayment(Number(b.dataset.payment)));$("historyList").querySelectorAll("[data-detail]").forEach(b=>b.onclick=()=>showPayments(Number(b.dataset.detail)));}
function populateSelects(){const stock=$("stockProduct"),sale=$("saleProduct"),oldStock=stock.value,oldSale=sale.value;stock.innerHTML='<option value="">Selecciona un producto</option>'+products.map(p=>`<option value="${p.id}">${esc(p.name)} · ${p.stock} unidades</option>`).join("");sale.innerHTML='<option value="">Selecciona un producto</option>'+products.filter(p=>p.status==="Disponible"&&p.stock>0).map(p=>`<option value="${p.id}">${esc(p.name)} · ${money(p.price)} · Stock ${p.stock}</option>`).join("");if(products.some(p=>String(p.id)===oldStock))stock.value=oldStock;if(products.some(p=>String(p.id)===oldSale&&p.status==="Disponible"&&p.stock>0))sale.value=oldSale;const names=[...new Set(sales.map(s=>s.client).filter(Boolean))];$("clientOptions").innerHTML=names.map(n=>`<option value="${esc(n)}"></option>`).join("");updateSaleTotal();}
function updateSaleTotal(){const p=products.find(x=>x.id===Number($("saleProduct").value));const total=(p?.price||0)*(Number($("saleQty").value)||0);$("saleTotal").textContent=money(total);$("initialPayment").max=total||0;}
$("saleProduct").addEventListener("change",updateSaleTotal);$("saleQty").addEventListener("input",updateSaleTotal);$("newProductBtn").onclick=()=>openProduct();
function openProduct(p=null){$("productForm").reset();$("productId").value=p?.id||"";$("productDialogTitle").textContent=p?"Editar producto":"Nuevo producto";$("productName").value=p?.name||"";$("productDescription").value=p?.description||"";$("productPrice").value=p?.price??"";$("productStock").value=p?.stock??0;$("productStatus").value=p?.status||"Disponible";photoData=p?.photo||"";previewPhoto();$("productPhoto").value="";$("productDialog").showModal();}
function editProduct(id){const p=products.find(x=>x.id===id);if(p)openProduct(p);}
async function deleteProduct(id){if(!confirm("¿Eliminar este producto del catálogo? El historial de ventas se conservará."))return;await del("products",id);await refresh();toast("Producto eliminado.");}
$("productPhoto").addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;if(f.size>5*1024*1024){toast("La fotografía debe pesar menos de 5 MB.");e.target.value="";return;}const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{const c=document.createElement("canvas"),max=1000,scale=Math.min(1,max/Math.max(img.width,img.height));c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext("2d").drawImage(img,0,0,c.width,c.height);photoData=c.toDataURL("image/jpeg",.78);previewPhoto();};img.src=reader.result;};reader.readAsDataURL(f);});
function previewPhoto(){$("photoPreview").style.backgroundImage=photoData?`url("${photoData}")`:"";$("photoPreview").textContent=photoData?"":"Vista previa de la fotografía";}
$("productForm").addEventListener("submit",async e=>{e.preventDefault();const id=$("productId").value?Number($("productId").value):Date.now();const old=products.find(p=>p.id===id);const stock=Number($("productStock").value);let status=$("productStatus").value;if(stock===0&&status==="Disponible")status="Agotado";const p={id,name:$("productName").value.trim(),description:$("productDescription").value.trim(),price:Number($("productPrice").value),stock,status,photo:photoData};await put("products",p);$("productDialog").close();await refresh();toast(old?"Producto actualizado.":"Producto agregado al catálogo.");});
$("stockForm").addEventListener("submit",async e=>{e.preventDefault();const id=Number($("stockProduct").value),qty=Number($("stockQty").value),p=products.find(x=>x.id===id);if(!p||qty<1)return;p.stock+=qty;if(p.status==="Agotado")p.status="Disponible";await put("products",p);$("stockQty").value=1;await refresh();toast("Existencias actualizadas.");});
function addPaymentToSale(s,amount,method,date=today()){s.payments=s.payments||[];s.payments.push({id:Date.now()+Math.random(),date,created:Date.now(),amount:Number(amount),method});s.payment=saleStatus(s);}
$("saleForm").addEventListener("submit",async e=>{e.preventDefault();const p=products.find(x=>x.id===Number($("saleProduct").value)),qty=Number($("saleQty").value);if(!p||qty<1||qty>p.stock){toast("Revisa el producto y las existencias disponibles.");return;}const total=p.price*qty,initial=Number($("initialPayment").value)||0;if(!Number.isInteger(initial)||initial<0||initial>total){toast("El abono inicial no puede superar el total de la venta.");return;}const method=$("initialPaymentMethod").value;if(initial>0&&!method){toast("Selecciona el medio de pago del abono inicial.");return;}const s={id:Date.now(),created:Date.now(),date:$("saleDate").value,client:$("saleClient").value.trim(),product:p.name,productId:p.id,qty,unitPrice:p.price,total,payments:[],payment:"Pendiente"};if(initial>0)addPaymentToSale(s,initial,method,s.date);p.stock-=qty;if(p.stock===0)p.status="Agotado";await put("products",p);await put("sales",s);$("saleClient").value="";$("saleQty").value=1;$("initialPayment").value=0;$("saleProduct").value="";$("initialPaymentMethod").value="";await refresh();go("history");toast("Venta registrada e inventario actualizado.");});
function openPayment(id){const s=sales.find(x=>x.id===id);if(!s||balance(s)<=0)return;$("paymentSaleId").value=id;$("paymentDescription").textContent=`${s.client||"Cliente sin nombre"} · ${s.product} · Total ${money(s.total)} · Saldo ${money(balance(s))}`;$("paymentAmount").value=balance(s);$("paymentAmount").max=balance(s);$("paymentMethod").value="";$("paymentDate").value=today();$("paymentDialog").showModal();}
$("paymentForm").addEventListener("submit",async e=>{e.preventDefault();const id=Number($("paymentSaleId").value),s=sales.find(x=>x.id===id),amount=Number($("paymentAmount").value),method=$("paymentMethod").value;if(!s)return;const remaining=balance(s);if(!Number.isInteger(amount)||amount<=0||amount>remaining){toast(`El abono debe ser un valor entero entre $1 y ${money(remaining)}.`);return;}if(!PAYMENT_METHODS.includes(method)){toast("Selecciona un medio de pago válido.");return;}addPaymentToSale(s,amount,method,$("paymentDate").value||today());await put("sales",s);$("paymentDialog").close();await refresh();toast("Abono registrado correctamente.");});
function showPayments(id){const s=sales.find(x=>x.id===id);if(!s)return;const lines=s.payments.length?s.payments.map((p,i)=>`${i+1}. ${p.date} · ${p.method} · ${money(p.amount)}${p.note?` (${p.note})`:""}`).join("\n"):"Esta venta todavía no tiene abonos.";alert(`${s.product} · ${s.client||"Cliente sin nombre"}\nTotal: ${money(s.total)}\nAbonado: ${money(paidAmount(s))}\nSaldo: ${money(balance(s))}\n\n${lines}`);}
$("historySearch").addEventListener("input",renderHistory);
function renderReports(){if(!$("reportResults"))return;const from=$("reportFrom").value,to=$("reportTo").value;const inRange=d=>(!from||d>=from)&&(!to||d<=to);const filtered=sales.filter(s=>inRange(s.date||""));const sold=filtered.reduce((a,s)=>a+(Number(s.total)||0),0),outstanding=filtered.reduce((a,s)=>a+balance(s),0);const periodPayments=sales.flatMap(s=>(s.payments||[]).map(p=>({...p,sale:s}))).filter(p=>inRange(p.date||""));const received=periodPayments.reduce((a,p)=>a+p.amount,0),methods=new Map();periodPayments.forEach(p=>methods.set(p.method,(methods.get(p.method)||0)+p.amount));$("reportResults").innerHTML=`<div class="stats report-stats"><article class="stat"><span>Total vendido</span><strong>${money(sold)}</strong></article><article class="stat"><span>Recaudado en el periodo</span><strong>${money(received)}</strong></article><article class="stat"><span>Saldo pendiente de esas ventas</span><strong>${money(outstanding)}</strong></article><article class="stat"><span>Pedidos registrados</span><strong>${filtered.length}</strong></article></div><div class="panel report-panel"><h3>Recaudo por medio de pago</h3>${PAYMENT_METHODS.map(m=>`<div class="row-card"><span>${m}</span><strong>${money(methods.get(m)||0)}</strong></div>`).join("")}<div class="row-card"><span>Pagos antiguos sin medio especificado</span><strong>${money(methods.get("No especificado")||0)}</strong></div></div>`;}
$("reportFrom").addEventListener("change",renderReports);$("reportTo").addEventListener("change",renderReports);
$("exportBtn").onclick=async()=>{const data={app:"Diego cocina en casa",version:2,exportedAt:new Date().toISOString(),products:await all("products"),sales:(await all("sales")).map(normalizeSale)};const blob=new Blob([JSON.stringify(data)],{type:"application/json"});download(blob,`respaldo-diego-cocina-${today()}.json`);toast("Copia de seguridad descargada.");};
$("importFile").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.products)||!Array.isArray(data.sales))throw Error("Archivo no válido");if(!confirm("Esto reemplazará los datos actuales. ¿Deseas continuar?"))return;const tx=db.transaction(["products","sales"],"readwrite");tx.objectStore("products").clear();tx.objectStore("sales").clear();data.products.forEach(p=>tx.objectStore("products").put(p));data.sales.map(normalizeSale).forEach(s=>tx.objectStore("sales").put(s));tx.oncomplete=async()=>{await refresh();toast("Copia restaurada correctamente.");};tx.onerror=()=>toast("No se pudo restaurar la copia.");}catch(err){toast("El archivo seleccionado no es una copia válida.");}e.target.value="";});
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
let deferredPrompt;window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;$("installBtn").hidden=false;});$("installBtn").onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$("installBtn").hidden=true;};
const SUPABASE_URL="https://nidkljhagbauuorhpwns.supabase.co";const SUPABASE_PUBLISHABLE_KEY="sb_publishable_CNFbNoF1SySXHdBHp4seiA_4pcZRbPQ";let supabaseClient=null;
function authMessage(message){$("authMessage").textContent=message||"";}
function showAuthenticated(profile,email){$("authGate").hidden=true;$("appShell").hidden=false;$("userRole").hidden=false;$("logoutBtn").hidden=false;$("userRole").textContent=(profile.role==="admin"?"ADMINISTRADOR":"VENDEDOR")+" · "+(profile.full_name||email);}
async function startAuthenticatedApp(){db=await openDB();await refresh();if("serviceWorker" in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});}
async function verifySession(session){if(!session){$("authGate").hidden=false;$("appShell").hidden=true;return;}const {data,error}=await supabaseClient.from("profiles").select("id,full_name,role").eq("id",session.user.id).single();if(error||!data){await supabaseClient.auth.signOut();$("authGate").hidden=false;$("appShell").hidden=true;authMessage("No se pudo validar tu perfil. Revisa que el usuario tenga un perfil activo.");return;}showAuthenticated(data,session.user.email||"");await startAuthenticatedApp();}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();authMessage("Verificando acceso…");const {data,error}=await supabaseClient.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});if(error){authMessage("No se pudo iniciar sesión. Verifica el correo y la contraseña.");return;}try{await verifySession(data.session);authMessage("");}catch(err){console.error(err);authMessage("No se pudo cargar la aplicación. Comprueba tu conexión.");}});
$("logoutBtn").onclick=async()=>{await supabaseClient.auth.signOut();location.reload();};
(async()=>{try{if(!window.supabase?.createClient)throw new Error("No se pudo cargar el cliente de conexión.");supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);const {data,error}=await supabaseClient.auth.getSession();if(error)throw error;await verifySession(data.session);}catch(e){console.error(e);$("authGate").hidden=false;$("appShell").hidden=true;authMessage("No se pudo conectar. Revisa Internet e inténtalo nuevamente.");}})();


// ===== Cloud synchronization and role-based interface =====
let currentProfile=null, currentEmail="", realtimeChannel=null, cloudBusy=false;
const newUuid=()=>crypto.randomUUID?crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==="x"?r:(r&3|8)).toString(16);});
function applyRoleUI(){
  const seller=currentProfile?.role==="vendedor";
  $("userRole").textContent=(seller?"VENDEDOR":"ADMINISTRADOR")+" · "+(currentProfile?.full_name||currentEmail||"");
  ["inventory","clients","settings","reports"].forEach(id=>{const v=$(id);if(v)v.hidden=seller;});
  document.querySelectorAll(".nav-item").forEach(b=>{const id=b.dataset.view;b.hidden=seller?["inventory","clients","settings"].includes(id):false;});
  $("newProductBtn").hidden=seller;
  $("stockForm").closest(".panel").hidden=seller;
  $("initialPayment").closest("label").hidden=seller;
  $("initialPaymentMethod").closest("label").hidden=seller;
  $("paymentDialog").hidden=seller;
  if(seller && ["inventory","clients","settings","reports"].includes(document.querySelector(".view.active")?.id))go("dashboard");
}
async function cloudProductUpsert(p){
  if(currentProfile?.role!=="admin")throw new Error("Solo el administrador puede modificar productos.");
  const cloudId=p.cloud_id||newUuid();
  const payload={id:cloudId,name:p.name,description:p.description||null,price:Number(p.price)||0,stock:Number(p.stock)||0,status:p.status||"Disponible",photo_url:p.photo||null};
  const {data,error}=await supabaseClient.from("products").upsert(payload).select().single();
  if(error)throw error;
  p.cloud_id=data.id;return p;
}
async function importLegacyAdminSales(){
  if(currentProfile?.role!=="admin")return;
  const localSales=(await all("sales")).map(normalizeSale);
  const localProducts=await all("products");
  for(const s of localSales){
    if(!s.cloud_request_id)s.cloud_request_id=newUuid();
    await put("sales",s);
    const p=localProducts.find(x=>x.id===s.productId);
    if(!p?.cloud_id)continue;
    let remote=s.cloud_id?{id:s.cloud_id}:null;
    if(!remote){
      const found=await supabaseClient.from("sales").select("id").eq("seller_id",currentProfile.id).eq("client_request_id",s.cloud_request_id).maybeSingle();
      if(found.error)throw found.error;
      remote=found.data;
    }
    if(!remote){
      const ins=await supabaseClient.from("sales").insert({seller_id:currentProfile.id,total:s.total,payment_status:"Pendiente",sale_date:s.date||today(),customer_name:s.client||null,client_request_id:s.cloud_request_id,paid_amount:0,balance:s.total}).select("id").single();
      if(ins.error)throw ins.error;remote=ins.data;
    }
    s.cloud_id=remote.id;
    const itemCheck=await supabaseClient.from("sale_items").select("id").eq("sale_id",remote.id).limit(1);
    if(itemCheck.error)throw itemCheck.error;
    if(!itemCheck.data.length){
      const item=await supabaseClient.from("sale_items").insert({sale_id:remote.id,product_id:p.cloud_id,product_name:s.product,quantity:s.qty,unit_price:s.unitPrice,subtotal:s.total});
      if(item.error)throw item.error;
    }
    for(const payment of (s.payments||[])){
      if(payment.cloud_id)continue;
      const pay=await supabaseClient.from("payments").insert({sale_id:remote.id,seller_id:currentProfile.id,amount:payment.amount,payment_date:(payment.date||today())+"T12:00:00",payment_method:PAYMENT_METHODS.includes(payment.method)?payment.method:"No especificado",notes:payment.note||null}).select("id").single();
      if(pay.error)throw pay.error;payment.cloud_id=pay.data.id;
    }
    await put("sales",s);
  }
}
async function seedAdminProductsIfCloudEmpty(){
  if(currentProfile?.role!=="admin")return;
  const remote=await supabaseClient.from("products").select("id").limit(1);
  if(remote.error)throw remote.error;
  if(remote.data.length)return;
  const local=await all("products");
  for(const p of local){await cloudProductUpsert(p);await put("products",p);}
}
async function pullCloudData(){
  if(cloudBusy)return;cloudBusy=true;
  try{
    const [pr,sr,ir]=await Promise.all([
      supabaseClient.from("products").select("*").order("created_at",{ascending:true}),
      supabaseClient.from("sales").select("*").order("created_at",{ascending:false}),
      supabaseClient.from("sale_items").select("*")
    ]);
    if(pr.error)throw pr.error;if(sr.error)throw sr.error;if(ir.error)throw ir.error;
    const localProducts=await all("products"), productByCloud=new Map(localProducts.filter(p=>p.cloud_id).map(p=>[p.cloud_id,p]));
    const nextProducts=[];
    for(const rp of pr.data){
      const old=productByCloud.get(rp.id)||localProducts.find(p=>p.name===rp.name&&!p.cloud_id);
      const p={id:old?.id||Date.now()+Math.floor(Math.random()*100000),cloud_id:rp.id,name:rp.name,description:rp.description||"",price:Number(rp.price)||0,stock:Number(rp.stock)||0,status:rp.status||"Disponible",photo:rp.photo_url||old?.photo||""};
      nextProducts.push(p);await put("products",p);
    }
    const productLocalId=new Map(nextProducts.map(p=>[p.cloud_id,p.id]));
    let remotePayments=[];
    if(currentProfile?.role==="admin"){
      const pay=await supabaseClient.from("payments").select("*").order("payment_date",{ascending:true});
      if(pay.error)throw pay.error;remotePayments=pay.data;
    }
    const paymentBySale=new Map();
    remotePayments.forEach(p=>{const a=paymentBySale.get(p.sale_id)||[];a.push({id:p.id,cloud_id:p.id,date:(p.payment_date||"").slice(0,10),created:new Date(p.payment_date||Date.now()).getTime(),amount:Number(p.amount)||0,method:p.payment_method||"No especificado",note:p.notes||""});paymentBySale.set(p.sale_id,a);});
    const localSales=await all("sales"), saleByCloud=new Map(localSales.filter(s=>s.cloud_id).map(s=>[s.cloud_id,s]));
    const itemsBySale=new Map();ir.data.forEach(i=>{const a=itemsBySale.get(i.sale_id)||[];a.push(i);itemsBySale.set(i.sale_id,a);});
    for(const rs of sr.data){
      const item=(itemsBySale.get(rs.id)||[])[0];if(!item)continue;
      const old=saleByCloud.get(rs.id);
      const paid=Number(rs.paid_amount)||0;
      const payments=currentProfile?.role==="admin"?(paymentBySale.get(rs.id)||[]):(paid>0?[{id:"cloud-summary-"+rs.id,date:(rs.created_at||"").slice(0,10),created:new Date(rs.created_at||Date.now()).getTime(),amount:paid,method:"Abono registrado por administrador"}]:[]);
      const s={id:old?.id||Date.now()+Math.floor(Math.random()*100000),cloud_id:rs.id,cloud_request_id:rs.client_request_id||old?.cloud_request_id,created:new Date(rs.created_at||Date.now()).getTime(),date:rs.sale_date,client:rs.customer_name||"",product:item.product_name,productId:productLocalId.get(item.product_id)||old?.productId||0,qty:Number(item.quantity)||1,unitPrice:Number(item.unit_price)||0,total:Number(rs.total)||0,payments,payment:rs.payment_status||"Pendiente"};
      await put("sales",s);
    }
    products=await all("products");sales=(await all("sales")).map(normalizeSale);renderAll();applyRoleUI();
  }finally{cloudBusy=false;}
}
async function cloudBootstrap(){
  if(currentProfile?.role==="admin"){
    await seedAdminProductsIfCloudEmpty();
    await importLegacyAdminSales();
  }
  await pullCloudData();
  if(realtimeChannel)await supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel=supabaseClient.channel("diego-cocina-shared-data")
    .on("postgres_changes",{event:"*",schema:"public",table:"products"},()=>setTimeout(()=>pullCloudData().catch(e=>console.error(e)),250))
    .on("postgres_changes",{event:"*",schema:"public",table:"sales"},()=>setTimeout(()=>pullCloudData().catch(e=>console.error(e)),250))
    .subscribe();
}
async function startAuthenticatedApp(){
  db=await openDB();await refresh();applyRoleUI();
  try{await cloudBootstrap();toast("Datos sincronizados con la nube.");}
  catch(e){console.error("Cloud sync:",e);toast("No se pudo sincronizar. Revisa tu conexión.");}
  if("serviceWorker" in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});
}
async function verifySession(session){
  if(!session){currentProfile=null;$("authGate").hidden=false;$("appShell").hidden=true;return;}
  const {data,error}=await supabaseClient.from("profiles").select("id,full_name,role").eq("id",session.user.id).single();
  if(error||!data){await supabaseClient.auth.signOut();$("authGate").hidden=false;$("appShell").hidden=true;authMessage("No se pudo validar tu perfil. Revisa que el usuario tenga un perfil activo.");return;}
  currentProfile=data;currentEmail=session.user.email||"";showAuthenticated(data,currentEmail);applyRoleUI();await startAuthenticatedApp();
}
const originalRenderProducts=renderProducts;
renderProducts=function(){originalRenderProducts();if(currentProfile?.role==="vendedor")document.querySelectorAll("#productList [data-edit],#productList [data-delete]").forEach(b=>b.remove());};
const originalRenderHistory=renderHistory;
renderHistory=function(){originalRenderHistory();if(currentProfile?.role==="vendedor")document.querySelectorAll("#historyList [data-payment]").forEach(b=>b.remove());};
async function deleteProduct(id){
  if(currentProfile?.role!=="admin")return;
  const p=products.find(x=>x.id===id);if(!p)return;
  if(!confirm("¿Eliminar este producto del catálogo? El historial de ventas se conservará."))return;
  if(p.cloud_id){const {error}=await supabaseClient.from("products").delete().eq("id",p.cloud_id);if(error){toast("No se puede eliminar porque está vinculado a ventas. Márcalo como agotado.");return;}}
  await del("products",id);await refresh();toast("Producto eliminado.");
}
$("productForm").addEventListener("submit",async e=>{
  e.preventDefault();e.stopImmediatePropagation();if(currentProfile?.role!=="admin")return;
  const id=$("productId").value?Number($("productId").value):Date.now(),old=products.find(p=>p.id===id);
  const stock=Number($("productStock").value);let status=$("productStatus").value;if(stock===0&&status==="Disponible")status="Agotado";
  const p={id,cloud_id:old?.cloud_id,name:$("productName").value.trim(),description:$("productDescription").value.trim(),price:Number($("productPrice").value),stock,status,photo:photoData};
  try{await cloudProductUpsert(p);await put("products",p);$("productDialog").close();await pullCloudData();toast(old?"Producto actualizado y sincronizado.":"Producto agregado y sincronizado.");}
  catch(err){console.error(err);toast("No se pudo guardar en la nube. No se modificó el catálogo.");}
},true);
$("stockForm").addEventListener("submit",async e=>{
  e.preventDefault();e.stopImmediatePropagation();if(currentProfile?.role!=="admin")return;
  const id=Number($("stockProduct").value),qty=Number($("stockQty").value),p=products.find(x=>x.id===id);if(!p||qty<1)return;
  const next={...p,stock:p.stock+qty,status:p.stock+qty>0?"Disponible":p.status};
  try{await cloudProductUpsert(next);await put("products",next);$("stockQty").value=1;await pullCloudData();toast("Inventario actualizado en ambos celulares.");}
  catch(err){console.error(err);toast("No se pudo actualizar el inventario en la nube.");}
},true);
$("saleForm").addEventListener("submit",async e=>{
  e.preventDefault();e.stopImmediatePropagation();
  const p=products.find(x=>x.id===Number($("saleProduct").value)),qty=Number($("saleQty").value);
  if(!p||!p.cloud_id||qty<1){toast("El producto todavía no está sincronizado.");return;}
  const initial=currentProfile?.role==="admin"?(Number($("initialPayment").value)||0):0;
  const total=p.price*qty,method=$("initialPaymentMethod").value;
  if(qty>p.stock){toast("No hay existencias suficientes.");return;}
  if(!Number.isInteger(initial)||initial<0||initial>total|| (initial>0&&!PAYMENT_METHODS.includes(method))){toast("Revisa el abono inicial y su medio de pago.");return;}
  try{
    const requestId=newUuid();
    const {data,error}=await supabaseClient.rpc("create_sale_with_item",{p_client_request_id:requestId,p_product_id:p.cloud_id,p_product_name:p.name,p_quantity:qty,p_unit_price:p.price,p_sale_date:$("saleDate").value||today(),p_customer_name:$("saleClient").value.trim()||null});
    if(error)throw error;
    const saleId=Array.isArray(data)?data[0]?.sale_id:data?.sale_id;
    if(initial>0){const payment=await supabaseClient.rpc("record_sale_payment",{p_sale_id:saleId,p_amount:initial,p_payment_method:method,p_payment_date:$("saleDate").value||today()});if(payment.error)throw payment.error;}
    $("saleClient").value="";$("saleQty").value=1;$("initialPayment").value=0;$("saleProduct").value="";$("initialPaymentMethod").value="";
    await pullCloudData();go("history");toast("Venta registrada. El inventario se actualizó en ambos celulares.");
  }catch(err){console.error(err);toast(err.message||"No se pudo registrar la venta en la nube.");}
},true);
$("paymentForm").addEventListener("submit",async e=>{
  e.preventDefault();e.stopImmediatePropagation();if(currentProfile?.role!=="admin")return;
  const local=sales.find(s=>s.id===Number($("paymentSaleId").value)),amount=Number($("paymentAmount").value),method=$("paymentMethod").value;
  if(!local?.cloud_id){toast("La venta todavía no está sincronizada.");return;}
  try{
    const {error}=await supabaseClient.rpc("record_sale_payment",{p_sale_id:local.cloud_id,p_amount:amount,p_payment_method:method,p_payment_date:$("paymentDate").value||today()});
    if(error)throw error;$("paymentDialog").close();await pullCloudData();toast("Abono registrado y saldo actualizado en ambos celulares.");
  }catch(err){console.error(err);toast(err.message||"No se pudo registrar el abono.");}
},true);
