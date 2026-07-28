/**
 * Send a test email to verify SMTP config.
 *   npm run test:email -- you@example.com
 */
import '../config/database.js'; // runs dotenv.config()
import { sendTestEmail } from '../services/emailService.js';

const to = process.argv[2];
if (!to) {
  console.error('Usage: npm run test:email -- <recipient@example.com>');
  process.exit(1);
}

try {
  const info = await sendTestEmail(to);
  console.log(`✅ Test email sent to ${to} (messageId: ${info.messageId})`);
  process.exit(0);
} catch (err) {
  console.error(`❌ Failed to send test email: ${err.message}`);
  process.exit(1);
}
