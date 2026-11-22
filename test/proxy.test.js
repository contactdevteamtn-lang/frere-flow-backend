/**
 * Adresse IP du visiteur transmise par le relais du site (PROXY_SECRET) : acceptée uniquement avec
 * le bon secret, sinon un attaquant pourrait choisir son adresse et contourner les limites anti-abus.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const SECRET = 'secret-relais-0123456789-0123456789-abcdef';
process.env.PROXY_SECRET = SECRET;
process.env.TRUST_PROXY = 'false';
process.env.JWT_SECRET = 'secret-de-test-0123456789-0123456789-0123456789';

const { ipDe } = await import('../src/middlewares/http.js');
const req = (headers) => ({ headers, socket: { remoteAddress: '10.0.0.9' } });

describe('Adresse IP transmise par le relais du site', () => {
  it('bon secret → adresse réelle du visiteur', () => {
    assert.equal(ipDe(req({ 'x-proxy-secret': SECRET, 'x-real-client-ip': '196.203.1.2' })), '196.203.1.2');
    assert.equal(ipDe(req({ 'x-proxy-secret': SECRET, 'x-real-client-ip': '2001:db8::1' })), '2001:db8::1');
  });
  it('secret absent, faux ou de mauvaise longueur → adresse de la connexion', () => {
    for (const s of [undefined, '', 'faux', `${SECRET}x`, SECRET.slice(0, -1)]) {
      assert.equal(ipDe(req({ 'x-proxy-secret': s, 'x-real-client-ip': '1.2.3.4' })), '10.0.0.9', String(s));
    }
  });
  it('adresse invalide refusée même avec le bon secret', () => {
    for (const ip of ['', 'abc', '1.2.3.4; rm -rf', 'x'.repeat(100), '<script>']) {
      assert.equal(ipDe(req({ 'x-proxy-secret': SECRET, 'x-real-client-ip': ip })), '10.0.0.9', ip);
    }
  });
});
