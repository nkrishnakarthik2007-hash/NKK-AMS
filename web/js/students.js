async function students(){let ed=null;main(`<h2>Students</h2><form id=f class=bar><input id=e placeholder="Employee ID" required><input id=n placeholder="Name" required>
 <label>Joining <input type=date id=j required></label><label>Leaving <input type=date id=l></label><button id=sb2>Add Student</button><button type=button class=s id=cx hidden>Cancel</button></form>
 <div class=bar><input id=q placeholder="Search"></div><div id=v>Loading…</div>`);
 let L=[];const draw=()=>{const q=$('#q').value.toLowerCase();$('#v').innerHTML=`<div class=tw><table><tr><th>ID</th><th>Name</th><th>Joined</th><th>Left</th><th></th></tr>${L.filter(s=>(s.employee_id+s.name).toLowerCase().includes(q)).map(s=>
  `<tr><td>${esc(s.employee_id)}</td><td>${esc(s.name)}</td><td>${fmt(s.joining_date)}</td><td>${s.left_date?fmt(s.left_date):'Active'}</td><td><button class=s data-e=${s.id}>Edit</button> ${s.left_date?'':`<button class=d data-l=${s.id}>Left</button>`}</td></tr>`).join('')}</table></div>`;
  $('#v').querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>{ed=L.find(s=>s.id===b.dataset.e);$('#e').value=ed.employee_id;$('#n').value=ed.name;$('#j').value=ed.joining_date;$('#l').value=ed.left_date||'';$('#sb2').textContent='Update Student';$('#cx').hidden=false;scrollTo(0,0)});
  $('#v').querySelectorAll('[data-l]').forEach(b=>b.onclick=async()=>{const s=L.find(x=>x.id===b.dataset.l),d=prompt('Leaving date (YYYY-MM-DD) for '+s.name,today());if(!d)return;
   const{error}=await sb.from('students').update({left_date:d}).eq('id',s.id);error?toast(errTxt(error),1):(toast('Marked as Left'),load())})};
 const load=async()=>{const{data,error}=await sb.from('students').select('*').order('employee_id');if(error)return $('#v').textContent=error.message;L=data;draw()};
 $('#q').oninput=draw;$('#cx').onclick=()=>students();
 $('#f').onsubmit=async ev=>{ev.preventDefault();const r={employee_id:$('#e').value.trim(),name:$('#n').value.trim(),joining_date:$('#j').value,left_date:$('#l').value||null};
  const{error}=ed?await sb.from('students').update(r).eq('id',ed.id):await sb.from('students').insert({...r,created_by:me.id});
  if(error)return toast(errTxt(error),1);toast(ed?'Student updated':'Student added');students()};
 load()}

