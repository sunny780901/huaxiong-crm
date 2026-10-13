const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
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
  c.apiPost = async () => { run("currentUser.lastErrorMessage='價目已由其他人更新，請重新載入後再編輯'"); return null; };
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
