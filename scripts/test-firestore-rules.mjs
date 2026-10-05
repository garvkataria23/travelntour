import assert from 'node:assert/strict';

const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const projectId = process.env.GCLOUD_PROJECT || 'demo-flyconnect';
const baseUrl = `http://${host}/v1/projects/${projectId}/databases/(default)/documents`;

function base64Url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/**
 * Builds an unsigned JWT accepted by the Firebase Firestore Emulator.
 */
function emulatorJwt(claims) {
  const header = base64Url({ alg: 'none', typ: 'JWT' });
  const payload = base64Url({
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    iat: Math.floor(Date.now() / 1000) - 60,
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: claims.uid,
    user_id: claims.uid,
    ...claims,
  });
  return `${header}.${payload}.`;
}

async function firestoreReq(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify({ fields: body }) : undefined,
  });
  return res.status;
}

const nowIso = new Date().toISOString();
const str = (v) => ({ stringValue: v });
const ts = (v = nowIso) => ({ timestampValue: v });
const map = (fields = {}) => ({ mapValue: { fields } });

async function run() {
  const staffA = emulatorJwt({ uid: 'staff-a', businessId: 'biz-a', role: 'STAFF', email: 'staff@a.com' });
  const managerA = emulatorJwt({ uid: 'mgr-a', businessId: 'biz-a', role: 'MANAGER', email: 'mgr@a.com' });
  const adminA = emulatorJwt({ uid: 'admin-a', businessId: 'biz-a', role: 'ADMIN', email: 'admin@a.com' });
  const adminB = emulatorJwt({ uid: 'admin-b', businessId: 'biz-b', role: 'ADMIN', email: 'admin@b.com' });
  const superAdmin = emulatorJwt({ uid: 'super-1', businessId: 'biz-platform', role: 'SUPER_ADMIN', email: 'owner@flyconnect.com' });

  // 1. Unauthenticated read/write is denied
  assert.equal(
    await firestoreReq('GET', '/customers/cust-1'),
    403,
    'Unauthenticated GET /customers/cust-1 must return 403',
  );

  // 2. Tenant member (STAFF in biz-a) can create a valid customer in biz-a
  assert.equal(
    await firestoreReq('PATCH', '/customers/cust-1', {
      token: staffA,
      body: {
        id: str('cust-1'),
        businessId: str('biz-a'),
        name: str('Aarav Sharma'),
        phone: str('+919876543210'),
        status: str('ACTIVE'),
        createdAt: ts(),
      },
    }),
    200,
    'STAFF in biz-a should be able to create customer in biz-a',
  );

  // 3. Cross-tenant isolation: ADMIN in biz-b cannot read or delete biz-a customer
  assert.equal(
    await firestoreReq('GET', '/customers/cust-1', { token: adminB }),
    403,
    'Cross-tenant ADMIN (biz-b) must not read biz-a customer',
  );
  assert.equal(
    await firestoreReq('DELETE', '/customers/cust-1', { token: adminB }),
    403,
    'Cross-tenant ADMIN (biz-b) must not delete biz-a customer',
  );

  // 4. Role enforcement inside tenant: STAFF cannot delete customer, ADMIN can
  assert.equal(
    await firestoreReq('DELETE', '/customers/cust-1', { token: staffA }),
    403,
    'STAFF in biz-a must not delete customer in Firestore',
  );
  assert.equal(
    await firestoreReq('DELETE', '/customers/cust-1', { token: managerA }),
    403,
    'MANAGER in biz-a must not delete customer in Firestore (admin/super_admin only)',
  );
  assert.equal(
    await firestoreReq('DELETE', '/customers/cust-1', { token: adminA }),
    200,
    'ADMIN in biz-a can delete customer in biz-a',
  );

  // 5. Privilege escalation guard on /users: tenant ADMIN cannot mint SUPER_ADMIN, but can create MANAGER
  assert.equal(
    await firestoreReq('PATCH', '/users/user-escalate', {
      token: adminA,
      body: {
        uid: str('user-escalate'),
        businessId: str('biz-a'),
        email: str('evil@a.com'),
        name: str('Evil'),
        role: str('SUPER_ADMIN'),
        status: str('ACTIVE'),
      },
    }),
    403,
    'Tenant ADMIN must be blocked from creating a SUPER_ADMIN user document',
  );

  assert.equal(
    await firestoreReq('PATCH', '/users/user-mgr', {
      token: adminA,
      body: {
        uid: str('user-mgr'),
        businessId: str('biz-a'),
        email: str('mgr@a.com'),
        name: str('Manager A'),
        role: str('MANAGER'),
        status: str('ACTIVE'),
      },
    }),
    200,
    'Tenant ADMIN can create a MANAGER user document in their own tenant',
  );

  // 6. Backup collection rules: tenant member can create valid backup snapshot; other tenant cannot read it
  assert.equal(
    await firestoreReq('PATCH', '/backups/bk-1', {
      token: adminA,
      body: {
        businessId: str('biz-a'),
        backup: map({ version: str('1.0') }),
        createdAt: ts(),
      },
    }),
    200,
    'Tenant ADMIN can write a valid backup snapshot to /backups/bk-1',
  );

  assert.equal(
    await firestoreReq('GET', '/backups/bk-1', { token: adminB }),
    403,
    'Cross-tenant ADMIN (biz-b) cannot read biz-a backup snapshot',
  );

  assert.equal(
    await firestoreReq('GET', '/backups/bk-1', { token: superAdmin }),
    200,
    'SUPER_ADMIN can read backup snapshot across tenants',
  );

  console.log('Firestore rules behavioral tests: 10/10 assertions PASSED');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
