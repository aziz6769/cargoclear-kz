import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, as } from './helpers/pg.js';

let db;
try {
  db = await openDb();
} catch (e) {
  console.warn('RLS tests skipped: could not start the local Postgres (pglite):', e.message);
}
const skip = !db && 'pglite not available';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const SA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const rejects = (p, re) => assert.rejects(p, (e) => re.test(String(e.message)));

test('profile row is created by the signup trigger from whitelisted metadata only', { skip }, async () => {
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
    ('${A}', 'a@example.com', '{"full_name":"Alice","company_name":"Acme","preferred_language":"kk","is_admin":true}'),
    ('${B}', 'b@example.com', '{"preferred_language":"xx"}')`);
  const { rows } = await db.query('select id, full_name, company_name, preferred_language, email from public.profiles order by email');
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].full_name, rows[0].company_name, rows[0].preferred_language], ['Alice', 'Acme', 'kk']);
  assert.equal(rows[1].preferred_language, 'ru', 'an unknown language falls back to ru');
});

test('a user can create rows only under their own user_id (default = auth.uid())', { skip }, async () => {
  await as(db, A, async (d) => {
    await d.query(`insert into public.shipments (id, title) values ('${SA}', 'A shipment')`);
    const { rows } = await d.query(`select user_id from public.shipments where id = '${SA}'`);
    assert.equal(rows[0].user_id, A);
    await d.query(`insert into public.carriers (id, name) values ('${CA}', 'Carrier A')`);
  });
  await as(db, B, async (d) => {
    await rejects(d.query(`insert into public.shipments (title, user_id) values ('spoof', '${A}')`), /row-level security/);
  });
});

test('users cannot read, update or delete another user\'s rows', { skip }, async () => {
  await as(db, B, async (d) => {
    assert.equal((await d.query('select * from public.shipments')).rows.length, 0);
    assert.equal((await d.query('select * from public.carriers')).rows.length, 0);
    const upd = await d.query(`update public.shipments set title = 'hacked' where id = '${SA}'`);
    assert.equal(upd.affectedRows, 0);
    const del = await d.query(`delete from public.shipments where id = '${SA}'`);
    assert.equal(del.affectedRows, 0);
  });
  await as(db, A, async (d) => {
    const { rows } = await d.query(`select title from public.shipments where id = '${SA}'`);
    assert.equal(rows[0].title, 'A shipment');
  });
});

test('a user cannot hand a row to someone else (user_id is immutable through the API)', { skip }, async () => {
  await as(db, A, async (d) => {
    await rejects(d.query(`update public.shipments set user_id = '${B}' where id = '${SA}'`), /row-level security/);
  });
});

test('related records cannot point at another user\'s shipment, carrier or comparison', { skip }, async () => {
  await as(db, B, async (d) => {
    // own user_id, foreign parent -> composite foreign key refuses it
    await rejects(d.query(`insert into public.comparisons (shipment_id, title) values ('${SA}', 'x')`), /foreign key/);
    await rejects(d.query(`insert into public.events (shipment_id, event_type) values ('${SA}', 'note')`), /foreign key/);
    await rejects(d.query(`insert into public.documents (shipment_id, title) values ('${SA}', 'x')`), /foreign key/);
  });
  await as(db, A, async (d) => {
    // foreign user_id -> RLS refuses it
    await rejects(d.query(`insert into public.events (user_id, shipment_id, event_type) values ('${B}', '${SA}', 'note')`), /row-level security/);
  });
});

test('offers: unknown price stays NULL, negative price is refused, carrier/shipment links are enforced', { skip }, async () => {
  await as(db, A, async (d) => {
    await d.query(`insert into public.comparisons (id, shipment_id, title) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '${SA}', 'cmp')`);
    await d.query(`insert into public.offers (shipment_id, carrier_id, comparison_id, base_price) values ('${SA}', '${CA}', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', null)`);
    const { rows } = await d.query('select base_price from public.offers');
    assert.equal(rows[0].base_price, null);
    await rejects(d.query(`insert into public.offers (shipment_id, carrier_id, base_price) values ('${SA}', '${CA}', -1)`), /check constraint/);
    await rejects(d.query(`delete from public.carriers where id = '${CA}'`), /foreign key/); // carrier with offers cannot disappear
    await rejects(d.query(`delete from public.shipments where id = '${SA}'`), /foreign key/); // shipment with comparisons cannot disappear
  });
  await as(db, B, async (d) => {
    assert.equal((await d.query('select * from public.offers')).rows.length, 0);
    await rejects(d.query(`insert into public.offers (shipment_id, carrier_id) values ('${SA}', '${CA}')`), /foreign key/);
  });
});

test('documents: storage_path must live under the owner\'s folder; size is capped; shipment delete keeps the row', { skip }, async () => {
  await as(db, A, async (d) => {
    await rejects(d.query(`insert into public.documents (title, storage_path) values ('x', '${B}/f.pdf')`), /check constraint/);
    await rejects(d.query(`insert into public.documents (title, storage_path, file_size) values ('x', '${A}/d/f.pdf', 99999999)`), /check constraint/);
    await d.query(`insert into public.documents (id, title, storage_path, file_size, shipment_id) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'ok', '${A}/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/f.pdf', 1000, '${SA}')`);
  });
  await db.exec(`delete from public.comparisons`); // service-level cleanup (superuser) so the shipment can go
  await db.exec(`delete from public.offers`);
  await db.exec(`delete from public.shipments where id = '${SA}'`);
  const { rows } = await db.query(`select shipment_id from public.documents where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].shipment_id, null);
});

test('the anonymous role has no access to any table', { skip }, async () => {
  for (const t of ['shipments', 'carriers', 'comparisons', 'offers', 'documents', 'events', 'profiles']) {
    await as(db, null, async (d) => {
      await rejects(d.query(`select * from public.${t}`), /permission denied/);
    }, 'anon');
  }
});

test('profiles: a user reads and edits only their own profile', { skip }, async () => {
  await as(db, B, async (d) => {
    const { rows } = await d.query('select id from public.profiles');
    assert.deepEqual(rows.map((r) => r.id), [B]);
    const upd = await d.query(`update public.profiles set full_name = 'hacked' where id = '${A}'`);
    assert.equal(upd.affectedRows, 0);
    await d.query(`update public.profiles set full_name = 'Bob', company_name = 'B Ltd' where id = '${B}'`);
  });
});

test('storage: private bucket with limits; objects only inside the owner\'s folder', { skip }, async () => {
  const { rows } = await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'documents'`);
  assert.equal(rows[0].public, false);
  assert.equal(Number(rows[0].file_size_limit), 3 * 1024 * 1024);
  assert.ok(rows[0].allowed_mime_types.includes('application/pdf') && !rows[0].allowed_mime_types.includes('text/html'));
  await as(db, A, async (d) => {
    await d.query(`insert into storage.objects (bucket_id, name, owner) values ('documents', '${A}/doc1/file.pdf', '${A}')`);
    await rejects(d.query(`insert into storage.objects (bucket_id, name) values ('documents', '${B}/doc1/evil.pdf')`), /row-level security/);
    await rejects(d.query(`insert into storage.objects (bucket_id, name) values ('documents', 'loose.pdf')`), /row-level security/);
  });
  await as(db, B, async (d) => {
    assert.equal((await d.query('select * from storage.objects')).rows.length, 0);
    assert.equal((await d.query(`delete from storage.objects where name like '${A}/%'`)).affectedRows, 0);
  });
  await as(db, A, async (d) => {
    assert.equal((await d.query('select * from storage.objects')).rows.length, 1);
  });
});

test('migration versions are recorded', { skip }, async () => {
  const { rows } = await db.query('select version from public.app_migrations order by version');
  assert.deepEqual(rows.map((r) => r.version), ['20261113000001', '20261113000002', '20261113000003']);
});
