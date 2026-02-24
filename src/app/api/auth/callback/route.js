import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json({ error, description: searchParams.get('error_description') }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'No code received' }, { status: 400 });
  }

  // Exchange code for short-lived token
  const APP_ID = '1373133064828047';
  const APP_SECRET = '26ebc8df33cbca795ba79ff72b4e4b10';
  const REDIRECT_URI = 'https://jaclyn-river-dashboard.vercel.app/api/auth/callback';

  try {
    const tokenRes = await fetch(
      `https://graph.facebook.com/v25.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_secret=${APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return NextResponse.json({ error: tokenData.error.message }, { status: 400 });
    }

    // Exchange for long-lived token
    const longRes = await fetch(
      `https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
    );
    const longData = await longRes.json();

    if (longData.error) {
      return NextResponse.json({ error: longData.error.message }, { status: 400 });
    }

    // Get pages and IG account
    const pagesRes = await fetch(`https://graph.facebook.com/v25.0/me/accounts?access_token=${longData.access_token}`);
    const pagesData = await pagesRes.json();

    let igInfo = null;
    if (pagesData.data) {
      for (const page of pagesData.data) {
        const igRes = await fetch(`https://graph.facebook.com/v25.0/${page.id}?fields=instagram_business_account,name&access_token=${longData.access_token}`);
        const igData = await igRes.json();
        if (igData.instagram_business_account) {
          igInfo = { page_name: page.name, page_id: page.id, ig_account_id: igData.instagram_business_account.id };
          break;
        }
      }
    }

    // Return the token info (River will grab this)
    const result = {
      access_token: longData.access_token,
      expires_in: longData.expires_in,
      obtained: new Date().toISOString(),
      expires_at: new Date(Date.now() + (longData.expires_in || 5184000) * 1000).toISOString(),
      ig_account: igInfo,
      pages: pagesData.data?.map(p => ({ id: p.id, name: p.name }))
    };

    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h1>✅ Authorization Successful!</h1>
        <p>River now has access to Instagram.</p>
        <p>Token expires: ${result.expires_at}</p>
        <p>Instagram Account: ${igInfo ? igInfo.ig_account_id : 'Not found'}</p>
        <pre style="text-align:left;background:#f5f5f5;padding:20px;border-radius:8px;max-width:600px;margin:20px auto;overflow-x:auto;font-size:12px">${JSON.stringify(result, null, 2)}</pre>
        <p><strong>Copy the JSON above and save it.</strong></p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch(e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
