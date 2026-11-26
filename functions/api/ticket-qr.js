import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { sign, timingSafeEqual } from './_shared.js';

const svgResponse = (body, status = 200) => new Response(body, {
  status,
  headers: {
    'content-type': 'image/svg+xml; charset=utf-8',
    'cache-control': 'private, no-store, max-age=0',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
  }
});

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!env.QR_SIGNING_SECRET || env.QR_SIGNING_SECRET.length < 32 || token.length > 220) return svgResponse('', 400);
  const parts = token.split('.');
  if (parts.length !== 3 || !/^SSS-[A-F0-9]{6}$/i.test(parts[0]) || !/^SSS-[A-F0-9]{12}$/i.test(parts[1]) || !/^[a-f0-9]{64}$/i.test(parts[2])) return svgResponse('', 404);
  const expected = await sign(env.QR_SIGNING_SECRET, `${parts[0]}.${parts[1]}`);
  if (!timingSafeEqual(expected, parts[2].toLowerCase())) return svgResponse('', 404);
  const svg = renderToStaticMarkup(createElement(QRCodeSVG, {
    value: token,
    size: 240,
    level: 'H',
    includeMargin: true,
    bgColor: '#ffffff',
    fgColor: '#06101d',
    title: 'Event ticket QR code'
  }));
  return svgResponse(svg);
}
