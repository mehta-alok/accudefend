/**
 * AccuDefend - Hotel Chargeback Defense System
 * Chargeback Cases Routes
 */

const express = require('express');
const { prisma } = require('../config/database');
const { authenticateToken, requireRole, requirePropertyAccess } = require('../middleware/auth');
const { createCaseSchema, updateCaseSchema, updateCaseStatusSchema, caseFilterSchema } = require('../utils/validators');
const { analyzeChargeback } = require('../services/fraudDetection');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requirePropertyAccess);

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

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/cases
 * List chargebacks with filtering and pagination
 */
router.get('/', async (req, res) => {
  try {
    // Validate query params
    const validation = caseFilterSchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: validation.error.errors
      });
    }

    const {
      status,
      propertyId,
      providerId,
      dateFrom,
      dateTo,
      search,
      page,
      limit,
      sortBy,
      sortOrder
    } = validation.data;

    // Build where clause
    const where = {
      ...req.propertyFilter // Property access control
    };

    if (status) {
      where.status = { in: status.split(',') };
    }

    if (providerId) {
      where.providerId = providerId;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    if (search) {
      where.OR = [
        { caseNumber: { contains: search, mode: 'insensitive' } },
        { guestName: { contains: search, mode: 'insensitive' } },
        { guestEmail: { contains: search, mode: 'insensitive' } },
        { confirmationNumber: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Execute query
    const [cases, total] = await Promise.all([
      prisma.chargeback.findMany({
        where,
        include: {
          property: { select: { id: true, name: true } },
          provider: { select: { id: true, name: true } },
          _count: { select: { evidence: true, notes: true } }
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.chargeback.count({ where })
    ]);

    res.json({
      cases,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('List cases error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve cases'
    });
  }
});

/**
 * GET /api/cases/stats
 * Get case statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const where = req.propertyFilter;

    const [statusCounts, totalAmount, recentCases] = await Promise.all([
      // Count by status
      prisma.chargeback.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
        _sum: { amount: true }
      }),

      // Total disputed amount
      prisma.chargeback.aggregate({
        where,
        _sum: { amount: true },
        _count: true
      }),

      // Recent cases (last 7 days)
      prisma.chargeback.count({
        where: {
          ...where,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      })
    ]);

    // Calculate win rate
    const wonCount = statusCounts.find(s => s.status === 'WON')?._count.status || 0;
    const lostCount = statusCounts.find(s => s.status === 'LOST')?._count.status || 0;
    const resolvedCount = wonCount + lostCount;
    const winRate = resolvedCount > 0 ? Math.round((wonCount / resolvedCount) * 100) : 0;

    res.json({
      overview: {
        totalCases: totalAmount._count,
        totalAmount: totalAmount._sum.amount || 0,
        recentCases,
        winRate
      },
      byStatus: statusCounts.reduce((acc, item) => {
        acc[item.status] = {
          count: item._count.status,
          amount: item._sum.amount || 0
        };
        return acc;
      }, {})
    });

  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve statistics'
    });
  }
});

/**
 * GET /api/cases/:id
 * Get single chargeback with all details
 */
router.get('/:id', async (req, res) => {
  try {
    const chargeback = await prisma.chargeback.findFirst({
      where: {
        id: req.params.id,
        ...req.propertyFilter
      },
      include: {
        property: true,
        provider: true,
        evidence: {
          orderBy: { createdAt: 'desc' }
        },
        timeline: {
          orderBy: { createdAt: 'desc' }
        },
        notes: {
          include: {
            user: { select: { firstName: true, lastName: true } }
          },
          orderBy: { createdAt: 'desc' }
        },
        submissions: {
          orderBy: { submittedAt: 'desc' }
        }
      }
    });

    if (!chargeback) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    res.json({ chargeback });

  } catch (error) {
    logger.error('Get case error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve case'
    });
  }
});

/**
 * POST /api/cases
 * Create new chargeback manually
 */
router.post('/', requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res) => {
  try {
    // Validate input
    const validation = createCaseSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: validation.error.errors
      });
    }

    const data = validation.data;

    // Verify property access
    if (req.user.role !== 'ADMIN' && data.propertyId !== req.user.propertyId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot create case for another property'
      });
    }

    // Generate case number
    const caseNumber = await generateCaseNumber();

    // Create chargeback
    const chargeback = await prisma.chargeback.create({
      data: {
        caseNumber,
        ...data,
        disputeDate: new Date(data.disputeDate),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        checkInDate: new Date(data.checkInDate),
        checkOutDate: new Date(data.checkOutDate)
      },
      include: {
        property: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true } }
      }
    });

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId: chargeback.id,
        eventType: 'SYSTEM',
        title: 'Case Created',
        description: `Case ${caseNumber} created manually by ${req.user.firstName} ${req.user.lastName}`
      }
    });

    // Run AI analysis
    try {
      await analyzeChargeback(chargeback.id);
    } catch (aiError) {
      logger.warn(`AI analysis failed for ${caseNumber}:`, aiError.message);
    }

    logger.info(`Case created: ${caseNumber} by ${req.user.email}`);

    res.status(201).json({
      message: 'Chargeback created successfully',
      chargeback
    });

  } catch (error) {
    logger.error('Create case error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create case'
    });
  }
});

/**
 * PATCH /api/cases/:id
 * Update chargeback details
 */
router.patch('/:id', requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res) => {
  try {
    // Validate input
    const validation = updateCaseSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: validation.error.errors
      });
    }

    // Check access
    const existing = await prisma.chargeback.findFirst({
      where: {
        id: req.params.id,
        ...req.propertyFilter
      }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    // Update chargeback
    const chargeback = await prisma.chargeback.update({
      where: { id: req.params.id },
      data: validation.data,
      include: {
        property: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true } }
      }
    });

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId: chargeback.id,
        eventType: 'USER_ACTION',
        title: 'Case Updated',
        description: `Updated by ${req.user.firstName} ${req.user.lastName}`
      }
    });

    logger.info(`Case updated: ${chargeback.caseNumber} by ${req.user.email}`);

    res.json({
      message: 'Chargeback updated successfully',
      chargeback
    });

  } catch (error) {
    logger.error('Update case error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update case'
    });
  }
});

/**
 * PATCH /api/cases/:id/status
 * Update chargeback status
 */
router.patch('/:id/status', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    // Validate input
    const validation = updateCaseStatusSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: validation.error.errors
      });
    }

    const { status, notes } = validation.data;

    // Check access
    const existing = await prisma.chargeback.findFirst({
      where: {
        id: req.params.id,
        ...req.propertyFilter
      }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    // Update status
    const updateData = {
      status,
      ...(status === 'WON' || status === 'LOST' ? { resolvedAt: new Date() } : {})
    };

    const chargeback = await prisma.chargeback.update({
      where: { id: req.params.id },
      data: updateData
    });

    // Determine event type
    let eventType = 'USER_ACTION';
    if (status === 'WON') eventType = 'WON';
    if (status === 'LOST') eventType = 'LOST';

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId: chargeback.id,
        eventType,
        title: `Status Changed to ${status}`,
        description: notes || `Status updated by ${req.user.firstName} ${req.user.lastName}`
      }
    });

    logger.info(`Case status updated: ${chargeback.caseNumber} -> ${status} by ${req.user.email}`);

    res.json({
      message: 'Status updated successfully',
      chargeback
    });

  } catch (error) {
    logger.error('Update status error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update status'
    });
  }
});

/**
 * POST /api/cases/:id/analyze
 * Re-run AI analysis
 */
router.post('/:id/analyze', requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res) => {
  try {
    // Check access
    const existing = await prisma.chargeback.findFirst({
      where: {
        id: req.params.id,
        ...req.propertyFilter
      }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    // Run analysis
    const result = await analyzeChargeback(req.params.id);

    res.json({
      message: 'Analysis complete',
      ...result
    });

  } catch (error) {
    logger.error('Analyze case error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to analyze case'
    });
  }
});

/**
 * POST /api/cases/:id/notes
 * Add note to case
 */
router.post('/:id/notes', requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res) => {
  try {
    const { content, isInternal = true } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Note content is required'
      });
    }

    // Check access
    const existing = await prisma.chargeback.findFirst({
      where: {
        id: req.params.id,
        ...req.propertyFilter
      }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    // Create note
    const note = await prisma.caseNote.create({
      data: {
        chargebackId: req.params.id,
        userId: req.user.id,
        content: content.trim(),
        isInternal
      },
      include: {
        user: { select: { firstName: true, lastName: true } }
      }
    });

    res.status(201).json({
      message: 'Note added successfully',
      note
    });

  } catch (error) {
    logger.error('Add note error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to add note'
    });
  }
});

/**
 * DELETE /api/cases/:id
 * Soft delete chargeback (Admin only)
 */
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const existing = await prisma.chargeback.findFirst({
      where: {
        id: req.params.id,
        ...req.propertyFilter
      }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    // Soft delete by setting status to CANCELLED
    await prisma.chargeback.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' }
    });

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId: req.params.id,
        eventType: 'SYSTEM',
        title: 'Case Cancelled',
        description: `Case cancelled by ${req.user.firstName} ${req.user.lastName}`
      }
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'DELETE_CASE',
        entityType: 'Chargeback',
        entityId: req.params.id,
        oldValues: { status: existing.status },
        newValues: { status: 'CANCELLED' }
      }
    });

    logger.info(`Case cancelled: ${existing.caseNumber} by ${req.user.email}`);

    res.json({
      message: 'Chargeback cancelled successfully'
    });

  } catch (error) {
    logger.error('Delete case error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete case'
    });
  }
});

module.exports = router;
