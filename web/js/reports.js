async function view(){yearView(+today().slice(0,4))}
async function yearView(y){main(`<h2>Year view</h2><div class=bar><button class=s id=pv>◀</button><b>${y}</b><button class=s id=nx>▶</button><button id=yx>Yearly Excel</button></div><div id=v>Loading…</div>`);
 $('#pv').onclick=()=>yearView(y-1);$('#nx').onclick=()=>yearView(y+1);$('#yx').onclick=()=>yearExcel(y);
 const{data,error}=await sb.rpc('day_summary',{d1:y+'-01-01',d2:y+'-12-31'});if(error)return $('#v').textContent=error.message;
 const t=Array(12).fill(0).map(()=>[0,0,0]);data.forEach(r=>{const i=+r.attendance_date.slice(5,7)-1;t[i][0]+=r.present;t[i][1]+=r.absent;t[i][2]++});
 $('#v').innerHTML='<div class=months>'+t.map((x,i)=>`<div data-m=${i}><b>${MN[i]}</b><br>P ${x[0]} · A ${x[1]}<br>${x[2]} day(s) marked</div>`).join('')+'</div>';
 $('#v').querySelectorAll('[data-m]').forEach(e=>e.onclick=()=>monthView(y,+e.dataset.m))}
async function monthView(y,m){main(`<h2>${MN[m]} ${y}</h2><div class=bar><button class=s id=bk>◀ Year</button><button class=s id=ex>Month register</button></div><div id=v>Loading…</div>`);
 $('#bk').onclick=()=>yearView(y);const a=ymd(y,m,1),z=ymd(y,m,31>new Date(y,m+1,0).getDate()?new Date(y,m+1,0).getDate():31);
 const[s,h,st]=await Promise.all([sb.rpc('day_summary',{d1:a,d2:z}),sb.from('holidays').select('*').gte('holiday_date',a).lte('holiday_date',z),sb.from('students').select('*')]);
 if(s.error)return $('#v').textContent=s.error.message;const S={},H={};s.data.forEach(r=>S[r.attendance_date]=r);h.data.forEach(r=>H[r.holiday_date]=r);
 $('#ex').onclick=()=>monthRegister(y,m,st.data);
 $('#v').innerHTML='<p>Green = complete · Orange = incomplete · Yellow = holiday · White = no attendance</p>'+cal(y,m,(d,n)=>{
  const r=S[d],e=st.data.filter(x=>elig(x,d)).length;
  if(H[d])return`<div class=hol data-d=${d}>${n}<br>${esc(H[d].reason||'Holiday')}</div>`;
  if(r)return`<div class="${r.present+r.absent>=e?'done':'part'}" data-d=${d}>${n}<br>P${r.present} A${r.absent}</div>`;return`<div data-d=${d}>${n}</div>`});
 $('#v').querySelectorAll('[data-d]').forEach(e=>e.onclick=()=>dateView(e.dataset.d,y,m))}
async function monthRegister(y,m,sts){const n=new Date(y,m+1,0).getDate(),a=ymd(y,m,1),z=ymd(y,m,n);
 let data;try{data=await fetchAll(()=>sb.from('attendance').select('student_id,attendance_date,status').gte('attendance_date',a).lte('attendance_date',z).order('attendance_date').order('student_id'))}catch(e){return toast(e.message,1)}
 const M={};data.forEach(r=>M[r.student_id+r.attendance_date]=r.status);
 main(`<h2>Register ${MN[m]} ${y}</h2><div class="bar no-print"><button class=s onclick="history.back()">Back</button></div>${tools('t','register-'+y+'-'+(m+1))}
 <div class=tw><table id=t><tr><th>Employee ID</th><th>Name</th>${Array.from({length:n},(_,i)=>`<th>${i+1}</th>`).join('')}<th>P</th><th>A</th></tr>
 ${sts.sort((a,b)=>a.employee_id.localeCompare(b.employee_id)).map(s=>{let p=0,ab=0;const c=Array.from({length:n},(_,i)=>{const d=ymd(y,m,i+1),v=M[s.id+d];v==='present'?p++:v==='absent'&&ab++;return`<td>${v==='present'?'P':v==='absent'?'A':elig(s,d)?'-':''}</td>`}).join('');
 return`<tr><td>${esc(s.employee_id)}</td><td>${esc(s.name)}</td>${c}<td>${p}</td><td>${ab}</td></tr>`}).join('')}</table></div>`)}
async function dateView(d,y,m){main(`<h2>${fmt(d)}</h2><div class="bar no-print"><button class=s id=bk>◀ Month</button><a href="#mark/${d}"><button>Edit / Mark</button></a><select id=fl><option value=all>All</option><option value=present>Present</option><option value=absent>Absent</option><option value=none>Not Marked</option></select></div>${tools('t','attendance-'+d)}<div id=v>Loading…</div>`);
 $('#bk').onclick=()=>monthView(y,m);
 const[a,b,c]=await Promise.all([sb.from('students').select('*').order('employee_id'),sb.from('attendance').select('student_id,status').eq('attendance_date',d),sb.from('holidays').select('*').eq('holiday_date',d)]);
 if(a.error||b.error)return $('#v').textContent=(a.error||b.error).message;const S={};b.data.forEach(r=>S[r.student_id]=r.status);const L=a.data.filter(s=>elig(s,d));
 const draw=()=>{const f=$('#fl').value,rows=L.filter(s=>f==='all'||(f==='none'?!S[s.id]:S[s.id]===f));
  $('#v').innerHTML=(c.data.length?`<p class="note hol">Holiday: ${esc(c.data[0].reason||'Non-working day')}</p>`:'')+`<p>Present ${L.filter(s=>S[s.id]==='present').length} · Absent ${L.filter(s=>S[s.id]==='absent').length} · Not Marked ${L.filter(s=>!S[s.id]).length}</p>
  <div class=tw><table id=t><tr><th>S.No</th><th>Employee ID</th><th>Name</th><th>Status</th></tr>${rows.map((s,i)=>`<tr><td>${i+1}</td><td>${esc(s.employee_id)}</td><td>${esc(s.name)}</td><td>${stTxt(S[s.id])}</td></tr>`).join('')}</table></div>`};
 $('#fl').onchange=draw;draw()}

async function report(){main(`<h2>Individual report</h2><div class=bar><input id=q list=dl placeholder="Employee ID or Name" autocomplete=off><datalist id=dl></datalist>
 <input type=number id=y value=${today().slice(0,4)} style="width:100px"><button id=go>Show</button></div><div id=v></div>`);
 const{data:S}=await sb.from('students').select('*').order('employee_id');
 $('#dl').innerHTML=(S||[]).map(s=>`<option value="${esc(s.employee_id)} - ${esc(s.name)}">`).join('');
 $('#go').onclick=async()=>{const k=$('#q').value.split(' - ')[0].trim().toLowerCase(),y=+$('#y').value;
  const s=S.find(x=>x.employee_id.toLowerCase()===k)||S.find(x=>x.name.toLowerCase()===$('#q').value.trim().toLowerCase());if(!s)return toast('Student not found',1);
  const{data,error}=await sb.from('attendance').select('attendance_date,status').eq('student_id',s.id).gte('attendance_date',y+'-01-01').lte('attendance_date',y+'-12-31');if(error)return toast(error.message,1);
  const M={};data.forEach(r=>M[r.attendance_date]=r.status);const mo=Array(12).fill(0).map(()=>[0,0]);data.forEach(r=>mo[+r.attendance_date.slice(5,7)-1][r.status==='present'?0:1]++);
  const P=mo.reduce((a,x)=>a+x[0],0),A=mo.reduce((a,x)=>a+x[1],0),pc=(p,a)=>p+a?(p/(p+a)*100).toFixed(1)+'%':'–';
  $('#v').innerHTML=`<h3>${esc(s.name)} (${esc(s.employee_id)}) – ${y}</h3><p>Joined ${fmt(s.joining_date)} · Left ${s.left_date?fmt(s.left_date):'Active'}</p><p>Present ${P} · Absent ${A} · Attendance ${pc(P,A)}</p>${tools('t','student-'+s.employee_id+'-'+y)}
  <div class=tw><table id=t><tr><th>Month</th><th>Present</th><th>Absent</th><th>%</th></tr>${mo.map((x,i)=>`<tr><td>${MN[i]}</td><td>${x[0]}</td><td>${x[1]}</td><td>${pc(...x)}</td></tr>`).join('')}<tr><th>Total</th><th>${P}</th><th>${A}</th><th>${pc(P,A)}</th></tr></table></div>
  <h3>Calendar</h3><select id=cm>${MN.map((n,i)=>`<option value=${i}>${n}</option>`).join('')}</select><div id=cv></div>`;
  const dr=()=>{const m=+$('#cm').value;$('#cv').innerHTML=cal(y,m,(d,n)=>`<div class="${M[d]==='present'?'P':M[d]==='absent'?'A':''}">${n}</div>`)};$('#cm').value=Math.min(new Date().getMonth(),11);$('#cm').onchange=dr;dr()}}

