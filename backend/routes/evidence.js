/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Evidence Management Routes
 */

const express = require('express');
const multer = require('multer');
const { prisma } = require('../config/database');
const { authenticateToken, requireRole, requirePropertyAccess } = require('../middleware/auth');
const { uploadFile, generateS3Key, getPresignedDownloadUrl, deleteFile } = require('../config/s3');
const { uploadEvidenceSchema, EvidenceType } = require('../utils/validators');
const logger = require('../utils/logger');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
    files: 5 // Max 5 files at once
  },
  fileFilter: (req, file, cb) => {
    // Allowed MIME types
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'video/mp4',
      'video/quicktime',
      'text/plain',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
  }
});

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requirePropertyAccess);

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/evidence/case/:chargebackId
 * List all evidence for a chargeback
 */
router.get('/case/:chargebackId', async (req, res) => {
  try {
    // Verify chargeback access
    const chargeback = await prisma.chargeback.findFirst({
      where: {
        id: req.params.chargebackId,
        ...req.propertyFilter
      }
    });

    if (!chargeback) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    // Get evidence with presigned URLs
    const evidence = await prisma.evidence.findMany({
      where: { chargebackId: req.params.chargebackId },
      orderBy: { createdAt: 'desc' }
    });

    // Generate presigned URLs
    const evidenceWithUrls = await Promise.all(
      evidence.map(async (e) => {
        try {
          const downloadUrl = await getPresignedDownloadUrl(e.s3Key);
          return { ...e, downloadUrl };
        } catch (error) {
          logger.warn(`Failed to generate URL for evidence ${e.id}:`, error.message);
          return { ...e, downloadUrl: null };
        }
      })
    );

    res.json({
      evidence: evidenceWithUrls,
      summary: {
        total: evidence.length,
        byType: evidence.reduce((acc, e) => {
          acc[e.type] = (acc[e.type] || 0) + 1;
          return acc;
        }, {}),
        verified: evidence.filter(e => e.verified).length
      }
    });

  } catch (error) {
    logger.error('List evidence error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve evidence'
    });
  }
});

/**
 * POST /api/evidence/upload/:chargebackId
 * Upload evidence file
 */
router.post('/upload/:chargebackId', requireRole('ADMIN', 'MANAGER', 'STAFF'), upload.single('file'), async (req, res) => {
  try {
    // Validate body
    const validation = uploadEvidenceSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: validation.error.errors
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'File is required'
      });
    }

    const { type, description } = validation.data;

    // Verify chargeback access
    const chargeback = await prisma.chargeback.findFirst({
      where: {
        id: req.params.chargebackId,
        ...req.propertyFilter
      }
    });

    if (!chargeback) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    // Generate S3 key and upload
    const s3Key = generateS3Key(req.params.chargebackId, type, req.file.originalname);
    await uploadFile(req.file.buffer, s3Key, req.file.mimetype);

    // Create evidence record
    const evidence = await prisma.evidence.create({
      data: {
        chargebackId: req.params.chargebackId,
        type,
        fileName: req.file.originalname,
        s3Key,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        description
      }
    });

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId: req.params.chargebackId,
        eventType: 'USER_ACTION',
        title: 'Evidence Uploaded',
        description: `${type.replace(/_/g, ' ')} uploaded by ${req.user.firstName} ${req.user.lastName}`,
        metadata: {
          evidenceId: evidence.id,
          fileName: req.file.originalname,
          fileSize: req.file.size
        }
      }
    });

    // Generate download URL
    const downloadUrl = await getPresignedDownloadUrl(s3Key);

    logger.info(`Evidence uploaded: ${evidence.id} for case ${chargeback.caseNumber}`);

    res.status(201).json({
      message: 'Evidence uploaded successfully',
      evidence: {
        ...evidence,
        downloadUrl
      }
    });

  } catch (error) {
    logger.error('Upload evidence error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to upload evidence'
    });
  }
});

/**
 * POST /api/evidence/upload-multiple/:chargebackId
 * Upload multiple evidence files
 */
router.post('/upload-multiple/:chargebackId', requireRole('ADMIN', 'MANAGER', 'STAFF'), upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'At least one file is required'
      });
    }

    const { types } = req.body; // JSON array of types matching files
    const typeArray = types ? JSON.parse(types) : req.files.map(() => 'OTHER');

    // Verify chargeback access
    const chargeback = await prisma.chargeback.findFirst({
      where: {
        id: req.params.chargebackId,
        ...req.propertyFilter
      }
    });

    if (!chargeback) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    // Upload all files
    const uploadResults = await Promise.all(
      req.files.map(async (file, index) => {
        try {
          const type = typeArray[index] || 'OTHER';
          const s3Key = generateS3Key(req.params.chargebackId, type, file.originalname);

          await uploadFile(file.buffer, s3Key, file.mimetype);

          const evidence = await prisma.evidence.create({
            data: {
              chargebackId: req.params.chargebackId,
              type,
              fileName: file.originalname,
              s3Key,
              mimeType: file.mimetype,
              fileSize: file.size
            }
          });

          const downloadUrl = await getPresignedDownloadUrl(s3Key);
          return { success: true, evidence: { ...evidence, downloadUrl } };
        } catch (error) {
          return { success: false, fileName: file.originalname, error: error.message };
        }
      })
    );

    // Create single timeline event for batch upload
    const successCount = uploadResults.filter(r => r.success).length;
    await prisma.timelineEvent.create({
      data: {
        chargebackId: req.params.chargebackId,
        eventType: 'USER_ACTION',
        title: 'Evidence Batch Upload',
        description: `${successCount} file(s) uploaded by ${req.user.firstName} ${req.user.lastName}`
      }
    });

    logger.info(`Batch upload: ${successCount}/${req.files.length} files for case ${chargeback.caseNumber}`);

    res.status(201).json({
      message: `${successCount} of ${req.files.length} files uploaded successfully`,
      results: uploadResults
    });

  } catch (error) {
    logger.error('Batch upload error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to upload files'
    });
  }
});

/**
 * GET /api/evidence/:id/download
 * Get presigned download URL for evidence
 */
router.get('/:id/download', async (req, res) => {
  try {
    const evidence = await prisma.evidence.findUnique({
      where: { id: req.params.id },
      include: {
        chargeback: {
          select: { propertyId: true }
        }
      }
    });

    if (!evidence) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Evidence not found'
      });
    }

    // Verify property access
    if (req.user.role !== 'ADMIN' && evidence.chargeback.propertyId !== req.user.propertyId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied'
      });
    }

    const downloadUrl = await getPresignedDownloadUrl(evidence.s3Key);

    res.json({
      downloadUrl,
      fileName: evidence.fileName,
      mimeType: evidence.mimeType,
      expiresIn: parseInt(process.env.AWS_S3_PRESIGNED_EXPIRY) || 3600
    });

  } catch (error) {
    logger.error('Get download URL error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate download URL'
    });
  }
});

/**
 * PATCH /api/evidence/:id/verify
 * Mark evidence as verified
 */
router.patch('/:id/verify', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const evidence = await prisma.evidence.findUnique({
      where: { id: req.params.id },
      include: {
        chargeback: {
          select: { id: true, propertyId: true, caseNumber: true }
        }
      }
    });

    if (!evidence) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Evidence not found'
      });
    }

    // Verify property access
    if (req.user.role !== 'ADMIN' && evidence.chargeback.propertyId !== req.user.propertyId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied'
      });
    }

    const updated = await prisma.evidence.update({
      where: { id: req.params.id },
      data: {
        verified: true,
        verifiedAt: new Date()
      }
    });

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId: evidence.chargebackId,
        eventType: 'SUCCESS',
        title: 'Evidence Verified',
        description: `${evidence.type.replace(/_/g, ' ')} verified by ${req.user.firstName} ${req.user.lastName}`
      }
    });

    logger.info(`Evidence verified: ${evidence.id} for case ${evidence.chargeback.caseNumber}`);

    res.json({
      message: 'Evidence verified successfully',
      evidence: updated
    });

  } catch (error) {
    logger.error('Verify evidence error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify evidence'
    });
  }
});

/**
 * DELETE /api/evidence/:id
 * Delete evidence file
 */
router.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const evidence = await prisma.evidence.findUnique({
      where: { id: req.params.id },
      include: {
        chargeback: {
          select: { id: true, propertyId: true, caseNumber: true }
        }
      }
    });

    if (!evidence) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Evidence not found'
      });
    }

    // Verify property access
    if (req.user.role !== 'ADMIN' && evidence.chargeback.propertyId !== req.user.propertyId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied'
      });
    }

    // Delete from S3
    try {
      await deleteFile(evidence.s3Key);
    } catch (s3Error) {
      logger.warn(`Failed to delete S3 file ${evidence.s3Key}:`, s3Error.message);
    }

    // Delete record
    await prisma.evidence.delete({
      where: { id: req.params.id }
    });

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId: evidence.chargebackId,
        eventType: 'WARNING',
        title: 'Evidence Deleted',
        description: `${evidence.type.replace(/_/g, ' ')} deleted by ${req.user.firstName} ${req.user.lastName}`
      }
    });

    logger.info(`Evidence deleted: ${evidence.id} from case ${evidence.chargeback.caseNumber}`);

    res.json({
      message: 'Evidence deleted successfully'
    });

  } catch (error) {
    logger.error('Delete evidence error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete evidence'
    });
  }
});

module.exports = router;
