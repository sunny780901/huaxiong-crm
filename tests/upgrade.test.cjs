const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(process.env.CRM_TEST_HTML || path.join(__dirname, '..', 'index.html'), 'utf8');
function harness() {
  const elements = new Map();
  const document = { addEventListener() {}, querySelectorAll: () => [],
    getElementById(id) {
      if (!elements.has(id)) { const classes = new Set(['hidden']); elements.set(id, { innerHTML: '', textContent: '', value: '', disabled: false, scrollIntoView() {},
        classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value), toggle(value, active) { if (active) classes.add(value); else classes.delete(value); } } }); }
      return elements.get(id);
    }
  };
  const c = vm.createContext({ document, window: { addEventListener() {}, scrollTo() {}, crypto: { randomUUID: () => 'qa-request-00000001' } },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, alert() {}, console, setTimeout, clearTimeout, Intl, Date,
    FormData: class { constructor(target) { this.target = target; } entries() { return Object.entries(this.target.fields); } }
  });
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/\bsrc\s*=/.test(script[1])) vm.runInContext(script[2], c);
  vm.runInContext(`Object.assign(currentUser, { role: '專案經理', permissions: { managePrices: true, modules: { priceMenu: true } } });
    appData.priceMenu = { copy: [{id:'base-test',unit:'B6',floor:4,area:'-',price:100}],houses:[],showcase:[],parking:[],options:[],version:0 };
    activePriceMenuTab = 'copy';`, c);
  return { c, document, elements, run: code => vm.runInContext(code, c) };
}

test('customer search handles legacy numeric phones, empty fields, text phones and status filters', () => {
  const { c, document, run } = harness();
  run(`appData.customers = [
    {id:'numeric',姓名:'QA 數字電話',電話:987654321,訪客類別:'初訪'},
    {id:'text',姓名:'QA 字串電話',電話:'0000000000',訪客類別:'回籠'},
    {id:'empty',姓名:'QA 缺電話',電話:null,訪客類別:'初訪'},
    {id:'unnamed',姓名:null,電話:123450000,訪客類別:'初訪'}
  ];`);
  const search = document.getElementById('customer-search-input');
  const status = document.getElementById('customer-filter-status');
  const list = document.getElementById('customer-list-container');
  status.value = '';
  search.value = '987';
  c.renderCustomerList();
  assert.match(list.innerHTML, /QA 數字電話/);
  assert.doesNotMatch(list.innerHTML, /QA 字串電話|QA 缺電話/);
  search.value = '0000000000';
  c.renderCustomerList();
  assert.match(list.innerHTML, /QA 字串電話/);
  search.value = 'qa';
  status.value = '回籠';
  c.renderCustomerList();
  assert.match(list.innerHTML, /QA 字串電話/);
  assert.doesNotMatch(list.innerHTML, /QA 數字電話|QA 缺電話/);
  status.value = '';
  search.value = '';
  c.renderCustomerList();
  for (const id of ['numeric','text','empty','unnamed']) assert.ok(list.innerHTML.includes(id));
});
test('all inline scripts compile; runtime Tailwind and floating script URLs are removed', () => {
  assert.ok(!html.includes('cdn.tailwindcss.com'));
  assert.ok(!html.includes('tailwind.config ='));
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'external-assets.json'), 'utf8'));
  for (const url of Object.values(manifest)) assert.ok(html.includes(url));
  assert.ok(html.includes('assets/crm.css'));
  harness();
});
test('price manager controls require manager role, explicit capability, module permission and server version', () => {
  const { run } = harness();
  assert.equal(run('canManagePrices()'), true);
  for (const role of ['銷售主任','行政副理']) { run(`currentUser.role=${JSON.stringify(role)}`); assert.equal(run('canManagePrices()'), false); }
  run("currentUser.role='專案經理'; currentUser.permissions.managePrices=false"); assert.equal(run('canManagePrices()'), false);
  run('currentUser.permissions.managePrices=true; currentUser.permissions.modules.priceMenu=false'); assert.equal(run('canManagePrices()'), false);
  run('currentUser.permissions.modules.priceMenu=true; delete appData.priceMenu.version'); assert.equal(run('canManagePrices()'), false);
});
test('price rendering retains the B6-4F 100萬 card and uses data arguments for edit actions', () => {
  const { c, document } = harness();
  c.renderPriceMenu();
  const markup = document.getElementById('price-menu-list').innerHTML;
  assert.match(markup, /B6-4F/);
  assert.match(markup, /100/);
  assert.match(markup, /data-crm-action="openPriceEditor"/);
  assert.ok(!markup.includes("onclick=\"openPriceEditor('"));
});
test('editor escapes stored text and keeps price unit and version snapshot', () => {
  const { c, document, run } = harness();
  run(`appData.priceMenu.copy[0].area='<img src=x onerror=alert(1)>';`);
  c.openPriceEditor('base-test');
  const markup = document.getElementById('price-entry-fields').innerHTML;
  assert.ok(markup.includes('&lt;img'));
  assert.ok(!markup.includes('<img'));
  assert.ok(markup.includes('價格（萬）'));
  assert.equal(run('priceEditorState.baseVersion'), 0);
});
test('saving sends the correct category, record identity and version then refreshes the authoritative menu', async () => {
  const { c, document, run } = harness();
  c.openPriceEditor('base-test');
  let sent;
  c.apiPost = async (action, data) => { sent = { action, data }; return { priceMenu: { copy: [{id:'base-test',unit:'B6',floor:4,area:'-',price:101}],houses:[],showcase:[],parking:[],options:[],version:1 } }; };
  c.showSaveToast = () => {};
  await c.submitPriceEditor({ preventDefault() {}, target: { fields: { unit:'B6',floor:'4',area:'-',price:'101' } } });
  assert.equal(sent.action, 'savePriceEntry');
  assert.equal(sent.data.category, 'copy');
  assert.equal(sent.data.id, 'base-test');
  assert.equal(sent.data.baseVersion, 0);
  assert.equal(run('appData.priceMenu.version'), 1);
  assert.equal(run('priceEditorState'), null);
  assert.equal(document.getElementById('price-entry-save').disabled, false);
});
test('failed save keeps user inputs and stable retry key, shows server error and unlocks button', async () => {
  const { c, document, run } = harness();
  c.openPriceEditor('base-test');
  const key = run('priceEditorState.requestKey');
  c.apiPost = async (action, data, id, suppressAlert, failure) => { failure.message='價目已由其他人更新，請重新載入後再編輯'; return null; };
  await c.submitPriceEditor({ preventDefault() {}, target: { fields: { unit:'B6',floor:'4',price:'101' } } });
  assert.equal(run('priceEditorState.requestKey'), key);
  assert.equal(document.getElementById('price-entry-form').classList.contains('hidden'), false);
  assert.match(document.getElementById('price-entry-error').textContent, /重新載入/);
  assert.equal(document.getElementById('price-entry-save').disabled, false);
});
test('audit output treats stored actor, note and label as text', async () => {
  const { c, document } = harness();
  c.apiPost = async () => ({ entries: [{ operation:'新增',time:'2026-10-13 10:00:00',actor:'<img src=x>',category:'options',before:null,after:{item:'<script>test</script>',note:'<b>note</b>',price:10}}] });
  await c.loadPriceHistory();
  const markup = document.getElementById('price-history-list').innerHTML;
  assert.ok(!markup.includes('<img'));
  assert.ok(!markup.includes('<script>'));
  assert.ok(markup.includes('&lt;script&gt;'));
});
test('compiled CSS includes new manager controls, custom gold colors and mobile breakpoints', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets/crm.css'), 'utf8');
  for (const selector of ['.bg-gold-600', '.text-gold-700', '.rounded-xl', '.hidden', '.sm\\:grid-cols-2', '.text-base']) assert.ok(css.includes(selector), selector);
});
test('successful customer creation unlocks the same save button for the next edit', async () => {
  const { c, document } = harness();
  const form = document.getElementById('customer-form-element');
  form.reset = () => {};
  form.elements = { id: { value: 'previous-id' } };
  c.apiPost = async () => ({ id: 'qa-created-customer', 姓名: '隔離新增驗收' });
  c.applyCustomerWriteResult = () => {};
  c.switchView = () => {};
  c.showSaveToast = () => {};
  await c.handleCustomerSubmit({ preventDefault() {}, target: { fields: { id:'', 姓名:'隔離新增驗收' } } });
  assert.equal(document.getElementById('customer-submit').disabled, false);
  assert.equal(form.elements.id.value, '');
});

function delayedPriceHarness() {
  const h = harness(), requests = [], toasts = [], alerts = [];
  h.run("appData.priceMenu.copy.push({id:'second-test',unit:'B1',floor:2,area:'-',price:200})");
  h.c.apiPost = (action, data) => new Promise((resolve, reject) => requests.push({ action, data, resolve, reject }));
  h.c.showSaveToast = message => toasts.push(message);
  h.c.alert = message => alerts.push(message);
  return { ...h, requests, toasts, alerts };
}
function priceReply(version, price = 101) {
  return { priceMenu: { copy: [{id:'base-test',unit:'B6',floor:4,area:'-',price}, {id:'second-test',unit:'B1',floor:2,area:'-',price:200}], houses:[], showcase:[], parking:[], options:[], version } };
}
function priceSubmit(c, price = '101') {
  return c.submitPriceEditor({ preventDefault() {}, target: { fields: { unit:'B6',floor:'4',area:'-',price } } });
}

test('late save success refreshes a newer menu without closing a newly opened editor', async () => {
  const { c, document, run, requests, toasts } = delayedPriceHarness();
  c.openPriceEditor('base-test'); const saving = priceSubmit(c);
  c.openPriceEditor('second-test');
  document.getElementById('price-entry-fields').innerHTML = 'unsaved second editor';
  assert.equal(document.getElementById('price-entry-save').disabled, false);
  requests[0].resolve(priceReply(1)); await saving;
  assert.equal(run('appData.priceMenu.version'), 1);
  assert.equal(run('priceEditorState.id'), 'second-test');
  assert.equal(document.getElementById('price-entry-fields').innerHTML, 'unsaved second editor');
  assert.equal(document.getElementById('price-entry-form').classList.contains('hidden'), false);
  assert.deepEqual(toasts, []);
});

for (const outcome of ['success', 'failure', 'rejection']) {
  test(`old save ${outcome} cannot change a newer pending editor or unlock its save button`, async () => {
    const { c, document, run, requests } = delayedPriceHarness();
    c.openPriceEditor('base-test'); const first = priceSubmit(c);
    c.openPriceEditor('second-test'); const second = priceSubmit(c, '201');
    document.getElementById('price-entry-fields').innerHTML = 'new pending editor';
    if (outcome === 'rejection') { requests[0].reject(new Error('isolated failure')); await assert.rejects(first, /isolated failure/); }
    else { run("currentUser.lastErrorMessage='old save error'"); requests[0].resolve(outcome === 'success' ? priceReply(1) : null); await first; }
    assert.equal(run('priceEditorState.id'), 'second-test');
    assert.equal(run('appData.priceMenu.version'), outcome === 'success' ? 1 : 0);
    assert.equal(document.getElementById('price-entry-fields').innerHTML, 'new pending editor');
    assert.equal(document.getElementById('price-entry-error').classList.contains('hidden'), true);
    assert.equal(document.getElementById('price-entry-save').disabled, true);
    requests[1].resolve(priceReply(2, 202)); await second;
    assert.equal(run('appData.priceMenu.version'), 2);
    assert.equal(run('priceEditorState'), null);
  });
}

test('out-of-order saves cannot roll the menu back after the newer save completes', async () => {
  const { c, run, requests } = delayedPriceHarness();
  c.openPriceEditor('base-test'); const first = priceSubmit(c);
  c.openPriceEditor('second-test'); const second = priceSubmit(c, '202');
  requests[1].resolve(priceReply(2, 202)); await second;
  requests[0].resolve(priceReply(1, 101)); await first;
  assert.equal(run('appData.priceMenu.version'), 2);
  assert.equal(run('appData.priceMenu.copy[0].price'), 202);
});

test('double submit of the same editor sends only one request even with a different payload', async () => {
  const { c, document, requests } = delayedPriceHarness();
  c.openPriceEditor('base-test'); const first = priceSubmit(c);
  const duplicate = priceSubmit(c, '102');
  assert.equal(requests.length, 1);
  await duplicate;
  assert.equal(requests[0].data.entry.price, '101');
  assert.equal(document.getElementById('price-entry-save').disabled, true);
  requests[0].resolve(priceReply(1)); await first;
});

test('tab switch retains its selection and hides stale toasts while a fresher saved menu arrives', async () => {
  const { c, run, requests, toasts } = delayedPriceHarness();
  c.openPriceEditor('base-test'); const saving = priceSubmit(c);
  c.setPriceMenuTab('options');
  requests[0].resolve(priceReply(1)); await saving;
  assert.equal(run('appData.priceMenu.version'), 1);
  assert.equal(run('activePriceMenuTab'), 'options');
  assert.equal(run('priceEditorState'), null);
  assert.deepEqual(toasts, []);
});

test('late reload cannot replace the menu or close an editor opened after it started', async () => {
  const { c, document, run, requests } = delayedPriceHarness();
  const loading = c.reloadPriceMenu();
  c.openPriceEditor('second-test');
  requests[0].resolve(priceReply(1)); await loading;
  assert.equal(run('appData.priceMenu.version'), 0);
  assert.equal(run('priceEditorState.id'), 'second-test');
  assert.equal(document.getElementById('price-entry-form').classList.contains('hidden'), false);
});

test('late reload failure does not alert a newly opened editor', async () => {
  const { c, run, requests, alerts } = delayedPriceHarness();
  const loading = c.reloadPriceMenu(); c.openPriceEditor('second-test');
  run("currentUser.lastErrorMessage='old reload error'"); requests[0].resolve(null); await loading;
  assert.deepEqual(alerts, []);
  assert.equal(run('priceEditorState.id'), 'second-test');
});

test('save followed by reload retains the newer reload response', async () => {
  const { c, run, requests } = delayedPriceHarness();
  c.openPriceEditor('base-test'); const saving = priceSubmit(c); const loading = c.reloadPriceMenu();
  requests[1].resolve(priceReply(2, 202)); await loading;
  requests[0].resolve(priceReply(1)); await saving;
  assert.equal(run('appData.priceMenu.version'), 2);
  assert.equal(run('priceEditorState'), null);
});

test('reload followed by save cannot close or unlock the pending save', async () => {
  const { c, document, run, requests } = delayedPriceHarness();
  c.openPriceEditor('base-test'); const loading = c.reloadPriceMenu(); const saving = priceSubmit(c);
  requests[0].resolve(priceReply(1)); await loading;
  assert.equal(run('priceEditorState.id'), 'base-test');
  assert.equal(document.getElementById('price-entry-save').disabled, true);
  assert.equal(run('appData.priceMenu.version'), 0);
  requests[1].resolve(priceReply(2)); await saving;
  assert.equal(run('appData.priceMenu.version'), 2);
});

test('an older server version cannot replace an already newer menu', async () => {
  const { c, run, requests, toasts } = delayedPriceHarness();
  c.openPriceEditor('base-test'); const loading = c.reloadPriceMenu();
  run('appData.priceMenu.version=3');
  requests[0].resolve(priceReply(2)); await loading;
  assert.equal(run('appData.priceMenu.version'), 3);
  assert.equal(run('priceEditorState.id'), 'base-test');
  assert.deepEqual(toasts, []);
});

test('current reload closes its own editor normally', async () => {
  const { c, run, requests, toasts } = delayedPriceHarness();
  c.openPriceEditor('base-test'); const loading = c.reloadPriceMenu();
  requests[0].resolve(priceReply(1)); await loading;
  assert.equal(run('appData.priceMenu.version'), 1);
  assert.equal(run('priceEditorState'), null);
  assert.equal(toasts.length, 1);
});

test('review 4257336484: a save version N+1 still refreshes after reload N finishes first', async () => {
  const { c, document, run, requests } = delayedPriceHarness();
  c.openPriceEditor('base-test'); const saving = priceSubmit(c); const loading = c.reloadPriceMenu();
  requests[1].resolve(priceReply(0, 100)); await loading;
  c.openPriceEditor('second-test');
  document.getElementById('price-entry-fields').innerHTML = 'keep new editor input';
  requests[0].resolve(priceReply(1, 101)); await saving;
  assert.equal(run('appData.priceMenu.version'), 1);
  assert.equal(run('appData.priceMenu.copy[0].price'), 101);
  assert.equal(run('priceEditorState.id'), 'second-test');
  assert.equal(document.getElementById('price-entry-fields').innerHTML, 'keep new editor input');
});

test('review 4257336490: duplicate reload does not advance sequence or discard the first response', async () => {
  const { c, run } = harness(); const network = [], alerts = [];
  run("currentUser.accessToken='isolated-fake-token'");
  c.fetch = () => new Promise(resolve => network.push({ resolve }));
  c.alert = message => alerts.push(message); c.showSaveToast = () => {};
  const loading = c.reloadPriceMenu();
  await c.reloadPriceMenu();
  network[0].resolve({ json: async () => ({status:'success',data:priceReply(1)}) }); await loading;
  assert.equal(network.length, 1);
  assert.equal(run('appData.priceMenu.version'), 1);
  assert.deepEqual(alerts, []);
});

test('review 4257336495: actual apiPost returns each save its own failure message', async () => {
  const { c, document, run } = harness(); const network = [];
  run("currentUser.accessToken='isolated-fake-token'; appData.priceMenu.copy.push({id:'second-test',unit:'B1',floor:2,price:200})");
  c.fetch = () => new Promise((resolve, reject) => network.push({ resolve, reject }));
  c.showSaveToast = () => {};
  c.openPriceEditor('base-test'); const first = priceSubmit(c);
  c.openPriceEditor('second-test'); const second = priceSubmit(c, '201');
  network[0].resolve({ json: async () => ({status:'error',code:'VERSION_CONFLICT',message:'A version conflict'}) });
  await first;
  network[1].reject(new Error('B network failure')); await second;
  assert.equal(run('priceEditorState.id'), 'second-test');
  assert.equal(document.getElementById('price-entry-error').textContent, 'B network failure');
  assert.equal(document.getElementById('price-entry-save').disabled, false);
});
