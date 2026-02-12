/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * AI Fraud Detection Engine
 *
 * Analyzes chargebacks and calculates confidence scores
 * based on reason codes, evidence, and fraud indicators
 */

const { prisma } = require('../config/database');
const logger = require('../utils/logger');

// =============================================================================
// REASON CODE WIN RATES
// Historical win rates by dispute reason code
// =============================================================================

const REASON_CODE_WIN_RATES = {
  // Visa Reason Codes
  '13.1': { winRate: 0.75, category: 'Services Not Received', network: 'Visa' },
  '13.2': { winRate: 0.70, category: 'Cancelled Recurring', network: 'Visa' },
  '13.3': { winRate: 0.55, category: 'Not as Described', network: 'Visa' },
  '13.4': { winRate: 0.50, category: 'Counterfeit Merchandise', network: 'Visa' },
  '13.5': { winRate: 0.45, category: 'Misrepresentation', network: 'Visa' },
  '13.6': { winRate: 0.60, category: 'Credit Not Processed', network: 'Visa' },
  '13.7': { winRate: 0.55, category: 'Cancelled Merchandise', network: 'Visa' },
  '10.4': { winRate: 0.45, category: 'Fraud - Card Absent', network: 'Visa' },
  '10.5': { winRate: 0.40, category: 'Fraud - Chip Liability', network: 'Visa' },

  // Mastercard Reason Codes
  '4855': { winRate: 0.75, category: 'Non-Receipt', network: 'Mastercard' },
  '4853': { winRate: 0.60, category: 'Cardholder Dispute', network: 'Mastercard' },
  '4863': { winRate: 0.55, category: 'Cardholder Not Recognize', network: 'Mastercard' },
  '4837': { winRate: 0.40, category: 'No Cardholder Auth', network: 'Mastercard' },
  '4871': { winRate: 0.35, category: 'Chip Liability', network: 'Mastercard' },

  // Amex Reason Codes
  'C14': { winRate: 0.70, category: 'Paid by Other Means', network: 'Amex' },
  'C28': { winRate: 0.55, category: 'Cancelled Recurring', network: 'Amex' },
  'C31': { winRate: 0.50, category: 'Not as Described', network: 'Amex' },
  'C32': { winRate: 0.55, category: 'Merchandise Not Received', network: 'Amex' },
  'F10': { winRate: 0.40, category: 'Missing Imprint', network: 'Amex' },
  'F14': { winRate: 0.45, category: 'Missing Signature', network: 'Amex' },
  'F29': { winRate: 0.35, category: 'Card Not Present Fraud', network: 'Amex' },

  // Discover Reason Codes
  '4752': { winRate: 0.65, category: 'Services/Merchandise', network: 'Discover' },
  '4755': { winRate: 0.45, category: 'Non-Receipt', network: 'Discover' },
  'UA01': { winRate: 0.35, category: 'Fraud', network: 'Discover' },

  // Default for unknown codes
  'default': { winRate: 0.50, category: 'Unknown', network: 'Unknown' }
};

// =============================================================================
// EVIDENCE WEIGHTS
// Percentage contribution to confidence score
// =============================================================================

const EVIDENCE_WEIGHTS = {
  ID_SCAN: 16,
  AUTH_SIGNATURE: 16,
  CHECKOUT_SIGNATURE: 12,
  FOLIO: 12,
  RESERVATION_CONFIRMATION: 5,
  CANCELLATION_POLICY: 5,
  CANCELLATION_POLICY_VIOLATION: 10,
  KEY_CARD_LOG: 8,
  CCTV_FOOTAGE: 5,
  CORRESPONDENCE: 5,
  INCIDENT_REPORT: 8,
  DAMAGE_PHOTOS: 6,
  POLICE_REPORT: 10,
  NO_SHOW_DOCUMENTATION: 8,
  OTHER: 0
};

// =============================================================================
// FRAUD INDICATORS
// Points added/subtracted based on detected patterns
// =============================================================================

const FRAUD_INDICATORS = {
  positive: {
    matching_id: { points: 15, description: 'ID matches reservation name' },
    repeat_guest: { points: 10, description: 'Returning guest with history' },
    long_stay: { points: 5, description: 'Stay duration > 3 nights' },
    corporate_booking: { points: 8, description: 'Corporate/business booking' },
    advance_booking: { points: 5, description: 'Booked >7 days in advance' },
    loyalty_member: { points: 10, description: 'AccuDefend loyalty program member' },
    direct_booking: { points: 5, description: 'Booked directly with hotel' },
    local_card: { points: 3, description: 'Card issued in same country' }
  },
  negative: {
    foreign_card: { points: -8, description: 'Card issued in different country' },
    no_show_history: { points: -15, description: 'Previous no-show record' },
    missing_signature: { points: -20, description: 'No signature on file' },
    short_stay: { points: -3, description: 'Stay duration < 1 night' },
    same_day_booking: { points: -5, description: 'Booked on same day' },
    third_party_booking: { points: -10, description: 'Booked via OTA' },
    disputed_before: { points: -15, description: 'Guest has prior disputes' },
    high_value: { points: -5, description: 'Transaction >$1000' },
    weekend_only: { points: -3, description: 'Weekend-only stay pattern' }
  }
};

// =============================================================================
// ANALYSIS FUNCTIONS
// =============================================================================

/**
 * Calculate evidence completeness score
 */
function calculateEvidenceScore(evidence) {
  let totalWeight = 0;
  const evidenceTypes = new Set(evidence.map(e => e.type));

  for (const [type, weight] of Object.entries(EVIDENCE_WEIGHTS)) {
    if (evidenceTypes.has(type)) {
      totalWeight += weight;
    }
  }

  return Math.min(totalWeight, 100);
}

/**
 * Get reason code base win rate
 */
function getReasonCodeWinRate(reasonCode) {
  const codeInfo = REASON_CODE_WIN_RATES[reasonCode] || REASON_CODE_WIN_RATES['default'];
  return codeInfo;
}

/**
 * Detect fraud indicators from chargeback data
 */
function detectFraudIndicators(chargeback, evidence) {
  const detected = {
    positive: [],
    negative: []
  };

  // Check stay duration
  const stayDuration = Math.ceil(
    (new Date(chargeback.checkOutDate) - new Date(chargeback.checkInDate)) / (1000 * 60 * 60 * 24)
  );

  if (stayDuration >= 3) {
    detected.positive.push('long_stay');
  } else if (stayDuration < 1) {
    detected.negative.push('short_stay');
  }

  // Check for ID scan
  const hasIdScan = evidence.some(e => e.type === 'ID_SCAN' && e.verified);
  if (hasIdScan) {
    detected.positive.push('matching_id');
  }

  // Check for signatures
  const hasSignature = evidence.some(e =>
    e.type === 'AUTH_SIGNATURE' || e.type === 'CHECKOUT_SIGNATURE'
  );
  if (!hasSignature) {
    detected.negative.push('missing_signature');
  }

  // Check transaction amount
  if (parseFloat(chargeback.amount) > 1000) {
    detected.negative.push('high_value');
  }

  // Check booking timing (if confirmation number pattern suggests same-day)
  const bookingDate = new Date(chargeback.createdAt);
  const checkInDate = new Date(chargeback.checkInDate);
  const daysInAdvance = Math.ceil((checkInDate - bookingDate) / (1000 * 60 * 60 * 24));

  if (daysInAdvance > 7) {
    detected.positive.push('advance_booking');
  } else if (daysInAdvance === 0) {
    detected.negative.push('same_day_booking');
  }

  return detected;
}

/**
 * Calculate fraud indicator score adjustment
 */
function calculateIndicatorScore(indicators) {
  let adjustment = 0;

  for (const indicator of indicators.positive) {
    const info = FRAUD_INDICATORS.positive[indicator];
    if (info) {
      adjustment += info.points;
    }
  }

  for (const indicator of indicators.negative) {
    const info = FRAUD_INDICATORS.negative[indicator];
    if (info) {
      adjustment += info.points; // Already negative
    }
  }

  return adjustment;
}

/**
 * Determine recommendation based on confidence score
 */
function determineRecommendation(confidenceScore) {
  if (confidenceScore >= 85) {
    return 'AUTO_SUBMIT';
  } else if (confidenceScore >= 70) {
    return 'REVIEW_RECOMMENDED';
  } else if (confidenceScore >= 50) {
    return 'GATHER_MORE_EVIDENCE';
  } else {
    return 'UNLIKELY_TO_WIN';
  }
}

/**
 * Generate detailed analysis report
 */
function generateAnalysisReport(components) {
  return {
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    engine: 'AccuDefend Fraud Detection Engine',
    components: {
      reasonCodeAnalysis: {
        code: components.reasonCode,
        category: components.reasonCodeInfo.category,
        network: components.reasonCodeInfo.network,
        baseWinRate: Math.round(components.reasonCodeInfo.winRate * 100),
        contribution: Math.round(components.reasonCodeInfo.winRate * 40)
      },
      evidenceAnalysis: {
        score: components.evidenceScore,
        maxPossible: 100,
        contribution: Math.round(components.evidenceScore * 0.35),
        missingCritical: components.missingEvidence
      },
      fraudIndicators: {
        positive: components.indicators.positive.map(i => ({
          indicator: i,
          ...FRAUD_INDICATORS.positive[i]
        })),
        negative: components.indicators.negative.map(i => ({
          indicator: i,
          ...FRAUD_INDICATORS.negative[i]
        })),
        netAdjustment: components.indicatorScore
      }
    },
    scoring: {
      reasonCodeBase: Math.round(components.reasonCodeInfo.winRate * 40),
      evidenceBonus: Math.round(components.evidenceScore * 0.35),
      indicatorAdjustment: components.indicatorScore,
      finalScore: components.finalScore
    }
  };
}

// =============================================================================
// MAIN ANALYSIS FUNCTION
// =============================================================================

/**
 * Analyze a chargeback and calculate confidence score
 * @param {string} chargebackId - The chargeback ID to analyze
 * @returns {Object} Analysis results with confidence score and recommendation
 */
async function analyzeChargeback(chargebackId) {
  try {
    // Fetch chargeback with evidence
    const chargeback = await prisma.chargeback.findUnique({
      where: { id: chargebackId },
      include: {
        evidence: true,
        property: true,
        provider: true
      }
    });

    if (!chargeback) {
      throw new Error(`Chargeback not found: ${chargebackId}`);
    }

    logger.info(`AccuDefend Fraud Detection: Analyzing case ${chargeback.caseNumber}`);

    // 1. Get reason code base win rate (40% weight)
    const reasonCodeInfo = getReasonCodeWinRate(chargeback.reasonCode);
    const reasonCodeScore = reasonCodeInfo.winRate * 40;

    // 2. Calculate evidence score (35% weight)
    const evidenceScore = calculateEvidenceScore(chargeback.evidence);
    const evidenceContribution = evidenceScore * 0.35;

    // Identify missing critical evidence
    const presentTypes = new Set(chargeback.evidence.map(e => e.type));
    const criticalTypes = ['ID_SCAN', 'AUTH_SIGNATURE', 'FOLIO'];
    const missingEvidence = criticalTypes.filter(t => !presentTypes.has(t));

    // 3. Detect and score fraud indicators (25% weight, adjustment)
    const indicators = detectFraudIndicators(chargeback, chargeback.evidence);
    const indicatorScore = calculateIndicatorScore(indicators);

    // 4. Calculate final confidence score
    let finalScore = reasonCodeScore + evidenceContribution + indicatorScore;
    finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

    // 5. Determine recommendation
    const recommendation = determineRecommendation(finalScore);

    // 6. Generate detailed report
    const analysisReport = generateAnalysisReport({
      reasonCode: chargeback.reasonCode,
      reasonCodeInfo,
      evidenceScore,
      missingEvidence,
      indicators,
      indicatorScore,
      finalScore
    });

    // 7. Update chargeback with analysis results
    const updatedChargeback = await prisma.chargeback.update({
      where: { id: chargebackId },
      data: {
        confidenceScore: finalScore,
        fraudIndicators: indicators,
        recommendation,
        aiAnalysis: analysisReport
      }
    });

    // 8. Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId,
        eventType: 'AI',
        title: 'AI Analysis Complete',
        description: `Confidence: ${finalScore}%. Recommendation: ${recommendation.replace(/_/g, ' ')}`,
        metadata: {
          confidenceScore: finalScore,
          recommendation,
          evidenceScore,
          reasonCodeWinRate: Math.round(reasonCodeInfo.winRate * 100)
        }
      }
    });

    logger.info(`AccuDefend Fraud Detection: Case ${chargeback.caseNumber} - Score: ${finalScore}, Recommendation: ${recommendation}`);

    return {
      chargebackId,
      caseNumber: chargeback.caseNumber,
      confidenceScore: finalScore,
      recommendation,
      analysis: analysisReport
    };

  } catch (error) {
    logger.error(`AccuDefend Fraud Detection Error: ${error.message}`, { chargebackId });
    throw error;
  }
}

/**
 * Batch analyze multiple chargebacks
 */
async function analyzeMultiple(chargebackIds) {
  const results = [];

  for (const id of chargebackIds) {
    try {
      const result = await analyzeChargeback(id);
      results.push(result);
    } catch (error) {
      results.push({
        chargebackId: id,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Re-analyze all pending chargebacks
 */
async function reanalyzeAllPending() {
  const pending = await prisma.chargeback.findMany({
    where: {
      status: { in: ['PENDING', 'IN_REVIEW'] }
    },
    select: { id: true }
  });

  return analyzeMultiple(pending.map(c => c.id));
}

/**
 * Get risk assessment summary for a property's cases
 * @param {Array} cases - Array of chargeback objects (must have confidenceScore)
 * @returns {Object|null} Property risk summary
 */
function getPropertyRiskSummary(cases) {
  const total = cases.length;
  if (total === 0) return null;

  const byRisk = { LOW: 0, MEDIUM: 0, HIGH: 0 };

  for (const c of cases) {
    const score = c.confidenceScore || 0;
    if (score >= 75) byRisk.LOW++;
    else if (score >= 50) byRisk.MEDIUM++;
    else byRisk.HIGH++;
  }

  const avgConfidence = cases.reduce((sum, c) => sum + (c.confidenceScore || 0), 0) / total;

  return {
    totalCases: total,
    byRiskLevel: byRisk,
    averageConfidence: Math.round(avgConfidence),
    highRiskPercentage: total > 0 ? Math.round((byRisk.HIGH / total) * 100) : 0,
  };
}

module.exports = {
  analyzeChargeback,
  analyzeMultiple,
  reanalyzeAllPending,
  getPropertyRiskSummary,
  REASON_CODE_WIN_RATES,
  EVIDENCE_WEIGHTS,
  FRAUD_INDICATORS
};
