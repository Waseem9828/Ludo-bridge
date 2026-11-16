import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildImbOtpEndpointUrl,
  buildImbOtpHeaders,
  buildImbOtpPayload,
  createImbClient,
  getImbCredentialsFromEnv,
  isRetryableImbFailure,
  normalizeOtpChannel,
  parseImbApiResponse,
  sendImbOtp,
} from './imbCommunications';

test('buildImbOtpEndpointUrl and headers match IMB Communications specification', () => {
  assert.equal(normalizeOtpChannel('whatsapp'), 'whatsapp');
  assert.equal(normalizeOtpChannel('other'), 'sms');

  assert.equal(
    buildImbOtpEndpointUrl('sms'),
    'https://secure.imbpayment.in/api/v1/comunication/send-sms'
  );
  assert.equal(
    buildImbOtpEndpointUrl('whatsapp', 'https://secure.imbpayment.in/'),
    'https://secure.imbpayment.in/api/v1/comunication/whatsapp/send-message'
  );

  const headers = buildImbOtpHeaders({
    clientId: 'client_123',
    clientSecret: 'secret_abc',
  });
  assert.deepEqual(headers, {
    'Content-Type': 'application/json',
    'x-client-id': 'client_123',
    'x-client-secret': 'secret_abc',
  });

  assert.deepEqual(buildImbOtpPayload('+91 98367-36572', '123456'), {
    mobile_number: '9836736572',
    otp_code: '123456',
  });
});

test('getImbCredentialsFromEnv reads IMB_CLIENT_ID and IMB_CLIENT_SECRET safely', () => {
  assert.equal(getImbCredentialsFromEnv({}), null);
  assert.equal(getImbCredentialsFromEnv({ IMB_CLIENT_ID: 'only-id' }), null);
  assert.deepEqual(
    getImbCredentialsFromEnv({
      IMB_CLIENT_ID: ' id1 ',
      IMB_CLIENT_SECRET: ' sec1 ',
    }),
    { clientId: 'id1', clientSecret: 'sec1' }
  );
});

test('parseImbApiResponse parses 200 delivery, 422 validation errors, and 401/403 auth errors', () => {
  const ok = parseImbApiResponse(
    200,
    {
      response_code: 200,
      status: 'success',
      message: 'Success',
      data: {
        message_id: 'IMBSMS16192920251014_2ddf679c',
        status: 'delivered',
      },
      meta: {
        request_id: 'b95f8e92-18da-439c-84d6-5cbf588a5e29',
        time: '2025-10-14T16:19:29+05:30',
      },
    },
    'sms'
  );
  assert.equal(ok.delivered, true);
  if (ok.delivered) {
    assert.equal(ok.messageId, 'IMBSMS16192920251014_2ddf679c');
    assert.equal(ok.deliveryStatus, 'delivered');
  }

  const validationFail = parseImbApiResponse(
    422,
    {
      response_code: 422,
      error_code: 'error',
      message: 'Validation failed.',
      error: {
        mobile_number: ['The Mobile Number field is required.'],
      },
      data: null,
    },
    'whatsapp'
  );
  assert.equal(validationFail.delivered, false);
  if (!validationFail.delivered) {
    assert.equal(validationFail.statusCode, 422);
    assert.equal(validationFail.error, 'The Mobile Number field is required.');
    assert.equal(isRetryableImbFailure(validationFail), false);
  }

  const ipBlocked = parseImbApiResponse(
    403,
    {
      response_code: 403,
      error_code: 'INVALID_IP',
      message: 'IP is not whitelisted.',
      error: [],
      data: null,
    },
    'sms'
  );
  assert.equal(ipBlocked.delivered, false);
  if (!ipBlocked.delivered) {
    assert.equal(ipBlocked.errorCode, 'INVALID_IP');
    assert.equal(ipBlocked.error, 'IP is not whitelisted.');
    assert.equal(isRetryableImbFailure(ipBlocked), false);
  }

  const rateLimited = parseImbApiResponse(
    429,
    {
      error: true,
      message: 'Rate limit exceeded. Please try again after some time.',
    },
    'sms'
  );
  assert.equal(rateLimited.delivered, false);
  if (!rateLimited.delivered) {
    assert.equal(rateLimited.statusCode, 429);
    assert.equal(rateLimited.errorCode, 'RATE_LIMIT_EXCEEDED');
    assert.equal(isRetryableImbFailure(rateLimited), true);
  }
});

test('sendImbOtp dispatches POST request with x-client-id/x-client-secret and handles network errors', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        response_code: 200,
        status: 'success',
        message: 'Success',
        data: {
          message_id: 'IMBSMS_MOCK_001',
          status: 'delivered',
        },
        meta: {
          request_id: 'req-123',
          time: '2025-10-14T16:19:29+05:30',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const res = await sendImbOtp({
    mobile: '9836736572',
    otpCode: '482910',
    channel: 'whatsapp',
    credentials: { clientId: 'cid-live', clientSecret: 'csec-live' },
    fetchFn: mockFetch,
  });

  assert.equal(
    capturedUrl,
    'https://secure.imbpayment.in/api/v1/comunication/whatsapp/send-message'
  );
  assert.equal(capturedInit?.method, 'POST');
  assert.deepEqual(capturedInit?.headers, {
    'Content-Type': 'application/json',
    'x-client-id': 'cid-live',
    'x-client-secret': 'csec-live',
  });
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    mobile_number: '9836736572',
    otp_code: '482910',
  });
  assert.equal(res.delivered, true);

  // Network failure returns clean 503 error after bounded retries
  let networkAttempts = 0;
  const failFetch = (async () => {
    networkAttempts++;
    throw new Error('ECONNREFUSED');
  }) as typeof fetch;

  const netErr = await sendImbOtp({
    mobile: '9836736572',
    otpCode: '482910',
    channel: 'sms',
    credentials: { clientId: 'cid-live', clientSecret: 'csec-live' },
    maxRetries: 2,
    retryDelayMs: 0,
    fetchFn: failFetch,
  });
  assert.equal(networkAttempts, 3);
  assert.equal(netErr.delivered, false);
  if (!netErr.delivered) {
    assert.equal(netErr.errorCode, 'IMB_NETWORK_ERROR');
  }
});

test('createImbClient retries transient 503/429 responses and skips retry on 422 validation failure', async () => {
  let transientCalls = 0;
  const flakyFetch = (async () => {
    transientCalls++;
    if (transientCalls < 3) {
      return new Response(
        JSON.stringify({ response_code: 503, message: 'Service temporarily unavailable' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        response_code: 200,
        status: 'success',
        data: { message_id: 'IMBSMS_RETRY_OK', status: 'delivered' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const client = createImbClient({
    credentials: { clientId: 'cid', clientSecret: 'sec' },
    maxRetries: 2,
    retryDelayMs: 0,
    fetchFn: flakyFetch,
  });
  const recovered = await client.sendSmsOtp('9836736572', '123456');
  assert.equal(transientCalls, 3);
  assert.equal(recovered.delivered, true);

  let validationCalls = 0;
  const invalidFetch = (async () => {
    validationCalls++;
    return new Response(
      JSON.stringify({
        response_code: 422,
        error: { mobile_number: ['Invalid mobile number'] },
      }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const strictClient = createImbClient({
    credentials: { clientId: 'cid', clientSecret: 'sec' },
    maxRetries: 2,
    retryDelayMs: 0,
    fetchFn: invalidFetch,
  });
  const failed = await strictClient.sendWhatsappOtp('123', '123456');
  assert.equal(validationCalls, 1);
  assert.equal(failed.delivered, false);
});
