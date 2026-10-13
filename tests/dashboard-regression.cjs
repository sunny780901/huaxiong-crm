const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(process.argv[2], 'utf8');
function extract(name) {
    const start = source.indexOf('        function ' + name + '(');
    assert(start >= 0, 'Missing actual source function: ' + name);
    const next = source.slice(start + 1).match(/\n        (?:async )?function /);
    const end = next ? start + 1 + next.index : -1;
    return source.slice(start, end < 0 ? undefined : end).trim();
}
const names = ['appointmentDateKey', 'countTodayAppointments', 'dashboardMonthKey', 'countMonthlyCustomers', 'countMonthlyDeals', 'updateMonthlyCustomerStats', 'isTaskCompleted', 'normalizeTaskUnitKey', 'taskProgressScore', 'getActiveTaskGroups', 'renderTasksList', 'initAppUI', 'applyCustomerWriteResult', 'removeCustomerLocally', 'renderChangedModule'];
const elements = new Map();
const get = id => {
    if (!elements.has(id)) elements.set(id, {innerText: '', innerHTML: '', classList: {add(){}, remove(){}}});
    return elements.get(id);
};
const RealDate = Date;
class FixedDate extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-10-08T04:00:00Z'])); } }
const context = {
    Intl, Date: FixedDate, TASK_STAGES: ['簽約', '對保', '驗屋', '複驗', '交屋'],
    document: {getElementById: get}, currentUser: {name: 'Fixture', permissions: {manageUsers: false}},
    appData: {customers: [], teamCustomers: [], tasks: [], appointments: [], followUps: []},
    canEditOwnedRecord: () => false,
    escapeHtml: value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c])),
    normalizeTaskDate: value => String(value || '').slice(0, 10), normalizeTaskTime: value => String(value || ''),
    normalizeTaskAmount: value => value === undefined ? '' : value,
    photoButton: () => '', recordActionButtons: () => ''
};
for (const name of ['applyRolePermissions', 'renderCustomerStaffOptions', 'renderCustomerList', 'renderAppointmentsList', 'renderTaskStaffOptions', 'renderMaintenanceList', 'renderScheduleStaffOptions', 'renderScheduleCalendar', 'renderPriceMenu', 'renderSalesReports', 'renderUserManagement', 'renderTeamOverview']) context[name] = () => {};
vm.createContext(context);
new vm.Script(names.map(extract).join('\n')).runInContext(context, {timeout: 1000});
let passed = 0;
const equal = (actual, expected, label) => {assert.equal(actual, expected, label); passed++;};
const today = new RealDate('2026-10-08T04:00:00Z');
const visit = date => ({訪客日期: date});
const deal = (date, status = '正式成交', visitDate = '2026-09-01') => ({成交日期: date, 成交狀態: status, 訪客日期: visitDate});
equal(context.dashboardMonthKey(new RealDate('2026-09-30T15:59:59Z')), '2026-09', 'Taipei before month boundary');
equal(context.dashboardMonthKey(new RealDate('2026-09-30T16:00:00Z')), '2026-10', 'Taipei at month boundary');
equal(context.dashboardMonthKey(new RealDate('2026-10-31T16:00:00Z')), '2026-11', 'Taipei next month');
equal(context.dashboardMonthKey(new RealDate('2026-12-31T16:00:00Z')), '2027-01', 'Taipei year boundary');
for (const [label, rows, expected] of [
    ['empty', undefined, 0], ['malformed collection', {}, 0], ['today', [visit('2026-10-08')], 1],
    ['full month', [visit('2026-10-01'), visit('2026-10-31')], 2],
    ['past future other year', [visit('2026-09-30'), visit('2026-11-01'), visit('2025-10-08')], 0],
    ['slash dates', [visit('2026/10/8')], 1], ['whitespace', [visit(' 2026-10-08 ')], 1],
    ['calendar date from serialized timestamp', [visit('2026-10-01T00:00:00Z')], 1],
    ['invalid dates', [visit(''), visit(null), visit('2026-10-00'), visit('2026-10-32'), visit('2026-13-01'), visit('2026-10-01junk'), null], 0]
]) equal(context.countMonthlyCustomers(rows, today), expected, 'visits: ' + label);
equal(context.countMonthlyCustomers([visit('2028-02-29'), visit('2028-02-30')], new RealDate('2028-02-15T04:00:00Z')), 1, 'valid leap date only');
equal(context.countMonthlyCustomers([visit('2026-02-29')], new RealDate('2026-02-15T04:00:00Z')), 0, 'invalid non leap date');
for (const [label, rows, expected] of [
    ['empty', undefined, 0], ['malformed collection', {}, 0], ['old visit current closing', [deal('2026-10-08')], 1],
    ['old closing current visit', [deal('2026-09-01', '正式成交', '2026-10-08')], 0],
    ['only formal deals', [deal('2026-10-08'), deal('2026-10-08', '下訂保留'), deal('2026-10-08', '退戶'), deal('2026-10-08', '未成交')], 1],
    ['missing closing date excludes last update', [{成交狀態: '正式成交', 最後更新時間: '2026-10-08 12:00:00'}], 0],
    ['missing closing date excludes visit', [deal('', '正式成交', '2026-10-08')], 0],
    ['future and other year', [deal('2026-11-01'), deal('2025-10-08')], 0],
    ['trimmed state and slash date', [deal(' 2026/10/8 ', ' 正式成交 ')], 1],
    ['invalid dates', [deal('2026-10-32'), deal(''), null], 0]
]) equal(context.countMonthlyDeals(rows, today), expected, 'deals: ' + label);
const task = (id, unit, status = '進行中', extra = {}) => ({id, 戶別樓層: unit, 狀態: status, 客戶姓名: 'Fixture', ...extra});
equal(context.getActiveTaskGroups(undefined).length, 0, 'empty progress');
equal(context.getActiveTaskGroups({}).length, 0, 'malformed progress collection');
equal(context.getActiveTaskGroups([null]).length, 0, 'null progress');
const tasks = [task('a', 'A1/1F', '待辦'), task('b', 'A2/2F', '進行中', {期限:'2025-01-01', 目前流程:'對保'}), task('c', 'A3/3F', '進行中', {目前流程:'交屋', 交屋日期:'2026-10-08'})];
equal(context.getActiveTaskGroups(tasks).length, 3, 'all three groups regardless of month and stage');
for (const extra of [{狀態:'已完成'}, {狀態:'完成'}, {目前流程:'已完成'}, {交屋完成時間:'2026-10-08 12:00:00'}]) equal(context.getActiveTaskGroups([task('done','A4/4F','進行中',extra)]).length, 0, 'completed groups excluded');
const duplicates = [task('less',' a1 - 1f '), task('more','A1／1樓','進行中',{簽約完成時間:'2026-01-01'})];
equal(context.getActiveTaskGroups(duplicates).length, 1, 'list unit grouping retained');
equal(context.getActiveTaskGroups(duplicates)[0].id, 'more', 'same preferred progress record as list');
equal(context.getActiveTaskGroups([task('blank-a',''),task('blank-b','')]).length, 2, 'missing unit rows retained separately as list');
const serializedTasks = JSON.stringify(tasks);
context.getActiveTaskGroups(tasks);
equal(JSON.stringify(tasks), serializedTasks, 'source tasks not mutated');
context.appData.customers = [{id:'c1', ...visit('2026-10-08')}, {id:'c2', ...deal('2026-10-05')}, {id:'c3', ...visit('2026-09-30')}];
context.appData.tasks = tasks;
context.appData.appointments = [{預約日期:'2026-10-08', 狀態:'待到訪'}, {預約日期:'2026-10-08', 狀態:'爽約取消'}, {預約日期:'2026-10-10', 狀態:'待到訪'}];
context.initAppUI();
equal(get('stat-total-customers').innerText, 1, 'initial monthly customer card');
equal(get('stat-closed-deals').innerText, 1, 'initial monthly deal card');
equal(get('stat-pending-tasks').innerText, 3, 'initial progress card');
equal((get('tasks-list-container').innerHTML.match(/<article /g) || []).length, 3, 'actual list renders same three groups');
equal(get('stat-today-appointments').innerText, 1, 'today appointment behavior retained');
context.applyCustomerWriteResult({id:'c4', 訪客日期:'2026-10-08'});
equal(get('stat-total-customers').innerText, 2, 'new customer refreshes monthly card');
context.applyCustomerWriteResult({id:'c4', 成交狀態:'正式成交', 成交日期:'2026-10-08'});
equal(get('stat-closed-deals').innerText, 2, 'customer closing refreshes deal card');
context.applyCustomerWriteResult({id:'c4', 成交狀態:'退戶'});
equal(get('stat-closed-deals').innerText, 1, 'withdrawn customer removes deal count');
context.removeCustomerLocally('c4');
equal(get('stat-total-customers').innerText, 1, 'customer deletion refreshes month count');
equal(get('stat-today-appointments').innerText, 1, 'customer changes do not touch today card');
context.appData.tasks = tasks.map(row => row.id === 'a' ? {...row, 交屋完成時間:'2026-10-08 12:00:00'} : row);
context.renderChangedModule('tasks');
equal(get('stat-pending-tasks').innerText, 2, 'handover completion removes one group immediately');
equal((get('tasks-list-container').innerHTML.match(/<article /g) || []).length, 2, 'actual list and card update together');
equal(get('stat-today-appointments').innerText, 1, 'progress changes do not touch today card');
context.appData.tasks = [];
context.renderChangedModule('tasks');
equal(get('stat-pending-tasks').innerText, 0, 'last group removal yields zero');
assert(get('tasks-list-container').innerHTML.includes('目前無已購客進度')); passed++;
console.log(JSON.stringify({deviceTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, passed, failed:0, fixtures:'synthetic only', actualSourceFunctions: names.length, externalNetwork:'not provided in VM'}));
