const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');

const apiBase = (process.env.FARMHANDS_API_URL || 'http://localhost:3000/api').replace(/\/$/, '');
const runId = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-12);
const farmerPhone = `+1555${runId}01`;
const workerPhone = `+1555${runId}02`;
const userIds = [];
const requestIds = [];
const uploadPaths = [];
let checks = 0;

function farmDate(offset = 0) {
  const date = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()));
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function sameDayAvailabilityOpen() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date()));
  return hour < 7;
}

function pass(label) {
  checks += 1;
  console.log(`PASS ${label}`);
}

async function call(route, { method = 'GET', body, expected } = {}) {
  const headers = {};
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${apiBase}${route}`, { method, headers, body: payload });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  const statuses = expected ?? (method === 'POST' ? 201 : 200);
  const allowed = Array.isArray(statuses) ? statuses : [statuses];
  assert.ok(
    allowed.includes(response.status),
    `${method} ${route}: expected HTTP ${allowed.join(' or ')}, got ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`,
  );
  return { status: response.status, data };
}

function trackUpload(result, folder) {
  const url = result.data?.url;
  assert.equal(typeof url, 'string', `Expected uploaded file URL for ${folder}`);
  const fileName = path.basename(new URL(url, apiBase).pathname);
  uploadPaths.push(path.join(__dirname, '..', 'uploads', folder, fileName));
}

async function login(phone, label) {
  const requested = await call('/auth/request-otp', { method: 'POST', body: { phone } });
  assert.equal(requested.data.phone, phone);
  const verified = await call('/auth/verify-otp', { method: 'POST', body: { phone, otp: 'test-code' } });
  assert.ok(verified.data.user?.id);
  assert.ok(verified.data.token);
  userIds.push(verified.data.user.id);
  pass(`${label} OTP request and development verification`);
  return verified.data.user.id;
}

async function cleanup() {
  if (userIds.length || requestIds.length) {
    const client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USERNAME || 'farmhands',
      password: process.env.DB_PASSWORD || 'farmhands',
      database: process.env.DB_DATABASE || 'farmhands',
    });
    await client.connect();
    try {
      await client.query('BEGIN');
      if (requestIds.length) {
        await client.query('DELETE FROM "labour_requests" WHERE "id" = ANY($1::uuid[])', [requestIds]);
      }
      if (userIds.length) {
        await client.query('DELETE FROM "worker_reviews" WHERE "farmerId" = ANY($1::uuid[]) OR "workerId" = ANY($1::uuid[])', [userIds]);
        await client.query('DELETE FROM "saved_workers" WHERE "farmerId" = ANY($1::uuid[]) OR "workerId" = ANY($1::uuid[])', [userIds]);
        await client.query('DELETE FROM "worker_search_alerts" WHERE "farmerId" = ANY($1::uuid[])', [userIds]);
        await client.query('DELETE FROM "labour_groups" WHERE "leaderId" = ANY($1::uuid[])', [userIds]);
        await client.query('DELETE FROM "users" WHERE "id" = ANY($1::uuid[])', [userIds]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }
  }
  for (const filePath of uploadPaths) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

async function run() {
  const farmerId = await login(farmerPhone, 'farmer');
  const workerId = await login(workerPhone, 'labour');
  const outsiderId = await login(`+1555${runId}03`, 'outsider');
  await call('/auth/verify-otp', { method: 'POST', body: { otp: 'test-code' }, expected: 400 });
  pass('authentication request validation');

  const farmer = await call(`/users/${farmerId}`);
  assert.equal(farmer.data.id, farmerId);
  const worker = await call(`/users/${workerId}`);
  assert.equal(worker.data.id, workerId);
  pass('farmer and labour profile reads');

  await call(`/users/${farmerId}`, {
    method: 'PATCH',
    body: {
      roles: ['farmer'],
      firstName: 'API_TEST_FARMER',
      lastName: 'Flow',
      onboardingComplete: true,
      preferredLanguage: 'en',
      homeAddress: 'Test farm, Akloor',
      farms: [{
        id: `test-farm-${runId}`,
        name: 'API Test Farm',
        acres: 2,
        crop: 'Maize',
        address: 'Test farm, Akloor',
        mapLink: null,
      }],
    },
  });
  const updatedWorker = await call(`/users/${workerId}`, {
    method: 'PATCH',
    body: {
      roles: ['labour'],
      firstName: 'API_TEST_WORKER',
      lastName: 'Flow',
      onboardingComplete: true,
      labourSkills: ['Harvesting', 'Planting'],
      labourArea: 'Akloor',
      labourDailyRate: 600,
      labourTravelRadius: 25,
      labourAvailable: sameDayAvailabilityOpen(),
      labourShift: 'morning',
      labourAvailableDates: [
        ...(sameDayAvailabilityOpen() ? [farmDate()] : []),
        farmDate(1), farmDate(2), farmDate(3), farmDate(4), farmDate(5),
      ],
    },
  });
  assert.equal(updatedWorker.data.labourShift, 'morning');
  const persistedWorker = await call(`/users/${workerId}`);
  assert.equal(persistedWorker.data.labourShift, 'morning');
  await call(`/users/${workerId}`, { method: 'PATCH', body: { labourShift: 'evening' }, expected: 400 });
  if (!sameDayAvailabilityOpen()) {
    await call(`/users/${workerId}`, { method: 'PATCH', body: { labourAvailable: true }, expected: 400 });
    await call(`/users/${workerId}`, {
      method: 'PATCH',
      body: { labourAvailableDates: [farmDate(), farmDate(1), farmDate(2), farmDate(3), farmDate(4), farmDate(5)] },
      expected: 400,
    });
  }
  await call(`/users/${workerId}`, { method: 'PATCH', body: { labourTravelRadius: 501, }, expected: 400 });
  pass('profile updates and invalid field validation');

  const group = await call(`/groups/${workerId}`, {
    method: 'PUT',
    body: { name: 'API Test Crew', memberNames: ['Test Member'] },
  });
  assert.equal(group.data.size, 2);
  const fetchedGroup = await call(`/groups/${workerId}`);
  assert.equal(fetchedGroup.data.name, 'API Test Crew');
  await call(`/groups/${workerId}`, {
    method: 'PUT',
    body: { name: 'API Test Crew', memberNames: [''] },
    expected: 400,
  });
  await call(`/groups/${workerId}`, {
    method: 'PUT',
    body: { name: 'API Test Crew', memberNames: ['Same', 'same'] },
    expected: 400,
  });
  await call(`/groups/${farmerId}`, {
    method: 'PUT',
    body: { name: 'Invalid Farmer Group', memberNames: [] },
    expected: 403,
  });
  pass('labour group save, read, duplicate/blank roster validation, and farmer access rejection');

  const options = await call(`/requests/options?farmerId=${farmerId}`);
  assert.ok(options.data.workTypes.includes('Harvesting'));
  assert.ok(options.data.farms.some((farm) => farm.id === `test-farm-${runId}`));
  pass('request form options');

  const searchAlert = await call('/workers/alerts', {
    method: 'POST',
    body: { farmerId, from: farmDate(5), to: farmDate(5), skill: 'Harvesting' },
  });
  assert.equal(searchAlert.data.saved, true);
  await call('/workers/alerts', {
    method: 'POST',
    body: { farmerId, from: farmDate(5), to: farmDate(5), latitude: 12, maxDistanceKm: 20 },
    expected: 400,
  });
  pass('worker search alerts and invalid coordinate validation');

  const initialSearch = await call(`/workers?from=${farmDate(1)}&to=${farmDate(1)}&farmerId=${farmerId}`);
  const workerInSearch = initialSearch.data.workers.find((item) => item.id === workerId && item.available);
  assert.ok(workerInSearch);
  assert.equal(workerInSearch.labourShift, 'morning');
  const todaySearch = await call(`/workers?from=${farmDate()}&to=${farmDate()}&farmerId=${farmerId}`);
  const workerToday = todaySearch.data.workers.find((item) => item.id === workerId);
  assert.ok(workerToday);
  assert.equal(workerToday.available, sameDayAvailabilityOpen());
  assert.equal(workerToday.availableDates.includes(farmDate()), sameDayAvailabilityOpen());
  await call(`/workers?from=${farmDate(3)}&to=${farmDate(1)}`, { expected: 400 });
  await call(`/workers?from=${farmDate(1)}&to=${farmDate(1)}&maxDistanceKm=10`, { expected: 400 });
  pass('worker search availability and invalid date range');

  await call(`/workers/${farmerId}/saved/${workerId}`, {
    method: 'PUT',
    body: { notifyWhenAvailable: false },
  });
  await call(`/workers/${farmerId}/saved/${workerId}/alerts`, {
    method: 'PATCH',
    body: { notifyWhenAvailable: true },
  });
  const savedWorkers = await call(`/workers/${farmerId}/saved`);
  assert.ok(savedWorkers.data.some((item) => item.id === workerId && item.notifyWhenAvailable));
  await call(`/workers/${farmerId}/saved?freeToday=true`);
  await call(`/workers/${farmerId}/saved/${workerId}`, { method: 'DELETE' });
  await call(`/workers/${farmerId}/saved/${workerId}/alerts`, {
    method: 'PATCH',
    body: { notifyWhenAvailable: false },
    expected: 404,
  });
  await call(`/workers/${farmerId}/saved/${workerId}`, { method: 'DELETE', expected: 404 });
  pass('saved worker add, list, filter, alert update, delete, and missing-record validation');

  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l0sAAAAASUVORK5CYII=',
    'base64',
  );
  const profileForm = new FormData();
  profileForm.append('file', new Blob([image], { type: 'image/png' }), 'api-test.png');
  trackUpload(await call(`/users/${workerId}/profile-image`, { method: 'POST', body: profileForm }), 'profile-images');
  const requestForm = new FormData();
  requestForm.append('file', new Blob([image], { type: 'image/png' }), 'api-test.png');
  const requestImage = await call('/requests/image', { method: 'POST', body: requestForm });
  trackUpload(requestImage, 'request-images');
  const invalidProfileForm = new FormData();
  invalidProfileForm.append('file', new Blob(['not an image'], { type: 'text/plain' }), 'api-test.txt');
  await call(`/users/${workerId}/profile-image`, { method: 'POST', body: invalidProfileForm, expected: 400 });
  const invalidRequestForm = new FormData();
  invalidRequestForm.append('file', new Blob(['not an image'], { type: 'text/plain' }), 'api-test.txt');
  await call('/requests/image', { method: 'POST', body: invalidRequestForm, expected: 400 });
  await call('/requests/image', { method: 'POST', body: new FormData(), expected: 400 });
  pass('profile and request image upload plus missing/invalid-file validation');

  await call('/places/autocomplete?input=');
  await call('/places/reverse-geocode?latitude=91&longitude=200', { expected: 400 });
  await call('/places/bad%20id', { expected: 502 });
  pass('places empty-input and local validation cases (no external Places requests made)');

  const createRequest = async (label, startDate, endDate = startDate) => {
    const result = await call('/requests', {
      method: 'POST',
      body: {
        title: `API Test ${label}`,
        workType: 'Harvesting',
        crop: 'Maize',
        farmLocationId: `test-farm-${runId}`,
        area: 'Akloor',
        startDate,
        endDate,
        peopleNeeded: 2,
        payPerDay: 600,
        farmerId,
        workerIds: [workerId],
      },
    });
    requestIds.push(result.data.id);
    return result.data;
  };

  if (!sameDayAvailabilityOpen()) {
    const lateSameDayRequest = await call('/requests', {
      method: 'POST',
      body: {
        title: 'API Test late same-day request',
        workType: 'Harvesting',
        crop: 'Maize',
        area: 'Akloor',
        startDate: farmDate(),
        endDate: farmDate(),
        peopleNeeded: 1,
        payPerDay: 600,
        farmerId,
        workerIds: [workerId],
      },
      expected: 400,
    });
    assert.match(lateSameDayRequest.data.message, /before 7:00 a\.m\./i);
  }

  const acceptedRequest = await createRequest('accepted booking', farmDate(1));
  const allRequests = await call('/requests?status=open');
  assert.ok(allRequests.data.some((item) => item.id === acceptedRequest.id));
  const pendingWorkerRequests = await call(`/requests/worker/${workerId}?bucket=new`);
  assert.ok(pendingWorkerRequests.data.some((item) => item.request.id === acceptedRequest.id));
  const farmerPending = await call(`/requests/bookings/${farmerId}?role=farmer&bucket=pending`);
  const pendingRequest = farmerPending.data.find((item) => item.request.id === acceptedRequest.id);
  assert.ok(pendingRequest);
  assert.equal(pendingRequest.worker.phone, undefined);
  await call(`/requests/bookings/${acceptedRequest.id}/${workerId}?userId=${farmerId}`, { expected: 404 });

  await call(`/requests/${acceptedRequest.id}/respond`, {
    method: 'POST',
    body: { workerId, status: 'accepted' },
  });
  await call(`/requests/${acceptedRequest.id}/respond`, {
    method: 'POST',
    body: { workerId, status: 'accepted' },
    expected: 400,
  });
  const workerAccepted = await call(`/requests/worker/${workerId}?bucket=accepted`);
  assert.ok(workerAccepted.data.some((item) => item.request.id === acceptedRequest.id && item.bookingStatus === 'confirmed'));
  await call(`/requests/bookings/${workerId}?role=labour&bucket=upcoming`);
  await call(`/requests/bookings/${workerId}?role=labour&bucket=pending`);
  const farmerBookings = await call(`/requests/bookings/${farmerId}?role=farmer&bucket=upcoming`);
  assert.ok(farmerBookings.data.some((item) => item.request.id === acceptedRequest.id && item.booking.status === 'confirmed'));
  const bookingDetails = await call(`/requests/bookings/${acceptedRequest.id}/${workerId}?userId=${farmerId}`);
  assert.equal(bookingDetails.data.booking.status, 'confirmed');
  assert.equal(bookingDetails.data.worker.phone, workerPhone);
  await call(`/requests/bookings/${acceptedRequest.id}/${workerId}?userId=${outsiderId}`, { expected: 403 });
  await call(`/requests/bookings/${acceptedRequest.id}/${workerId}/cancel`, {
    method: 'POST',
    body: { userId: outsiderId, reason: 'plans_changed' },
    expected: 403,
  });

  const bookedDateSearch = await call(`/workers?from=${farmDate(1)}&to=${farmDate(1)}&farmerId=${farmerId}`);
  assert.ok(!bookedDateSearch.data.workers.some((item) => item.id === workerId));
  assert.ok(bookedDateSearch.data.bookedWorkerIds.includes(workerId));
  const laterDateSearch = await call(`/workers?from=${farmDate(2)}&to=${farmDate(2)}&farmerId=${farmerId}`);
  assert.ok(laterDateSearch.data.workers.some((item) => item.id === workerId && item.available));
  const conflicts = await call('/requests', {
    method: 'POST',
    body: {
      title: 'API Test duplicate date',
      workType: 'Harvesting',
      crop: 'Maize',
      area: 'Akloor',
      startDate: farmDate(1),
      endDate: farmDate(1),
      peopleNeeded: 1,
      payPerDay: 600,
      farmerId,
      workerIds: [workerId],
    },
    expected: 400,
  });
  assert.match(conflicts.data.message, /confirmed booking/i);
  pass('request acceptance, pre/post-acceptance phone access, booking views, duplicate response, date exclusion, and booking conflict validation');

  const alerts = await call(`/workers/${farmerId}/alerts`);
  assert.ok(alerts.data.some((item) => item.type === 'accepted' && item.requestId === acceptedRequest.id));
  assert.ok(alerts.data.some((item) => item.type === 'availability'));
  pass('farmer alerts include accepted booking and saved search');

  await call(`/requests/bookings/${acceptedRequest.id}/${workerId}/cancel`, {
    method: 'POST',
    body: { userId: farmerId, reason: 'plans_changed' },
  });
  const reopenedDateSearch = await call(`/workers?from=${farmDate(1)}&to=${farmDate(1)}`);
  assert.ok(reopenedDateSearch.data.workers.some((item) => item.id === workerId && item.available));
  await call(`/requests/bookings/${acceptedRequest.id}/${workerId}/cancel`, {
    method: 'POST',
    body: { userId: farmerId, reason: 'plans_changed' },
    expected: 400,
  });
  pass('booking cancellation and availability restoration');

  const declinedRequest = await createRequest('declined request', farmDate(3));
  await call(`/requests/${declinedRequest.id}/respond`, {
    method: 'POST',
    body: { workerId, status: 'declined', declineReason: 'too_far' },
  });
  await call(`/requests/${declinedRequest.id}/respond`, {
    method: 'POST',
    body: { workerId, status: 'accepted' },
    expected: 400,
  });
  const workerPast = await call(`/requests/worker/${workerId}?bucket=past`);
  assert.ok(workerPast.data.some((item) => item.request.id === declinedRequest.id && item.responseStatus === 'declined'));
  pass('worker decline and past request flow');

  const closedRequest = await createRequest('repeat request', farmDate(4));
  await call(`/requests/${closedRequest.id}/cancel`, {
    method: 'POST',
    body: { userId: farmerId, reason: 'dates_changed' },
  });
  const repeatedRequest = await call(`/requests/${closedRequest.id}/repeat`, {
    method: 'POST',
    body: { farmerId, workerId },
  });
  requestIds.push(repeatedRequest.data.id);
  assert.equal(repeatedRequest.data.status, 'open');
  const repeatedPending = await call(`/requests/worker/${workerId}?bucket=new`);
  assert.ok(repeatedPending.data.some((item) => item.request.id === repeatedRequest.data.id));
  pass('open request cancellation and repeat flow');

  const reviewRequest = await createRequest('completed review', farmDate(1));
  await call(`/requests/${reviewRequest.id}/respond`, {
    method: 'POST',
    body: { workerId, status: 'accepted' },
  });
  const db = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'farmhands',
    password: process.env.DB_PASSWORD || 'farmhands',
    database: process.env.DB_DATABASE || 'farmhands',
  });
  await db.connect();
  try {
    await db.query('UPDATE "labour_requests" SET "startDate"=$2::date, "endDate"=$2::date WHERE "id"=$1::uuid', [
      reviewRequest.id,
      farmDate(-1),
    ]);
  } finally {
    await db.end();
  }
  const canRate = await call(`/workers/reviews/${reviewRequest.id}/${workerId}?farmerId=${farmerId}`);
  assert.equal(canRate.data.canRate, true);
  await call('/workers/reviews', {
    method: 'POST',
    body: {
      requestId: reviewRequest.id,
      workerId,
      farmerId,
      rating: 5,
      attendanceStatus: 'all_attended',
      peopleAttended: 1,
      tags: [],
    },
    expected: 400,
  });
  await call('/workers/reviews', {
    method: 'POST',
    body: {
      requestId: reviewRequest.id,
      workerId,
      farmerId,
      rating: 5,
      attendanceStatus: 'all_attended',
      peopleAttended: 2,
      comment: 'API flow test review',
      tags: ['on_time', 'hard_working'],
      saveWorker: true,
    },
  });
  await call('/workers/reviews', {
    method: 'POST',
    body: {
      requestId: reviewRequest.id,
      workerId,
      farmerId,
      rating: 5,
      attendanceStatus: 'all_attended',
      peopleAttended: 2,
      tags: [],
    },
    expected: 400,
  });
  const savedAfterReview = await call(`/workers/${farmerId}/saved`);
  assert.ok(savedAfterReview.data.some((item) => item.id === workerId));
  const pastBookings = await call(`/requests/bookings/${farmerId}?role=farmer&bucket=past`);
  assert.ok(pastBookings.data.some((item) => item.request.id === reviewRequest.id && item.booking.status === 'completed'));
  pass('completed booking, review submission, duplicate review rejection, save worker, and past booking');

  await call(`/requests/bookings/${acceptedRequest.id}/${workerId}?userId=${farmerId}`);
  await call(`/requests/${requestIds[0]}/repeat`, {
    method: 'POST',
    body: { farmerId, workerId },
    expected: 400,
  });

  console.log(`\nAPI flow test passed: ${checks} checks.`);
}

run()
  .catch((error) => {
    console.error(`\nAPI flow test failed after ${checks} checks: ${error.stack || error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
      console.log('Temporary API test accounts, records, and uploads cleaned up.');
    } catch (error) {
      console.error(`Test cleanup failed; inspect only this run's test data: ${error.stack || error.message}`);
      process.exitCode = 1;
    }
  });
