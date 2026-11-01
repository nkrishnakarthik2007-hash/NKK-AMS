async function loadMe(){const{data:{session}}=await sb.auth.getSession();me=null;if(!session)return;
 const{data}=await sb.from('profiles').select('*').eq('id',session.user.id).single();
 if(!data||!data.is_active){await sb.auth.signOut();return}me=data}
window.onhashchange=()=>{if(revert){revert=false;return}
 if(dirty&&!confirm('You have unsaved changes. Leave this page?')){revert=true;location.hash=cur;return}
 dirty=false;go()};
async function boot(){await loadMe();go()}
function go(){cur=location.hash;const[p,a]=location.hash.slice(1).split('/');
 const pub={'':welcome,welcome,login,forgot};
 if(pub[p||'']){if(me&&p==='login'){location.hash='home';return}return pub[p||'']()}
 if(!me){location.hash='login';return}
 shell(p);const R={home,mark:()=>mark(a),view,students,report,holidays,users,resets,password};
 const f=R[p];if(!f)return home();
 if(['holidays','users','resets'].includes(p)&&!isAdmin())return home();f()}
function shell(p){const nav=[['home','Dashboard'],['mark','Mark Attendance'],['view','View Attendance'],['students','Students'],['report','Reports'],
 ...(isAdmin()?[['holidays','Holidays'],['users','Users'],['resets','Reset Requests']]:[]),['password','Change Password']];
 app.innerHTML=`<header class="top no-print"><button id=mb>☰</button><b>AMS</b><button id=th>◐ Theme</button><span>${esc(me.name)} · ${me.role.replace('_',' ')}</span></header>
 <div class=lay><nav id=nav class=no-print>${nav.map(([h,t])=>`<a href="#${h}" class="${h===p?'on':''}">${t}</a>`).join('')}<a href="#" id=lo>Logout</a></nav><main id=main></main></div>`;
 $('#th').onclick=toggleTheme;$('#mb').onclick=()=>$('#nav').classList.toggle('open');$('#nav').onclick=()=>$('#nav').classList.remove('open');
 $('#lo').onclick=async e=>{e.preventDefault();if(dirty&&!confirm('Unsaved changes will be lost. Logout?'))return;dirty=false;await sb.auth.signOut();me=null;location.hash='login';go()}}


boot();
