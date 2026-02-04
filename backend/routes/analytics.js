/**
 * AccuDefend - Hotel Chargeback Defense System
 * Analytics Routes
 */

const express = require('express');
const { prisma } = require('../config/database');
const { authenticateToken, requirePropertyAccess } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requirePropertyAccess);

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/analytics/dashboard
 * Get main dashboard metrics
 */
router.get('/dashboard', async (req, res) => {
  try {
    const where = req.propertyFilter;

    // Get date ranges
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);

    const [
      totalStats,
      currentPeriod,
      previousPeriod,
      statusBreakdown,
      recentCases,
      urgentCases
    ] = await Promise.all([
      // Overall statistics
      prisma.chargeback.aggregate({
        where,
        _count: true,
        _sum: { amount: true }
      }),

      // Current 30-day period
      prisma.chargeback.aggregate({
        where: {
          ...where,
          createdAt: { gte: thirtyDaysAgo }
        },
        _count: true,
        _sum: { amount: true }
      }),

      // Previous 30-day period (for comparison)
      prisma.chargeback.aggregate({
        where: {
          ...where,
          createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo }
        },
        _count: true,
        _sum: { amount: true }
      }),

      // Status breakdown
      prisma.chargeback.groupBy({
        by: ['status'],
        where,
        _count: true,
        _sum: { amount: true }
      }),

      // Recent cases (last 5)
      prisma.chargeback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          caseNumber: true,
          guestName: true,
          amount: true,
          status: true,
          confidenceScore: true,
          recommendation: true,
          createdAt: true
        }
      }),

      // Urgent cases (due within 7 days)
      prisma.chargeback.count({
        where: {
          ...where,
          status: { in: ['PENDING', 'IN_REVIEW'] },
          dueDate: {
            lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            gte: now
          }
        }
      })
    ]);

    // Calculate win rate
    const wonCount = statusBreakdown.find(s => s.status === 'WON')?._count || 0;
    const lostCount = statusBreakdown.find(s => s.status === 'LOST')?._count || 0;
    const resolvedCount = wonCount + lostCount;
    const winRate = resolvedCount > 0 ? Math.round((wonCount / resolvedCount) * 100) : 0;

    // Calculate recovered amount
    const recoveredAmount = statusBreakdown.find(s => s.status === 'WON')?._sum.amount || 0;

    // Calculate trends
    const casesTrend = previousPeriod._count > 0
      ? Math.round(((currentPeriod._count - previousPeriod._count) / previousPeriod._count) * 100)
      : 0;

    const amountTrend = previousPeriod._sum.amount > 0
      ? Math.round(((Number(currentPeriod._sum.amount || 0) - Number(previousPeriod._sum.amount || 0)) / Number(previousPeriod._sum.amount)) * 100)
      : 0;

    res.json({
      summary: {
        totalCases: totalStats._count,
        totalAmount: Number(totalStats._sum.amount || 0),
        recoveredAmount: Number(recoveredAmount),
        winRate,
        urgentCases,
        currentPeriodCases: currentPeriod._count,
        trends: {
          cases: casesTrend,
          amount: amountTrend
        }
      },
      statusBreakdown: statusBreakdown.reduce((acc, item) => {
        acc[item.status] = {
          count: item._count,
          amount: Number(item._sum.amount || 0)
        };
        return acc;
      }, {}),
      recentCases
    });

  } catch (error) {
    logger.error('Dashboard analytics error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve dashboard analytics'
    });
  }
});

/**
 * GET /api/analytics/monthly
 * Get monthly case trends
 */
router.get('/monthly', async (req, res) => {
  try {
    const { months = 12 } = req.query;
    const where = req.propertyFilter;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));

    // Get all cases in date range
    const cases = await prisma.chargeback.findMany({
      where: {
        ...where,
        createdAt: { gte: startDate, lte: endDate }
      },
      select: {
        id: true,
        status: true,
        amount: true,
        createdAt: true,
        resolvedAt: true
      }
    });

    // Group by month
    const monthlyData = {};
    for (let i = 0; i < parseInt(months); i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[key] = {
        month: key,
        cases: 0,
        amount: 0,
        won: 0,
        lost: 0,
        recovered: 0
      };
    }

    // Populate with actual data
    cases.forEach(c => {
      const key = `${c.createdAt.getFullYear()}-${String(c.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyData[key]) {
        monthlyData[key].cases++;
        monthlyData[key].amount += Number(c.amount);
        if (c.status === 'WON') {
          monthlyData[key].won++;
          monthlyData[key].recovered += Number(c.amount);
        }
        if (c.status === 'LOST') {
          monthlyData[key].lost++;
        }
      }
    });

    // Convert to array and sort
    const monthlyArray = Object.values(monthlyData)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        ...m,
        winRate: (m.won + m.lost) > 0 ? Math.round((m.won / (m.won + m.lost)) * 100) : 0
      }));

    res.json({
      monthly: monthlyArray,
      totals: {
        cases: cases.length,
        amount: cases.reduce((sum, c) => sum + Number(c.amount), 0),
        won: cases.filter(c => c.status === 'WON').length,
        lost: cases.filter(c => c.status === 'LOST').length
      }
    });

  } catch (error) {
    logger.error('Monthly analytics error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve monthly analytics'
    });
  }
});

/**
 * GET /api/analytics/processors
 * Get metrics by payment processor
 */
router.get('/processors', async (req, res) => {
  try {
    const where = req.propertyFilter;

    const processorStats = await prisma.chargeback.groupBy({
      by: ['providerId'],
      where,
      _count: true,
      _sum: { amount: true }
    });

    // Get provider names and add win rates
    const providers = await prisma.provider.findMany({
      where: {
        id: { in: processorStats.map(p => p.providerId) }
      },
      select: { id: true, name: true }
    });

    // Get win/loss by provider
    const resolutions = await prisma.chargeback.groupBy({
      by: ['providerId', 'status'],
      where: {
        ...where,
        status: { in: ['WON', 'LOST'] }
      },
      _count: true
    });

    // Build result
    const result = processorStats.map(stat => {
      const provider = providers.find(p => p.id === stat.providerId);
      const won = resolutions.find(r => r.providerId === stat.providerId && r.status === 'WON')?._count || 0;
      const lost = resolutions.find(r => r.providerId === stat.providerId && r.status === 'LOST')?._count || 0;
      const resolved = won + lost;

      return {
        providerId: stat.providerId,
        providerName: provider?.name || 'Unknown',
        totalCases: stat._count,
        totalAmount: Number(stat._sum.amount || 0),
        won,
        lost,
        winRate: resolved > 0 ? Math.round((won / resolved) * 100) : 0
      };
    });

    res.json({
      processors: result.sort((a, b) => b.totalCases - a.totalCases)
    });

  } catch (error) {
    logger.error('Processor analytics error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve processor analytics'
    });
  }
});

/**
 * GET /api/analytics/reason-codes
 * Get win rates by reason code
 */
router.get('/reason-codes', async (req, res) => {
  try {
    const where = req.propertyFilter;

    const reasonCodeStats = await prisma.chargeback.groupBy({
      by: ['reasonCode', 'reasonDescription'],
      where,
      _count: true,
      _sum: { amount: true }
    });

    // Get win/loss by reason code
    const resolutions = await prisma.chargeback.groupBy({
      by: ['reasonCode', 'status'],
      where: {
        ...where,
        status: { in: ['WON', 'LOST'] }
      },
      _count: true
    });

    // Build result
    const result = reasonCodeStats.map(stat => {
      const won = resolutions.find(r => r.reasonCode === stat.reasonCode && r.status === 'WON')?._count || 0;
      const lost = resolutions.find(r => r.reasonCode === stat.reasonCode && r.status === 'LOST')?._count || 0;
      const resolved = won + lost;

      return {
        reasonCode: stat.reasonCode,
        description: stat.reasonDescription || 'Unknown',
        totalCases: stat._count,
        totalAmount: Number(stat._sum.amount || 0),
        won,
        lost,
        winRate: resolved > 0 ? Math.round((won / resolved) * 100) : 0
      };
    });

    res.json({
      reasonCodes: result.sort((a, b) => b.totalCases - a.totalCases)
    });

  } catch (error) {
    logger.error('Reason code analytics error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve reason code analytics'
    });
  }
});

/**
 * GET /api/analytics/properties
 * Get metrics by property (Admin only)
 */
router.get('/properties', async (req, res) => {
  try {
    // Only admins can see all properties
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Admin access required'
      });
    }

    const propertyStats = await prisma.chargeback.groupBy({
      by: ['propertyId'],
      _count: true,
      _sum: { amount: true }
    });

    // Get property names
    const properties = await prisma.property.findMany({
      where: {
        id: { in: propertyStats.map(p => p.propertyId) }
      },
      select: { id: true, name: true, city: true, state: true }
    });

    // Get win/loss by property
    const resolutions = await prisma.chargeback.groupBy({
      by: ['propertyId', 'status'],
      where: {
        status: { in: ['WON', 'LOST'] }
      },
      _count: true,
      _sum: { amount: true }
    });

    // Build result
    const result = propertyStats.map(stat => {
      const property = properties.find(p => p.id === stat.propertyId);
      const won = resolutions.find(r => r.propertyId === stat.propertyId && r.status === 'WON')?._count || 0;
      const lost = resolutions.find(r => r.propertyId === stat.propertyId && r.status === 'LOST')?._count || 0;
      const recoveredAmount = resolutions.find(r => r.propertyId === stat.propertyId && r.status === 'WON')?._sum.amount || 0;
      const resolved = won + lost;

      return {
        propertyId: stat.propertyId,
        propertyName: property?.name || 'Unknown',
        location: property ? `${property.city}, ${property.state}` : '',
        totalCases: stat._count,
        totalAmount: Number(stat._sum.amount || 0),
        recoveredAmount: Number(recoveredAmount),
        won,
        lost,
        winRate: resolved > 0 ? Math.round((won / resolved) * 100) : 0
      };
    });

    res.json({
      properties: result.sort((a, b) => b.totalCases - a.totalCases)
    });

  } catch (error) {
    logger.error('Property analytics error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve property analytics'
    });
  }
});

/**
 * GET /api/analytics/ai-performance
 * Get AI recommendation accuracy metrics
 */
router.get('/ai-performance', async (req, res) => {
  try {
    const where = req.propertyFilter;

    // Get resolved cases with AI recommendations
    const resolvedCases = await prisma.chargeback.findMany({
      where: {
        ...where,
        status: { in: ['WON', 'LOST'] },
        recommendation: { not: null }
      },
      select: {
        recommendation: true,
        confidenceScore: true,
        status: true,
        amount: true
      }
    });

    // Calculate accuracy by recommendation
    const byRecommendation = {};
    const recommendationTypes = ['AUTO_SUBMIT', 'REVIEW_RECOMMENDED', 'GATHER_MORE_EVIDENCE', 'UNLIKELY_TO_WIN'];

    recommendationTypes.forEach(rec => {
      const cases = resolvedCases.filter(c => c.recommendation === rec);
      const won = cases.filter(c => c.status === 'WON').length;
      const total = cases.length;

      byRecommendation[rec] = {
        totalCases: total,
        won,
        lost: total - won,
        accuracy: total > 0 ? Math.round((
          rec === 'UNLIKELY_TO_WIN'
            ? ((total - won) / total) * 100  // For unlikely, accuracy = correctly predicted losses
            : (won / total) * 100             // For others, accuracy = actual wins
        )) : 0
      };
    });

    // Calculate accuracy by confidence score ranges
    const scoreRanges = [
      { min: 85, max: 100, label: '85-100%' },
      { min: 70, max: 84, label: '70-84%' },
      { min: 50, max: 69, label: '50-69%' },
      { min: 0, max: 49, label: '0-49%' }
    ];

    const byConfidenceScore = scoreRanges.map(range => {
      const cases = resolvedCases.filter(c =>
        c.confidenceScore >= range.min && c.confidenceScore <= range.max
      );
      const won = cases.filter(c => c.status === 'WON').length;
      const total = cases.length;

      return {
        range: range.label,
        totalCases: total,
        won,
        lost: total - won,
        actualWinRate: total > 0 ? Math.round((won / total) * 100) : 0
      };
    });

    res.json({
      overview: {
        totalAnalyzed: resolvedCases.length,
        overallAccuracy: resolvedCases.length > 0
          ? Math.round((resolvedCases.filter(c =>
              (c.confidenceScore >= 70 && c.status === 'WON') ||
              (c.confidenceScore < 50 && c.status === 'LOST')
            ).length / resolvedCases.length) * 100)
          : 0
      },
      byRecommendation,
      byConfidenceScore
    });

  } catch (error) {
    logger.error('AI performance analytics error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve AI performance analytics'
    });
  }
});

module.exports = router;
