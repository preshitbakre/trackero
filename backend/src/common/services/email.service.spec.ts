import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

/**
 * EmailService security tests (Task 5.3).
 *
 * Two guarantees:
 *  1. With SMTP unconfigured, sendEmail() logs ONLY `to`/`subject` — never the
 *     HTML body, never the secret token embedded in invitation/reset URLs.
 *  2. Every user-controlled value interpolated into a template's HTML is
 *     HTML-escaped, so a malicious task title / role / sprint name cannot
 *     inject live markup into the recipient's mail client.
 */

/** A ConfigService stub with NO SMTP config (transporter stays null). */
function noSmtpConfig(): ConfigService {
  return {
    get: (key: string, fallback?: unknown) => {
      const values: Record<string, unknown> = {
        SMTP_FROM: 'noreply@trackero.dev',
        APP_URL: 'http://localhost:5173',
      };
      return key in values ? values[key] : fallback;
    },
  } as unknown as ConfigService;
}

describe('EmailService', () => {
  describe('sendEmail with SMTP not configured', () => {
    it('logs only the recipient and subject, never the body or token', async () => {
      const service = new EmailService(noSmtpConfig());
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      await service.sendInvitation(
        'invitee@example.com',
        'tok-secret-123',
        'admin',
      );

      const logged = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      // The secret token must NOT appear anywhere in the logs.
      expect(logged).not.toContain('tok-secret-123');
      // The body markup must NOT be logged (not even stripped/truncated).
      expect(logged).not.toContain('You\'re invited to Trackero'.replace(/'/g, ''));
      expect(logged).not.toContain('Accept Invitation');
      expect(logged).not.toContain('register?token');
      // It SHOULD still log the recipient + subject for observability.
      expect(logged).toContain('invitee@example.com');
      expect(logged).toContain('Subject:');

      logSpy.mockRestore();
    });

    it('does not log the reset token either', async () => {
      const service = new EmailService(noSmtpConfig());
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      await service.sendPasswordReset('user@example.com', 'reset-tok-xyz-999');

      const logged = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logged).not.toContain('reset-tok-xyz-999');
      expect(logged).not.toContain('reset-password?token');
      expect(logged).toContain('user@example.com');

      logSpy.mockRestore();
    });
  });

  describe('template builders escape user content', () => {
    const service = new EmailService(noSmtpConfig());

    it('escapes the role in the invitation body', () => {
      const html = (service as any).buildInvitationHtml(
        'http://localhost:5173/register?token=abc',
        '<b>admin</b>',
      );
      expect(html).not.toContain('<b>admin</b>');
      expect(html).toContain('&lt;b&gt;admin&lt;/b&gt;');
    });

    it('escapes a malicious task title in sendTaskAssigned body', () => {
      const html = (service as any).buildTaskAssignedHtml(
        'TRK-1',
        '<img src=x onerror=alert(1)>',
      );
      expect(html).not.toContain('<img src=x onerror=alert(1)>');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('escapes sprint and project names in sendSprintStarting body', () => {
      const html = (service as any).buildSprintStartingHtml(
        '<script>evil()</script>',
        'Proj & Co',
      );
      expect(html).not.toContain('<script>evil()</script>');
      expect(html).toContain('&lt;script&gt;evil()&lt;/script&gt;');
      expect(html).toContain('Proj &amp; Co');
    });

    it('escapes task title and end date in sendTaskDueSoon body', () => {
      const html = (service as any).buildTaskDueSoonHtml(
        'TRK-2',
        '<i>hax</i>',
        '<b>2026-01-01</b>',
      );
      expect(html).not.toContain('<i>hax</i>');
      expect(html).toContain('&lt;i&gt;hax&lt;/i&gt;');
      expect(html).toContain('&lt;b&gt;2026-01-01&lt;/b&gt;');
    });

    it('escapes the reset URL in the password-reset body', () => {
      const html = (service as any).buildPasswordResetHtml(
        'http://localhost:5173/reset-password?token=t&x="evil"',
      );
      expect(html).not.toContain('"evil"');
      expect(html).toContain('&quot;evil&quot;');
      expect(html).toContain('&amp;x=');
    });
  });
});
