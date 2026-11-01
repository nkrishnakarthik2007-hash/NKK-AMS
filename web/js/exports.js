function tools(id,name){return `<div class="bar no-print"><button class=s onclick="copyT('${id}')">Copy</button><button class=s onclick="xl('${id}','${name}')">Excel</button><button class=s onclick="print()">Print</button></div>`}
window.copyT=async id=>{const t=[...document.querySelectorAll('#'+id+' tr')].map(r=>[...r.cells].map(c=>c.innerText).join('\t')).join('\n');
 try{await navigator.clipboard.writeText(t);toast('Copied')}catch{toast('Copy failed',1)}};
window.xl=(id,name)=>{const wb=XLSX.utils.table_to_book(document.getElementById(id),{raw:true});XLSX.writeFile(wb,name+'.xlsx')};


async function yearExcel(y){try{const[S,A]=await Promise.all([fetchAll(()=>sb.from('students').select('*').order('employee_id')),
 fetchAll(()=>sb.from('attendance').select('student_id,attendance_date,status').gte('attendance_date',y+'-01-01').lte('attendance_date',y+'-12-31').order('attendance_date').order('student_id'))]);
 const T={},z=()=>Array.from({length:12},()=>[0,0]);A.forEach(r=>{(T[r.student_id]=T[r.student_id]||z())[+r.attendance_date.slice(5,7)-1][r.status==='present'?0:1]++});
 const rows=[['Employee ID','Name',...MN.flatMap(n=>[n+' P',n+' A']),'Total P','Total A','%']];
 S.forEach(s=>{const t=T[s.id]||z(),p=t.reduce((a,x)=>a+x[0],0),a=t.reduce((a,x)=>a+x[1],0);rows.push([s.employee_id,s.name,...t.flat(),p,a,p+a?+(p/(p+a)*100).toFixed(1):''])});
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Year '+y);XLSX.writeFile(wb,'attendance-'+y+'.xlsx')}catch(e){toast(e.message,1)}}
