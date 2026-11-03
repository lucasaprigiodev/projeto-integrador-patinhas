// Suíte QA – Patinhas API. Executa contra cópia isolada (sandbox) do backend.
// Rodar: cd qa && node --test api.test.js
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');

const app = require('./server');
let server, base;
const J = { 'Content-Type': 'application/json' };

async function call(method, url, { token, body, headers } = {}) {
  const h = { ...(body !== undefined ? J : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers };
  const r = await fetch(base + url, { method, headers: h, body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
  let data = null; const t = await r.text(); try { data = JSON.parse(t); } catch { data = t; }
  return { status: r.status, data, headers: r.headers };
}
async function login(email, senha) { const r = await call('POST', '/api/auth/login', { body: { email, senha } }); return r.data.token; }

let ong, lucas, maria, protetor, admin;
before(async () => {
  const { db, initDatabase } = require('./database');
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('DROP TABLE IF EXISTS indicacoes_adocao;');
  db.exec('DROP TABLE IF EXISTS marcos_tutor;');
  db.exec('DROP TABLE IF EXISTS prontuario_eventos;');
  db.exec('DROP TABLE IF EXISTS custodias;');
  db.exec('DROP TABLE IF EXISTS mensagens;');
  db.exec('DROP TABLE IF EXISTS adocoes_matches;');
  db.exec('DROP TABLE IF EXISTS animais;');
  db.exec('DROP TABLE IF EXISTS usuarios;');
  db.exec('PRAGMA foreign_keys = ON;');
  initDatabase();

  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  ong = await login('admin@ong.com', 'admin');
  lucas = await login('lucas@ifrn.edu.br', '123456');
  maria = await login('maria@email.com', '123456');
  protetor = await login('carlos@protetor.org', '123456');
  admin = await login('admin@patinhas.org.br', 'admin123');
});
after(() => server.close());

describe('AUTH – funcional', () => {
  test('login válido → 200 + token JWT', async () => { assert.ok(ong && ong.split('.').length === 3); });
  test('login senha errada → 401', async () => { assert.equal((await call('POST', '/api/auth/login', { body: { email: 'lucas@ifrn.edu.br', senha: 'x' } })).status, 401); });
  test('login sem campos → 400', async () => { assert.equal((await call('POST', '/api/auth/login', { body: {} })).status, 400); });
  test('login com email inexistente → 401', async () => { assert.equal((await call('POST', '/api/auth/login', { body: { email: 'no@no.com', senha: '1234' } })).status, 401); });
  test('registro válido → 201', async () => {
    const r = await call('POST', '/api/auth/register', { body: { nome: 'Teste QA', email: `qa${Date.now()}@t.com`, senha: 'abcd1234' } });
    assert.equal(r.status, 201); assert.equal(r.data.usuario.perfil, 'adotante');
  });
  test('registro e-mail duplicado → 409', async () => { assert.equal((await call('POST', '/api/auth/register', { body: { nome: 'Dup Lic', email: 'LUCAS@ifrn.edu.br', senha: 'abcd' } })).status, 409); });
  test('registro nome curto → 400', async () => { assert.equal((await call('POST', '/api/auth/register', { body: { nome: 'a', email: 'a@a.com', senha: 'abcd' } })).status, 400); });
  test('registro e-mail inválido → 400', async () => { assert.equal((await call('POST', '/api/auth/register', { body: { nome: 'Abc', email: 'semarroba', senha: 'abcd' } })).status, 400); });
  test('registro senha < 4 → 400', async () => { assert.equal((await call('POST', '/api/auth/register', { body: { nome: 'Abc', email: 'x@x.com', senha: '123' } })).status, 400); });
  test('/auth/me não vaza senha_hash', async () => { const r = await call('GET', '/api/auth/me', { token: lucas }); assert.equal(r.status, 200); assert.equal(r.data.usuario.senha_hash, undefined); });
  test('JSON malformado → 400 (não 500)', async () => { const r = await call('POST', '/api/auth/login', { body: '{bad json' }); assert.equal(r.status, 400); });
});

describe('AUTH – segurança', () => {
  test('SEC-01 registro NÃO deve permitir auto-atribuir perfil "ong" (escalada de privilégio)', async () => {
    const r = await call('POST', '/api/auth/register', { body: { nome: 'Hacker', email: `h${Date.now()}@t.com`, senha: 'abcd1234', perfil: 'ong' } });
    assert.notEqual(r.data.usuario && r.data.usuario.perfil, 'ong', `VULNERÁVEL: usuário anônimo criou conta perfil=${r.data.usuario && r.data.usuario.perfil}`);
  });
  test('SEC-02 rota protegida sem token → 401', async () => { assert.equal((await call('GET', '/api/matches')).status, 401); });
  test('SEC-03 token adulterado (assinatura) → 401', async () => { const [h, p] = lucas.split('.'); assert.equal((await call('GET', '/api/auth/me', { token: `${h}.${p}.AAAA` })).status, 401); });
  test('SEC-04 JWT alg=none → 401', async () => {
    const h = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url');
    const p = Buffer.from(JSON.stringify({ id: 1, perfil: 'ong', exp: 9999999999 })).toString('base64url');
    assert.equal((await call('GET', '/api/users', { token: `${h}.${p}.` })).status, 401);
  });
  test('SEC-05 payload alterado com assinatura antiga → 401', async () => {
    const [h, , s] = lucas.split('.'); const p = Buffer.from(JSON.stringify({ id: 1, perfil: 'ong', exp: 9999999999 })).toString('base64url');
    assert.equal((await call('GET', '/api/users', { token: `${h}.${p}.${s}` })).status, 401);
  });
  test('SEC-06 token expirado → 401', async () => {
    const sec = 'patinhas_ifrn_jwt_secret_key_2026'; // segredo default hard-coded no repositório
    const h = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
    const p = Buffer.from(JSON.stringify({ id: 2, exp: 1 })).toString('base64url');
    const s = crypto.createHmac('sha256', sec).update(`${h}.${p}`).digest('base64url');
    assert.equal((await call('GET', '/api/auth/me', { token: `${h}.${p}.${s}` })).status, 401);
  });
  test('SEC-07 segredo JWT default é público no repo → atacante forja token de ONG', async () => {
    const sec = 'patinhas_ifrn_jwt_secret_key_2026';
    const h = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
    const p = Buffer.from(JSON.stringify({ id: 1, perfil: 'ong', exp: 9999999999 })).toString('base64url');
    const s = crypto.createHmac('sha256', sec).update(`${h}.${p}`).digest('base64url');
    const r = await call('GET', '/api/users', { token: `${h}.${p}.${s}` });
    assert.notEqual(r.status, 200, 'VULNERÁVEL: token forjado com segredo default foi aceito como ONG');
  });
  test('SEC-08 brute-force: 30 logins errados seguidos não deveriam ser todos 401 (rate limit/429)', async () => {
    const rs = []; for (let i = 0; i < 30; i++) rs.push((await call('POST', '/api/auth/login', { body: { email: 'lucas@ifrn.edu.br', senha: 'err' + i } })).status);
    assert.ok(rs.includes(429), 'VULNERÁVEL: sem rate limiting – ' + rs.filter(s => s === 401).length + '/30 tentativas aceitas');
  });
  test('SEC-09 headers de segurança (helmet/CSP/X-Content-Type-Options)', async () => {
    const r = await call('GET', '/api/pets');
    assert.ok(r.headers.get('x-content-type-options'), 'faltando X-Content-Type-Options');
    assert.ok(r.headers.get('content-security-policy'), 'faltando Content-Security-Policy');
  });
  test('SEC-10 header X-Powered-By não deve revelar Express', async () => { assert.equal((await call('GET', '/api/pets')).headers.get('x-powered-by'), null); });
  test('SEC-11 hash de senha deve usar salt por usuário', async () => {
    const { db } = require('./database');
    const rows = db.prepare("SELECT senha_hash FROM usuarios WHERE email IN ('lucas@ifrn.edu.br','maria@email.com')").all();
    assert.notEqual(rows[0].senha_hash, rows[1].senha_hash); // senhas iguais '123456'
  });
});

describe('API /api/state (ponte legada)', () => {
  test('SEC-12 GET /api/state sem token não deveria expor CPF/e-mail/matches', async () => {
    const r = await call('GET', '/api/state'); assert.equal(r.status, 401, `VULNERÁVEL: ${r.status} – retornou ${JSON.stringify(r.data).length} bytes de dados de ${r.data.matches?.length} matches sem autenticação`);
  });
  test('SEC-13 PUT /api/state anônimo não deveria poder escrever', async () => {
    const before = (await call('GET', '/api/state', { token: ong })).data;
    const r = await call('PUT', '/api/state', { body: { pets: before.pets.map(p => p.id === 1 ? { ...p, nome: 'HACKED' } : p), matches: before.matches } });
    // restaura
    await call('PUT', '/api/state', { token: ong, body: { pets: before.pets, matches: before.matches } });
    assert.equal(r.status, 401, 'VULNERÁVEL: escrita anônima aceita (status ' + r.status + ')');
  });
  test('SEC-14 PUT /api/state anônimo NÃO deveria apagar todos os animais', async () => {
    const snap = (await call('GET', '/api/state', { token: ong })).data;
    const r = await call('PUT', '/api/state', { body: { pets: [] } });
    const after = (await call('GET', '/api/state', { token: ong })).data;
    await call('PUT', '/api/state', { token: ong, body: { pets: snap.pets, matches: snap.matches } });
    assert.ok(after.pets.length > 0 || r.status === 401, 'VULNERÁVEL: PUT anônimo com pets:[] apagou o catálogo inteiro');
  });
});

describe('RBAC / autorização por recurso', () => {
  test('adotante não cria pet → 403', async () => { assert.equal((await call('POST', '/api/pets', { token: lucas, body: { nome: 'Rex', raca: 'x', idade: '1', foto_url: 'u' } })).status, 403); });
  test('anônimo não cria pet → 401', async () => { assert.equal((await call('POST', '/api/pets', { body: {} })).status, 401); });
  test('adotante não lista usuários → 403', async () => { assert.equal((await call('GET', '/api/users', { token: lucas })).status, 403); });
  test('ONG lista usuários, sem senha_hash', async () => { const r = await call('GET', '/api/users', { token: ong }); assert.equal(r.status, 200); assert.ok(!JSON.stringify(r.data).includes('senha_hash')); });
  test('adotante só vê os próprios matches', async () => { const r = await call('GET', '/api/matches', { token: lucas }); assert.ok(r.data.every(m => m.adotante.email === 'lucas@ifrn.edu.br')); });
  test('adotante A não lê chat do adotante B → 403', async () => {
    const ms = (await call('GET', '/api/matches', { token: maria })).data; assert.equal((await call('GET', `/api/matches/${ms[0].id}/messages`, { token: lucas })).status, 403);
  });
  test('adotante A não assina termo do adotante B → 403', async () => {
    const ms = (await call('GET', '/api/matches', { token: maria })).data; assert.equal((await call('POST', `/api/matches/${ms[0].id}/assinar-termo`, { token: lucas, body: {} })).status, 403);
  });
  test('SEC-15 adotante não pode excluir match de outro → 403', async () => {
    const ms = (await call('GET', '/api/matches', { token: maria })).data; assert.equal((await call('DELETE', `/api/matches/${ms[0].id}`, { token: lucas })).status, 403);
  });
  test('adotante não aprova adoção → 403', async () => { assert.equal((await call('PATCH', '/api/matches/1/status', { token: lucas, body: { status: 'aprovado' } })).status, 403); });
  test('SEC-16 ONG-A não deveria editar/excluir pet de ONG-B (ownership)', async () => {
    const reg = await call('POST', '/api/auth/register', { body: { nome: 'ONG Dois', email: `ong2${Date.now()}@t.com`, senha: 'abcd1234', perfil: 'ong' } });
    const r = await call('PUT', '/api/pets/1', { token: reg.data.token, body: { nome: 'Invadido' } });
    assert.equal(r.status, 403, 'VULNERÁVEL: ONG qualquer altera pet de outra ONG (status ' + r.status + ')');
  });
  test('SEC-17 ONG pode "assinar termo" em nome do adotante (bypass de assinatura)', async () => {
    const ms = (await call('GET', '/api/matches', { token: ong })).data; const m = ms.find(x => x.status === 'termo_enviado');
    const r = await call('POST', `/api/matches/${m.id}/assinar-termo`, { token: ong, body: { assinatura_digital: 'Falsificado' } });
    assert.equal(r.status, 403, 'VULNERÁVEL: ONG assinou em nome do adotante (status ' + r.status + ')');
  });
});

describe('Máquina de estados do match', () => {
  test('assinar sem termo enviado → 422', async () => {
    const pet = (await call('GET', '/api/pets?status=disponivel')).data.find(p => p.id === 1);
    const tk = (await call('POST', '/api/auth/register', { body: { nome: 'Fluxo Teste', email: `f${Date.now()}@t.com`, senha: 'abcd1234' } })).data.token;
    const m = await call('POST', '/api/matches', { token: tk, body: { animal_id: pet.id } }); assert.equal(m.status, 201);
    assert.equal((await call('POST', `/api/matches/${m.data.id}/assinar-termo`, { token: tk, body: {} })).status, 422);
    assert.equal((await call('PATCH', `/api/matches/${m.data.id}/status`, { token: ong, body: { status: 'aprovado' } })).status, 422);
    assert.equal((await call('POST', '/api/matches', { token: tk, body: { animal_id: pet.id } })).status, 409);
  });
  test('fluxo feliz completo pendente→termo_enviado→assinado→aprovado + pet vira adotado', async () => {
    const tk = (await call('POST', '/api/auth/register', { body: { nome: 'Fluxo Feliz', email: `ff${Date.now()}@t.com`, senha: 'abcd1234' } })).data.token;
    const m = (await call('POST', '/api/matches', { token: tk, body: { animal_id: 2 } })).data;
    assert.equal((await call('POST', `/api/matches/${m.id}/enviar-termo`, { token: ong })).status, 200);
    assert.equal((await call('POST', `/api/matches/${m.id}/assinar-termo`, { token: tk, body: { assinatura_digital: 'Fluxo Feliz' } })).status, 200);
    assert.equal((await call('PATCH', `/api/matches/${m.id}/status`, { token: ong, body: { status: 'aprovado' } })).status, 200);
    assert.equal((await call('GET', '/api/pets/2')).data.status, 'adotado');
  });
  test('match em animal adotado → 422', async () => { assert.equal((await call('POST', '/api/matches', { token: lucas, body: { animal_id: 10 } })).status, 422); });
  test('SEC-18 reverter status via PATCH (termo_assinado → pendente) deveria ser bloqueado', async () => {
    const ms = (await call('GET', '/api/matches', { token: ong })).data; const m = ms.find(x => x.status === 'termo_assinado');
    const r = await call('PATCH', `/api/matches/${m.id}/status`, { token: ong, body: { status: 'pendente' } });
    assert.equal(r.status, 422, 'FALHA DE REGRA: transição regressiva permitida (status ' + r.status + ')');
  });
  test('BUG-01 aprovar com exigir_termo:false deveria ser ignorado (bypass da assinatura)', async () => {
    const tk = (await call('POST', '/api/auth/register', { body: { nome: 'Bypass Termo', email: `bp${Date.now()}@t.com`, senha: 'abcd1234' } })).data.token;
    const m = (await call('POST', '/api/matches', { token: tk, body: { animal_id: 3 } })).data;
    const r = await call('PATCH', `/api/matches/${m.id}/status`, { token: ong, body: { status: 'aprovado', exigir_termo: false } });
    assert.equal(r.status, 422, 'FALHA DE REGRA: aprovou sem termo assinado via flag exigir_termo:false');
  });
  test('BUG-02 aprovar match deveria rejeitar automaticamente os demais interessados no mesmo pet', async () => {
    const pet = (await call('GET', '/api/pets/4')).data; assert.ok(pet);
    // Lucas já tem match 'termo_enviado' no Thor(4). Aprovar o pet para outra pessoa não deveria deixar match aberto
    const tk = (await call('POST', '/api/auth/register', { body: { nome: 'Concorrente', email: `cc${Date.now()}@t.com`, senha: 'abcd1234' } })).data.token;
    const m = (await call('POST', '/api/matches', { token: tk, body: { animal_id: 4 } })).data;
    await call('POST', `/api/matches/${m.id}/enviar-termo`, { token: ong });
    await call('POST', `/api/matches/${m.id}/assinar-termo`, { token: tk, body: {} });
    await call('PATCH', `/api/matches/${m.id}/status`, { token: ong, body: { status: 'aprovado' } });
    const lm = (await call('GET', '/api/matches', { token: lucas })).data.find(x => x.animal_id === 4);
    assert.ok(['rejeitado'].includes(lm.status), `FALHA DE REGRA: match concorrente do Lucas continua "${lm.status}" mesmo com pet adotado`);
  });
  test('BUG-03 pet com match ativo deveria ir para "em_processo"', async () => {
    const tk = (await call('POST', '/api/auth/register', { body: { nome: 'Processo Ativo', email: `pa${Date.now()}@t.com`, senha: 'abcd1234' } })).data.token;
    await call('POST', '/api/matches', { token: tk, body: { animal_id: 6 } });
    assert.equal((await call('GET', '/api/pets/6')).data.status, 'em_processo');
  });
});

describe('Validação de entrada / robustez', () => {
  test('pet inexistente → 404', async () => { assert.equal((await call('GET', '/api/pets/99999')).status, 404); });
  test('pet id não numérico → 400', async () => { assert.equal((await call('GET', '/api/pets/abc')).status, 400); });
  test('POST pet sem campos obrigatórios → 400', async () => { assert.equal((await call('POST', '/api/pets', { token: ong, body: { nome: 'Rex' } })).status, 400); });
  test('SEC-19 PUT pet com status inválido deveria dar 400 (hoje vira 500 por CHECK)', async () => {
    const r = await call('PUT', '/api/pets/5', { token: ong, body: { status: 'xpto' } }); assert.equal(r.status, 400, 'status=' + r.status);
  });
  test('SEC-20 PUT pet com especie inválida deveria dar 400', async () => { const r = await call('PUT', '/api/pets/5', { token: ong, body: { especie: 'Dragão' } }); assert.equal(r.status, 400, 'status=' + r.status); });
  test('SEC-21 erro 500 não deve vazar detalhes internos (err.message)', async () => {
    const r = await call('PUT', '/api/pets/5', { token: ong, body: { porte: 'Gigante' } });
    assert.ok(!(r.data && r.data.detalhes), 'VAZAMENTO: ' + JSON.stringify(r.data));
  });
  test('SQL injection em ?especie é neutralizada (parametrizado)', async () => { const r = await call('GET', "/api/pets?especie=' OR '1'='1"); assert.equal(r.status, 200); assert.equal(r.data.length, 0); });
  test('SQL injection no login neutralizada', async () => { assert.equal((await call('POST', '/api/auth/login', { body: { email: "' OR 1=1 --", senha: 'x' } })).status, 401); });
  test('XSS armazenado: nome do pet com <script> é salvo cru (front deve escapar)', async () => {
    const r = await call('POST', '/api/pets', { token: ong, body: { nome: '<img src=x onerror=alert(1)>', raca: 'x', idade: '1', foto_url: 'https://x/y.png' } });
    assert.equal(r.status, 201);
    const fs = require('node:fs'); const html = fs.readFileSync(path.join(__dirname, '../www/10-chat-mensagem.html'), 'utf8');
    assert.ok(!/innerHTML\s*=\s*`[^`]*\$\{c\.text\}/.test(html), 'VULNERÁVEL (XSS armazenado): 10-chat-mensagem.html injeta ${c.text} em innerHTML sem escape');
  });
  test('SEC-22 foto_url deve aceitar apenas http(s)/data:image (javascript: bloqueado)', async () => {
    const r = await call('POST', '/api/pets', { token: ong, body: { nome: 'JS Url', raca: 'x', idade: '1', foto_url: 'javascript:alert(1)' } });
    assert.equal(r.status, 400, 'VULNERÁVEL: foto_url "javascript:" aceito');
  });
  test('payload > 15MB → 413', async () => { const r = await call('POST', '/api/auth/login', { body: JSON.stringify({ email: 'a', senha: 'x'.repeat(16 * 1024 * 1024) }) }); assert.equal(r.status, 413); });
  test('SEC-23 mensagem muito longa (100KB) deveria ser limitada (400/413)', async () => {
    const r = await call('POST', '/api/matches/1/messages', { token: ong, body: { texto: 'a'.repeat(100000) } }); assert.ok([400, 413].includes(r.status), 'aceitou ' + r.status);
  });
  test('SEC-24 adotante não deveria poder forjar is_termo:true em mensagem', async () => {
    const ms = (await call('GET', '/api/matches', { token: lucas })).data; const r = await call('POST', `/api/matches/${ms[0].id}/messages`, { token: lucas, body: { texto: 'falso termo', is_termo: true } });
    assert.equal(r.data.is_termo, false, 'VULNERÁVEL: adotante criou mensagem is_termo=true (gera botão de contrato falso)');
  });
});

describe('CORS / OpenAPI / Estáticos', () => {
  test('preflight OPTIONS → 204 com ACAO', async () => { const r = await call('OPTIONS', '/api/pets', { headers: { Origin: 'http://x.com', 'Access-Control-Request-Method': 'POST' } }); assert.ok([200, 204].includes(r.status)); assert.ok(r.headers.get('access-control-allow-origin')); });
  test('SEC-25 CORS não deveria ser "*" em rotas autenticadas', async () => { const r = await call('GET', '/api/pets', { headers: { Origin: 'http://evil.com' } }); assert.notEqual(r.headers.get('access-control-allow-origin'), '*'); });
  test('/api/openapi.json válido', async () => { const r = await call('GET', '/api/openapi.json'); assert.equal(r.status, 200); assert.equal(typeof r.data, 'object'); assert.ok(r.data.openapi); });
  test('OpenAPI declara securitySchemes bearer', async () => { const r = await call('GET', '/api/openapi.json'); assert.ok(r.data.components?.securitySchemes); });
  test('DOC-01 OpenAPI documenta TODAS as rotas implementadas (inclui /state)', async () => {
    const spec = (await call('GET', '/api/openapi.json')).data; const paths = Object.keys(spec.paths);
    for (const p of ['/auth/register', '/auth/login', '/auth/me', '/users', '/pets', '/pets/{id}', '/matches', '/matches/{id}', '/matches/{id}/messages', '/matches/{id}/enviar-termo', '/matches/{id}/assinar-termo', '/matches/{id}/status'])
      assert.ok(paths.some(x => x.replace(/^\/api/, '') === p), 'rota não documentada: ' + p);
  });
  test('DOC-02 toda operação tem exemplos de resposta de erro 401/403/404 conforme aplicável', async () => {
    const spec = (await call('GET', '/api/openapi.json')).data; const missing = [];
    for (const [p, ops] of Object.entries(spec.paths)) for (const [m, op] of Object.entries(ops)) { if (op.security?.length && !op.responses['401']) missing.push(`${m.toUpperCase()} ${p} sem 401`); }
    assert.equal(missing.length, 0, missing.join('; '));
  });
  test('rota inexistente /api/xyz → 404 JSON', async () => { const r = await call('GET', '/api/xyz'); assert.equal(r.status, 404); assert.equal(typeof r.data, 'object', 'retorna HTML em vez de JSON'); });
  test('SEC-26 arquivos sensíveis não são servidos estaticamente', async () => {
    for (const f of ['/../backend/patinhas.sqlite', '/backend/patinhas.sqlite', '/..%2fbackend%2fserver.js']) { const r = await call('GET', f); assert.notEqual(r.status === 200 && typeof r.data === 'string' && r.data.includes('SQLite format'), true); }
  });
});

describe('Persistência', () => {
  test('dados criados persistem no arquivo SQLite (WAL checkpoint)', async () => {
    const { db } = require('./database');
    assert.ok(db.prepare('SELECT COUNT(*) c FROM usuarios').get().c >= 3);
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  });
  test('integridade referencial: excluir usuário ONG com animais é RESTRICT', async () => {
    const { db } = require('./database');
    assert.throws(() => db.prepare('DELETE FROM usuarios WHERE id = 1').run());
  });
  test('DB-01 não deve existir match duplicado (UNIQUE animal+adotante)', async () => {
    const { db } = require('./database');
    assert.throws(() => db.prepare("INSERT INTO adocoes_matches(animal_id,adotante_id,data_match) VALUES(4,2,'x')").run());
  });
});

describe('Performance (smoke)', () => {
  test('PERF-01 GET /api/pets p95 < 50ms (100 req)', async () => {
    const t = []; for (let i = 0; i < 100; i++) { const s = performance.now(); await call('GET', '/api/pets'); t.push(performance.now() - s); }
    t.sort((a, b) => a - b); const p95 = t[94]; console.log(`   p50=${t[49].toFixed(1)}ms p95=${p95.toFixed(1)}ms`); assert.ok(p95 < 50, 'p95=' + p95);
  });
  test('PERF-02 GET /api/matches (ONG) p95 < 100ms – detecta N+1', async () => {
    const t = []; for (let i = 0; i < 50; i++) { const s = performance.now(); await call('GET', '/api/matches', { token: ong }); t.push(performance.now() - s); }
    t.sort((a, b) => a - b); console.log(`   p50=${t[24].toFixed(1)}ms p95=${t[47].toFixed(1)}ms`); assert.ok(t[47] < 100);
  });
  test('PERF-03 login (scrypt síncrono) não deve bloquear o event loop > 100ms', async () => {
    const s = performance.now(); await Promise.all(Array.from({ length: 10 }, () => call('POST', '/api/auth/login', { body: { email: 'lucas@ifrn.edu.br', senha: '123456' } })));
    const total = performance.now() - s; console.log(`   10 logins concorrentes: ${total.toFixed(0)}ms`); assert.ok(total < 600, 'total=' + total);
  });
  test('PERF-04 GET /api/pets com resposta enxuta (< 6KB/pet duplicado de campos PT+EN)', async () => {
    const r = await fetch(base + '/api/pets'); const txt = await r.text(); const n = JSON.parse(txt).length; console.log(`   ${txt.length}B para ${n} pets = ${(txt.length / n) | 0}B/pet; compressão: ${r.headers.get('content-encoding')}`);
    assert.ok(r.headers.get('content-encoding'), 'sem gzip/br');
  });
  test('PERF-05 /api/state escala com N+1 (3 queries por match)', async () => {
    const s = performance.now(); await call('GET', '/api/state'); console.log(`   /api/state ${(performance.now() - s).toFixed(1)}ms`);
  });
});

describe('Módulo de Resgates & Triagem', () => {
  test('RESG-01 protetor independente cadastra resgate com sucesso → 201 + custódia + prontuário inicial', async () => {
    const r = await call('POST', '/api/resgates', {
      token: protetor,
      body: {
        nome: 'Pitoco Resgatado',
        especie: 'Cachorro',
        raca: 'Vira-lata',
        idade: '1 ano',
        porte: 'Pequeno',
        sexo: 'Macho',
        local_resgate: 'Via Costeira, Natal/RN',
        condicao_inicial: 'Levemente desidratado',
        peso_atual_kg: 7.5,
        foto_url: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800'
      }
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.animal.nome, 'Pitoco Resgatado');
    assert.equal(r.data.animal.status, 'resgatado');
    assert.ok(r.data.custodia_id > 0);
  });

  test('RESG-02 adotante comum não pode cadastrar resgate diretamente → 403', async () => {
    const r = await call('POST', '/api/resgates', {
      token: lucas,
      body: { nome: 'Pet Inválido', foto_url: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800' }
    });
    assert.equal(r.status, 403);
  });

  test('RESG-03 publicar animal para adoção após triagem → 200 + status disponivel + checklist', async () => {
    const cad = await call('POST', '/api/resgates', {
      token: protetor,
      body: { nome: 'Floquinho', raca: 'Poodle', foto_url: 'https://images.unsplash.com/photo-1516371535707-512a1e83bb9a?w=800' }
    });
    const petId = cad.data.animal.id;

    const pub = await call('POST', `/api/pets/${petId}/publicar`, {
      token: protetor,
      body: { pendencias_saude: 'Filhote: castração programada para os 6 meses' }
    });
    assert.equal(pub.status, 200);
    assert.equal(pub.data.animal.status, 'disponivel');
    assert.ok(pub.data.checklist);
  });

  test('RESG-04 ONG-B não pode publicar animal da ONG-A ou de outro protetor → 403', async () => {
    const pub = await call('POST', '/api/pets/1/publicar', { token: protetor });
    assert.equal(pub.status, 403);
  });
});

describe('Módulo de Prontuário Veterinário & Histórico Clínico', () => {
  test('PRONT-01 leitura pública do prontuário retorna linha do tempo e resumo clínico', async () => {
    const r = await call('GET', '/api/pets/1/prontuario');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data.eventos));
    assert.ok(r.data.eventos.length >= 5);
    assert.equal(r.data.animal.nome, 'Buddy');
    assert.equal(r.data.animal.castrado, true);
    assert.equal(r.data.animal.vacinado, true);
  });

  test('PRONT-02 registrar vacina atualiza status de vacinado do animal → 201 + pet.vacinado=true', async () => {
    const p = await call('POST', '/api/pets', {
      token: ong,
      body: { nome: 'Snoopy Teste', raca: 'Beagle', idade: '1 ano', foto_url: 'https://images.unsplash.com/photo-1505628346881-b72b27e84530?w=800', vacinado: 0 }
    });
    const petId = p.data.id;
    assert.equal(p.data.vacinado, false);

    const ev = await call('POST', `/api/pets/${petId}/prontuario`, {
      token: ong,
      body: {
        tipo: 'vacina',
        titulo: 'Vacina V10 Polivalente',
        descricao: '1ª Dose aplicada',
        ocorrido_em: '2024-05-20',
        profissional: 'Dr. Roberto Silva',
        crmv: 'CRMV/RN 1420',
        clinica: 'VetCare'
      }
    });
    assert.equal(ev.status, 201);

    const petAtualizado = await call('GET', `/api/pets/${petId}`);
    assert.equal(petAtualizado.data.vacinado, true);
  });

  test('PRONT-03 registrar peso atualiza peso_atual_kg do animal → 201', async () => {
    const ev = await call('POST', '/api/pets/1/prontuario', {
      token: ong,
      body: {
        tipo: 'peso',
        titulo: 'Aferição de peso',
        descricao: 'Pesagem de controle',
        dados: { peso_kg: 30.5 },
        ocorrido_em: '2024-06-01'
      }
    });
    assert.equal(ev.status, 201);
    const pet = await call('GET', '/api/pets/1');
    assert.equal(pet.data.peso_atual_kg, 30.5);
  });

  test('PRONT-04 retificação auditável de evento anterior sem excluir o original → 201', async () => {
    const pront = await call('GET', '/api/pets/1/prontuario');
    const eventoOriginal = pront.data.eventos[0];

    const ret = await call('POST', `/api/pets/1/prontuario/${eventoOriginal.id}/retificar`, {
      token: ong,
      body: {
        motivo_retificacao: 'Digitação incorreta do lote da vacina no formulário',
        titulo: 'Vacina V10 (Lote Corrigido)',
        descricao: 'Lote retificado para LT-99002B'
      }
    });
    assert.equal(ret.status, 201);
    assert.equal(ret.data.evento_original_id, eventoOriginal.id);
  });

  test('PRONT-05 consulta da agenda médica retorna próximas doses e retornos', async () => {
    const r = await call('GET', '/api/pets/1/agenda');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data.agenda));
  });

  test('PRONT-06 usuário sem autorização não pode alterar prontuário de pet alheio → 403', async () => {
    const r = await call('POST', '/api/pets/1/prontuario', {
      token: maria,
      body: { tipo: 'observacao', titulo: 'Comentário aleatório' }
    });
    assert.equal(r.status, 403);
  });
});

describe('Módulo Pós-Adoção Vitalício, Portal do Tutor & Engajamento', () => {
  test('TUTOR-01 tutor consulta seus pets adotados e obtém RG Pet Digital → 200', async () => {
    const r = await call('GET', '/api/meus-pets', { token: lucas });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data));
    assert.ok(r.data.length >= 1);
    const mia = r.data.find(p => p.nome === 'Mia');
    assert.ok(mia, 'Mia não encontrada nos pets adotados do Lucas');
    assert.ok(mia.rg_pet, 'RG Pet ausente');
    assert.ok(mia.rg_pet.numero_registro.startsWith('RN-'));
    assert.equal(mia.rg_pet.tutor_nome, 'Lucas Aprígio');
    assert.ok(mia.dias_juntos >= 1);
  });

  test('TUTOR-02 tutor registra acompanhamento pós-adoção de peso e vacina → 201', async () => {
    const r = await call('POST', '/api/meus-pets/10/acompanhamento', {
      token: lucas,
      body: {
        tipo: 'peso',
        peso_kg: 4.0,
        observacao: 'Mia ganhou 200g de massa saudável com a nova ração úmida!'
      }
    });
    assert.equal(r.status, 201);
    assert.ok(r.data.evento_id > 0);

    const pront = await call('GET', '/api/pets/10/prontuario');
    const pesoEv = pront.data.eventos.find(e => e.tipo === 'peso' && e.titulo.includes('4 kg'));
    assert.ok(pesoEv);
  });

  test('TUTOR-03 lista marcos e conquistas pós-adoção do tutor → 200', async () => {
    const r = await call('GET', '/api/tutor/marcos', { token: lucas });
    assert.equal(r.status, 200);
    assert.ok(r.data.total_conquistas >= 1);
    assert.ok(r.data.marcos.some(m => m.tipo === 'adocao_concluida'));
  });

  test('TUTOR-04 gera código de indicação de amigos para incentivo a novas adoções → 200', async () => {
    const r = await call('GET', '/api/tutor/indicacao', { token: lucas });
    assert.equal(r.status, 200);
    assert.ok(r.data.codigo);
    assert.ok(r.data.mensagem_pronta.includes('Patinhas'));
  });

  test('TUTOR-05 aprovar match de adoção transfere custódia e gera marcos automaticamente', async () => {
    const apr = await call('PATCH', '/api/matches/2/status', {
      token: ong,
      body: { status: 'aprovado' }
    });
    assert.equal(apr.status, 200);

    const meus = await call('GET', '/api/meus-pets', { token: maria });
    assert.equal(meus.status, 200);
    const bella = meus.data.find(p => p.id === 5);
    assert.ok(bella, 'Bella não aparece nos pets de Maria após aprovação');
    assert.ok(bella.rg_pet);

    const marcosMaria = await call('GET', '/api/tutor/marcos', { token: maria });
    assert.ok(marcosMaria.data.marcos.some(m => m.tipo === 'adocao_concluida' && m.animal_id === 5));
  });
});
