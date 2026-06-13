import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { escapeHtml } from '../helpers/sanitize.helper';

@Injectable()
export class EmailService {
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT', 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    this.from = this.configService.get<string>('SMTP_FROM', 'noreply@trackero.dev');
    this.appUrl = this.configService.get<string>('APP_URL', 'http://localhost:5173');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      console.log(`[EmailService] SMTP configured: ${host}:${port}`);
    } else {
      this.transporter = null;
      console.warn('[EmailService] SMTP not configured — emails logged to console');
    }
  }

  /** Whether SMTP is configured (host + user + pass present). When false,
   *  email delivery is unavailable and callers should fall back to the
   *  manual (no-email) paths — sendEmail() itself degrades to a safe no-op. */
  isEmailEnabled(): boolean {
    return this.transporter !== null;
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter) {
      // SECURITY: never log the HTML body — invitation/password-reset bodies
      // contain the secret token in the URL. Log only recipient + subject.
      console.log(`📧 [EMAIL] (SMTP not configured) To: ${to} — Subject: ${subject}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        html,
      });
    } catch (err) {
      console.error(`[EmailService] Failed to send email to ${to}:`, err);
    }
  }

  // --- Template builders (pure functions of their inputs) -------------------
  // Every user-/config-controlled value is HTML-escaped so it renders as inert
  // text in the recipient's mail client — no HTML/script injection.

  private buildInvitationHtml(registerUrl: string, role: string): string {
    const url = escapeHtml(registerUrl);
    return `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1E2A35;">You're invited to Trackero</h2>
        <p style="color: #3D4F5F;">You've been invited to join as <strong>${escapeHtml(role)}</strong>.</p>
        <p style="color: #3D4F5F;">Click the button below to create your account:</p>
        <a href="${url}"
           style="display: inline-block; padding: 10px 24px; background: #4A6FA5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
          Accept Invitation
        </a>
        <p style="color: #6D7F8E; font-size: 13px; margin-top: 24px;">
          Or copy this link: ${url}
        </p>
        <p style="color: #9BAAB8; font-size: 12px;">This invitation expires in 7 days.</p>
      </div>
    `;
  }

  private buildPasswordResetHtml(resetUrl: string): string {
    const url = escapeHtml(resetUrl);
    return `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1E2A35;">Reset your password</h2>
        <p style="color: #3D4F5F;">We received a request to reset your password.</p>
        <a href="${url}"
           style="display: inline-block; padding: 10px 24px; background: #4A6FA5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
          Reset Password
        </a>
        <p style="color: #6D7F8E; font-size: 13px; margin-top: 24px;">
          Or copy this link: ${url}
        </p>
        <p style="color: #9BAAB8; font-size: 12px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
      </div>
    `;
  }

  private buildTaskAssignedHtml(taskKey: string, taskTitle: string): string {
    return `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1E2A35;">Task assigned to you</h2>
        <p style="color: #3D4F5F;">You've been assigned to <strong>${escapeHtml(taskKey)}</strong>: ${escapeHtml(taskTitle)}</p>
        <a href="${escapeHtml(this.appUrl)}/dashboard"
           style="display: inline-block; padding: 10px 24px; background: #4A6FA5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
          View in Trackero
        </a>
      </div>
    `;
  }

  private buildSprintStartingHtml(sprintName: string, projectName: string): string {
    return `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1E2A35;">Sprint starting</h2>
        <p style="color: #3D4F5F;">Sprint <strong>${escapeHtml(sprintName)}</strong> in project <strong>${escapeHtml(projectName)}</strong> starts tomorrow.</p>
        <a href="${escapeHtml(this.appUrl)}/dashboard"
           style="display: inline-block; padding: 10px 24px; background: #4A6FA5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
          View in Trackero
        </a>
      </div>
    `;
  }

  private buildTaskDueSoonHtml(
    taskKey: string,
    taskTitle: string,
    endDate: string,
  ): string {
    return `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1E2A35;">Task due soon</h2>
        <p style="color: #3D4F5F;"><strong>${escapeHtml(taskKey)}</strong>: ${escapeHtml(taskTitle)} is due on <strong>${escapeHtml(endDate)}</strong>.</p>
        <a href="${escapeHtml(this.appUrl)}/dashboard"
           style="display: inline-block; padding: 10px 24px; background: #4A6FA5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
          View in Trackero
        </a>
      </div>
    `;
  }

  // --- Public send methods --------------------------------------------------

  /** The registration link an invitee follows to accept their invite. Built
   *  from APP_URL so the manual (no-email) flow surfaces the exact same link
   *  the invitation email would contain. */
  buildInviteUrl(token: string): string {
    return `${this.appUrl}/register?token=${token}`;
  }

  async sendInvitation(email: string, token: string, role: string): Promise<void> {
    const registerUrl = this.buildInviteUrl(token);
    const html = this.buildInvitationHtml(registerUrl, role);
    await this.sendEmail(email, 'You\'re invited to Trackero', html);
  }

  async sendPasswordReset(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${this.appUrl}/reset-password?token=${resetToken}`;
    const html = this.buildPasswordResetHtml(resetUrl);
    await this.sendEmail(email, 'Reset your Trackero password', html);
  }

  async sendTaskAssigned(email: string, taskKey: string, taskTitle: string): Promise<void> {
    const html = this.buildTaskAssignedHtml(taskKey, taskTitle);
    await this.sendEmail(email, `Task assigned: ${taskKey}`, html);
  }

  async sendSprintStarting(email: string, sprintName: string, projectName: string): Promise<void> {
    const html = this.buildSprintStartingHtml(sprintName, projectName);
    await this.sendEmail(email, `Sprint starting: ${sprintName}`, html);
  }

  async sendTaskDueSoon(email: string, taskKey: string, taskTitle: string, endDate: string): Promise<void> {
    const html = this.buildTaskDueSoonHtml(taskKey, taskTitle, endDate);
    await this.sendEmail(email, `Task due soon: ${taskKey}`, html);
  }
}
