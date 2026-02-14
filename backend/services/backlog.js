/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Technical Backlog Service
 * Manages technical backlog items, epics, sprints, and dependencies
 */

const { prisma } = require('../config/database');
const logger = require('../utils/logger');

// =============================================================================
// BACKLOG SERVICE
// =============================================================================

class BacklogService {
  // ---------------------------------------------------------------------------
  // BACKLOG ITEMS
  // ---------------------------------------------------------------------------

  /**
   * Create a new backlog item
   */
  async createItem(data, createdById) {
    const item = await prisma.backlogItem.create({
      data: {
        title: data.title,
        description: data.description,
        status: data.status || 'OPEN',
        priority: data.priority || 'MEDIUM',
        category: data.category,
        storyPoints: data.storyPoints,
        epicId: data.epicId,
        sprintId: data.sprintId,
        assigneeId: data.assigneeId,
        createdById,
        aiGenerated: data.aiGenerated || false,
        aiAgentId: data.aiAgentId,
        aiConfidence: data.aiConfidence,
        aiReasoning: data.aiReasoning,
        acceptanceCriteria: data.acceptanceCriteria,
        technicalNotes: data.technicalNotes,
        labels: data.labels || [],
        estimatedHours: data.estimatedHours,
        dueDate: data.dueDate
      },
      include: {
        epic: true,
        sprint: true,
        assignee: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        aiAgent: true
      }
    });

    // Log activity
    await this.logActivity(item.id, 'created', null, null, null, createdById);

    logger.info(`Backlog item created: ${item.id} - ${item.title}`);
    return item;
  }

  /**
   * Get backlog item by ID
   */
  async getItem(id) {
    return prisma.backlogItem.findUnique({
      where: { id },
      include: {
        epic: true,
        sprint: true,
        assignee: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        aiAgent: true,
        comments: {
          include: {
            aiAgent: true
          },
          orderBy: { createdAt: 'desc' }
        },
        dependencies: {
          include: {
            blockingItem: {
              select: { id: true, title: true, status: true }
            }
          }
        },
        blockedBy: {
          include: {
            dependentItem: {
              select: { id: true, title: true, status: true }
            }
          }
        },
        activities: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            aiAgent: true
          }
        },
        attachments: true
      }
    });
  }

  /**
   * List backlog items with filters
   */
  async listItems(filters = {}) {
    const where = {};

    if (filters.status) {
      where.status = Array.isArray(filters.status) ? { in: filters.status } : filters.status;
    }
    if (filters.priority) {
      where.priority = Array.isArray(filters.priority) ? { in: filters.priority } : filters.priority;
    }
    if (filters.category) {
      where.category = Array.isArray(filters.category) ? { in: filters.category } : filters.category;
    }
    if (filters.epicId) {
      where.epicId = filters.epicId;
    }
    if (filters.sprintId) {
      where.sprintId = filters.sprintId;
    }
    if (filters.assigneeId) {
      where.assigneeId = filters.assigneeId;
    }
    if (filters.aiGenerated !== undefined) {
      where.aiGenerated = filters.aiGenerated;
    }
    if (filters.labels && filters.labels.length > 0) {
      where.labels = { hasSome: filters.labels };
    }
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    const [items, total] = await Promise.all([
      prisma.backlogItem.findMany({
        where,
        include: {
          epic: { select: { id: true, title: true } },
          sprint: { select: { id: true, name: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
          aiAgent: { select: { id: true, name: true, type: true } },
          _count: { select: { comments: true, attachments: true } }
        },
        orderBy: [
          { priority: 'asc' },
          { createdAt: 'desc' }
        ],
        skip: filters.offset || 0,
        take: filters.limit || 50
      }),
      prisma.backlogItem.count({ where })
    ]);

    return { items, total };
  }

  /**
   * Update backlog item
   */
  async updateItem(id, updates, userId = null, aiAgentId = null) {
    const currentItem = await prisma.backlogItem.findUnique({ where: { id } });

    if (!currentItem) {
      throw new Error('Backlog item not found');
    }

    // Track changes for activity log
    const changes = [];
    for (const [key, value] of Object.entries(updates)) {
      if (currentItem[key] !== value) {
        changes.push({
          field: key,
          oldValue: String(currentItem[key]),
          newValue: String(value)
        });
      }
    }

    const item = await prisma.backlogItem.update({
      where: { id },
      data: {
        ...updates,
        completedAt: updates.status === 'DONE' && !currentItem.completedAt ? new Date() : currentItem.completedAt
      },
      include: {
        epic: true,
        sprint: true,
        assignee: {
          select: { id: true, firstName: true, lastName: true, email: true }
        }
      }
    });

    // Log activities for each change
    for (const change of changes) {
      await this.logActivity(id, 'updated', change.field, change.oldValue, change.newValue, userId, aiAgentId);
    }

    logger.info(`Backlog item updated: ${item.id}`);
    return item;
  }

  /**
   * Delete backlog item
   */
  async deleteItem(id) {
    const item = await prisma.backlogItem.delete({
      where: { id }
    });

    logger.info(`Backlog item deleted: ${id}`);
    return item;
  }

  /**
   * Change item status
   */
  async changeStatus(id, newStatus, userId = null, aiAgentId = null) {
    return this.updateItem(id, { status: newStatus }, userId, aiAgentId);
  }

  /**
   * Assign item to user
   */
  async assignItem(id, assigneeId, userId = null) {
    return this.updateItem(id, { assigneeId }, userId);
  }

  /**
   * Move item to sprint
   */
  async moveToSprint(id, sprintId, userId = null) {
    return this.updateItem(id, { sprintId }, userId);
  }

  // ---------------------------------------------------------------------------
  // COMMENTS
  // ---------------------------------------------------------------------------

  /**
   * Add comment to backlog item
   */
  async addComment(backlogItemId, content, authorId = null, aiAgentId = null) {
    const comment = await prisma.backlogComment.create({
      data: {
        backlogItemId,
        content,
        authorId,
        aiAgentId
      },
      include: {
        aiAgent: true
      }
    });

    await this.logActivity(backlogItemId, 'commented', null, null, content.substring(0, 100), authorId, aiAgentId);

    return comment;
  }

  /**
   * Get comments for backlog item
   */
  async getComments(backlogItemId) {
    return prisma.backlogComment.findMany({
      where: { backlogItemId },
      include: { aiAgent: true },
      orderBy: { createdAt: 'asc' }
    });
  }

  // ---------------------------------------------------------------------------
  // DEPENDENCIES
  // ---------------------------------------------------------------------------

  /**
   * Add dependency between items
   */
  async addDependency(dependentItemId, blockingItemId, dependencyType = 'blocks') {
    return prisma.backlogDependency.create({
      data: {
        dependentItemId,
        blockingItemId,
        dependencyType
      }
    });
  }

  /**
   * Remove dependency
   */
  async removeDependency(dependentItemId, blockingItemId) {
    return prisma.backlogDependency.delete({
      where: {
        dependentItemId_blockingItemId: {
          dependentItemId,
          blockingItemId
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // EPICS
  // ---------------------------------------------------------------------------

  /**
   * Create epic
   */
  async createEpic(data, createdById) {
    return prisma.backlogEpic.create({
      data: {
        title: data.title,
        description: data.description,
        status: data.status || 'OPEN',
        priority: data.priority || 'MEDIUM',
        startDate: data.startDate,
        targetDate: data.targetDate,
        createdById
      }
    });
  }

  /**
   * Get epic with items
   */
  async getEpic(id) {
    return prisma.backlogEpic.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { priority: 'asc' }
        }
      }
    });
  }

  /**
   * List epics
   */
  async listEpics(filters = {}) {
    const where = {};

    if (filters.status) {
      where.status = filters.status;
    }

    return prisma.backlogEpic.findMany({
      where,
      include: {
        _count: { select: { items: true } },
        items: {
          select: { status: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Update epic progress
   */
  async updateEpicProgress(epicId) {
    const items = await prisma.backlogItem.findMany({
      where: { epicId },
      select: { status: true }
    });

    const total = items.length;
    const done = items.filter(i => i.status === 'DONE').length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;

    return prisma.backlogEpic.update({
      where: { id: epicId },
      data: { progress }
    });
  }

  // ---------------------------------------------------------------------------
  // SPRINTS
  // ---------------------------------------------------------------------------

  /**
   * Create sprint
   */
  async createSprint(data) {
    return prisma.sprint.create({
      data: {
        name: data.name,
        goal: data.goal,
        startDate: data.startDate,
        endDate: data.endDate,
        status: 'planned'
      }
    });
  }

  /**
   * Get sprint with items
   */
  async getSprint(id) {
    return prisma.sprint.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            assignee: {
              select: { id: true, firstName: true, lastName: true }
            }
          },
          orderBy: { priority: 'asc' }
        }
      }
    });
  }

  /**
   * List sprints
   */
  async listSprints(filters = {}) {
    const where = {};

    if (filters.status) {
      where.status = filters.status;
    }

    return prisma.sprint.findMany({
      where,
      include: {
        _count: { select: { items: true } },
        items: {
          select: { status: true, storyPoints: true }
        }
      },
      orderBy: { startDate: 'desc' }
    });
  }

  /**
   * Start sprint
   */
  async startSprint(id) {
    return prisma.sprint.update({
      where: { id },
      data: { status: 'active' }
    });
  }

  /**
   * Complete sprint
   */
  async completeSprint(id) {
    const sprint = await this.getSprint(id);

    // Calculate velocity
    const completedPoints = sprint.items
      .filter(i => i.status === 'DONE')
      .reduce((sum, i) => sum + (i.storyPoints || 0), 0);

    // Move incomplete items back to backlog
    await prisma.backlogItem.updateMany({
      where: {
        sprintId: id,
        status: { not: 'DONE' }
      },
      data: { sprintId: null }
    });

    return prisma.sprint.update({
      where: { id },
      data: {
        status: 'completed',
        velocity: completedPoints
      }
    });
  }

  // ---------------------------------------------------------------------------
  // ACTIVITIES
  // ---------------------------------------------------------------------------

  /**
   * Log activity
   */
  async logActivity(backlogItemId, action, field = null, oldValue = null, newValue = null, userId = null, aiAgentId = null) {
    return prisma.backlogActivity.create({
      data: {
        backlogItemId,
        action,
        field,
        oldValue,
        newValue,
        userId,
        aiAgentId
      }
    });
  }

  /**
   * Get activity feed
   */
  async getActivityFeed(filters = {}) {
    const where = {};

    if (filters.backlogItemId) {
      where.backlogItemId = filters.backlogItemId;
    }
    if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.aiAgentId) {
      where.aiAgentId = filters.aiAgentId;
    }

    return prisma.backlogActivity.findMany({
      where,
      include: {
        backlogItem: {
          select: { id: true, title: true }
        },
        aiAgent: {
          select: { id: true, name: true, type: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 50
    });
  }

  // ---------------------------------------------------------------------------
  // STATISTICS
  // ---------------------------------------------------------------------------

  /**
   * Get backlog statistics
   */
  async getStatistics() {
    const [
      statusCounts,
      priorityCounts,
      categoryCounts,
      aiGeneratedCount,
      sprintStats
    ] = await Promise.all([
      prisma.backlogItem.groupBy({
        by: ['status'],
        _count: true
      }),
      prisma.backlogItem.groupBy({
        by: ['priority'],
        _count: true
      }),
      prisma.backlogItem.groupBy({
        by: ['category'],
        _count: true
      }),
      prisma.backlogItem.count({
        where: { aiGenerated: true }
      }),
      prisma.sprint.findMany({
        where: { status: 'completed' },
        select: { velocity: true },
        orderBy: { endDate: 'desc' },
        take: 5
      })
    ]);

    const avgVelocity = sprintStats.length > 0
      ? sprintStats.reduce((sum, s) => sum + (s.velocity || 0), 0) / sprintStats.length
      : 0;

    return {
      byStatus: statusCounts.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
      byPriority: priorityCounts.reduce((acc, p) => ({ ...acc, [p.priority]: p._count }), {}),
      byCategory: categoryCounts.reduce((acc, c) => ({ ...acc, [c.category]: c._count }), {}),
      aiGenerated: aiGeneratedCount,
      averageVelocity: Math.round(avgVelocity),
      recentVelocities: sprintStats.map(s => s.velocity)
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = new BacklogService();
