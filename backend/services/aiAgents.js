/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * AI Agents Service
 * Manages AI agents that automate backlog management, code review, and other tasks
 */

const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const backlogService = require('./backlog');

const prisma = new PrismaClient();

// =============================================================================
// AI AGENT CONFIGURATIONS
// =============================================================================

const AGENT_CONFIGS = {
  BACKLOG_MANAGER: {
    name: 'Backlog Manager',
    description: 'Creates, prioritizes, and manages backlog items based on system analysis',
    capabilities: [
      'create_backlog_item',
      'update_backlog_item',
      'prioritize_items',
      'suggest_estimates',
      'identify_dependencies',
      'generate_acceptance_criteria'
    ],
    schedule: '0 9 * * 1-5', // 9 AM weekdays
    defaultPrompt: `You are an AI assistant helping manage a software development backlog for AccuDefend, a hotel chargeback defense system. Your role is to:
1. Analyze system logs, errors, and performance metrics to identify issues
2. Create well-structured backlog items with clear descriptions
3. Prioritize items based on business impact and technical urgency
4. Suggest story point estimates based on complexity
5. Identify dependencies between items
6. Generate acceptance criteria for features`
  },

  CODE_REVIEWER: {
    name: 'Code Reviewer',
    description: 'Reviews pull requests and suggests improvements',
    capabilities: [
      'review_pull_request',
      'suggest_improvements',
      'check_security',
      'verify_tests',
      'comment_on_pr'
    ],
    schedule: null, // Event-driven
    defaultPrompt: `You are an AI code reviewer for AccuDefend. Review code changes for:
1. Code quality and best practices
2. Security vulnerabilities
3. Performance issues
4. Test coverage
5. Documentation completeness
Provide constructive feedback with specific suggestions.`
  },

  DOCUMENTATION_AGENT: {
    name: 'Documentation Agent',
    description: 'Generates and updates technical documentation',
    capabilities: [
      'generate_docs',
      'update_readme',
      'create_api_docs',
      'generate_changelog'
    ],
    schedule: '0 0 * * 0', // Weekly on Sunday
    defaultPrompt: `You are an AI documentation specialist for AccuDefend. Your role is to:
1. Keep README files up to date
2. Generate API documentation from code
3. Create changelogs from commits
4. Document architectural decisions
5. Maintain system design documents`
  },

  TEST_GENERATOR: {
    name: 'Test Generator',
    description: 'Creates test cases and improves test coverage',
    capabilities: [
      'generate_unit_tests',
      'generate_integration_tests',
      'identify_untested_code',
      'suggest_edge_cases'
    ],
    schedule: null, // Event-driven
    defaultPrompt: `You are an AI test engineer for AccuDefend. Generate comprehensive test cases that:
1. Cover edge cases and error scenarios
2. Test business logic thoroughly
3. Include integration tests for APIs
4. Verify security controls
5. Test performance under load`
  },

  SECURITY_SCANNER: {
    name: 'Security Scanner',
    description: 'Scans for vulnerabilities and security issues',
    capabilities: [
      'scan_dependencies',
      'check_secrets',
      'analyze_permissions',
      'identify_vulnerabilities',
      'create_security_issues'
    ],
    schedule: '0 2 * * *', // Daily at 2 AM
    defaultPrompt: `You are an AI security analyst for AccuDefend. Scan the codebase for:
1. Vulnerable dependencies
2. Hardcoded secrets or credentials
3. SQL injection risks
4. XSS vulnerabilities
5. Authentication/authorization issues
6. Data exposure risks`
  },

  PERFORMANCE_MONITOR: {
    name: 'Performance Monitor',
    description: 'Monitors and suggests performance optimizations',
    capabilities: [
      'analyze_metrics',
      'identify_bottlenecks',
      'suggest_optimizations',
      'create_performance_issues'
    ],
    schedule: '0 */6 * * *', // Every 6 hours
    defaultPrompt: `You are an AI performance analyst for AccuDefend. Monitor and analyze:
1. API response times
2. Database query performance
3. Memory usage patterns
4. CPU utilization
5. Cache hit rates
Create backlog items for performance improvements.`
  },

  DISPUTE_ANALYZER: {
    name: 'Dispute Analyzer',
    description: 'Analyzes chargeback cases and suggests strategies',
    capabilities: [
      'analyze_dispute',
      'calculate_confidence',
      'suggest_evidence',
      'generate_response'
    ],
    schedule: null, // Event-driven
    defaultPrompt: `You are an AI dispute analyst for AccuDefend. For each chargeback case:
1. Analyze the dispute type and reason code
2. Calculate win probability based on evidence
3. Identify missing evidence
4. Suggest response strategy
5. Generate dispute response documentation`
  },

  EVIDENCE_PROCESSOR: {
    name: 'Evidence Processor',
    description: 'Processes and validates evidence documents',
    capabilities: [
      'ocr_documents',
      'validate_evidence',
      'extract_data',
      'verify_signatures'
    ],
    schedule: null, // Event-driven
    defaultPrompt: `You are an AI evidence processor for AccuDefend. Process uploaded evidence:
1. Extract text using OCR
2. Validate document authenticity
3. Extract key information (dates, amounts, signatures)
4. Flag potential issues
5. Suggest evidence classification`
  }
};

// =============================================================================
// AI AGENT SERVICE
// =============================================================================

class AIAgentService {
  constructor() {
    this.runningAgents = new Map();
  }

  // ---------------------------------------------------------------------------
  // AGENT MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Initialize all agents
   */
  async initializeAgents() {
    for (const [type, config] of Object.entries(AGENT_CONFIGS)) {
      const existing = await prisma.aIAgent.findFirst({
        where: { type }
      });

      if (!existing) {
        await this.createAgent(type, config);
      }
    }

    logger.info('AI Agents initialized');
  }

  /**
   * Create a new agent
   */
  async createAgent(type, customConfig = {}) {
    const baseConfig = AGENT_CONFIGS[type];

    if (!baseConfig) {
      throw new Error(`Unknown agent type: ${type}`);
    }

    const agent = await prisma.aIAgent.create({
      data: {
        name: customConfig.name || baseConfig.name,
        type,
        description: customConfig.description || baseConfig.description,
        status: 'IDLE',
        config: {
          ...baseConfig,
          ...customConfig
        },
        schedule: customConfig.schedule || baseConfig.schedule,
        priority: customConfig.priority || 5,
        capabilities: baseConfig.capabilities,
        modelProvider: customConfig.modelProvider || 'anthropic',
        modelName: customConfig.modelName || 'claude-3-sonnet',
        maxTokens: customConfig.maxTokens || 4096,
        temperature: customConfig.temperature || 0.7
      }
    });

    logger.info(`AI Agent created: ${agent.name} (${agent.type})`);
    return agent;
  }

  /**
   * Get agent by ID
   */
  async getAgent(id) {
    return prisma.aIAgent.findUnique({
      where: { id },
      include: {
        runs: {
          take: 10,
          orderBy: { startedAt: 'desc' }
        },
        _count: {
          select: {
            backlogItems: true,
            comments: true
          }
        }
      }
    });
  }

  /**
   * List all agents
   */
  async listAgents(filters = {}) {
    const where = {};

    if (filters.type) {
      where.type = filters.type;
    }
    if (filters.status) {
      where.status = filters.status;
    }

    return prisma.aIAgent.findMany({
      where,
      include: {
        _count: {
          select: {
            backlogItems: true,
            runs: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Update agent configuration
   */
  async updateAgent(id, updates) {
    const agent = await prisma.aIAgent.update({
      where: { id },
      data: updates
    });

    logger.info(`AI Agent updated: ${agent.name}`);
    return agent;
  }

  /**
   * Enable/disable agent
   */
  async setAgentStatus(id, status) {
    return this.updateAgent(id, { status });
  }

  // ---------------------------------------------------------------------------
  // AGENT EXECUTION
  // ---------------------------------------------------------------------------

  /**
   * Run an agent
   */
  async runAgent(agentId, input = {}, trigger = 'manual') {
    const agent = await prisma.aIAgent.findUnique({ where: { id: agentId } });

    if (!agent) {
      throw new Error('Agent not found');
    }

    if (agent.status === 'DISABLED') {
      throw new Error('Agent is disabled');
    }

    if (agent.status === 'RUNNING') {
      throw new Error('Agent is already running');
    }

    // Create run record
    const run = await prisma.aIAgentRun.create({
      data: {
        agentId,
        status: 'running',
        trigger,
        input
      }
    });

    // Update agent status
    await prisma.aIAgent.update({
      where: { id: agentId },
      data: { status: 'RUNNING' }
    });

    // Execute agent in background
    this.executeAgent(agent, run, input).catch(error => {
      logger.error(`Agent execution failed: ${agent.name}`, error);
    });

    return run;
  }

  /**
   * Execute agent logic
   */
  async executeAgent(agent, run, input) {
    const startTime = Date.now();

    try {
      let output;

      switch (agent.type) {
        case 'BACKLOG_MANAGER':
          output = await this.runBacklogManager(agent, input);
          break;
        case 'CODE_REVIEWER':
          output = await this.runCodeReviewer(agent, input);
          break;
        case 'SECURITY_SCANNER':
          output = await this.runSecurityScanner(agent, input);
          break;
        case 'PERFORMANCE_MONITOR':
          output = await this.runPerformanceMonitor(agent, input);
          break;
        case 'DISPUTE_ANALYZER':
          output = await this.runDisputeAnalyzer(agent, input);
          break;
        case 'EVIDENCE_PROCESSOR':
          output = await this.runEvidenceProcessor(agent, input);
          break;
        default:
          output = { message: 'Agent type not implemented' };
      }

      const durationMs = Date.now() - startTime;

      // Update run record
      await prisma.aIAgentRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          output,
          completedAt: new Date(),
          durationMs,
          tokensUsed: output.tokensUsed || 0
        }
      });

      // Update agent stats
      await prisma.aIAgent.update({
        where: { id: agent.id },
        data: {
          status: 'IDLE',
          totalRuns: { increment: 1 },
          successfulRuns: { increment: 1 },
          lastRunAt: new Date(),
          avgDuration: durationMs
        }
      });

      logger.info(`Agent completed: ${agent.name} (${durationMs}ms)`);
      return output;

    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Update run record with error
      await prisma.aIAgentRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          durationMs,
          errorMessage: error.message,
          errorStack: error.stack
        }
      });

      // Update agent stats
      await prisma.aIAgent.update({
        where: { id: agent.id },
        data: {
          status: 'ERROR',
          totalRuns: { increment: 1 },
          failedRuns: { increment: 1 },
          lastRunAt: new Date(),
          lastErrorAt: new Date(),
          lastError: error.message
        }
      });

      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // AGENT IMPLEMENTATIONS
  // ---------------------------------------------------------------------------

  /**
   * Backlog Manager Agent
   */
  async runBacklogManager(agent, input) {
    const items = [];

    // Analyze system for potential backlog items
    // This would integrate with monitoring, logs, and metrics

    // Example: Create items based on analysis
    if (input.analysis) {
      for (const issue of input.analysis.issues || []) {
        const item = await backlogService.createItem({
          title: issue.title,
          description: issue.description,
          category: issue.category || 'ENHANCEMENT',
          priority: issue.priority || 'MEDIUM',
          storyPoints: issue.estimatedPoints,
          aiGenerated: true,
          aiAgentId: agent.id,
          aiConfidence: issue.confidence || 0.8,
          aiReasoning: issue.reasoning,
          labels: issue.labels || ['ai-generated']
        }, null);

        items.push(item);
      }
    }

    // Re-prioritize existing items
    const existingItems = await backlogService.listItems({
      status: ['OPEN', 'IN_PROGRESS']
    });

    // AI would analyze and suggest priority changes
    const priorityChanges = [];

    return {
      itemsCreated: items.length,
      itemsAnalyzed: existingItems.total,
      priorityChanges: priorityChanges.length,
      items,
      priorityChanges
    };
  }

  /**
   * Code Reviewer Agent
   */
  async runCodeReviewer(agent, input) {
    const { pullRequest } = input;

    if (!pullRequest) {
      return { message: 'No pull request provided' };
    }

    // Analyze code changes
    // This would integrate with GitHub/GitLab API

    const comments = [];
    const suggestions = [];

    // AI analysis would populate these

    return {
      pullRequest: pullRequest.number,
      commentsAdded: comments.length,
      suggestionsAdded: suggestions.length,
      overallScore: 85,
      comments,
      suggestions
    };
  }

  /**
   * Security Scanner Agent
   */
  async runSecurityScanner(agent, input) {
    const issues = [];

    // Scan for security issues
    // This would analyze code, dependencies, and configurations

    // Create backlog items for found issues
    for (const issue of issues) {
      await backlogService.createItem({
        title: `[Security] ${issue.title}`,
        description: issue.description,
        category: 'SECURITY',
        priority: issue.severity === 'critical' ? 'CRITICAL' : 'HIGH',
        aiGenerated: true,
        aiAgentId: agent.id,
        aiConfidence: issue.confidence,
        labels: ['security', 'ai-generated']
      }, null);
    }

    return {
      issuesFound: issues.length,
      criticalIssues: issues.filter(i => i.severity === 'critical').length,
      highIssues: issues.filter(i => i.severity === 'high').length,
      issues
    };
  }

  /**
   * Performance Monitor Agent
   */
  async runPerformanceMonitor(agent, input) {
    const metrics = input.metrics || {};
    const issues = [];

    // Analyze performance metrics
    // This would integrate with monitoring systems

    // Example thresholds
    if (metrics.avgResponseTime > 500) {
      issues.push({
        title: 'High API Response Time',
        description: `Average response time is ${metrics.avgResponseTime}ms (threshold: 500ms)`,
        priority: 'HIGH'
      });
    }

    if (metrics.errorRate > 0.01) {
      issues.push({
        title: 'Elevated Error Rate',
        description: `Error rate is ${(metrics.errorRate * 100).toFixed(2)}% (threshold: 1%)`,
        priority: 'HIGH'
      });
    }

    // Create backlog items
    for (const issue of issues) {
      await backlogService.createItem({
        title: `[Performance] ${issue.title}`,
        description: issue.description,
        category: 'PERFORMANCE',
        priority: issue.priority,
        aiGenerated: true,
        aiAgentId: agent.id,
        labels: ['performance', 'ai-generated']
      }, null);
    }

    return {
      metricsAnalyzed: Object.keys(metrics).length,
      issuesFound: issues.length,
      issues
    };
  }

  /**
   * Dispute Analyzer Agent
   */
  async runDisputeAnalyzer(agent, input) {
    const { chargebackId } = input;

    if (!chargebackId) {
      return { message: 'No chargeback ID provided' };
    }

    // Get chargeback details
    const chargeback = await prisma.chargeback.findUnique({
      where: { id: chargebackId },
      include: {
        evidence: true,
        property: true
      }
    });

    if (!chargeback) {
      return { message: 'Chargeback not found' };
    }

    // AI analysis
    const analysis = {
      confidenceScore: 75,
      missingEvidence: [],
      recommendations: [],
      fraudIndicators: []
    };

    // Update chargeback with analysis
    await prisma.chargeback.update({
      where: { id: chargebackId },
      data: {
        confidenceScore: analysis.confidenceScore,
        aiAnalysis: analysis,
        fraudIndicators: analysis.fraudIndicators
      }
    });

    return {
      chargebackId,
      analysis
    };
  }

  /**
   * Evidence Processor Agent
   */
  async runEvidenceProcessor(agent, input) {
    const { evidenceId } = input;

    if (!evidenceId) {
      return { message: 'No evidence ID provided' };
    }

    // Get evidence details
    const evidence = await prisma.evidence.findUnique({
      where: { id: evidenceId }
    });

    if (!evidence) {
      return { message: 'Evidence not found' };
    }

    // Process evidence (OCR, validation, etc.)
    const processing = {
      extractedText: '',
      extractedData: {},
      validationResult: 'valid',
      confidence: 0.95
    };

    // Update evidence with extracted data
    await prisma.evidence.update({
      where: { id: evidenceId },
      data: {
        extractedText: processing.extractedText,
        verified: processing.validationResult === 'valid',
        verifiedAt: new Date()
      }
    });

    return {
      evidenceId,
      processing
    };
  }

  // ---------------------------------------------------------------------------
  // RUN HISTORY
  // ---------------------------------------------------------------------------

  /**
   * Get agent runs
   */
  async getAgentRuns(agentId, filters = {}) {
    const where = { agentId };

    if (filters.status) {
      where.status = filters.status;
    }

    return prisma.aIAgentRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: filters.limit || 50
    });
  }

  /**
   * Get run details
   */
  async getRunDetails(runId) {
    return prisma.aIAgentRun.findUnique({
      where: { id: runId },
      include: {
        agent: true
      }
    });
  }

  // ---------------------------------------------------------------------------
  // STATISTICS
  // ---------------------------------------------------------------------------

  /**
   * Get agent statistics
   */
  async getStatistics() {
    const agents = await prisma.aIAgent.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        totalRuns: true,
        successfulRuns: true,
        failedRuns: true,
        avgDuration: true,
        lastRunAt: true,
        _count: {
          select: {
            backlogItems: true
          }
        }
      }
    });

    const totalRuns = agents.reduce((sum, a) => sum + a.totalRuns, 0);
    const successfulRuns = agents.reduce((sum, a) => sum + a.successfulRuns, 0);
    const itemsCreated = agents.reduce((sum, a) => sum + a._count.backlogItems, 0);

    return {
      agents: agents.length,
      totalRuns,
      successfulRuns,
      failedRuns: totalRuns - successfulRuns,
      successRate: totalRuns > 0 ? ((successfulRuns / totalRuns) * 100).toFixed(1) : 0,
      itemsCreated,
      agentDetails: agents
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  AIAgentService: new AIAgentService(),
  AGENT_CONFIGS
};
