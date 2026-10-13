const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(process.argv[2], 'utf8');
function extract(name) {
  const start = source.indexOf('        function ' + name + '(');
  assert(start >= 0);
  const end = source.indexOf('\n        function ', start + 1);
  return source.slice(start, end < 0 ? undefined : end).trim();
}
const names = ['appointmentDateKey', 'countTodayAppointments', 'dashboardMonthKey', 'countMonthlyCustomers', 'countMonthlyDeals', 'updateMonthlyCustomerStats', 'isTaskCompleted', 'normalizeTaskUnitKey', 'taskProgressScore', 'getActiveTaskGroups', 'initAppUI', 'renderChangedModule'];
const code = names.map(extract).join('\n');
const elements = new Map();
const get = id => { if (!elements.has(id)) elements.set(id, {innerText:'', classList:{add(){},remove(){}}}); return elements.get(id); };
const RealDate = Date;
class FixedDate extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-10-07T05:44:00Z'])); } }
const context = {Intl,Date:FixedDate,document:{getElementById:get},appData:{appointments:[],customers:[],tasks:[],followUps:[]},currentUser:{name:'Fixture',permissions:{manageUsers:false}}};
for (const name of ['applyRolePermissions','renderCustomerStaffOptions','renderCustomerList','renderAppointmentsList','renderTaskStaffOptions','renderTasksList','renderMaintenanceList','renderScheduleStaffOptions','renderScheduleCalendar','renderPriceMenu','renderSalesReports','renderUserManagement','renderTeamOverview']) context[name]=()=>{};
vm.createContext(context);
new vm.Script(code).runInContext(context,{timeout:1000});
const row = (date,status='待到訪',created='2026-10-07 11:55:00')=>({'預約日期':date,'狀態':status,'建立時間':created});
const today=new RealDate('2026-10-07T05:44:00Z');
const cases=[
 ['today pending',[row('2026-10-07')],today,1],
 ['today arrived',[row('2026-10-07','已到訪')],today,1],
 ['today converted',[row('2026-10-07','已轉客戶')],today,1],
 ['today revisited',[row('2026-10-07','已回訪')],today,1],
 ['today returning',[row('2026-10-07','待回籠')],today,1],
 ['cancelled',[row('2026-10-07','爽約取消')],today,0],
 ['cancelled whitespace',[row('2026-10-07',' 爽約取消 ')],today,0],
 ['future dates',[row('2026-10-10'),row('2026-10-13')],today,0],
 ['created today booked future',[row('2026-10-13')],today,0],
 ['created yesterday booked today',[row('2026-10-07','待到訪','2026-10-06 11:55:00')],today,1],
 ['slash date',[row('2026/10/7')],today,1],
 ['padded whitespace',[row(' 2026-10-07 ')],today,1],
 ['empty invalid dates',[row(''),row(null),row('2026-02-30'),row('2026-13-07'),row('2026-10-00'),null],today,0],
 ['malformed timestamp rejected',[row('2026-10-07Tinvalid'),row('2026-10-07 garbage')],today,0],
 ['invalid non leap',[row('2026-02-29')],new RealDate('2026-03-01T04:00:00Z'),0],
 ['valid leap',[row('2028-02-29')],new RealDate('2028-02-29T04:00:00Z'),1],
 ['before Taipei midnight',[row('2026-10-08')],new RealDate('2026-10-07T15:59:59Z'),0],
 ['at Taipei midnight',[row('2026-10-08')],new RealDate('2026-10-07T16:00:00Z'),1],
 ['previous Taipei day excluded',[row('2026-10-07')],new RealDate('2026-10-07T16:00:00Z'),0],
 ['empty collection',undefined,today,0],
 ['unknown noncancel status retained',[row('2026-10-07','有效新狀態')],today,1]
];
for (const [label,rows,now,expected] of cases) assert.equal(context.countTodayAppointments(rows,now),expected,label);
context.appData.appointments=[row('2026-10-07'),row('2026-10-07','已到訪'),row('2026-10-07','爽約取消'),row('2026-10-10'),row('2026-10-13')];
context.initAppUI();assert.equal(get('stat-today-appointments').innerText,2,'initial card');
get('stat-today-appointments').innerText=-1;
context.renderChangedModule('appointments');assert.equal(get('stat-today-appointments').innerText,2,'update card');
const assignments = source.split('\n').filter(x=>x.includes("getElementById('stat-today-appointments').innerText"));
assert.equal(assignments.length,2);assert(assignments.every(x=>x.includes('countTodayAppointments(appData.appointments)')));
console.log(JSON.stringify({deviceTimeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,passed:cases.length+3,failed:0,network:'unavailable in test sandbox',fixtures:'synthetic only'}));
