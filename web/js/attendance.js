async function mark(d){d=d||today();dirty=false;
 main(`<h2>Mark attendance</h2><div class=bar>${dateSel(d)}<b>${fmt(d)}</b><input id=qs placeholder="Search ID or name"></div><div id=mb2>Loading…</div>`);
 bindDate(v=>{if(dirty&&!confirm('Discard unsaved changes?')){const[y,mo,dd]=d.split('-').map(Number);$('#sy').value=y;$('#sm').value=mo;$('#sd').value=dd;return}dirty=false;location.hash='mark/'+v});
 const[a,b,c]=await Promise.all([sb.from('students').select('*').order('employee_id'),sb.from('attendance').select('student_id,status').eq('attendance_date',d),sb.from('holidays').select('*').eq('holiday_date',d)]);
 const er=a.error||b.error||c.error;if(er)return $('#mb2').innerHTML=`<p class=note>Could not load: ${esc(er.message)}</p>`;
 if(c.data.length)return $('#mb2').innerHTML=`<p class="note hol">Holiday: ${esc(c.data[0].reason||'Non-working day')}. Attendance cannot be marked.</p>`;
 const L=a.data.filter(s=>elig(s,d)),saved={};b.data.forEach(x=>saved[x.student_id]=x.status);const m={...saved};let flt='all',q='';$('#qs').oninput=e=>{q=e.target.value.toLowerCase();draw()};
 const cnt=()=>({p:L.filter(s=>m[s.id]==='present').length,a:L.filter(s=>m[s.id]==='absent').length,n:L.filter(s=>!m[s.id]).length});
 const draw=()=>{const c=cnt(),rows=L.filter(s=>(flt==='all'||(flt==='none'?!m[s.id]:m[s.id]===flt))&&(s.employee_id+' '+s.name).toLowerCase().includes(q));
  $('#mb2').innerHTML=`<div class="bar no-print"><button id=mp>Mark All Present</button>
  <select id=fl>${[['all','All'],['present','Present'],['absent','Absent'],['none','Not Marked']].map(([v,t])=>`<option value=${v} ${v===flt?'selected':''}>${t}</option>`).join('')}</select></div>
  <div class=tw><table><tr><th>S.No</th><th>Employee ID</th><th>Name</th><th>Attendance</th><th>Status</th></tr>
  ${rows.map((s,i)=>`<tr><td>${i+1}</td><td>${esc(s.employee_id)}</td><td>${esc(s.name)}</td><td><div class=pa>
  <button class="P ${m[s.id]==='present'?'on':''}" data-i="${s.id}" data-v=present>Present</button><button class="A ${m[s.id]==='absent'?'on':''}" data-i="${s.id}" data-v=absent>Absent</button></div></td>
  <td>${stTxt(saved[s.id])}</td></tr>`).join('')||'<tr><td colspan=5>No eligible students for this date.</td></tr>'}</table></div>
  <div class="sum no-print"><span>Done ${c.p+c.a}/${L.length} · P ${c.p} · A ${c.a} · Not marked ${c.n}</span><button id=sv>${Object.keys(saved).length?'Update Attendance':'Save Attendance'}</button></div>
  ${c.n&&L.length?'<p class=note>Warning: attendance is incomplete.</p>':''}`;
  $('#fl').onchange=e=>{flt=e.target.value;draw()};
  $('#mp').onclick=()=>{if(!confirm('Select Present for all '+L.length+' students? Nothing is saved until you click Save Attendance.'))return;L.forEach(s=>m[s.id]='present');dirty=true;draw()};
  $('#mb2').querySelectorAll('.pa button').forEach(x=>x.onclick=()=>{m[x.dataset.i]=x.dataset.v;dirty=true;draw()});
  $('#sv').onclick=save};
 const save=async()=>{const c=cnt(),ch=L.filter(s=>saved[s.id]&&saved[s.id]!==m[s.id]).length;
  const rows=L.filter(s=>m[s.id]).map(s=>({student_id:s.id,attendance_date:d,status:m[s.id]}));
  if(!rows.length)return toast('Nothing marked to save',1);
  if(!confirm(`Save attendance for ${fmt(d)}?\nTotal: ${L.length}\nPresent: ${c.p}\nAbsent: ${c.a}\nNot Marked: ${c.n}\nCompletion: ${c.p+c.a}/${L.length}`+(c.n?'\n\nWarning: unmarked students stay Not Marked (not counted absent).':'')+(ch?`\n\n${ch} existing record(s) will be overwritten.`:'')))return;
  $('#sv').disabled=true;const{error}=await sb.from('attendance').upsert(rows,{onConflict:'student_id,attendance_date'});
  if(error){$('#sv').disabled=false;return toast('Save failed: '+error.message,1)}
  Object.assign(saved,m);dirty=false;draw();toast('Attendance saved')};
 draw()}

