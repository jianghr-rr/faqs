import {NextResponse, type NextRequest} from 'next/server';
import {Webhook} from 'standardwebhooks';
import {sms} from 'tencentcloud-sdk-nodejs-sms';

const SmsClient = sms.v20210111.Client;

export async function POST(request: NextRequest) {
    try {
        const payload = await request.text();
        const secret = process.env.SEND_SMS_HOOK_SECRETS;
        if (!secret) {
            console.error('[send-sms] SEND_SMS_HOOK_SECRETS not configured');
            return NextResponse.json(
                {error: {message: 'Send SMS hook not configured', http_code: 500}},
                {status: 500, headers: {'Content-Type': 'application/json'}}
            );
        }

        const base64Secret = secret.replace('v1,whsec_', '');
        const headers = Object.fromEntries(request.headers);
        const wh = new Webhook(base64Secret);

        let user: {phone?: string};
        let sms: {otp?: string};
        try {
            const verified = wh.verify(payload, headers) as {user: {phone?: string}; sms: {otp?: string}};
            user = verified.user;
            sms = verified.sms;
        } catch (err) {
            console.error('[send-sms] Webhook verification failed:', err);
            return NextResponse.json(
                {error: {message: 'Invalid webhook signature', http_code: 403}},
                {status: 403, headers: {'Content-Type': 'application/json'}}
            );
        }

        const phone = user?.phone;
        const otp = sms?.otp;
        if (!phone || !otp) {
            return NextResponse.json(
                {error: {message: 'Missing phone or OTP', http_code: 400}},
                {status: 400, headers: {'Content-Type': 'application/json'}}
            );
        }

        const secretId = process.env.TENCENTCLOUD_SECRET_ID;
        const secretKey = process.env.TENCENTCLOUD_SECRET_KEY;
        const sdkAppId = process.env.TENCENTCLOUD_SMS_SDK_APP_ID;
        const signName = process.env.TENCENTCLOUD_SMS_SIGN_NAME;
        const templateId = process.env.TENCENTCLOUD_SMS_TEMPLATE_ID;

        if (!secretId || !secretKey || !sdkAppId || !signName || !templateId) {
            console.error('[send-sms] Tencent Cloud SMS env vars missing');
            return NextResponse.json(
                {error: {message: 'SMS provider not configured', http_code: 500}},
                {status: 500, headers: {'Content-Type': 'application/json'}}
            );
        }

        const client = new SmsClient({
            credential: {secretId, secretKey},
            region: 'ap-guangzhou',
            profile: {httpProfile: {endpoint: 'sms.tencentcloudapi.com'}},
        });

        const params = {
            PhoneNumberSet: [phone.startsWith('+') ? phone : `+${phone}`],
            SmsSdkAppId: sdkAppId,
            SignName: signName,
            TemplateId: templateId,
            TemplateParamSet: [otp],
        };

        const response = await client.SendSms(params);

        const sendStatus = response.SendStatusSet?.[0];
        if (!sendStatus || sendStatus.Code !== 'Ok') {
            const msg = sendStatus?.Message ?? 'Unknown error';
            console.error('[send-sms] Tencent Cloud error:', msg, sendStatus);
            return NextResponse.json(
                {
                    error: {
                        message: `Failed to send SMS: ${msg}`,
                        http_code: 500,
                    },
                },
                {status: 500, headers: {'Content-Type': 'application/json'}}
            );
        }

        return new Response(JSON.stringify({}), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[send-sms] Error:', msg);
        return NextResponse.json(
            {
                error: {
                    message: `Failed to send SMS: ${msg}`,
                    http_code: 500,
                },
            },
            {status: 500, headers: {'Content-Type': 'application/json'}}
        );
    }
}
