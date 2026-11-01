const sb=supabase.createClient(CFG.url,CFG.key);
const $=s=>document.querySelector(s),app=$('#app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MN=['January','February','March','April','May','June','July','August','September','October','November','December'];
const ymd=(y,m,d)=>`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const today=()=>{const d=new Date();return ymd(d.getFullYear(),d.getMonth(),d.getDate())};
const fmt=d=>d?d.split('-').reverse().join('-'):'';
const elig=(s,d)=>s.joining_date<=d&&(!s.left_date||s.left_date>=d);
const emailOf=id=>`${id.trim()}@ams.example.com`;
const stTxt=v=>v==='present'?'<span class=st-present>Present</span>':v==='absent'?'<span class=st-absent>Absent</span>':'<span class=st-none>Not Marked</span>';
let me=null,dirty=false,cur='',revert=false;
const isAdmin=()=>me&&['admin','super_admin'].includes(me.role);
const toast=(m,e)=>{const t=$('#toast');t.textContent=m;t.className='show'+(e?' err':'');clearTimeout(t.h);t.h=setTimeout(()=>t.className='',4000)};
const errTxt=e=>e.code==='23505'?'Duplicate: that Employee ID already exists.':(e.message||String(e));
const main=h=>{$('#main').innerHTML=h};
const bye=()=>{if(dirty)return'x'};window.onbeforeunload=bye;

function cal(y,m,cell){const f=new Date(y,m,1).getDay(),n=new Date(y,m+1,0).getDate();
 let h='<div class=cal>'+'SMTWTFS'.split('').map(x=>`<b>${x}</b>`).join('');
 for(let i=0;i<f;i++)h+='<i></i>';for(let d=1;d<=n;d++)h+=cell(ymd(y,m,d),d);return h+'</div>'}

async function fetchAll(mk){let o=[],f=0;for(;;){const{data,error}=await mk().range(f,f+999);if(error)throw error;o=o.concat(data);if(data.length<1000)return o;f+=1000}}
const applyTheme=t=>{document.documentElement.dataset.theme=t;try{localStorage.setItem('ams-theme',t)}catch{}};
const toggleTheme=()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
try{applyTheme(localStorage.getItem('ams-theme')||'light')}catch{applyTheme('light')}
function dateSel(d){const[y,m,dd]=d.split('-').map(Number);
 return `<select id=sy>${[y-3,y-2,y-1,y,y+1].map(v=>`<option ${v===y?'selected':''}>${v}</option>`).join('')}</select><select id=sm>${MN.map((t,i)=>`<option value=${i+1} ${i+1===m?'selected':''}>${t}</option>`).join('')}</select><select id=sd>${Array.from({length:31},(_,i)=>`<option ${i+1===dd?'selected':''}>${i+1}</option>`).join('')}</select>`}
function bindDate(cb){const g=()=>{const y=+$('#sy').value,m=+$('#sm').value;cb(ymd(y,m-1,Math.min(+$('#sd').value,new Date(y,m,0).getDate())))};['#sy','#sm','#sd'].forEach(s=>$(s).onchange=g)}
