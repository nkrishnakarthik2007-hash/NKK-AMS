# Status
Implemented: all modules in the spec (see web/js/*). Verified only by static checks (JS syntax, script/CSS paths, no duplicate globals).
NOT tested against live Supabase, a browser, Android, or the deployed site. SQL not executed.
Known limits: student list queries assume < 1000 students outside exports (exports/registers paginate).
