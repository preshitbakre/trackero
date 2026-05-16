import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly smtpConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    this.smtpConfigured = !!this.configService.get<string>('SMTP_HOST');
    if (!this.smtpConfigured) {
      console.warn('[EmailService] SMTP not configured — email features disabled (logged to console)');
    }
  }

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    if (!this.smtpConfigured) {
      console.log(`[EMAIL] To: ${to} | Subject: ${subject} | Body: ${body.substring(0, 100)}`);
      return;
    }
    // TODO: Implement actual SMTP sending when SMTP_HOST is configured
  }

  async sendTaskAssigned(email: string, taskKey: string, taskTitle: string): Promise<void> {
    await this.sendEmail(email, `Task assigned: ${taskKey}`, `You've been assigned to "${taskTitle}"`);
  }

  async sendSprintStarting(email: string, sprintName: string, projectName: string): Promise<void> {
    await this.sendEmail(email, `Sprint starting: ${sprintName}`, `Sprint "${sprintName}" in project "${projectName}" starts tomorrow`);
  }

  async sendTaskDueSoon(email: string, taskKey: string, taskTitle: string, dueDate: string): Promise<void> {
    await this.sendEmail(email, `Task due soon: ${taskKey}`, `"${taskTitle}" is due on ${dueDate}`);
  }

  async sendPasswordReset(email: string, resetToken: string): Promise<void> {
    const appUrl = this.configService.get<string>('APP_URL', 'http://localhost:5173');
    await this.sendEmail(email, 'Password Reset', `Reset your password: ${appUrl}/reset-password?token=${resetToken}`);
  }
}
