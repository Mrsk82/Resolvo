  _settingsTab: 'general',

  renderUnifiedSettings: async function(tab) {
    var self = this;
    if (!self.currentUser || self.currentUser.role !== 'Admin') { self.showToast('Admin access required','error'); return; }
    self._settingsTab = tab || self._settingsTab || 'general';
    self.setPage('Settings','Admin / Settings');
    var area = document.getElementById('contentArea');

    var TABS = [
      {id:'general',icon:'🏢',label:'General'},
      {id:'email',icon:'📬',label:'Email & Ticketing'},
      {id:'sla',icon:'⏱',label:'SLA & Workflow'},
      {id:'integrations',icon:'🔗',label:'Integrations'},
      {id:'team',icon:'🤝',label:'Team & Roles'},
      {id:'features',icon:'⚡',label:'Features & Plan'},
      {id:'security',icon:'🔐',label:'Security'},
    ];

    var tabsHtml = TABS.map(function(t){
      var active = t.id === self._settingsTab;
      return '<div onclick="App._settingsTab=\''+t.id+'\';App.renderUnifiedSettings(\''+t.id+'\')" '+
        'style="display:flex;align-items:center;gap:9px;padding:10px 14px;cursor:pointer;border-radius:8px;'+
        'background:'+(active?'var(--accent-dim)':'transparent')+';'+
        'border:1px solid '+(active?'var(--border-accent)':'transparent')+';margin-bottom:2px;transition:all .12s;">'+
        '<span style="font-size:16px;">'+t.icon+'</span>'+
        '<span style="font-size:13px;font-weight:'+(active?700:500)+';color:'+(active?'var(--accent)':'var(--text-secondary)')+';">'+t.label+'</span>'+
        '</div>';
    }).join('');

    area.innerHTML =
      '<div style="display:flex;gap:20px;min-height:calc(100vh - 140px);">'+
        '<div style="width:195px;flex-shrink:0;">'+
          '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:10px;">'+
          tabsHtml+
          '</div>'+
        '</div>'+
        '<div id="settingsContent" style="flex:1;min-width:0;">'+
          '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-dim);">Loading...</div>'+
        '</div>'+
      '</div>';

    var content = '';
    var tid = self._settingsTab;

    try {
      if (tid === 'general') {
        var r = await self.callAsync('getSettings');
        var s = (r&&r.success)?r.settings:{};
        var mr = await self.callAsync('getModules');
        var mods = (mr&&mr.success)?mr.modules:[];
        content =
          App._sSection('Brand Identity',[
            App._sRow('App / Brand Name','Shown in sidebar, emails and public pages',
              '<input id="s_appname" class="form-input" style="width:240px;" value="'+App._esc(s.APP_NAME||'Resolvo')+'">'),
            App._sRow('Logo URL','Brand logo URL (leave blank to use ⟳ icon)',
              '<input id="s_logo" class="form-input" style="width:240px;" placeholder="https://..." value="'+App._esc(s.LOGO_URL||'')+'">'),
            App._sRow('Support Email','Reply-to address in notification emails',
              '<input id="s_support_email" class="form-input" style="width:240px;" placeholder="support@company.com" value="'+App._esc(s.SUPPORT_EMAIL||'')+'">'),
            '<div style="text-align:right;margin-top:14px;"><button onclick="App._saveGeneralSettings()" class="btn-primary">Save Changes</button></div>'
          ])+
          App._sSection('Modules',[
            '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Comma-separated modules available when creating issues.</div>',
            '<textarea id="admin_modules" class="form-textarea" style="min-height:70px;font-family:var(--font-mono);font-size:12px;">'+mods.join(', ')+'</textarea>',
            '<div style="text-align:right;margin-top:8px;"><button onclick="App.saveModulesFromAdmin()" class="btn-secondary btn-sm">Save Modules</button></div>'
          ]);
      }
      else if (tid === 'email') {
        var er = await self.callAsync('getEmailTicketingConfig');
        var ec = (er&&er.success)?er.config:{};
        var etON = ec.enabled===true;
        content =
          App._sSection('Email Ticketing — Inbox Monitor',[
            '<div style="background:'+(etON?'var(--low-dim)':'var(--critical-dim)')+';border:1px solid '+(etON?'rgba(22,163,74,.3)':'rgba(220,38,38,.25)')+';border-radius:8px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;">'+
              '<div style="font-size:13px;font-weight:700;color:'+(etON?'var(--low)':'var(--critical)')+';">'+(etON?'● Connected — monitoring '+App._esc(ec.user||''):'○ Disabled'+(ec.user?' — '+App._esc(ec.user):''))+'</div>'+
              '<div style="display:flex;gap:6px;">'+(etON?'<button onclick="App._pollEmailNow()" class="btn-secondary btn-sm">⟳ Poll Now</button>':'')+
              '<button onclick="App.navigate(\'ticket-inbox\')" class="btn-secondary btn-sm">📬 Open Inbox</button></div>'+
            '</div>',
            App._sRow('Enable Email Ticketing','Monitor inbox and auto-create tickets',
              '<input type="checkbox" id="et_enabled" '+(etON?'checked':'')+' style="width:18px;height:18px;accent-color:var(--accent);">'),
            App._sRow('IMAP Host','Gmail: imap.gmail.com · Outlook: outlook.office365.com',
              '<input id="et_host" class="form-input" style="width:230px;" value="'+App._esc(ec.host||'imap.gmail.com')+'">'),
            App._sRow('Inbox Email','The email address to monitor',
              '<input id="et_user" type="email" class="form-input" style="width:230px;" value="'+App._esc(ec.user||'')+'">'),
            App._sRow('App Password','Gmail: use App Password from myaccount.google.com/apppasswords',
              '<input id="et_pass" type="password" class="form-input" style="width:230px;" placeholder="'+(ec.pass?'(saved — leave blank to keep)':'Gmail App Password')+'">'),
            App._sRow('Poll Every','How often to check for new emails',
              '<select id="et_interval" class="form-select" style="width:120px;">'+[2,5,10,15,30].map(function(n){return '<option value="'+n+'"'+((ec.intervalMinutes||5)==n?' selected':'')+'>'+n+' min</option>';}).join('')+'</select>'),
            App._sRow('Default Priority','Used when no keywords found in subject',
              '<select id="et_priority" class="form-select" style="width:120px;">'+['Critical','High','Medium','Low'].map(function(p){return '<option'+(p===(ec.defaultPriority||'Medium')?' selected':'')+'>'+p+'</option>';}).join('')+'</select>'),
            App._sRow('Send Ack Email','Auto-reply to sender with ticket ID',
              '<input type="checkbox" id="et_ack" '+(ec.sendAckEmail!==false?'checked':'')+' style="width:18px;height:18px;accent-color:var(--accent);">'),
            '<div style="margin-top:10px;"><label class="form-label">Spam Blocklist (comma-separated emails, domains, keywords)</label>'+
              '<textarea id="et_blocklist" class="form-textarea" style="min-height:55px;font-family:var(--font-mono);font-size:12px;" placeholder="spam@example.com, @newsletter.com, unsubscribe">'+App._esc(ec.senderBlocklist||'')+'</textarea></div>',
            '<div id="et_result" style="display:none;margin-top:8px;"></div>',
            '<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;">'+
              '<button onclick="App._testEmailConnection()" class="btn-secondary">🔌 Test Connection</button>'+
              '<button onclick="App._saveEmailFromSettings()" class="btn-primary">💾 Save Email Settings</button>'+
            '</div>'
          ])+
          App._sSection('Auto-Spam Filter',[
            '<div style="font-size:13px;color:var(--text-secondary);line-height:1.8;">Automatically skipped (no ticket created):<br>'+
            '<code style="background:var(--bg-elevated);padding:1px 6px;border-radius:3px;font-size:11px;">mailer-daemon</code> '+
            '<code style="background:var(--bg-elevated);padding:1px 6px;border-radius:3px;font-size:11px;">noreply</code> '+
            '<code style="background:var(--bg-elevated);padding:1px 6px;border-radius:3px;font-size:11px;">postmaster</code> '+
            '<code style="background:var(--bg-elevated);padding:1px 6px;border-radius:3px;font-size:11px;">bounce</code> '+
            '· Delivery Status Notification · Undeliverable · Auto-Reply · Out of Office</div>'
          ]);
      }
      else if (tid === 'sla') {
        var sr = await self.callAsync('getSLAConfig');
        var sla = (sr&&sr.success)?sr.config:{};
        var pC = {Critical:'var(--critical)',High:'var(--high)',Medium:'var(--accent)',Low:'var(--low)'};
        content =
          App._sSection('SLA Rules — Maximum Resolution Time',[
            '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px;">'+
              ['Critical','High','Medium','Low'].map(function(p){
                return '<div style="background:var(--bg-elevated);border:1.5px solid '+pC[p]+'44;border-radius:12px;padding:16px;text-align:center;">'+
                  '<div style="font-size:12px;font-weight:700;color:'+pC[p]+';margin-bottom:10px;">'+p+'</div>'+
                  '<input type="number" id="sla_'+p+'" class="form-input" style="text-align:center;font-size:22px;font-weight:800;color:'+pC[p]+';background:transparent;border-color:'+pC[p]+'44;" value="'+(sla[p]||24)+'" min="1">'+
                  '<div style="font-size:11px;color:var(--text-dim);margin-top:6px;">hours</div>'+
                '</div>';
              }).join('')+
            '</div>',
            '<div style="text-align:right;"><button onclick="App.saveSLAFromAdmin()" class="btn-primary">Save SLA Rules</button></div>'
          ])+
          App._sSection('Working Hours',[
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">'+
              '<div class="form-group"><label class="form-label">Start Hour (24h)</label><input id="wh_start" type="number" class="form-input" value="9" min="0" max="23"></div>'+
              '<div class="form-group"><label class="form-label">End Hour (24h)</label><input id="wh_end" type="number" class="form-input" value="18" min="1" max="24"></div>'+
              '<div class="form-group"><label class="form-label">Timezone</label><select id="wh_tz" class="form-select"><option>UTC</option><option>Asia/Kolkata</option><option>US/Eastern</option><option>US/Pacific</option><option>Europe/London</option><option>Asia/Dubai</option></select></div>'+
            '</div>',
            '<div style="margin-top:10px;"><label class="form-label">Work Days</label>'+
              '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">'+
                ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(function(d,i){
                  return '<label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-secondary);cursor:pointer;padding:5px 10px;border-radius:6px;background:var(--bg-elevated);border:1px solid var(--border);">'+
                    '<input type="checkbox" id="wd_'+i+'" '+(i<5?'checked':'')+' style="accent-color:var(--accent);"> '+d+'</label>';
                }).join('')+
              '</div>'+
            '</div>',
            '<div style="text-align:right;margin-top:12px;"><button onclick="App.saveWorkingHours()" class="btn-primary">Save Working Hours</button></div>'
          ])+
          App._sSection('Automation',[
            '<div style="display:flex;gap:10px;flex-wrap:wrap;">'+
              '<button onclick="App.navigate(\'escalations\')" class="btn-secondary btn-sm">⚠ Escalation Rules</button>'+
              '<button onclick="App.navigate(\'recurring\')" class="btn-secondary btn-sm">↺ Recurring Templates</button>'+
              '<button onclick="App.navigate(\'oncall\')" class="btn-secondary btn-sm">📞 On-Call Schedule</button>'+
            '</div>'
          ]);
      }
      else if (tid === 'integrations') {
        var sr2 = await self.callAsync('getSettings');
        var st = (sr2&&sr2.success)?sr2.settings:{};
        content =
          App._sSection('External API Integration',[
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'+
              '<div class="form-group"><label class="form-label">Platform</label><select id="apiType" class="form-select" onchange="App._apiTypeChange()">'+
                '<option value="">— Disabled —</option>'+
                '<option value="jira"'+(st.EXTERNAL_API_TYPE==='jira'?' selected':'')+'>Jira (Atlassian)</option>'+
                '<option value="servicenow"'+(st.EXTERNAL_API_TYPE==='servicenow'?' selected':'')+'>ServiceNow</option>'+
                '<option value="github"'+(st.EXTERNAL_API_TYPE==='github'?' selected':'')+'>GitHub Issues</option>'+
                '<option value="custom"'+(st.EXTERNAL_API_TYPE==='custom'?' selected':'')+'>Custom REST API</option>'+
              '</select></div>'+
              '<div class="form-group"><label class="form-label">Base URL</label><input id="apiBaseUrl" class="form-input" value="'+App._esc(st.EXTERNAL_API_BASE_URL||'')+'" placeholder="https://your-domain.atlassian.net"></div>'+
              '<div class="form-group"><label class="form-label">Username / Email</label><input id="apiUser" class="form-input" value="'+App._esc(st.EXTERNAL_API_USER||'')+'" placeholder="user@email.com"></div>'+
              '<div class="form-group"><label class="form-label">API Token / Password</label><input id="apiToken" class="form-input" type="password" placeholder="API token"></div>'+
              '<div class="form-group" id="apiProjectGroup"><label class="form-label">Project Key / Repo</label><input id="apiProject" class="form-input" value="'+App._esc(st.EXTERNAL_API_PROJECT_KEY||'')+'" placeholder="TECH or owner/repo"></div>'+
            '</div>',
            '<div style="display:flex;gap:8px;margin-top:12px;"><button onclick="App._saveAPIConfig()" class="btn-primary btn-sm">💾 Save</button><button onclick="App._syncFromAPI()" class="btn-secondary btn-sm">⟳ Sync From API</button></div>',
            '<div id="apiResult" style="display:none;margin-top:10px;"></div>'
          ])+
          App._sSection('Slack & Webhooks',[
            App._sRow('Slack Webhook URL','Slack channel alerts',
              '<input id="notif_slack" class="form-input" style="width:280px;" placeholder="https://hooks.slack.com/..." value="'+App._esc(st.SLACK_WEBHOOK_URL||'')+'">'),
            App._sRow('Custom Webhook URL','POST to any URL on issue events',
              '<input id="notif_wa" class="form-input" style="width:280px;" placeholder="https://your-webhook.com/..." value="'+App._esc(st.WEBHOOK_ALERT_URL||'')+'">'),
            App._sRow('Alert Level','',
              '<select id="notif_threshold" class="form-select" style="width:140px;"><option value="false"'+(st.WEBHOOK_CRITICAL_ONLY!=='true'?' selected':'')+'>All Issues</option><option value="true"'+(st.WEBHOOK_CRITICAL_ONLY==='true'?' selected':'')+'>Critical Only</option></select>'),
            '<div style="text-align:right;margin-top:12px;"><button onclick="App.saveNotifChannels()" class="btn-primary">Save Webhooks</button></div>'
          ])+
          App._sSection('Gemini AI',[
            '<div style="background:var(--bg-elevated);border-radius:8px;padding:12px 14px;margin-bottom:12px;font-size:12px;color:var(--text-muted);">Powers smart triage, summaries and standup digests. Get a free key at <a href="https://aistudio.google.com" target="_blank" style="color:var(--accent);">aistudio.google.com</a></div>',
            '<div style="display:flex;gap:8px;"><input id="ai_localKey" class="form-input" style="flex:1;" type="password" placeholder="AIza..."><button onclick="App.saveBrowserGeminiKey()" class="btn-primary btn-sm">Save Key</button></div>'
          ]);
      }
      else if (tid === 'team') {
        var tr = await self.callAsync('getTeams');
        var teams = (tr&&tr.success)?tr.teams:[];
        var cfr = await self.callAsync('getCustomFields');
        var fields = (cfr&&cfr.success)?cfr.fields:[];
        content =
          App._sSection('Teams ('+teams.length+')',[
            '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:8px;margin-bottom:12px;">'+
              (teams.length?teams.map(function(t){
                return '<div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;">'+
                  '<div><div style="font-size:13px;font-weight:600;color:var(--text-primary);">'+App._esc(t.name)+'</div>'+
                  (t.description?'<div style="font-size:11px;color:var(--text-dim);">'+App._esc(t.description)+'</div>':'')+
                  '</div><button onclick="App.callAsync(\'deleteTeam\',\''+t.id+'\').then(function(){App.showToast(\'Deleted\',\'success\');App.renderUnifiedSettings(\'team\');})" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:16px;">×</button></div>';
              }).join(''):'<div style="font-size:12px;color:var(--text-dim);">No teams yet.</div>')+
            '</div>',
            '<div style="display:flex;gap:8px;">'+
              '<input id="newTeamName" class="form-input" style="flex:1;" placeholder="New team name">'+
              '<input id="newTeamDesc" class="form-input" style="flex:1;" placeholder="Description (optional)">'+
              '<button onclick="App._quickAddTeam()" class="btn-primary btn-sm">+ Add Team</button>'+
            '</div>'
          ])+
          App._sSection('Custom Fields ('+fields.length+')',[
            (fields.length?fields.map(function(f){
              return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">'+
                '<span style="flex:1;font-size:13px;font-weight:600;color:var(--text-primary);">'+App._esc(f.name)+'</span>'+
                '<span style="font-size:11px;color:var(--text-dim);padding:2px 8px;background:var(--bg-elevated);border-radius:5px;">'+f.type+'</span>'+
                '<span style="font-size:11px;color:'+(f.required?'var(--critical)':'var(--text-dim)');'">'+( f.required?'Required':'Optional')+'</span>'+
                '<button onclick="App.callAsync(\'deleteCustomField\',\''+f.id+'\').then(function(){App.renderUnifiedSettings(\'team\');})" class="btn-danger btn-sm" style="font-size:10px;">Remove</button>'+
              '</div>';
            }).join(''):'<div style="font-size:12px;color:var(--text-dim);">No custom fields yet.</div>'),
            '<div style="text-align:right;margin-top:10px;"><button onclick="App.navigate(\'custom-fields\')" class="btn-secondary btn-sm">Advanced Custom Fields →</button></div>'
          ]);
      }
      else if (tid === 'features') {
        var flagR = await self.callAsync('getAllFeatureFlags');
        var flags = (flagR&&flagR.success)?flagR.flags:{};
        var overrides = (flagR&&flagR.overrides)?flagR.overrides:{};
        var tier = (self.currentUser&&self.currentUser.brandTier)||'Free';
        var tClr = ({Enterprise:'#f5a623',Pro:'#74b9ff',Free:'#636e72',Trial:'#2ed573'})[tier]||'#636e72';
        var fnm = {KANBAN_ENABLED:'Kanban Board',SPRINTS_ENABLED:'Sprints & Burndown',BULK_ACTIONS_ENABLED:'Bulk Actions',
          DEPENDENCY_GRAPH_ENABLED:'Dependencies',AI_ENABLED:'AI / Gemini',AI_SMART_TRIAGE_ENABLED:'Smart AI Triage',
          FULL_TEXT_SEARCH_ENABLED:'Full Text Search',ANALYTICS_ENABLED:'Analytics',WORKLOAD_ENABLED:'Workload View',
          SLA_REPORT_ENABLED:'SLA Report',RELEASE_NOTES_ENABLED:'Release Notes',POSTMORTEM_ENABLED:'Post-Mortems',
          PEER_REVIEW_ENABLED:'Peer Review',ON_CALL_ENABLED:'On-Call Schedule',TIME_LOGGING_ENABLED:'Time Logging',
          WATCHERS_ENABLED:'Watchers',REACTIONS_ENABLED:'Reactions',CUSTOM_FIELDS_ENABLED:'Custom Fields',
          TAGS_ENABLED:'Issue Tags',PINNED_ISSUES_ENABLED:'Pinned Issues',ANNOUNCEMENT_BAR_ENABLED:'Announcement Bar',
          ISSUE_TEMPLATES_ENABLED:'Issue Templates',API_INTEGRATION_ENABLED:'API Integration',EMAIL_TRIAGE_ENABLED:'Email Triage'};
        var fGroups = [
          {l:'Workflow',f:['KANBAN_ENABLED','SPRINTS_ENABLED','BULK_ACTIONS_ENABLED','DEPENDENCY_GRAPH_ENABLED']},
          {l:'AI & Intelligence',f:['AI_ENABLED','AI_SMART_TRIAGE_ENABLED','FULL_TEXT_SEARCH_ENABLED']},
          {l:'Analytics',f:['ANALYTICS_ENABLED','WORKLOAD_ENABLED','SLA_REPORT_ENABLED','RELEASE_NOTES_ENABLED','POSTMORTEM_ENABLED']},
          {l:'Collaboration',f:['PEER_REVIEW_ENABLED','ON_CALL_ENABLED','TIME_LOGGING_ENABLED','WATCHERS_ENABLED','REACTIONS_ENABLED']},
          {l:'Customisation',f:['CUSTOM_FIELDS_ENABLED','TAGS_ENABLED','PINNED_ISSUES_ENABLED','ANNOUNCEMENT_BAR_ENABLED','ISSUE_TEMPLATES_ENABLED']},
          {l:'Integrations',f:['API_INTEGRATION_ENABLED','EMAIL_TRIAGE_ENABLED']},
        ];
        content =
          App._sSection('Current Plan',[
            '<div style="display:flex;align-items:center;gap:14px;padding:6px 0;">'+
              '<div style="width:48px;height:48px;border-radius:50%;background:'+tClr+'22;border:2px solid '+tClr+';display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:'+tClr+';">'+tier.charAt(0)+'</div>'+
              '<div><div style="font-size:18px;font-weight:800;color:var(--text-primary);">'+tier+' Plan</div>'+
              '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Contact your platform owner to change plan</div></div>'+
            '</div>'
          ])+
          App._sSection('Feature Toggles',[
            fGroups.map(function(g){
              return '<div style="margin-bottom:14px;">'+
                '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin-bottom:5px;">'+g.l+'</div>'+
                g.f.map(function(k){
                  var on=flags[k]===true||flags[k]==='true';
                  var locked=k in overrides;
                  return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:6px;background:var(--bg-elevated);margin-bottom:3px;">'+
                    '<div style="flex:1;">'+
                      '<span style="font-size:13px;color:var(--text-primary);">'+(fnm[k]||k)+'</span>'+
                      (locked?'<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:var(--accent-dim);color:var(--accent);margin-left:6px;">OWNER SET</span>':'')+
                    '</div>'+
                    (locked
                      ?'<span style="font-size:12px;font-weight:700;color:'+(on?'var(--low)':'var(--critical)')+';">'+(on?'On':'Off')+'</span>'
                      :'<input type="checkbox"'+(on?' checked':'')+' onchange="App.toggleFeatureFlag(\''+k+'\',this.checked)" style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer;">')+
                  '</div>';
                }).join('')+
              '</div>';
            }).join('')
          ]);
      }
      else if (tid === 'security') {
        content =
          App._sSection('Authentication',[
            App._sRow('Session Duration','','<span style="font-size:13px;color:var(--text-secondary);">8h normal · 30d with Remember Me</span>'),
            App._sRow('Rate Limiting','5 attempts / 15min / IP','<span style="color:var(--low);font-size:13px;font-weight:600;">● Active</span>'),
            App._sRow('Password Storage','','<span style="color:var(--low);font-size:13px;font-weight:600;">● bcrypt hash (cost 10)</span>'),
            App._sRow('Data Isolation','Separate DB file per brand','<span style="color:var(--low);font-size:13px;font-weight:600;">● Enabled</span>')
          ])+
          App._sSection('Backup & Restore',[
            '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Download a full JSON backup of all brand data, or restore from a previous backup.</div>',
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">'+
              '<button onclick="App._downloadBackup()" class="btn-secondary btn-sm">⬇ Download Backup</button>'+
              '<label class="btn-secondary btn-sm" style="cursor:pointer;">⬆ Restore Backup<input type="file" accept=".json" style="display:none" onchange="App._restoreBackup(this)"></label>'+
              '<button onclick="App.navigate(\'platform-admin\')" class="btn-secondary btn-sm">📊 Platform Stats</button>'+
            '</div>'
          ])+
          App._sSection('Audit Trail',[
            '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Every user action logged with email, timestamp, and issue ID.</div>',
            '<button onclick="App.navigate(\'audit-trail\')" class="btn-secondary btn-sm">View Full Audit Log →</button>'
          ]);
      }
    } catch(err) {
      content = '<div style="background:var(--critical-dim);border:1px solid var(--critical);border-radius:8px;padding:16px;color:var(--critical);">Error loading settings: '+App._esc(err.message||String(err))+'</div>';
      console.error('[Settings]',err);
    }

    var el = document.getElementById('settingsContent');
    if (el) el.innerHTML = content || '<div style="color:var(--text-dim);padding:20px;">Nothing to show here.</div>';
  },

  _sSection: function(title, rows) {
    return '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:22px;margin-bottom:16px;">'+
      '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border);">'+title+'</div>'+
      (Array.isArray(rows)?rows.join(''):rows)+
    '</div>';
  },

  _sRow: function(label, desc, input) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--border);">'+
      '<div style="flex:1;min-width:0;">'+
        '<div style="font-size:13px;font-weight:600;color:var(--text-primary);">'+label+'</div>'+
        (desc?'<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">'+desc+'</div>':'')+
      '</div>'+
      '<div style="flex-shrink:0;">'+input+'</div>'+
    '</div>';
  },

  _quickAddTeam: async function() {
    var name = (document.getElementById('newTeamName')||{}).value?.trim();
    var desc = (document.getElementById('newTeamDesc')||{}).value?.trim()||'';
    if (!name){App.showToast('Enter a team name','warning');return;}
    var r = await App.callAsync('saveTeam',{name,description:desc});
    if(r&&r.success){App.showToast('Team added','success');App.renderUnifiedSettings('team');}
    else App.showToast('Failed:'+(r&&r.error||'unknown'),'error');
  },

  _saveGeneralSettings: async function() {
    var appName = (document.getElementById('s_appname')||{}).value?.trim();
    var logo    = (document.getElementById('s_logo')||{}).value?.trim()||'';
    var supportEmail = (document.getElementById('s_support_email')||{}).value?.trim()||'';
    if(appName) await App.callAsync('updateSetting','APP_NAME',appName);
    await App.callAsync('updateSetting','LOGO_URL',logo);
    await App.callAsync('updateSetting','SUPPORT_EMAIL',supportEmail);
    App.showToast('General settings saved','success');
    var el=document.querySelector('.brand-name');if(el&&appName)el.textContent=appName;
  },

  _saveEmailFromSettings: async function() {
    var config = {
      enabled:!!(document.getElementById('et_enabled')&&document.getElementById('et_enabled').checked),
      host:(document.getElementById('et_host')||{}).value?.trim()||'imap.gmail.com',
      port:993,
      user:(document.getElementById('et_user')||{}).value?.trim()||'',
      pass:(document.getElementById('et_pass')||{}).value?.trim()||'',
      mailbox:'INBOX',
      intervalMinutes:parseInt((document.getElementById('et_interval')||{}).value)||5,
      defaultPriority:(document.getElementById('et_priority')||{}).value||'Medium',
      sendAckEmail:!!(document.getElementById('et_ack')&&document.getElementById('et_ack').checked),
      tls:true,
      senderBlocklist:(document.getElementById('et_blocklist')||{}).value?.trim()||''
    };
    var r = await App.callAsync('saveEmailTicketingConfig',config);
    if(r&&r.success){App.showToast('Email settings saved','success');App.renderUnifiedSettings('email');}
    else App.showToast('Failed:'+(r&&r.error||'unknown'),'error');
  },

  _getEmailCfgForm: function() {
    return {
      enabled:!!(document.getElementById('et_enabled')&&document.getElementById('et_enabled').checked),
      host:(document.getElementById('et_host')||{}).value?.trim()||'imap.gmail.com',
      port:993,user:(document.getElementById('et_user')||{}).value?.trim()||'',
      pass:(document.getElementById('et_pass')||{}).value?.trim()||'',
      mailbox:'INBOX',intervalMinutes:5,defaultPriority:'Medium',sendAckEmail:true,tls:true
    };
  },

