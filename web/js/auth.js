function welcome(){app.innerHTML=`<div class="wrap big"><svg width=160 height=100 viewBox="0 0 160 100" aria-hidden=true><ellipse cx=80 cy=50 rx=70 ry=26 fill=none stroke="#94a3b8" stroke-width=1.5 transform="rotate(-18 80 50)"/><circle cx=80 cy=50 r=20 fill="#1d4ed8"/><circle cx=137 cy=32 r=5 fill="#64748b"/></svg><h1>AMS</h1><p>Attendance Management System</p>
 <button onclick="location.hash='${me?'home':'login'}'">${me?'Continue':'Login'}</button> <button class=s id=th>◐ Dark mode</button></div>`;$('#th').onclick=toggleTheme}
function login(){app.innerHTML=`<form class=wrap id=f><h2>Login</h2><label>Employee ID<input id=e autocomplete=username required></label>
 <label>Password<input id=p type=password autocomplete=current-password required></label><button style="width:100%">Login</button>
 <p><a href="#forgot">Forgot password?</a></p></form>`;
 $('#f').onsubmit=async ev=>{ev.preventDefault();const b=ev.target.querySelector('button');b.disabled=true;
  const{error}=await sb.auth.signInWithPassword({email:emailOf($('#e').value),password:$('#p').value});
  if(error){b.disabled=false;return toast('Invalid Employee ID or password',1)}
  await loadMe();if(!me){b.disabled=false;return toast('Account not active. Contact an admin.',1)}location.hash='home'}}
async function forgot(){app.innerHTML=`<div class=wrap><h2>Forgot password</h2><p>Contact an admin, or submit a reset request below.</p><div id=c>Loading…</div>
 <form id=f><input id=e placeholder="Your Employee ID" required><input id=n placeholder="Note (optional)"><button style="width:100%">Submit request</button></form>
 <p><a href="#login">Back to login</a></p></div>`;
 const{data}=await sb.from('admin_contacts').select('*');
 $('#c').innerHTML=(data||[]).map(c=>`<p><b>${esc(c.name)}</b><br>WhatsApp: ${esc(c.whatsapp)}<br>Email: ${esc(c.email)}</p>`).join('');
 $('#f').onsubmit=async ev=>{ev.preventDefault();const{error}=await sb.rpc('request_password_reset',{emp:$('#e').value,note:$('#n').value});
  error?toast(errTxt(error),1):(toast('Request submitted. An admin will contact you.'),ev.target.reset())}}

function password(){main(`<form id=f class=wrap style="margin:0"><h2>Change password</h2><input id=o type=password placeholder="Current password" required><input id=p type=password placeholder="New password (min 8)" minlength=8 required><input id=c type=password placeholder="Confirm new password" required><button style="width:100%">Update</button></form>`);
 $('#f').onsubmit=async ev=>{ev.preventDefault();const a=await sb.auth.signInWithPassword({email:emailOf(me.employee_id),password:$('#o').value});if(a.error)return toast('Current password is wrong',1);if($('#p').value!==$('#c').value)return toast('New passwords do not match',1);
  const{error}=await sb.auth.updateUser({password:$('#p').value});error?toast(error.message,1):(toast('Password changed'),ev.target.reset())}}

