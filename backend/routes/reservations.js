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

// Lazy-load reservationMatcher to avoid startup failures in demo mode
let reservationMatcher;
try {
  reservationMatcher = require('../services/reservationMatcher');
} catch (e) {
  logger.warn('ReservationMatcher not available (demo mode)');
}

// All routes require authentication
router.use(authenticateToken);

// =========================================================================
// DEMO DATA — used when database is unavailable
// =========================================================================
const DEMO_RESERVATIONS = [
  {
    id: 'res-demo-1',
    confirmationNumber: 'RES-2026-1001',
    guestName: 'James Wilson',
    guestEmail: 'jwilson@email.com',
    guestPhone: '+1 (555) 234-5678',
    checkInDate: new Date(Date.now() - 5 * 86400000).toISOString(),
    checkOutDate: new Date(Date.now() - 2 * 86400000).toISOString(),
    actualCheckIn: new Date(Date.now() - 5 * 86400000 + 54000000).toISOString(),
    actualCheckOut: new Date(Date.now() - 2 * 86400000 + 39600000).toISOString(),
    roomNumber: '412',
    roomType: 'King Suite',
    rateCode: 'BAR',
    rateAmount: 289.00,
    totalAmount: 1250.00,
    currency: 'USD',
    status: 'checked_out',
    adults: 2,
    children: 0,
    cardBrand: 'VISA',
    cardLastFour: '4242',
    paymentMethod: 'CREDIT_CARD',
    bookingSource: 'Direct Website',
    loyaltyNumber: 'HH-789456',
    syncSource: 'OPERA_CLOUD',
    pmsSource: 'OPERA_CLOUD',
    isFlagged: false,
    property: { id: 'demo-property-1', name: 'AccuDefend Grand Hotel' },
    linkedCase: { id: 'demo-1', caseNumber: 'CB-2026-0247', status: 'PENDING', amount: 1250.00 },
    chargebacks: [{ id: 'demo-1', caseNumber: 'CB-2026-0247', status: 'PENDING', amount: 1250.00 }],
    _count: { folioItems: 12 }
  },
  {
    id: 'res-demo-2',
    confirmationNumber: 'RES-2026-1002',
    guestName: 'Sarah Chen',
    guestEmail: 'schen@email.com',
    guestPhone: '+1 (555) 345-6789',
    checkInDate: new Date(Date.now() - 3 * 86400000).toISOString(),
    checkOutDate: new Date(Date.now() + 1 * 86400000).toISOString(),
    actualCheckIn: new Date(Date.now() - 3 * 86400000 + 50400000).toISOString(),
    actualCheckOut: null,
    roomNumber: '208',
    roomType: 'Deluxe Double',
    rateCode: 'AAA',
    rateAmount: 219.00,
    totalAmount: 890.50,
    currency: 'USD',
    status: 'checked_in',
    adults: 1,
    children: 0,
    cardBrand: 'MASTERCARD',
    cardLastFour: '8901',
    paymentMethod: 'CREDIT_CARD',
    bookingSource: 'Booking.com',
    loyaltyNumber: null,
    syncSource: 'MEWS',
    pmsSource: 'MEWS',
    isFlagged: false,
    property: { id: 'demo-property-1', name: 'AccuDefend Grand Hotel' },
    linkedCase: { id: 'demo-2', caseNumber: 'CB-2026-0246', status: 'IN_REVIEW', amount: 890.50 },
    chargebacks: [{ id: 'demo-2', caseNumber: 'CB-2026-0246', status: 'IN_REVIEW', amount: 890.50 }],
    _count: { folioItems: 8 }
  },
  {
    id: 'res-demo-3',
    confirmationNumber: 'RES-2026-1003',
    guestName: 'Michael Brown',
    guestEmail: 'mbrown@email.com',
    guestPhone: '+1 (555) 456-7890',
    checkInDate: new Date(Date.now() - 10 * 86400000).toISOString(),
    checkOutDate: new Date(Date.now() - 7 * 86400000).toISOString(),
    actualCheckIn: new Date(Date.now() - 10 * 86400000 + 57600000).toISOString(),
    actualCheckOut: new Date(Date.now() - 7 * 86400000 + 36000000).toISOString(),
    roomNumber: '601',
    roomType: 'Presidential Suite',
    rateCode: 'RACK',
    rateAmount: 599.00,
    totalAmount: 2100.00,
    currency: 'USD',
    status: 'checked_out',
    adults: 2,
    children: 1,
    cardBrand: 'VISA',
    cardLastFour: '1234',
    paymentMethod: 'CREDIT_CARD',
    bookingSource: 'Travel Agent',
    loyaltyNumber: 'HH-112233',
    syncSource: 'OPERA_CLOUD',
    pmsSource: 'OPERA_CLOUD',
    isFlagged: false,
    property: { id: 'demo-property-1', name: 'AccuDefend Grand Hotel' },
    linkedCase: null,
    chargebacks: [],
    _count: { folioItems: 18 }
  },
  {
    id: 'res-demo-4',
    confirmationNumber: 'RES-2026-1004',
    guestName: 'Emily Rodriguez',
    guestEmail: 'erodriguez@email.com',
    guestPhone: '+1 (555) 567-8901',
    checkInDate: new Date(Date.now() + 2 * 86400000).toISOString(),
    checkOutDate: new Date(Date.now() + 5 * 86400000).toISOString(),
    actualCheckIn: null,
    actualCheckOut: null,
    roomNumber: '315',
    roomType: 'Standard Queen',
    rateCode: 'CORP',
    rateAmount: 179.00,
    totalAmount: 475.25,
    currency: 'USD',
    status: 'confirmed',
    adults: 1,
    children: 0,
    cardBrand: 'MASTERCARD',
    cardLastFour: '5678',
    paymentMethod: 'CREDIT_CARD',
    bookingSource: 'Corporate Portal',
    loyaltyNumber: null,
    syncSource: 'CLOUDBEDS',
    pmsSource: 'CLOUDBEDS',
    isFlagged: false,
    property: { id: 'demo-property-1', name: 'AccuDefend Grand Hotel' },
    linkedCase: null,
    chargebacks: [],
    _count: { folioItems: 3 }
  },
  {
    id: 'res-demo-5',
    confirmationNumber: 'RES-2026-1005',
    guestName: 'Robert Kim',
    guestEmail: 'rkim@email.com',
    guestPhone: '+1 (555) 678-9012',
    checkInDate: new Date(Date.now() - 8 * 86400000).toISOString(),
    checkOutDate: new Date(Date.now() - 6 * 86400000).toISOString(),
    actualCheckIn: new Date(Date.now() - 8 * 86400000 + 50400000).toISOString(),
    actualCheckOut: new Date(Date.now() - 6 * 86400000 + 43200000).toISOString(),
    roomNumber: '118',
    roomType: 'Accessible King',
    rateCode: 'GOV',
    rateAmount: 149.00,
    totalAmount: 560.75,
    currency: 'USD',
    status: 'checked_out',
    adults: 1,
    children: 0,
    cardBrand: 'DISCOVER',
    cardLastFour: '9012',
    paymentMethod: 'CREDIT_CARD',
    bookingSource: 'Government Rate',
    loyaltyNumber: null,
    syncSource: 'AUTOCLERK',
    pmsSource: 'AUTOCLERK',
    isFlagged: true,
    property: { id: 'demo-property-1', name: 'AccuDefend Grand Hotel' },
    linkedCase: { id: 'demo-7', caseNumber: 'CB-2026-0241', status: 'LOST', amount: 560.75 },
    chargebacks: [{ id: 'demo-7', caseNumber: 'CB-2026-0241', status: 'LOST', amount: 560.75 }],
    _count: { folioItems: 6 }
  },
  {
    id: 'res-demo-6',
    confirmationNumber: 'RES-2026-1006',
    guestName: 'Lisa Anderson',
    guestEmail: 'landerson@email.com',
    guestPhone: '+1 (555) 789-0123',
    checkInDate: new Date(Date.now() - 15 * 86400000).toISOString(),
    checkOutDate: new Date(Date.now() - 11 * 86400000).toISOString(),
    actualCheckIn: new Date(Date.now() - 15 * 86400000 + 54000000).toISOString(),
    actualCheckOut: new Date(Date.now() - 11 * 86400000 + 39600000).toISOString(),
    roomNumber: '502',
    roomType: 'Junior Suite',
    rateCode: 'BAR',
    rateAmount: 399.00,
    totalAmount: 1875.00,
    currency: 'USD',
    status: 'checked_out',
    adults: 2,
    children: 2,
    cardBrand: 'VISA',
    cardLastFour: '3456',
    paymentMethod: 'CREDIT_CARD',
    bookingSource: 'Expedia',
    loyaltyNumber: 'HH-445566',
    syncSource: 'OPERA_CLOUD',
    pmsSource: 'OPERA_CLOUD',
    isFlagged: false,
    property: { id: 'demo-property-1', name: 'AccuDefend Grand Hotel' },
    linkedCase: null,
    chargebacks: [],
    _count: { folioItems: 22 }
  },
  {
    id: 'res-demo-7',
    confirmationNumber: 'RES-2026-1007',
    guestName: 'David Thompson',
    guestEmail: 'dthompson@email.com',
    guestPhone: null,
    checkInDate: new Date(Date.now() - 1 * 86400000).toISOString(),
    checkOutDate: new Date(Date.now() + 3 * 86400000).toISOString(),
    actualCheckIn: new Date(Date.now() - 1 * 86400000 + 61200000).toISOString(),
    actualCheckOut: null,
    roomNumber: '710',
    roomType: 'Executive King',
    rateCode: 'RACK',
    rateAmount: 459.00,
    totalAmount: 3200.00,
    currency: 'USD',
    status: 'checked_in',
    adults: 2,
    children: 0,
    cardBrand: 'AMEX',
    cardLastFour: '0001',
    paymentMethod: 'CREDIT_CARD',
    bookingSource: 'Direct Phone',
    loyaltyNumber: 'HH-001122',
    syncSource: 'OPERA_CLOUD',
    pmsSource: 'OPERA_CLOUD',
    isFlagged: true,
    property: { id: 'demo-property-1', name: 'AccuDefend Grand Hotel' },
    linkedCase: { id: 'demo-5', caseNumber: 'CB-2026-0243', status: 'PENDING', amount: 3200.00 },
    chargebacks: [{ id: 'demo-5', caseNumber: 'CB-2026-0243', status: 'PENDING', amount: 3200.00 }],
    _count: { folioItems: 9 }
  },
  {
    id: 'res-demo-8',
    confirmationNumber: 'RES-2026-1008',
    guestName: 'Jennifer Lee',
    guestEmail: 'jlee@email.com',
    guestPhone: '+1 (555) 890-1234',
    checkInDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    checkOutDate: new Date(Date.now() + 10 * 86400000).toISOString(),
    actualCheckIn: null,
    actualCheckOut: null,
    roomNumber: null,
    roomType: 'King Suite',
    rateCode: 'PROMO',
    rateAmount: 349.00,
    totalAmount: 1450.00,
    currency: 'USD',
    status: 'confirmed',
    adults: 2,
    children: 1,
    cardBrand: 'MASTERCARD',
    cardLastFour: '7890',
    paymentMethod: 'CREDIT_CARD',
    bookingSource: 'Hotels.com',
    loyaltyNumber: null,
    syncSource: 'MEWS',
    pmsSource: 'MEWS',
    isFlagged: false,
    property: { id: 'demo-property-1', name: 'AccuDefend Grand Hotel' },
    linkedCase: null,
    chargebacks: [],
    _count: { folioItems: 2 }
  },
  {
    id: 'res-demo-9',
    confirmationNumber: 'RES-2026-1009',
    guestName: 'Carlos Mendez',
    guestEmail: 'cmendez@email.com',
    guestPhone: '+1 (555) 901-2345',
    checkInDate: new Date(Date.now() - 20 * 86400000).toISOString(),
    checkOutDate: new Date(Date.now() - 18 * 86400000).toISOString(),
    actualCheckIn: null,
    actualCheckOut: null,
    roomNumber: '203',
    roomType: 'Standard Double',
    rateCode: 'BAR',
    rateAmount: 159.00,
    totalAmount: 318.00,
    currency: 'USD',
    status: 'no_show',
    adults: 1,
    children: 0,
    cardBrand: 'VISA',
    cardLastFour: '6543',
    paymentMethod: 'CREDIT_CARD',
    bookingSource: 'Direct Website',
    loyaltyNumber: null,
    syncSource: 'CLOUDBEDS',
    pmsSource: 'CLOUDBEDS',
    isFlagged: false,
    property: { id: 'demo-property-1', name: 'AccuDefend Grand Hotel' },
    linkedCase: null,
    chargebacks: [],
    _count: { folioItems: 1 }
  },
  {
    id: 'res-demo-10',
    confirmationNumber: 'RES-2026-1010',
    guestName: 'Amanda Foster',
    guestEmail: 'afoster@email.com',
    guestPhone: '+1 (555) 012-3456',
    checkInDate: new Date(Date.now() - 12 * 86400000).toISOString(),
    checkOutDate: new Date(Date.now() - 9 * 86400000).toISOString(),
    actualCheckIn: new Date(Date.now() - 12 * 86400000 + 50400000).toISOString(),
    actualCheckOut: new Date(Date.now() - 9 * 86400000 + 36000000).toISOString(),
    roomNumber: '425',
    roomType: 'Deluxe King',
    rateCode: 'AAA',
    rateAmount: 249.00,
    totalAmount: 830.00,
    currency: 'USD',
    status: 'cancelled',
    adults: 2,
    children: 0,
    cardBrand: 'VISA',
    cardLastFour: '2468',
    paymentMethod: 'CREDIT_CARD',
    bookingSource: 'AAA Travel',
    loyaltyNumber: 'HH-998877',
    syncSource: 'OPERA_CLOUD',
    pmsSource: 'OPERA_CLOUD',
    isFlagged: false,
    property: { id: 'demo-property-1', name: 'AccuDefend Grand Hotel' },
    linkedCase: null,
    chargebacks: [],
    _count: { folioItems: 5 }
  }
];

/**
 * Helper: flatten a DB reservation row to the shape the frontend expects.
 * Merges guestProfile fields to top-level, maps syncSource → pmsSource,
 * and transforms chargebacks[] → linkedCase (first linked chargeback).
 */
function flattenReservation(row) {
  const flat = { ...row };

  // Flatten guestProfile fields to top level
  if (row.guestProfile) {
    flat.isFlagged = row.guestProfile.isFlagged || false;
    flat.chargebackCount = row.guestProfile.chargebackCount || 0;
  }

  // Map syncSource to pmsSource (frontend uses pmsSource)
  if (row.syncSource && !row.pmsSource) {
    flat.pmsSource = row.syncSource;
  }

  // Map chargebacks[] to linkedCase (first chargeback or null)
  if (row.chargebacks && row.chargebacks.length > 0 && !row.linkedCase) {
    flat.linkedCase = row.chargebacks[0];
  } else if (!row.linkedCase) {
    flat.linkedCase = null;
  }

  // Also keep chargebacks array as linkedChargebacks for ReservationViewer
  if (row.chargebacks) {
    flat.linkedChargebacks = row.chargebacks;
  }

  return flat;
}

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

    // Flatten each row for frontend compatibility
    const flatReservations = reservations.map(flattenReservation);

    res.json({
      reservations: flatReservations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    // Demo mode fallback
    logger.warn('List reservations: database unavailable, returning demo data');

    const {
      page = 1, limit = 25, status, guestName, confirmationNumber,
      pmsSource, syncSource, linkFilter
    } = req.query;

    let filtered = [...DEMO_RESERVATIONS];

    // Apply basic filters on demo data
    if (status) filtered = filtered.filter(r => r.status === status);
    if (guestName) filtered = filtered.filter(r => r.guestName.toLowerCase().includes(guestName.toLowerCase()));
    if (confirmationNumber) filtered = filtered.filter(r => r.confirmationNumber.toLowerCase().includes(confirmationNumber.toLowerCase()));
    if (pmsSource || syncSource) {
      const src = (pmsSource || syncSource || '').toUpperCase();
      filtered = filtered.filter(r => r.syncSource === src);
    }
    if (linkFilter === 'linked') filtered = filtered.filter(r => r.linkedCase !== null);
    if (linkFilter === 'unlinked') filtered = filtered.filter(r => r.linkedCase === null);

    const total = filtered.length;
    const pgInt = parseInt(page);
    const limInt = parseInt(limit);
    const start = (pgInt - 1) * limInt;
    const paged = filtered.slice(start, start + limInt);

    res.json({
      reservations: paged,
      pagination: {
        page: pgInt,
        limit: limInt,
        total,
        totalPages: Math.ceil(total / limInt)
      },
      isDemo: true
    });
  }
});

// =========================================================================
// GET /api/reservations/stats/summary — Reservation sync statistics
// (NOTE: must be defined BEFORE /:id to avoid matching "stats" as an ID)
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
      totalReservations: total,
      linkedToChargebacks: linked,
      unlinked: total - linked,
      flaggedGuests,
      lastSyncTime: new Date(Date.now() - 300000).toISOString(), // 5 min ago
      bySource: bySource.map(s => ({ source: s.syncSource, count: s._count })),
      byStatus: byStatus.map(s => ({ status: s.status, count: s._count }))
    });
  } catch (error) {
    // Demo mode fallback
    logger.warn('Get reservation stats: database unavailable, returning demo data');

    const linkedCount = DEMO_RESERVATIONS.filter(r => r.linkedCase !== null).length;
    const flaggedCount = DEMO_RESERVATIONS.filter(r => r.isFlagged).length;

    // Aggregate by source
    const sourceMap = {};
    const statusMap = {};
    DEMO_RESERVATIONS.forEach(r => {
      sourceMap[r.syncSource] = (sourceMap[r.syncSource] || 0) + 1;
      statusMap[r.status] = (statusMap[r.status] || 0) + 1;
    });

    res.json({
      totalReservations: DEMO_RESERVATIONS.length,
      linkedToChargebacks: linkedCount,
      unlinked: DEMO_RESERVATIONS.length - linkedCount,
      flaggedGuests: flaggedCount,
      lastSyncTime: new Date(Date.now() - 300000).toISOString(),
      bySource: Object.entries(sourceMap).map(([source, count]) => ({ source, count })),
      byStatus: Object.entries(statusMap).map(([status, count]) => ({ status, count })),
      isDemo: true
    });
  }
});

// =========================================================================
// GET /api/reservations/search/live — Search PMS in real-time
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
      results: localResults.map(flattenReservation),
      source: 'local',
      count: localResults.length
    });
  } catch (error) {
    // Demo mode fallback
    logger.warn('Search reservations: database unavailable, searching demo data');

    const { confirmationNumber, guestName, cardLastFour } = req.query;
    let results = [...DEMO_RESERVATIONS];

    if (confirmationNumber) results = results.filter(r => r.confirmationNumber.toLowerCase().includes(confirmationNumber.toLowerCase()));
    if (guestName) results = results.filter(r => r.guestName.toLowerCase().includes(guestName.toLowerCase()));
    if (cardLastFour) results = results.filter(r => r.cardLastFour === cardLastFour);

    res.json({
      results: results.slice(0, 20),
      source: 'demo',
      count: results.length,
      isDemo: true
    });
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

    // Flatten and add folio summary
    const flat = flattenReservation(reservation);

    res.json({
      ...flat,
      folioSummary
    });
  } catch (error) {
    // Demo mode fallback
    logger.warn('Get reservation detail: database unavailable, returning demo data');

    const demoRes = DEMO_RESERVATIONS.find(r => r.id === req.params.id);
    if (!demoRes) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    // Generate demo folio items
    const folioItems = _generateDemoFolioItems(demoRes);
    const folioSummary = _calculateFolioSummary(folioItems);

    res.json({
      ...demoRes,
      linkedChargebacks: demoRes.chargebacks || [],
      folioItems,
      folioSummary,
      isDemo: true
    });
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
    // Demo mode fallback
    logger.warn('Get folio: database unavailable, returning demo data');

    const demoRes = DEMO_RESERVATIONS.find(r => r.id === req.params.id);
    if (!demoRes) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const folioItems = _generateDemoFolioItems(demoRes);
    const summary = _calculateFolioSummary(folioItems);

    res.json({
      reservation: {
        id: demoRes.id,
        confirmationNumber: demoRes.confirmationNumber,
        guestName: demoRes.guestName,
        checkInDate: demoRes.checkInDate,
        checkOutDate: demoRes.checkOutDate,
        roomNumber: demoRes.roomNumber,
        roomType: demoRes.roomType,
        totalAmount: demoRes.totalAmount,
        currency: demoRes.currency
      },
      folioItems,
      summary,
      isDemo: true
    });
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
    // Demo mode fallback
    logger.warn('Link chargeback: database unavailable, returning demo success');

    res.json({
      message: 'Chargeback linked to reservation (demo)',
      chargeback: { id: req.body.chargebackId },
      reservation: { id: req.params.id },
      isDemo: true
    });
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

// =========================================================================
// Helper: Generate demo folio items for a reservation
// =========================================================================
function _generateDemoFolioItems(demoRes) {
  const checkIn = new Date(demoRes.checkInDate);
  const checkOut = new Date(demoRes.checkOutDate);
  const nights = Math.max(1, Math.round((checkOut - checkIn) / 86400000));
  const items = [];
  let seq = 1;

  // Room charges for each night
  for (let n = 0; n < nights; n++) {
    const postDate = new Date(checkIn.getTime() + n * 86400000);
    items.push({
      id: `folio-${demoRes.id}-${seq++}`,
      reservationId: demoRes.id,
      postDate: postDate.toISOString(),
      category: 'room',
      description: `Room Charge - ${demoRes.roomType} (Night ${n + 1})`,
      amount: demoRes.rateAmount.toFixed(2),
      currency: 'USD'
    });
  }

  // Add some incidental charges
  if (demoRes.totalAmount > demoRes.rateAmount * nights + 20) {
    const extras = demoRes.totalAmount - demoRes.rateAmount * nights;
    items.push({
      id: `folio-${demoRes.id}-${seq++}`,
      reservationId: demoRes.id,
      postDate: new Date(checkIn.getTime() + 86400000).toISOString(),
      category: 'food_beverage',
      description: 'Restaurant Charge - Room Service',
      amount: (extras * 0.4).toFixed(2),
      currency: 'USD'
    });
    items.push({
      id: `folio-${demoRes.id}-${seq++}`,
      reservationId: demoRes.id,
      postDate: new Date(checkIn.getTime() + 86400000).toISOString(),
      category: 'tax',
      description: 'Occupancy Tax',
      amount: (extras * 0.35).toFixed(2),
      currency: 'USD'
    });
    items.push({
      id: `folio-${demoRes.id}-${seq++}`,
      reservationId: demoRes.id,
      postDate: checkIn.toISOString(),
      category: 'other',
      description: 'Resort Fee',
      amount: (extras * 0.25).toFixed(2),
      currency: 'USD'
    });
  }

  // Payment entry
  items.push({
    id: `folio-${demoRes.id}-${seq++}`,
    reservationId: demoRes.id,
    postDate: (demoRes.actualCheckOut || demoRes.checkOutDate || demoRes.checkInDate),
    category: 'payment',
    description: `Payment - ${demoRes.cardBrand} ending ${demoRes.cardLastFour}`,
    amount: (-demoRes.totalAmount).toFixed(2),
    currency: 'USD'
  });

  return items;
}

module.exports = router;
