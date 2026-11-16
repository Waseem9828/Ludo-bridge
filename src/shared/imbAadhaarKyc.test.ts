import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildImbAadhaarEndpointUrl,
  canWithdrawWithKyc,
  formatAadhaarInput,
  getPlayerKycKey,
  maskAadhaarNumber,
  normalizeAadhaarNumber,
  parseImbAadhaarSendOtpResponse,
  parseImbAadhaarVerifyOtpResponse,
  sendImbAadhaarOtp,
  validateAadhaarOtp,
  verifyImbAadhaarOtp,
} from './imbAadhaarKyc';

test('Aadhaar normalization, masking, formatting, and OTP validation behave strictly', () => {
  assert.equal(normalizeAadhaarNumber('012345678901').valid, false);
  assert.equal(normalizeAadhaarNumber('9978345676').valid, false);

  const valid = normalizeAadhaarNumber('9978 3456 7654');
  assert.equal(valid.valid, true);
  if (valid.valid) {
    assert.equal(valid.value, '997834567654');
    assert.equal(valid.masked, 'XXXX XXXX 7654');
    assert.equal(valid.last4, '7654');
  }

  assert.equal(maskAadhaarNumber('997834567654'), 'XXXX XXXX 7654');
  assert.equal(formatAadhaarInput('997834567654'), '9978 3456 7654');

  assert.equal(validateAadhaarOtp('12345').valid, false);
  assert.deepEqual(validateAadhaarOtp('324426'), { valid: true, value: '324426' });

  assert.equal(
    buildImbAadhaarEndpointUrl('sendOtp'),
    'https://secure.imbpayment.in/api/v1/aadhaar/send-otp'
  );
  assert.equal(
    buildImbAadhaarEndpointUrl('verifyOtp', 'https://secure.imbpayment.in/'),
    'https://secure.imbpayment.in/api/v1/aadhaar/verify-otp'
  );
});

test('getPlayerKycKey and canWithdrawWithKyc enforce verified Aadhaar before payout', () => {
  assert.equal(
    getPlayerKycKey({ userId: 'usr-1', mobile: '9876543210', playerName: 'Aarav' }),
    'user:usr-1'
  );
  assert.equal(
    getPlayerKycKey({ mobile: '+91 98765 43210', playerName: 'Aarav' }),
    'mobile:9876543210'
  );
  assert.equal(getPlayerKycKey({ playerName: '  Aarav  ' }), 'name:aarav');

  assert.equal(canWithdrawWithKyc(null).allowed, false);
  assert.equal(
    canWithdrawWithKyc({
      verified: true,
      provider: 'imb',
      requestId: 'ADHRVFR1',
      maskedAadhaar: 'XXXX XXXX 7654',
      last4: '7654',
      fullName: 'John Doe',
      verifiedAt: '2026-11-15T18:00:00Z',
    }).allowed,
    true
  );
});

test('parseImbAadhaarSendOtpResponse and parseImbAadhaarVerifyOtpResponse handle success and errors', () => {
  const sent = parseImbAadhaarSendOtpResponse(
    200,
    {
      response_code: 200,
      status: 'success',
      message: 'OTP Sent successfully',
      data: {
        request_id: 'ADHRVFR17562920251014_421874e5',
        aadhaar: '997834567654',
        status: 'pending',
      },
    },
    '997834567654'
  );
  assert.equal(sent.sent, true);
  if (sent.sent) {
    assert.equal(sent.requestId, 'ADHRVFR17562920251014_421874e5');
    assert.equal(sent.maskedAadhaar, 'XXXX XXXX 7654');
  }

  const verified = parseImbAadhaarVerifyOtpResponse(
    200,
    {
      response_code: 200,
      status: 'success',
      message: 'Aadhaar verification successful — data found',
      data: {
        request_id: 'ADHRVFR17562920251014_421874e5',
        status: 'verified',
        aadhaar_details: {
          aadhaar_uid: '997834567654',
          full_name: 'John Doe',
          date_of_birth: '01/01/1967',
          gender: 'Male',
          address: 'Bathinda, Punjab - 151301',
        },
      },
    },
    '997834567654',
    'ADHRVFR17562920251014_421874e5'
  );
  assert.equal(verified.verified, true);
  if (verified.verified) {
    assert.equal(verified.details.fullName, 'John Doe');
    assert.equal(verified.details.dateOfBirth, '01/01/1967');
    assert.equal(verified.details.gender, 'Male');
    assert.equal(verified.details.maskedAadhaar, 'XXXX XXXX 7654');
  }

  const invalidOtp = parseImbAadhaarVerifyOtpResponse(
    422,
    {
      response_code: 422,
      error_code: 'error',
      message: 'Validation failed.',
      error: { otp: ['The OTP field must be at least 6 characters.'] },
    },
    '997834567654',
    'ADHRVFR1'
  );
  assert.equal(invalidOtp.verified, false);
  if (!invalidOtp.verified) {
    assert.equal(invalidOtp.error, 'The OTP field must be at least 6 characters.');
  }
});

test('sendImbAadhaarOtp and verifyImbAadhaarOtp call exact IMB endpoints with credentials', async () => {
  const calls: Array<{ url: string; headers: HeadersInit | undefined; body: unknown }> = [];
  const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: String(url), headers: init?.headers, body });

    if (String(url).endsWith('/aadhaar/send-otp')) {
      return new Response(
        JSON.stringify({
          response_code: 200,
          status: 'success',
          data: {
            request_id: 'ADHRVFR_MOCK_99',
            aadhaar: '997834567654',
            status: 'pending',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        response_code: 200,
        status: 'success',
        data: {
          request_id: 'ADHRVFR_MOCK_99',
          status: 'verified',
          aadhaar_details: {
            aadhaar_uid: '997834567654',
            full_name: 'Aarav Sharma',
            date_of_birth: '12/05/1998',
            gender: 'Male',
            address: 'Jaipur, Rajasthan - 302001',
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const sendRes = await sendImbAadhaarOtp({
    aadhaarNumber: '9978 3456 7654',
    credentials: { clientId: 'cid', clientSecret: 'sec' },
    fetchFn: mockFetch,
  });
  assert.equal(sendRes.sent, true);

  const verifyRes = await verifyImbAadhaarOtp({
    requestId: 'ADHRVFR_MOCK_99',
    otp: '324426',
    aadhaarNumber: '997834567654',
    credentials: { clientId: 'cid', clientSecret: 'sec' },
    fetchFn: mockFetch,
  });
  assert.equal(verifyRes.verified, true);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://secure.imbpayment.in/api/v1/aadhaar/send-otp');
  assert.deepEqual(calls[0].body, { aadhaar_number: '997834567654' });
  assert.equal(calls[1].url, 'https://secure.imbpayment.in/api/v1/aadhaar/verify-otp');
  assert.deepEqual(calls[1].body, {
    request_id: 'ADHRVFR_MOCK_99',
    otp: '324426',
    aadhaar_number: '997834567654',
  });
});
