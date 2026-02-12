/**
 * AccuDefend - AI Defense Configuration Service
 * Manages AI model settings, confidence thresholds, and defense strategies
 */

const crypto = require('crypto');

// Default AI Configuration
const DEFAULT_AI_CONFIG = {
  // Model Settings
  model: {
    provider: 'openai',
    name: 'gpt-4-turbo',
    temperature: 0.3,
    maxTokens: 4096,
    timeout: 30000
  },

  // Confidence Thresholds
  thresholds: {
    autoSubmit: 85,           // Auto-submit defense if confidence >= 85%
    reviewRecommended: 70,    // Recommend human review if 70-84%
    gatherMoreEvidence: 50,   // Request more evidence if 50-69%
    unlikelyToWin: 0          // Below 50% - unlikely to win
  },

  // Evidence Weights (total should equal 100)
  evidenceWeights: {
    ID_SCAN: 18,
    AUTH_SIGNATURE: 18,
    CHECKOUT_SIGNATURE: 12,
    FOLIO: 14,
    KEY_CARD_LOG: 8,
    CORRESPONDENCE: 8,
    CCTV_FOOTAGE: 4,
    CANCELLATION_POLICY: 4,
    POLICE_REPORT: 8,
    NO_SHOW_DOCUMENTATION: 6
  },

  // Fraud Detection Settings
  fraudDetection: {
    enabled: true,
    riskFactors: {
      foreignCard: { weight: 15, description: 'Card issued in different country than guest' },
      firstTimeGuest: { weight: 10, description: 'No prior stay history' },
      shortNotice: { weight: 10, description: 'Booking made within 24 hours of check-in' },
      highValue: { weight: 10, description: 'Transaction amount > $1000' },
      missingID: { weight: 25, description: 'No ID scan on file' },
      noSignature: { weight: 20, description: 'Missing authorization signature' },
      emailMismatch: { weight: 10, description: 'Booking email differs from card email' }
    },
    trustFactors: {
      repeatGuest: { weight: -15, description: 'Guest has stayed before' },
      loyaltyMember: { weight: -10, description: 'Enrolled in loyalty program' },
      corporateBooking: { weight: -10, description: 'Corporate account booking' },
      longStay: { weight: -5, description: 'Stay duration > 3 nights' },
      matchingID: { weight: -20, description: 'ID matches card holder name' },
      verifiedEmail: { weight: -5, description: 'Email verified via confirmation' }
    }
  },

  // Defense Strategy Templates
  defenseStrategies: {
    FRAUD_CLAIM: {
      name: 'Fraud Claim Defense',
      requiredEvidence: ['ID_SCAN', 'AUTH_SIGNATURE'],
      recommendedEvidence: ['FOLIO', 'KEY_CARD_LOG', 'CCTV_FOOTAGE'],
      responseTemplate: 'fraud_defense',
      priority: 1
    },
    SERVICE_NOT_RECEIVED: {
      name: 'Service Not Received Defense',
      requiredEvidence: ['FOLIO', 'KEY_CARD_LOG'],
      recommendedEvidence: ['CHECKOUT_SIGNATURE', 'CORRESPONDENCE'],
      responseTemplate: 'service_defense',
      priority: 2
    },
    NOT_AS_DESCRIBED: {
      name: 'Not As Described Defense',
      requiredEvidence: ['FOLIO', 'CORRESPONDENCE'],
      recommendedEvidence: ['CANCELLATION_POLICY'],
      responseTemplate: 'description_defense',
      priority: 3
    },
    DUPLICATE_CHARGE: {
      name: 'Duplicate Charge Defense',
      requiredEvidence: ['FOLIO'],
      recommendedEvidence: ['CORRESPONDENCE'],
      responseTemplate: 'duplicate_defense',
      priority: 4
    },
    CANCELLED_RESERVATION: {
      name: 'Cancelled Reservation Defense',
      requiredEvidence: ['CANCELLATION_POLICY', 'CORRESPONDENCE'],
      recommendedEvidence: ['FOLIO', 'NO_SHOW_DOCUMENTATION'],
      responseTemplate: 'cancellation_defense',
      priority: 5
    },
    NO_SHOW: {
      name: 'No Show Defense',
      requiredEvidence: ['CANCELLATION_POLICY', 'NO_SHOW_DOCUMENTATION', 'FOLIO'],
      recommendedEvidence: ['CORRESPONDENCE', 'RESERVATION_CONFIRMATION'],
      responseTemplate: 'no_show_defense',
      priority: 6
    },
    GUEST_BEHAVIOR_ABUSE: {
      name: 'Guest Behavior/Abuse Defense',
      requiredEvidence: ['FOLIO', 'INCIDENT_REPORT'],
      recommendedEvidence: ['POLICE_REPORT', 'CCTV_FOOTAGE', 'DAMAGE_PHOTOS', 'CORRESPONDENCE'],
      responseTemplate: 'behavior_abuse_defense',
      priority: 7
    },
    IDENTITY_FRAUD: {
      name: 'Identity Fraud Defense',
      requiredEvidence: ['ID_SCAN', 'AUTH_SIGNATURE', 'CCTV_FOOTAGE'],
      recommendedEvidence: ['FOLIO', 'KEY_CARD_LOG', 'POLICE_REPORT'],
      responseTemplate: 'identity_fraud_defense',
      priority: 8
    }
  },

  // Reason Code Mappings
  reasonCodeMappings: {
    // Visa reason codes
    '10.1': { category: 'FRAUD_CLAIM', network: 'Visa', description: 'EMV Liability Shift - Counterfeit' },
    '10.2': { category: 'FRAUD_CLAIM', network: 'Visa', description: 'EMV Liability Shift - Non-Counterfeit' },
    '10.3': { category: 'FRAUD_CLAIM', network: 'Visa', description: 'Other Fraud - Card Present' },
    '10.4': { category: 'FRAUD_CLAIM', network: 'Visa', description: 'Other Fraud - Card Absent' },
    '10.5': { category: 'FRAUD_CLAIM', network: 'Visa', description: 'Visa Fraud Monitoring Program' },
    '13.1': { category: 'SERVICE_NOT_RECEIVED', network: 'Visa', description: 'Merchandise/Services Not Received' },
    '13.2': { category: 'CANCELLED_RESERVATION', network: 'Visa', description: 'Cancelled Recurring Transaction' },
    '13.3': { category: 'NOT_AS_DESCRIBED', network: 'Visa', description: 'Not as Described or Defective' },
    '13.6': { category: 'DUPLICATE_CHARGE', network: 'Visa', description: 'Credit Not Processed' },
    '13.7': { category: 'DUPLICATE_CHARGE', network: 'Visa', description: 'Cancelled Merchandise/Services' },

    // Mastercard reason codes
    '4837': { category: 'FRAUD_CLAIM', network: 'Mastercard', description: 'No Cardholder Authorization' },
    '4849': { category: 'FRAUD_CLAIM', network: 'Mastercard', description: 'Questionable Merchant Activity' },
    '4863': { category: 'FRAUD_CLAIM', network: 'Mastercard', description: 'Cardholder Does Not Recognize' },
    '4855': { category: 'SERVICE_NOT_RECEIVED', network: 'Mastercard', description: 'Non-Receipt of Merchandise' },
    '4853': { category: 'NOT_AS_DESCRIBED', network: 'Mastercard', description: 'Cardholder Dispute' },

    // Amex reason codes
    'A01': { category: 'DUPLICATE_CHARGE', network: 'Amex', description: 'Charge Amount Exceeds Authorization' },
    'A02': { category: 'FRAUD_CLAIM', network: 'Amex', description: 'No Valid Authorization' },
    'A08': { category: 'DUPLICATE_CHARGE', network: 'Amex', description: 'Authorization Approval Expired' },
    'C02': { category: 'DUPLICATE_CHARGE', network: 'Amex', description: 'Credit Not Processed' },
    'C04': { category: 'SERVICE_NOT_RECEIVED', network: 'Amex', description: 'Goods/Services Returned or Refused' },
    'C05': { category: 'CANCELLED_RESERVATION', network: 'Amex', description: 'Goods/Services Cancelled' },
    'C08': { category: 'SERVICE_NOT_RECEIVED', network: 'Amex', description: 'Goods/Services Not Received' },
    'C14': { category: 'NOT_AS_DESCRIBED', network: 'Amex', description: 'Paid by Other Means' },
    'C18': { category: 'CANCELLED_RESERVATION', network: 'Amex', description: 'No Show or CancellationPolicy Dispute' },
    'F10': { category: 'FRAUD_CLAIM', network: 'Amex', description: 'Missing Imprint' },
    'F14': { category: 'FRAUD_CLAIM', network: 'Amex', description: 'Missing Signature' },
    'F24': { category: 'FRAUD_CLAIM', network: 'Amex', description: 'No Cardholder Authorization' },
    'F29': { category: 'FRAUD_CLAIM', network: 'Amex', description: 'Card Not Present' }
  },

  // Auto-Response Settings
  autoResponse: {
    enabled: false,
    minConfidence: 90,
    excludeHighValue: true,
    highValueThreshold: 2000,
    requireApproval: ['FRAUD_CLAIM'],
    notifyOnAutoSubmit: true
  },

  // Notification Settings
  notifications: {
    emailEnabled: true,
    slackEnabled: false,
    webhookEnabled: false,
    urgentThresholdDays: 7,
    criticalThresholdDays: 3,
    recipients: {
      newCase: ['manager'],
      urgentCase: ['manager', 'admin'],
      criticalCase: ['manager', 'admin', 'staff'],
      caseResolved: ['manager']
    }
  },

  // Analytics Settings
  analytics: {
    trackWinRate: true,
    trackResponseTime: true,
    trackEvidenceEffectiveness: true,
    reportingPeriod: 'monthly',
    benchmarkComparison: true
  }
};

class AIDefenseConfigService {
  constructor(prisma) {
    this.prisma = prisma;
    this.configCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get AI configuration for a property
   */
  async getConfig(propertyId = 'global') {
    const cacheKey = `config_${propertyId}`;
    const cached = this.configCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.config;
    }

    try {
      // Try to get property-specific config
      let config = await this.prisma.systemConfig.findUnique({
        where: { key: `ai_config_${propertyId}` }
      });

      // Fall back to global config
      if (!config && propertyId !== 'global') {
        config = await this.prisma.systemConfig.findUnique({
          where: { key: 'ai_config_global' }
        });
      }

      const finalConfig = config?.value || DEFAULT_AI_CONFIG;

      this.configCache.set(cacheKey, {
        config: finalConfig,
        timestamp: Date.now()
      });

      return finalConfig;
    } catch (error) {
      console.error('Error fetching AI config:', error);
      return DEFAULT_AI_CONFIG;
    }
  }

  /**
   * Update AI configuration
   */
  async updateConfig(propertyId = 'global', updates) {
    const currentConfig = await this.getConfig(propertyId);
    const newConfig = this.deepMerge(currentConfig, updates);

    await this.prisma.systemConfig.upsert({
      where: { key: `ai_config_${propertyId}` },
      update: { value: newConfig },
      create: {
        key: `ai_config_${propertyId}`,
        value: newConfig,
        description: `AI Defense configuration for ${propertyId}`
      }
    });

    // Clear cache
    this.configCache.delete(`config_${propertyId}`);

    return newConfig;
  }

  /**
   * Calculate confidence score for a case
   */
  async calculateConfidence(caseData, evidenceList) {
    const config = await this.getConfig(caseData.propertyId);
    let score = 0;
    let maxPossible = 0;

    // Calculate evidence score
    for (const [type, weight] of Object.entries(config.evidenceWeights)) {
      maxPossible += weight;
      if (evidenceList.some(e => e.type === type)) {
        score += weight;
      }
    }

    // Normalize to percentage
    let confidence = Math.round((score / maxPossible) * 100);

    // Apply fraud detection adjustments
    if (config.fraudDetection.enabled) {
      const fraudAdjustment = this.calculateFraudAdjustment(caseData, config);
      confidence = Math.max(0, Math.min(100, confidence + fraudAdjustment));
    }

    return {
      score: confidence,
      recommendation: this.getRecommendation(confidence, config),
      evidenceScore: score,
      maxPossible,
      fraudAdjustment: config.fraudDetection.enabled ? this.calculateFraudAdjustment(caseData, config) : 0
    };
  }

  /**
   * Calculate fraud adjustment based on risk/trust factors
   */
  calculateFraudAdjustment(caseData, config) {
    let adjustment = 0;

    // Apply risk factors
    for (const [factor, settings] of Object.entries(config.fraudDetection.riskFactors)) {
      if (caseData.fraudIndicators?.negative?.includes(factor)) {
        adjustment -= settings.weight;
      }
    }

    // Apply trust factors
    for (const [factor, settings] of Object.entries(config.fraudDetection.trustFactors)) {
      if (caseData.fraudIndicators?.positive?.includes(factor)) {
        adjustment -= settings.weight; // Negative weight means positive effect
      }
    }

    return adjustment;
  }

  /**
   * Get recommendation based on confidence score
   */
  getRecommendation(confidence, config) {
    const { thresholds } = config;

    if (confidence >= thresholds.autoSubmit) {
      return 'AUTO_SUBMIT';
    } else if (confidence >= thresholds.reviewRecommended) {
      return 'REVIEW_RECOMMENDED';
    } else if (confidence >= thresholds.gatherMoreEvidence) {
      return 'GATHER_MORE_EVIDENCE';
    } else {
      return 'UNLIKELY_TO_WIN';
    }
  }

  /**
   * Get defense strategy for a reason code
   */
  async getDefenseStrategy(reasonCode, propertyId) {
    const config = await this.getConfig(propertyId);
    const mapping = config.reasonCodeMappings[reasonCode];

    if (!mapping) {
      return {
        category: 'UNKNOWN',
        strategy: null,
        message: `Unknown reason code: ${reasonCode}`
      };
    }

    const strategy = config.defenseStrategies[mapping.category];

    return {
      category: mapping.category,
      network: mapping.network,
      description: mapping.description,
      strategy: {
        name: strategy.name,
        requiredEvidence: strategy.requiredEvidence,
        recommendedEvidence: strategy.recommendedEvidence,
        responseTemplate: strategy.responseTemplate,
        priority: strategy.priority
      }
    };
  }

  /**
   * Check if case qualifies for auto-response
   */
  async canAutoRespond(caseData, confidence) {
    const config = await this.getConfig(caseData.propertyId);
    const { autoResponse } = config;

    if (!autoResponse.enabled) {
      return { canAutoRespond: false, reason: 'Auto-response is disabled' };
    }

    if (confidence < autoResponse.minConfidence) {
      return { canAutoRespond: false, reason: `Confidence ${confidence}% below threshold ${autoResponse.minConfidence}%` };
    }

    if (autoResponse.excludeHighValue && caseData.amount > autoResponse.highValueThreshold) {
      return { canAutoRespond: false, reason: `Amount $${caseData.amount} exceeds high-value threshold` };
    }

    const mapping = config.reasonCodeMappings[caseData.reasonCode];
    if (mapping && autoResponse.requireApproval.includes(mapping.category)) {
      return { canAutoRespond: false, reason: `Category ${mapping.category} requires manual approval` };
    }

    return { canAutoRespond: true, reason: 'All criteria met for auto-response' };
  }

  /**
   * Generate AI analysis for a case
   */
  async analyzeCase(caseData, evidenceList) {
    const config = await this.getConfig(caseData.propertyId);

    // Calculate confidence
    const confidenceResult = await this.calculateConfidence(caseData, evidenceList);

    // Get defense strategy
    const defenseStrategy = await this.getDefenseStrategy(caseData.reasonCode, caseData.propertyId);

    // Check missing evidence
    const missingRequired = defenseStrategy.strategy?.requiredEvidence?.filter(
      type => !evidenceList.some(e => e.type === type)
    ) || [];

    const missingRecommended = defenseStrategy.strategy?.recommendedEvidence?.filter(
      type => !evidenceList.some(e => e.type === type)
    ) || [];

    // Check auto-response eligibility
    const autoResponseCheck = await this.canAutoRespond(caseData, confidenceResult.score);

    return {
      caseId: caseData.id,
      analyzedAt: new Date().toISOString(),
      confidence: confidenceResult,
      defenseStrategy,
      missingEvidence: {
        required: missingRequired,
        recommended: missingRecommended
      },
      autoResponse: autoResponseCheck,
      recommendations: this.generateRecommendations(confidenceResult, missingRequired, missingRecommended),
      riskAssessment: this.assessRisk(caseData, config)
    };
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations(confidenceResult, missingRequired, missingRecommended) {
    const recommendations = [];

    if (missingRequired.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        action: 'UPLOAD_EVIDENCE',
        message: `Upload required evidence: ${missingRequired.join(', ')}`,
        impact: '+15-25% confidence'
      });
    }

    if (missingRecommended.length > 0 && confidenceResult.score < 85) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'UPLOAD_EVIDENCE',
        message: `Consider uploading: ${missingRecommended.join(', ')}`,
        impact: '+5-15% confidence'
      });
    }

    if (confidenceResult.recommendation === 'AUTO_SUBMIT') {
      recommendations.push({
        priority: 'LOW',
        action: 'SUBMIT',
        message: 'Case is ready for submission with high confidence',
        impact: 'Estimated 85%+ win probability'
      });
    }

    return recommendations;
  }

  /**
   * Assess case risk level
   */
  assessRisk(caseData, config) {
    const daysUntilDue = Math.ceil((new Date(caseData.dueDate) - new Date()) / (1000 * 60 * 60 * 24));

    let riskLevel = 'LOW';
    const factors = [];

    if (daysUntilDue <= config.notifications.criticalThresholdDays) {
      riskLevel = 'CRITICAL';
      factors.push(`Due in ${daysUntilDue} days`);
    } else if (daysUntilDue <= config.notifications.urgentThresholdDays) {
      riskLevel = 'HIGH';
      factors.push(`Due in ${daysUntilDue} days`);
    }

    if (caseData.amount > 1000) {
      if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
      factors.push(`High value: $${caseData.amount}`);
    }

    return {
      level: riskLevel,
      factors,
      daysUntilDue
    };
  }

  /**
   * Deep merge helper
   */
  deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] instanceof Object && key in target) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  /**
   * Get default configuration
   */
  getDefaultConfig() {
    return { ...DEFAULT_AI_CONFIG };
  }

  /**
   * Validate configuration
   */
  validateConfig(config) {
    const errors = [];

    // Validate thresholds
    if (config.thresholds) {
      if (config.thresholds.autoSubmit <= config.thresholds.reviewRecommended) {
        errors.push('autoSubmit threshold must be greater than reviewRecommended');
      }
      if (config.thresholds.reviewRecommended <= config.thresholds.gatherMoreEvidence) {
        errors.push('reviewRecommended threshold must be greater than gatherMoreEvidence');
      }
    }

    // Validate evidence weights sum to 100
    if (config.evidenceWeights) {
      const sum = Object.values(config.evidenceWeights).reduce((a, b) => a + b, 0);
      if (sum !== 100) {
        errors.push(`Evidence weights must sum to 100 (current: ${sum})`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = { AIDefenseConfigService, DEFAULT_AI_CONFIG };
