// Minimal back-office console served at /admin. Plain DOM APIs only (no innerHTML) so customer-supplied text can never run as script.
export const adminHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>NyasaVault Admin</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;font:14px system-ui,sans-serif;background:#020617;color:#e2e8f0}
header{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #1e293b;background:#0f172a;position:sticky;top:0}
h1{font-size:16px;margin:0}main{max-width:900px;margin:0 auto;padding:16px}nav{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
button,input,select{font:inherit;border-radius:8px;border:1px solid #334155;background:#0b1220;color:#e2e8f0;padding:8px 12px}
button{cursor:pointer;background:#1e293b}button.pri{background:#34d399;color:#022c22;border-color:#34d399;font-weight:600}button.bad{background:#7f1d1d;border-color:#991b1b}
button.on{border-color:#34d399;color:#34d399}.card{border:1px solid #1e293b;background:#0f172a;border-radius:12px;padding:14px;margin-bottom:12px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}dl{display:grid;grid-template-columns:130px 1fr;gap:4px 10px;margin:0}dt{color:#94a3b8}dd{margin:0;word-break:break-all}
.tag{padding:2px 8px;border-radius:99px;font-size:11px;background:#422006;color:#fbbf24}.err{color:#fca5a5;margin:8px 0}.ok{color:#6ee7b7;margin:8px 0}.muted{color:#94a3b8}
img.doc{max-width:100%;max-height:360px;border-radius:8px;margin-top:8px;display:block}pre{white-space:pre-wrap;word-break:break-all;background:#0b1220;padding:10px;border-radius:8px}
</style></head><body><header><h1>NyasaVault Admin</h1><button id="out" hidden>Lock</button></header><main id="app"></main><script src="/admin.js"></script></body></html>`;

export const adminJs = `(function(){
var app=document.getElementById('app'),out=document.getElementById('out'),key=sessionStorage.getItem('nvkey')||'',tab='kyc';
function h(t,a){var e=document.createElement(t);a=a||{};for(var k in a){if(k==='class')e.className=a[k];else if(k.slice(0,2)==='on')e.addEventListener(k.slice(2),a[k]);else if(k==='value')e.value=a[k];else e.setAttribute(k,a[k]);}
for(var i=2;i<arguments.length;i++){var c=arguments[i];if(c==null)continue;e.appendChild(typeof c==='object'?c:document.createTextNode(String(c)));}return e;}
function api(m,p,b,raw){return fetch('/api/admin'+p,{method:m,headers:{'x-admin-key':key,'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined}).then(function(r){
if(raw&&r.ok)return r.blob();return r.json().then(function(j){if(!r.ok)throw new Error(j.error&&j.error.message||'Error');return j.data;});});}
function msg(el,t,ok){el.textContent=t;el.className=ok?'ok':'err';}
function login(){app.textContent='';out.hidden=true;var e=h('div',{class:'err'}),i=h('input',{type:'password',placeholder:'Admin API key',style:'width:100%'});
function go(){key=i.value.trim();api('GET','/ledger/verify').then(function(){sessionStorage.setItem('nvkey',key);render();}).catch(function(x){msg(e,x.message,false);});}
app.appendChild(h('div',{class:'card'},h('p',{},'Enter the ADMIN_API_KEY from your server .env.'),i,h('div',{class:'row'},h('button',{class:'pri',onclick:go},'Unlock')),e));i.addEventListener('keydown',function(ev){if(ev.key==='Enter')go();});}
out.addEventListener('click',function(){sessionStorage.removeItem('nvkey');key='';login();});
function render(){out.hidden=false;app.textContent='';var nav=h('nav');[['kyc','KYC queue'],['disputes','P2P disputes'],['flags','Compliance flags'],['tools','Tools']].forEach(function(t){
nav.appendChild(h('button',{class:tab===t[0]?'on':'',onclick:function(){tab=t[0];render();}},t[1]));});app.appendChild(nav);var box=h('div');app.appendChild(box);
({kyc:kyc,disputes:disputes,flags:flags,tools:tools})[tab](box);}
function fail(box){return function(e){if(/key required/i.test(e.message))return login();box.appendChild(h('div',{class:'err'},e.message));};}
function viewDoc(d,holder,status){api('GET','/kyc/documents/'+d.id,null,true).then(function(b){var u=URL.createObjectURL(b);
if(d.mime==='application/pdf'){window.open(u,'_blank');}else{holder.appendChild(h('div',{class:'muted'},d.kind));holder.appendChild(h('img',{class:'doc',src:u}));}}).catch(function(e){msg(status,e.message,false);});}
function kyc(box){box.appendChild(h('p',{class:'muted'},'Check the photo(s) match the details and the selfie. Approve only if everything is consistent.'));
api('GET','/kyc').then(function(list){if(!list.length)box.appendChild(h('p',{class:'muted'},'No pending verifications.'));list.forEach(function(u){
var tier=h('select',{},h('option',{value:'2'},'Tier 2 (ID verified)'),h('option',{value:'3'},'Tier 3 (+TPIN & address)')),note=h('input',{placeholder:u.is_pep?'EDD note (required for PEP)':'Reject reason / note',style:'flex:1;min-width:200px'}),st=h('div'),docs=h('div');
function decide(d){api('POST','/kyc/'+u.id+'/decision',{decision:d,tier:Number(tier.value),reason:note.value}).then(function(){render();}).catch(function(e){msg(st,e.message,false);});}
var dl=h('dl');[['Name',u.full_name],['Email',u.email],['Phone',u.phone],['ID type',u.id_type],['ID number',u.national_id],['Nationality',u.nationality],['Date of birth',u.dob],['District',u.district],['Address',u.address],['Occupation',u.occupation],['Source of funds',u.source_of_funds],['TPIN',u.tax_number||'-']].forEach(function(r){dl.appendChild(h('dt',{},r[0]));dl.appendChild(h('dd',{},r[1]));});
var row=h('div',{class:'row'});u.documents.forEach(function(d){row.appendChild(h('button',{onclick:function(){viewDoc(d,docs,st);}},'View '+d.kind));});
box.appendChild(h('div',{class:'card'},h('div',{class:'row'},h('b',{},u.full_name),u.is_pep?h('span',{class:'tag'},'PEP: enhanced due diligence'):null),dl,row,docs,h('div',{class:'row'},tier,note),h('div',{class:'row'},h('button',{class:'pri',onclick:function(){decide('VERIFIED');}},'Approve'),h('button',{class:'bad',onclick:function(){decide('REJECTED');}},'Reject')),st));});}).catch(fail(box));}
function disputes(box){api('GET','/p2p/disputes').then(function(list){if(!list.length)box.appendChild(h('p',{class:'muted'},'No open disputes.'));list.forEach(function(o){var st=h('div');
function res(a){if(!confirm(a==='RELEASE'?'Release crypto to the BUYER?':'Refund crypto to the SELLER?'))return;api('POST','/p2p/'+o.id+'/resolve',{action:a}).then(function(){render();}).catch(function(e){msg(st,e.message,false);});}
box.appendChild(h('div',{class:'card'},h('b',{},'Order '+o.id),h('dl',{},h('dt',{},'Amount'),h('dd',{},(o.units/1e8)+' '+o.asset),h('dt',{},'Value'),h('dd',{},'MWK '+(o.total_mwk/100)),h('dt',{},'Buyer ref'),h('dd',{},o.payment_ref||'-'),h('dt',{},'Reason'),h('dd',{},o.dispute_reason||'-')),
h('div',{class:'row'},h('button',{class:'pri',onclick:function(){res('RELEASE');}},'Release to buyer (payment verified)'),h('button',{class:'bad',onclick:function(){res('REFUND');}},'Refund seller')),st));});}).catch(fail(box));}
function flags(box){api('GET','/flags').then(function(list){if(!list.length)box.appendChild(h('p',{class:'muted'},'Nothing flagged.'));list.forEach(function(f){box.appendChild(h('div',{class:'card'},h('b',{},f.action),h('div',{class:'muted'},new Date(f.created_at).toLocaleString()+' · '+(f.target||'')),h('pre',{},f.detail||'')));});}).catch(fail(box));}
function tools(box){var st=h('div'),pre=h('pre',{hidden:'hidden'}),em=h('input',{placeholder:'customer email',style:'flex:1;min-width:200px'});
box.appendChild(h('div',{class:'card'},h('b',{},'Ledger integrity'),h('div',{class:'row'},h('button',{onclick:function(){api('GET','/ledger/verify').then(function(r){msg(st,r.ok?'Ledger balanced: no problems found':'PROBLEMS: '+r.problems.join('; '),r.ok);}).catch(function(e){msg(st,e.message,false);});}},'Run check')),st));
var st2=h('div');box.appendChild(h('div',{class:'card'},h('b',{},'Support-assisted password reset'),h('p',{class:'muted'},'Verify the customer identity first, then send them the one-time link (valid 30 min).'),h('div',{class:'row'},em,h('button',{onclick:function(){api('POST','/users/reset-link',{email:em.value}).then(function(r){pre.hidden=false;pre.textContent=r.link;msg(st2,'Link created (shown once)',true);}).catch(function(e){msg(st2,e.message,false);});}},'Create link')),st2,pre));}
if(key){api('GET','/ledger/verify').then(render).catch(login);}else login();
})();`;
