function home(){main(`<h2>Dashboard</h2><div class=cards>
 <a class=card href="#mark">Mark Attendance</a><a class=card href="#view">View Attendance</a><a class=card href="#students">Student Management</a><a class=card href="#report">Reports</a>
 ${isAdmin()?'<a class=card href="#users">Users</a><a class=card href="#resets">Reset Requests</a><a class=card href="#holidays">Holidays</a>':''}</div>`)}

