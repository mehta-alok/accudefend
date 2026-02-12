/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Payment Processor Webhook Routes
 */

const express = require('express');
const crypto = require('crypto');
const { prisma } = require('../config/database');
const { analyzeChargeback } = require('../services/fraudDetection');
const logger = require('../utils/logger');

const router = express.Router();

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate next case number
 */
async function generateCaseNumber() {
  const year = new Date().getFullYear();
  const prefix = `CB-${year}-`;

  const lastCase = await prisma.chargeback.findFirst({
    where: {
      caseNumber: { startsWith: prefix }
    },
    orderBy: { caseNumber: 'desc' }
  });

  let nextNumber = 1;
  if (lastCase) {
    const lastNumber = parseInt(lastCase.caseNumber.split('-')[2]);
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
}

/**
 * Map Stripe dispute reason to internal format
 */
function mapStripeReason(stripeReason) {
  const reasonMap = {
    'duplicate': { code: '13.6', description: 'Duplicate Transaction' },
    'fraudulent': { code: '10.4', description: 'Fraud - Card Absent' },
    'subscription_canceled': { code: '13.2', description: 'Cancelled Recurring' },
    'product_unacceptable': { code: '13.3', description: 'Not as Described' },
    'product_not_received': { code: '13.1', description: 'Services Not Received' },
    'unrecognized': { code: '10.4', description: 'Unrecognized Transaction' },
    'credit_not_processed': { code: '13.6', description: 'Credit Not Processed' },
    'general': { code: '13.1', description: 'General Dispute' }
  };

  return reasonMap[stripeReason] || { code: stripeReason, description: stripeReason };
}

/**
 * Verify Stripe webhook signature
 */
function verifyStripeSignature(payload, signature, secret) {
  if (!secret) return true; // Skip verification in development

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    stripe.webhooks.constructEvent(payload, signature, secret);
    return true;
  } catch (error) {
    logger.error('Stripe signature verification failed:', error.message);
    return false;
  }
}

/**
 * Verify Adyen HMAC signature
 */
function verifyAdyenSignature(payload, signature, hmacKey) {
  if (!hmacKey) return true; // Skip verification in development

  try {
    const hmac = crypto.createHmac('sha256', Buffer.from(hmacKey, 'hex'));
    hmac.update(payload);
    const calculated = hmac.digest('base64');
    return calculated === signature;
  } catch (error) {
    logger.error('Adyen signature verification failed:', error.message);
    return false;
  }
}

// =============================================================================
// STRIPE WEBHOOKS
// =============================================================================

/**
 * POST /api/webhooks/stripe
 * Handle Stripe dispute webhooks
 */
router.post('/stripe', async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    const payload = req.body;

    // Verify signature
    const isValid = verifyStripeSignature(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (!isValid) {
      logger.warn('Invalid Stripe webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse payload
    const event = JSON.parse(payload.toString());
    logger.info(`AccuDefend Webhook: Stripe event received - ${event.type}`);

    // Get Stripe provider
    const provider = await prisma.provider.findFirst({
      where: { name: 'Stripe', type: 'PAYMENT_PROCESSOR' }
    });

    if (!provider) {
      logger.error('Stripe provider not configured');
      return res.status(500).json({ error: 'Provider not configured' });
    }

    // Log webhook event
    const webhookEvent = await prisma.webhookEvent.create({
      data: {
        providerId: provider.id,
        eventType: event.type,
        payload: event,
        signature: signature?.substring(0, 100) // Truncate for storage
      }
    });

    // Handle dispute events
    if (event.type.startsWith('charge.dispute.')) {
      const dispute = event.data.object;

      // Find default property (or map based on metadata)
      const property = await prisma.property.findFirst({
        where: { isActive: true }
      });

      if (!property) {
        throw new Error('No active property found');
      }

      if (event.type === 'charge.dispute.created') {
        // Create new chargeback
        const caseNumber = await generateCaseNumber();
        const reason = mapStripeReason(dispute.reason);

        const chargeback = await prisma.chargeback.create({
          data: {
            caseNumber,
            status: 'PENDING',
            guestName: dispute.evidence?.customer_name || 'Unknown Guest',
            guestEmail: dispute.evidence?.customer_email_address,
            amount: dispute.amount / 100, // Stripe uses cents
            currency: dispute.currency.toUpperCase(),
            transactionId: dispute.charge,
            cardLastFour: dispute.evidence?.customer_purchase_ip ? null : null,
            cardBrand: dispute.payment_method_details?.card?.brand,
            reasonCode: reason.code,
            reasonDescription: reason.description,
            disputeDate: new Date(dispute.created * 1000),
            dueDate: dispute.evidence_details?.due_by
              ? new Date(dispute.evidence_details.due_by * 1000)
              : null,
            processorDisputeId: dispute.id,
            checkInDate: new Date(), // Would come from PMS integration
            checkOutDate: new Date(),
            propertyId: property.id,
            providerId: provider.id
          }
        });

        // Create timeline event
        await prisma.timelineEvent.create({
          data: {
            chargebackId: chargeback.id,
            eventType: 'ALERT',
            title: 'Dispute Received',
            description: `New ${reason.description} dispute from Stripe`,
            metadata: {
              processorDisputeId: dispute.id,
              amount: dispute.amount / 100
            }
          }
        });

        // Run AI analysis
        try {
          await analyzeChargeback(chargeback.id);
        } catch (aiError) {
          logger.warn(`AI analysis failed for ${caseNumber}:`, aiError.message);
        }

        logger.info(`AccuDefend: Created case ${caseNumber} from Stripe dispute ${dispute.id}`);

      } else if (event.type === 'charge.dispute.updated') {
        // Update existing case
        const existing = await prisma.chargeback.findFirst({
          where: { processorDisputeId: dispute.id }
        });

        if (existing) {
          await prisma.timelineEvent.create({
            data: {
              chargebackId: existing.id,
              eventType: 'INFO',
              title: 'Dispute Updated',
              description: `Stripe dispute status: ${dispute.status}`,
              metadata: { stripeStatus: dispute.status }
            }
          });
        }

      } else if (event.type === 'charge.dispute.closed') {
        // Close case with outcome
        const existing = await prisma.chargeback.findFirst({
          where: { processorDisputeId: dispute.id }
        });

        if (existing) {
          const status = dispute.status === 'won' ? 'WON' : 'LOST';

          await prisma.chargeback.update({
            where: { id: existing.id },
            data: {
              status,
              resolvedAt: new Date()
            }
          });

          await prisma.timelineEvent.create({
            data: {
              chargebackId: existing.id,
              eventType: status,
              title: `Dispute ${status}`,
              description: `Stripe dispute closed with outcome: ${dispute.status}`,
              metadata: {
                stripeStatus: dispute.status,
                netWorth: dispute.net_worth
              }
            }
          });

          logger.info(`AccuDefend: Case ${existing.caseNumber} closed as ${status}`);
        }
      }
    }

    // Mark webhook as processed
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        processed: true,
        processedAt: new Date()
      }
    });

    res.json({ received: true });

  } catch (error) {
    logger.error('Stripe webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// =============================================================================
// ADYEN WEBHOOKS
// =============================================================================

/**
 * POST /api/webhooks/adyen
 * Handle Adyen dispute notifications
 */
router.post('/adyen', async (req, res) => {
  try {
    const signature = req.headers['x-adyen-hmac-key'];
    const payload = req.body;

    // Verify signature
    const isValid = verifyAdyenSignature(
      JSON.stringify(payload),
      signature,
      process.env.ADYEN_HMAC_KEY
    );

    if (!isValid) {
      logger.warn('Invalid Adyen webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    logger.info('AccuDefend Webhook: Adyen notification received');

    // Get Adyen provider
    const provider = await prisma.provider.findFirst({
      where: { name: 'Adyen', type: 'PAYMENT_PROCESSOR' }
    });

    if (!provider) {
      logger.error('Adyen provider not configured');
      return res.status(500).json({ error: 'Provider not configured' });
    }

    // Process notification items
    const notifications = payload.notificationItems || [];

    for (const item of notifications) {
      const notification = item.NotificationRequestItem;

      // Log webhook event
      await prisma.webhookEvent.create({
        data: {
          providerId: provider.id,
          eventType: notification.eventCode,
          payload: notification,
          processed: true,
          processedAt: new Date()
        }
      });

      // Handle chargeback events
      if (notification.eventCode === 'CHARGEBACK') {
        // Find default property
        const property = await prisma.property.findFirst({
          where: { isActive: true }
        });

        if (!property) continue;

        const caseNumber = await generateCaseNumber();

        const chargeback = await prisma.chargeback.create({
          data: {
            caseNumber,
            status: 'PENDING',
            guestName: notification.additionalData?.shopperName || 'Unknown Guest',
            guestEmail: notification.additionalData?.shopperEmail,
            amount: notification.amount.value / 100,
            currency: notification.amount.currency,
            transactionId: notification.originalReference,
            reasonCode: notification.reason || 'Unknown',
            reasonDescription: notification.additionalData?.chargebackReasonCode,
            disputeDate: new Date(),
            processorDisputeId: notification.pspReference,
            checkInDate: new Date(),
            checkOutDate: new Date(),
            propertyId: property.id,
            providerId: provider.id
          }
        });

        await prisma.timelineEvent.create({
          data: {
            chargebackId: chargeback.id,
            eventType: 'ALERT',
            title: 'Chargeback Received',
            description: `New chargeback from Adyen: ${notification.reason}`
          }
        });

        try {
          await analyzeChargeback(chargeback.id);
        } catch (aiError) {
          logger.warn(`AI analysis failed for ${caseNumber}:`, aiError.message);
        }

        logger.info(`AccuDefend: Created case ${caseNumber} from Adyen chargeback`);
      }
    }

    // Adyen expects "[accepted]" response
    res.send('[accepted]');

  } catch (error) {
    logger.error('Adyen webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// =============================================================================
// SHIFT4 WEBHOOKS
// =============================================================================

/**
 * POST /api/webhooks/shift4
 * Handle Shift4 dispute webhooks
 */
router.post('/shift4', async (req, res) => {
  try {
    const signature = req.headers['x-shift4-signature'];
    const payload = req.body;

    logger.info('AccuDefend Webhook: Shift4 event received');

    // Get Shift4 provider
    const provider = await prisma.provider.findFirst({
      where: { name: 'Shift4', type: 'PAYMENT_PROCESSOR' }
    });

    if (!provider) {
      logger.error('Shift4 provider not configured');
      return res.status(500).json({ error: 'Provider not configured' });
    }

    const event = JSON.parse(payload.toString());

    // Log webhook event
    await prisma.webhookEvent.create({
      data: {
        providerId: provider.id,
        eventType: event.type || 'unknown',
        payload: event,
        signature: signature?.substring(0, 100),
        processed: true,
        processedAt: new Date()
      }
    });

    // Handle dispute events
    if (event.type === 'DISPUTE' || event.type === 'CHARGEBACK') {
      const property = await prisma.property.findFirst({
        where: { isActive: true }
      });

      if (property) {
        const caseNumber = await generateCaseNumber();

        const chargeback = await prisma.chargeback.create({
          data: {
            caseNumber,
            status: 'PENDING',
            guestName: event.customerName || 'Unknown Guest',
            amount: event.amount,
            currency: event.currency || 'USD',
            transactionId: event.transactionId,
            reasonCode: event.reasonCode || 'Unknown',
            reasonDescription: event.reason,
            disputeDate: new Date(),
            processorDisputeId: event.disputeId,
            checkInDate: new Date(),
            checkOutDate: new Date(),
            propertyId: property.id,
            providerId: provider.id
          }
        });

        await prisma.timelineEvent.create({
          data: {
            chargebackId: chargeback.id,
            eventType: 'ALERT',
            title: 'Dispute Received',
            description: `New dispute from Shift4`
          }
        });

        try {
          await analyzeChargeback(chargeback.id);
        } catch (aiError) {
          logger.warn(`AI analysis failed for ${caseNumber}:`, aiError.message);
        }

        logger.info(`AccuDefend: Created case ${caseNumber} from Shift4 dispute`);
      }
    }

    res.json({ received: true });

  } catch (error) {
    logger.error('Shift4 webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// =============================================================================
// ELAVON WEBHOOKS
// =============================================================================

/**
 * POST /api/webhooks/elavon
 * Handle Elavon dispute webhooks
 */
router.post('/elavon', async (req, res) => {
  try {
    const authHeader = req.headers['x-elavon-auth'];
    const payload = req.body;

    logger.info('AccuDefend Webhook: Elavon event received');

    // Get Elavon provider
    const provider = await prisma.provider.findFirst({
      where: { name: 'Elavon', type: 'PAYMENT_PROCESSOR' }
    });

    if (!provider) {
      logger.error('Elavon provider not configured');
      return res.status(500).json({ error: 'Provider not configured' });
    }

    const event = JSON.parse(payload.toString());

    // Log webhook event
    await prisma.webhookEvent.create({
      data: {
        providerId: provider.id,
        eventType: event.eventType || 'dispute',
        payload: event,
        processed: true,
        processedAt: new Date()
      }
    });

    // Similar processing logic for Elavon disputes
    if (event.eventType === 'CHARGEBACK' || event.eventType === 'RETRIEVAL') {
      const property = await prisma.property.findFirst({
        where: { isActive: true }
      });

      if (property) {
        const caseNumber = await generateCaseNumber();

        const chargeback = await prisma.chargeback.create({
          data: {
            caseNumber,
            status: 'PENDING',
            guestName: event.cardholderName || 'Unknown Guest',
            amount: parseFloat(event.amount),
            currency: 'USD',
            transactionId: event.transactionId,
            reasonCode: event.reasonCode || 'Unknown',
            reasonDescription: event.reasonDescription,
            disputeDate: new Date(event.disputeDate || Date.now()),
            dueDate: event.responseDeadline ? new Date(event.responseDeadline) : null,
            processorDisputeId: event.caseNumber,
            checkInDate: new Date(),
            checkOutDate: new Date(),
            propertyId: property.id,
            providerId: provider.id
          }
        });

        await prisma.timelineEvent.create({
          data: {
            chargebackId: chargeback.id,
            eventType: 'ALERT',
            title: 'Dispute Received',
            description: `New ${event.eventType} from Elavon`
          }
        });

        try {
          await analyzeChargeback(chargeback.id);
        } catch (aiError) {
          logger.warn(`AI analysis failed for ${caseNumber}:`, aiError.message);
        }

        logger.info(`AccuDefend: Created case ${caseNumber} from Elavon dispute`);
      }
    }

    res.json({ received: true, message: 'Webhook processed' });

  } catch (error) {
    logger.error('Elavon webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// =============================================================================
// DISPUTE COMPANY WEBHOOKS
// =============================================================================

const { disputeWebhookHandlers, DisputeCompanyService, DISPUTE_COMPANIES } = require('../services/disputeCompanies');

/**
 * Generic webhook handler for dispute companies
 */
async function handleDisputeCompanyWebhook(req, res, companyId) {
  try {
    const signature = req.headers['x-signature'] || req.headers['x-webhook-signature'];
    const payload = req.body;

    logger.info(`AccuDefend Webhook: ${companyId} event received`);

    // Get company config
    const company = DISPUTE_COMPANIES[companyId.toUpperCase()];
    if (!company) {
      return res.status(400).json({ error: 'Unknown dispute company' });
    }

    // Find integration
    const integration = await prisma.integration.findFirst({
      where: { type: companyId.toLowerCase(), status: 'active' }
    });

    // Log webhook event
    if (integration) {
      await prisma.integrationEvent.create({
        data: {
          integrationId: integration.id,
          eventType: payload.event || payload.type || 'webhook',
          direction: 'inbound',
          payload,
          processed: false
        }
      });
    }

    // Process the webhook
    const event = typeof payload === 'string' ? JSON.parse(payload) : payload;

    if (disputeWebhookHandlers[companyId.toLowerCase()]) {
      await disputeWebhookHandlers[companyId.toLowerCase()](
        event,
        signature,
        integration?.webhookSecret
      );
    }

    // Mark as processed
    if (integration) {
      await prisma.integrationEvent.updateMany({
        where: {
          integrationId: integration.id,
          processed: false
        },
        data: {
          processed: true,
          processedAt: new Date()
        }
      });
    }

    res.json({ received: true, company: companyId });

  } catch (error) {
    logger.error(`${companyId} webhook error:`, error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

/**
 * POST /api/webhooks/merlink
 * Handle Merlink dispute webhooks (2-way sync)
 */
router.post('/merlink', async (req, res) => {
  await handleDisputeCompanyWebhook(req, res, 'merlink');
});

/**
 * POST /api/webhooks/staysettle
 * Handle StaySettle dispute webhooks
 */
router.post('/staysettle', async (req, res) => {
  await handleDisputeCompanyWebhook(req, res, 'staysettle');
});

/**
 * POST /api/webhooks/winchargebacks
 * Handle Win Chargebacks webhooks
 */
router.post('/winchargebacks', async (req, res) => {
  await handleDisputeCompanyWebhook(req, res, 'win_chargebacks');
});

/**
 * POST /api/webhooks/chargebackgurus
 * Handle Chargeback Gurus webhooks
 */
router.post('/chargebackgurus', async (req, res) => {
  await handleDisputeCompanyWebhook(req, res, 'chargeback_gurus');
});

/**
 * POST /api/webhooks/chargebackhelp
 * Handle ChargebackHelp webhooks
 */
router.post('/chargebackhelp', async (req, res) => {
  await handleDisputeCompanyWebhook(req, res, 'chargebackhelp');
});

/**
 * POST /api/webhooks/clearview
 * Handle Clearview/Chargeback Shield webhooks
 */
router.post('/clearview', async (req, res) => {
  await handleDisputeCompanyWebhook(req, res, 'clearview');
});

/**
 * POST /api/webhooks/verifi
 * Handle Verifi (Visa) webhooks
 */
router.post('/verifi', async (req, res) => {
  await handleDisputeCompanyWebhook(req, res, 'verifi');
});

/**
 * POST /api/webhooks/ethoca
 * Handle Ethoca (Mastercard) webhooks
 */
router.post('/ethoca', async (req, res) => {
  await handleDisputeCompanyWebhook(req, res, 'ethoca');
});

/**
 * POST /api/webhooks/chargebacks911
 * Handle Chargebacks911 webhooks
 */
router.post('/chargebacks911', async (req, res) => {
  await handleDisputeCompanyWebhook(req, res, 'chargebacks911');
});

/**
 * POST /api/webhooks/riskified
 * Handle Riskified webhooks
 */
router.post('/riskified', async (req, res) => {
  await handleDisputeCompanyWebhook(req, res, 'riskified');
});

/**
 * POST /api/webhooks/chargeblast
 * Handle Chargeblast webhooks
 */
router.post('/chargeblast', async (req, res) => {
  await handleDisputeCompanyWebhook(req, res, 'chargeblast');
});

/**
 * POST /api/webhooks/midigator
 * Handle Midigator webhooks
 */
router.post('/midigator', async (req, res) => {
  await handleDisputeCompanyWebhook(req, res, 'midigator');
});

/**
 * POST /api/webhooks/cavu
 * Handle CAVU webhooks
 */
router.post('/cavu', async (req, res) => {
  await handleDisputeCompanyWebhook(req, res, 'cavu');
});

/**
 * POST /api/webhooks/tailoredpay
 * Handle TailoredPay webhooks
 */
router.post('/tailoredpay', async (req, res) => {
  await handleDisputeCompanyWebhook(req, res, 'tailoredpay');
});

module.exports = router;
