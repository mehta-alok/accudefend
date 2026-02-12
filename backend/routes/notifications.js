/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Notifications Routes
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const notificationsController = require('../controllers/notificationsController');

// All routes require authentication
router.use(authenticateToken);

// Get all notifications for current user
router.get('/', notificationsController.getNotifications);

// Get unread notification count
router.get('/unread-count', notificationsController.getUnreadCount);

// Mark all notifications as read
router.put('/mark-all-read', notificationsController.markAllAsRead);

// Clear all notifications
router.delete('/clear-all', notificationsController.clearAll);

// Mark a notification as read
router.put('/:id/read', notificationsController.markAsRead);

// Delete a notification
router.delete('/:id', notificationsController.deleteNotification);

module.exports = router;
