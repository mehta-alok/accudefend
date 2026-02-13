/**
 * AccuDefend - Reservations API Routes
 *
 * Endpoints for viewing PMS-synced reservations, guest folios,
 * and linking reservations to chargeback cases.
 */

const express = require('express');
const router = express.Router();
const { prisma } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const reservationMatcher = require('../services/reservationMatcher');

// All routes require authentication
router.use(authenticateToken);

// =========================================================================
// GET /api/reservations — List synced reservations with filters
// =========================================================================
router.get('/', async (req, res) => {
  try {
    const {
      status, guestName, confirmationNumber, cardLastFour,
      checkInFrom, checkInTo, checkOutFrom, checkOutTo,
      syncSource, linked, // 'true' = linked to chargeback, 'false' = unlinked
      page = 1, limit = 25, sortBy = 'checkInDate', sortOrder = 'desc'
    } = req.query;

    const where = {};

    // Property-level filtering for non-admins
    if (req.user.role !== 'ADMIN' && req.user.propertyId) {
      where.propertyId = req.user.propertyId;
    }

    if (status) where.status = status;
    if (confirmationNumber) where.confirmationNumber = { contains: confirmationNumber, mode: 'insensitive' };
    if (guestName) where.guestName = { contains: guestName, mode: 'insensitive' };
    if (cardLastFour) where.cardLastFour = cardLastFour;
    if (syncSource) where.syncSource = syncSource.toUpperCase();

    if (checkInFrom || checkInTo) {
      where.checkInDate = {};
      if (checkInFrom) where.checkInDate.gte = new Date(checkInFrom);
      if (checkInTo) where.checkInDate.lte = new Date(checkInTo);
    }

    if (checkOutFrom || checkOutTo) {
      where.checkOutDate = {};
      if (checkOutFrom) where.checkOutDate.gte = new Date(checkOutFrom);
      if (checkOutTo) where.checkOutDate.lte = new Date(checkOutTo);
    }

    if (linked === 'true') {
      where.chargebacks = { some: {} };
    } else if (linked === 'false') {
      where.chargebacks = { none: {} };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reservations, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        include: {
          property: { select: { id: true, name: true } },
          guestProfile: { select: { id: true, isFlagged: true, chargebackCount: true } },
          chargebacks: { select: { id: true, caseNumber: true, status: true, amount: true } },
          _count: { select: { folioItems: true } }
        },
        skip,
        take: parseInt(limit),
        orderBy: { [sortBy]: sortOrder }
      }),
      prisma.reservation.count({ where })
    ]);

    res.json({
      reservations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error listing reservations:', error);
    res.status(500).json({ error: 'Failed to list reservations', message: error.message });
  }
});

// =========================================================================
// GET /api/reservations/:id — Full reservation detail with folio
// =========================================================================
router.get('/:id', async (req, res) => {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: req.params.id },
      include: {
        property: { select: { id: true, name: true, timezone: true } },
        guestProfile: true,
        folioItems: {
          orderBy: { postDate: 'asc' }
        },
        chargebacks: {
          include: {
            evidence: { select: { id: true, type: true, fileName: true } },
            _count: { select: { evidence: true, timeline: true } }
          }
        }
      }
    });

    if (!reservation) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    // Property access check
    if (req.user.role !== 'ADMIN' && req.user.propertyId !== reservation.propertyId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Calculate folio summary
    const folioSummary = _calculateFolioSummary(reservation.folioItems);

    res.json({
      ...reservation,
      folioSummary
    });
  } catch (error) {
    logger.error('Error getting reservation:', error);
    res.status(500).json({ error: 'Failed to get reservation', message: error.message });
  }
});

// =========================================================================
// GET /api/reservations/:id/folio — Detailed guest folio
// =========================================================================
router.get('/:id/folio', async (req, res) => {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        confirmationNumber: true,
        guestName: true,
        checkInDate: true,
        checkOutDate: true,
        roomNumber: true,
        roomType: true,
        totalAmount: true,
        currency: true,
        propertyId: true
      }
    });

    if (!reservation) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    if (req.user.role !== 'ADMIN' && req.user.propertyId !== reservation.propertyId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const folioItems = await prisma.guestFolioItem.findMany({
      where: { reservationId: req.params.id },
      orderBy: { postDate: 'asc' }
    });

    const summary = _calculateFolioSummary(folioItems);

    res.json({
      reservation,
      folioItems,
      summary
    });
  } catch (error) {
    logger.error('Error getting folio:', error);
    res.status(500).json({ error: 'Failed to get folio', message: error.message });
  }
});

// =========================================================================
// GET /api/reservations/search — Search PMS in real-time
// =========================================================================
router.get('/search/live', async (req, res) => {
  try {
    const { confirmationNumber, guestName, cardLastFour, checkIn, checkOut } = req.query;

    if (!confirmationNumber && !guestName && !cardLastFour) {
      return res.status(400).json({ error: 'At least one search parameter required' });
    }

    const propertyId = req.user.propertyId;
    const where = {};

    if (propertyId && req.user.role !== 'ADMIN') {
      where.propertyId = propertyId;
    }

    if (confirmationNumber) where.confirmationNumber = { contains: confirmationNumber, mode: 'insensitive' };
    if (guestName) where.guestName = { contains: guestName, mode: 'insensitive' };
    if (cardLastFour) where.cardLastFour = cardLastFour;

    if (checkIn) {
      const checkInDate = new Date(checkIn);
      where.checkInDate = {
        gte: new Date(checkInDate.setDate(checkInDate.getDate() - 7)),
        lte: new Date(checkInDate.setDate(checkInDate.getDate() + 14))
      };
    }

    // Search local DB first
    const localResults = await prisma.reservation.findMany({
      where,
      include: {
        property: { select: { id: true, name: true } },
        guestProfile: { select: { isFlagged: true, chargebackCount: true } },
        chargebacks: { select: { id: true, caseNumber: true, status: true } },
        _count: { select: { folioItems: true } }
      },
      take: 20,
      orderBy: { checkInDate: 'desc' }
    });

    res.json({
      results: localResults,
      source: 'local',
      count: localResults.length
    });
  } catch (error) {
    logger.error('Error searching reservations:', error);
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

// =========================================================================
// POST /api/reservations/:id/link-chargeback — Manual linking
// =========================================================================
router.post('/:id/link-chargeback', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { chargebackId } = req.body;

    if (!chargebackId) {
      return res.status(400).json({ error: 'chargebackId is required' });
    }

    // Verify reservation exists
    const reservation = await prisma.reservation.findUnique({
      where: { id: req.params.id }
    });
    if (!reservation) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    // Verify chargeback exists
    const chargeback = await prisma.chargeback.findUnique({
      where: { id: chargebackId }
    });
    if (!chargeback) {
      return res.status(404).json({ error: 'Chargeback not found' });
    }

    // Link them
    const updated = await reservationMatcher.linkChargebackToReservation(chargebackId, req.params.id);

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId,
        eventType: 'USER_ACTION',
        title: 'Reservation manually linked',
        description: `Linked to reservation ${reservation.confirmationNumber} by ${req.user.firstName} ${req.user.lastName}`,
        metadata: {
          reservationId: req.params.id,
          confirmationNumber: reservation.confirmationNumber,
          linkedBy: req.user.id
        }
      }
    });

    res.json({
      message: 'Chargeback linked to reservation',
      chargeback: updated,
      reservation: { id: reservation.id, confirmationNumber: reservation.confirmationNumber }
    });
  } catch (error) {
    logger.error('Error linking chargeback to reservation:', error);
    res.status(500).json({ error: 'Failed to link', message: error.message });
  }
});

// =========================================================================
// GET /api/reservations/stats — Reservation sync statistics
// =========================================================================
router.get('/stats/summary', async (req, res) => {
  try {
    const where = {};
    if (req.user.role !== 'ADMIN' && req.user.propertyId) {
      where.propertyId = req.user.propertyId;
    }

    const [total, linked, flaggedGuests, bySource, byStatus] = await Promise.all([
      prisma.reservation.count({ where }),
      prisma.reservation.count({ where: { ...where, chargebacks: { some: {} } } }),
      prisma.guestProfile.count({ where: { isFlagged: true } }),
      prisma.reservation.groupBy({
        by: ['syncSource'],
        where,
        _count: true
      }),
      prisma.reservation.groupBy({
        by: ['status'],
        where,
        _count: true
      })
    ]);

    res.json({
      total,
      linked,
      unlinked: total - linked,
      flaggedGuests,
      bySource: bySource.map(s => ({ source: s.syncSource, count: s._count })),
      byStatus: byStatus.map(s => ({ status: s.status, count: s._count }))
    });
  } catch (error) {
    logger.error('Error getting reservation stats:', error);
    res.status(500).json({ error: 'Failed to get stats', message: error.message });
  }
});

// =========================================================================
// Helper: Calculate folio summary from line items
// =========================================================================
function _calculateFolioSummary(folioItems) {
  const categories = {};
  let totalCharges = 0;
  let totalPayments = 0;

  for (const item of folioItems) {
    const cat = item.category || 'other';
    if (!categories[cat]) {
      categories[cat] = { count: 0, total: 0 };
    }
    categories[cat].count++;

    const amount = parseFloat(item.amount) || 0;
    categories[cat].total += amount;

    if (cat === 'payment') {
      totalPayments += Math.abs(amount);
    } else {
      totalCharges += amount;
    }
  }

  return {
    totalCharges: totalCharges.toFixed(2),
    totalPayments: totalPayments.toFixed(2),
    balance: (totalCharges - totalPayments).toFixed(2),
    itemCount: folioItems.length,
    categories
  };
}

module.exports = router;
