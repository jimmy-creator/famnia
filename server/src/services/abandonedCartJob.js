import { AbandonedCart, Order } from '../models/index.js';
import { sendAbandonedCartEmail } from './emailService.js';
import { Op } from 'sequelize';

const DELAY_HOURS = parseInt(process.env.ABANDONED_CART_HOURS || '1');
const INTERVAL_MINUTES = parseInt(process.env.ABANDONED_CART_CHECK_INTERVAL || '15');

async function processAbandonedCarts() {
  try {
    const cutoff = new Date(Date.now() - DELAY_HOURS * 60 * 60 * 1000);

    // Find carts older than DELAY_HOURS that haven't been emailed or recovered
    const carts = await AbandonedCart.findAll({
      where: {
        emailSent: false,
        recovered: false,
        createdAt: { [Op.lte]: cutoff },
      },
      limit: 10,
    });

    if (carts.length === 0) return;

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    for (const cart of carts) {
      // Check if user has placed an order since cart was created
      const orderPlaced = await Order.findOne({
        where: {
          [Op.or]: [
            { guestEmail: cart.email },
            ...(cart.userId ? [{ userId: cart.userId }] : []),
          ],
          createdAt: { [Op.gte]: cart.createdAt },
        },
      });

      if (orderPlaced) {
        await cart.update({ recovered: true, recoveredAt: orderPlaced.createdAt });
        continue;
      }

      // Send recovery email
      const recoveryUrl = `${clientUrl}/cart`;
      await sendAbandonedCartEmail(cart.email, cart.items, cart.cartTotal, recoveryUrl);
      await cart.update({ emailSent: true, emailSentAt: new Date() });

      console.log(`[Abandoned Cart] Recovery email sent to ${cart.email}`);
    }
  } catch (error) {
    console.error('[Abandoned Cart] Job error:', error.message);
  }
}

export function startAbandonedCartJob() {
  console.log(`[Abandoned Cart] Job started — checking every ${INTERVAL_MINUTES}min, sending after ${DELAY_HOURS}h`);
  setInterval(processAbandonedCarts, INTERVAL_MINUTES * 60 * 1000);
  // Run once on start after a short delay
  setTimeout(processAbandonedCarts, 10000);
}
