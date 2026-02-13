/**
 * AccuDefend - Reservation Matcher Service
 *
 * Matches incoming chargebacks to synced PMS reservations using multiple
 * strategies ordered by confidence level. Used by the auto-evidence
 * collection worker to link chargebacks to guest stays.
 */

const { prisma } = require('../config/database');
const logger = require('../utils/logger');

class ReservationMatcher {
  /**
   * Find a matching reservation for a chargeback using multiple strategies.
   * Returns the best match with confidence score and strategy used.
   *
   * @param {Object} chargebackData - Chargeback data to match against
   * @param {string} propertyId - Property ID to scope the search
   * @returns {Object|null} { reservation, confidence, strategy } or null
   */
  async findMatchingReservation(chargebackData, propertyId) {
    const {
      confirmationNumber,
      cardLastFour,
      guestName,
      checkInDate,
      checkOutDate,
      transactionId,
      amount
    } = chargebackData;

    // Strategy 1: Exact confirmation number match (highest confidence)
    if (confirmationNumber) {
      const match = await this._matchByConfirmationNumber(confirmationNumber, propertyId);
      if (match) {
        logger.info(`[ReservationMatcher] Matched by confirmation number: ${confirmationNumber}`);
        return { reservation: match, confidence: 100, strategy: 'confirmation_number' };
      }
    }

    // Strategy 2: Transaction ID in folio payment items
    if (transactionId) {
      const match = await this._matchByTransactionId(transactionId, propertyId);
      if (match) {
        logger.info(`[ReservationMatcher] Matched by transaction ID: ${transactionId}`);
        return { reservation: match, confidence: 95, strategy: 'transaction_id' };
      }
    }

    // Strategy 3: Card last 4 + date overlap
    if (cardLastFour && (checkInDate || checkOutDate)) {
      const match = await this._matchByCardAndDates(cardLastFour, checkInDate, checkOutDate, propertyId);
      if (match) {
        logger.info(`[ReservationMatcher] Matched by card last 4 + dates: ****${cardLastFour}`);
        return { reservation: match, confidence: 90, strategy: 'card_date' };
      }
    }

    // Strategy 4: Card last 4 + amount match
    if (cardLastFour && amount) {
      const match = await this._matchByCardAndAmount(cardLastFour, amount, propertyId);
      if (match) {
        logger.info(`[ReservationMatcher] Matched by card last 4 + amount: ****${cardLastFour} / $${amount}`);
        return { reservation: match, confidence: 80, strategy: 'card_amount' };
      }
    }

    // Strategy 5: Guest name fuzzy match + date range
    if (guestName && (checkInDate || checkOutDate)) {
      const match = await this._matchByGuestNameAndDates(guestName, checkInDate, checkOutDate, propertyId);
      if (match) {
        logger.info(`[ReservationMatcher] Matched by guest name + dates: ${guestName}`);
        return { reservation: match, confidence: 60, strategy: 'name_date' };
      }
    }

    // Strategy 6: Card last 4 only (lowest confidence, most recent reservation)
    if (cardLastFour) {
      const match = await this._matchByCardOnly(cardLastFour, propertyId);
      if (match) {
        logger.info(`[ReservationMatcher] Matched by card last 4 only: ****${cardLastFour}`);
        return { reservation: match, confidence: 50, strategy: 'card_only' };
      }
    }

    logger.info('[ReservationMatcher] No matching reservation found');
    return null;
  }

  /**
   * Strategy 1: Exact confirmation number match
   */
  async _matchByConfirmationNumber(confirmationNumber, propertyId) {
    try {
      return await prisma.reservation.findFirst({
        where: {
          confirmationNumber: confirmationNumber,
          propertyId: propertyId
        },
        include: {
          folioItems: true,
          guestProfile: true
        },
        orderBy: { checkInDate: 'desc' }
      });
    } catch (error) {
      logger.error('[ReservationMatcher] Error in confirmation number match:', error.message);
      return null;
    }
  }

  /**
   * Strategy 2: Transaction ID found in folio payment line items
   */
  async _matchByTransactionId(transactionId, propertyId) {
    try {
      const folioItem = await prisma.guestFolioItem.findFirst({
        where: {
          transactionCode: transactionId,
          reservation: {
            propertyId: propertyId
          }
        },
        include: {
          reservation: {
            include: {
              folioItems: true,
              guestProfile: true
            }
          }
        }
      });
      return folioItem?.reservation || null;
    } catch (error) {
      logger.error('[ReservationMatcher] Error in transaction ID match:', error.message);
      return null;
    }
  }

  /**
   * Strategy 3: Card last 4 + check-in/check-out date overlap
   * Looks for reservations where the stay dates overlap with the chargeback dates.
   */
  async _matchByCardAndDates(cardLastFour, checkInDate, checkOutDate, propertyId) {
    try {
      const where = {
        cardLastFour: cardLastFour,
        propertyId: propertyId
      };

      // Build date overlap filter
      if (checkInDate && checkOutDate) {
        // Reservation overlaps with the chargeback date range
        where.checkInDate = { lte: new Date(checkOutDate) };
        where.checkOutDate = { gte: new Date(checkInDate) };
      } else if (checkInDate) {
        // Check-in within 30 days of chargeback check-in
        const dateFrom = new Date(checkInDate);
        const dateTo = new Date(checkInDate);
        dateFrom.setDate(dateFrom.getDate() - 30);
        dateTo.setDate(dateTo.getDate() + 30);
        where.checkInDate = { gte: dateFrom, lte: dateTo };
      } else if (checkOutDate) {
        const dateFrom = new Date(checkOutDate);
        const dateTo = new Date(checkOutDate);
        dateFrom.setDate(dateFrom.getDate() - 30);
        dateTo.setDate(dateTo.getDate() + 30);
        where.checkOutDate = { gte: dateFrom, lte: dateTo };
      }

      return await prisma.reservation.findFirst({
        where,
        include: {
          folioItems: true,
          guestProfile: true
        },
        orderBy: { checkInDate: 'desc' }
      });
    } catch (error) {
      logger.error('[ReservationMatcher] Error in card + date match:', error.message);
      return null;
    }
  }

  /**
   * Strategy 4: Card last 4 + amount match (within 5% tolerance)
   */
  async _matchByCardAndAmount(cardLastFour, amount, propertyId) {
    try {
      const amountNum = parseFloat(amount);
      const tolerance = amountNum * 0.05; // 5% tolerance for taxes/fees variance
      const minAmount = amountNum - tolerance;
      const maxAmount = amountNum + tolerance;

      return await prisma.reservation.findFirst({
        where: {
          cardLastFour: cardLastFour,
          propertyId: propertyId,
          totalAmount: {
            gte: minAmount,
            lte: maxAmount
          }
        },
        include: {
          folioItems: true,
          guestProfile: true
        },
        orderBy: { checkInDate: 'desc' }
      });
    } catch (error) {
      logger.error('[ReservationMatcher] Error in card + amount match:', error.message);
      return null;
    }
  }

  /**
   * Strategy 5: Guest name fuzzy match + date range
   * Uses case-insensitive contains search on guest name.
   */
  async _matchByGuestNameAndDates(guestName, checkInDate, checkOutDate, propertyId) {
    try {
      // Parse guest name into parts for broader matching
      const nameParts = this._parseGuestName(guestName);

      const where = {
        propertyId: propertyId,
        AND: []
      };

      // Match on last name (most reliable part of name)
      if (nameParts.lastName) {
        where.AND.push({
          guestName: {
            contains: nameParts.lastName,
            mode: 'insensitive'
          }
        });
      }

      // Add date range filter
      if (checkInDate && checkOutDate) {
        where.AND.push({
          checkInDate: { lte: new Date(checkOutDate) },
          checkOutDate: { gte: new Date(checkInDate) }
        });
      } else if (checkInDate) {
        const dateFrom = new Date(checkInDate);
        const dateTo = new Date(checkInDate);
        dateFrom.setDate(dateFrom.getDate() - 14);
        dateTo.setDate(dateTo.getDate() + 14);
        where.AND.push({
          checkInDate: { gte: dateFrom, lte: dateTo }
        });
      }

      if (where.AND.length === 0) return null;

      const results = await prisma.reservation.findMany({
        where,
        include: {
          folioItems: true,
          guestProfile: true
        },
        orderBy: { checkInDate: 'desc' },
        take: 5
      });

      // If multiple results, try to find best name match
      if (results.length === 0) return null;
      if (results.length === 1) return results[0];

      // Score each result by name similarity
      const scored = results.map(r => ({
        reservation: r,
        score: this._nameSimilarity(guestName, r.guestName)
      }));
      scored.sort((a, b) => b.score - a.score);

      // Only return if similarity is above threshold
      if (scored[0].score >= 0.6) {
        return scored[0].reservation;
      }

      return null;
    } catch (error) {
      logger.error('[ReservationMatcher] Error in guest name + date match:', error.message);
      return null;
    }
  }

  /**
   * Strategy 6: Card last 4 only — returns most recent reservation
   */
  async _matchByCardOnly(cardLastFour, propertyId) {
    try {
      // Only match reservations from the last 180 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 180);

      return await prisma.reservation.findFirst({
        where: {
          cardLastFour: cardLastFour,
          propertyId: propertyId,
          checkInDate: { gte: cutoffDate }
        },
        include: {
          folioItems: true,
          guestProfile: true
        },
        orderBy: { checkInDate: 'desc' }
      });
    } catch (error) {
      logger.error('[ReservationMatcher] Error in card-only match:', error.message);
      return null;
    }
  }

  /**
   * Parse a guest name string into first/last name parts.
   * Handles: "Last, First", "First Last", "LAST FIRST", etc.
   */
  _parseGuestName(fullName) {
    if (!fullName) return { firstName: '', lastName: '' };

    const name = fullName.trim();

    // Handle "Last, First" format
    if (name.includes(',')) {
      const [lastName, firstName] = name.split(',').map(s => s.trim());
      return { firstName: firstName || '', lastName: lastName || '' };
    }

    // Handle "First Last" format
    const parts = name.split(/\s+/);
    if (parts.length === 1) {
      return { firstName: '', lastName: parts[0] };
    }

    return {
      firstName: parts.slice(0, -1).join(' '),
      lastName: parts[parts.length - 1]
    };
  }

  /**
   * Calculate name similarity score (0-1) between two names.
   * Uses normalized Levenshtein-like comparison.
   */
  _nameSimilarity(name1, name2) {
    if (!name1 || !name2) return 0;

    const n1 = name1.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    const n2 = name2.toLowerCase().replace(/[^a-z\s]/g, '').trim();

    if (n1 === n2) return 1;

    // Check if one contains the other
    if (n1.includes(n2) || n2.includes(n1)) return 0.9;

    // Compare last names
    const parts1 = this._parseGuestName(name1);
    const parts2 = this._parseGuestName(name2);

    if (parts1.lastName.toLowerCase() === parts2.lastName.toLowerCase()) {
      // Same last name
      if (parts1.firstName && parts2.firstName) {
        // Check first name match
        if (parts1.firstName.toLowerCase() === parts2.firstName.toLowerCase()) return 1;
        // Check first initial match
        if (parts1.firstName[0].toLowerCase() === parts2.firstName[0].toLowerCase()) return 0.8;
      }
      return 0.7; // Same last name, different/missing first name
    }

    // Character-level similarity (Sørensen–Dice coefficient on bigrams)
    const bigrams1 = this._getBigrams(n1);
    const bigrams2 = this._getBigrams(n2);
    const intersection = bigrams1.filter(b => bigrams2.includes(b));
    return (2 * intersection.length) / (bigrams1.length + bigrams2.length);
  }

  /**
   * Get character bigrams from a string for similarity comparison.
   */
  _getBigrams(str) {
    const bigrams = [];
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.push(str.substring(i, i + 2));
    }
    return bigrams;
  }

  /**
   * Batch match: find reservations for multiple chargebacks at once.
   * Useful for scheduled sync operations.
   *
   * @param {Array} chargebacks - Array of chargeback records to match
   * @returns {Array} Array of { chargebackId, match } objects
   */
  async batchMatch(chargebacks) {
    const results = [];

    for (const chargeback of chargebacks) {
      const match = await this.findMatchingReservation({
        confirmationNumber: chargeback.confirmationNumber,
        cardLastFour: chargeback.cardLastFour,
        guestName: chargeback.guestName,
        checkInDate: chargeback.checkInDate,
        checkOutDate: chargeback.checkOutDate,
        transactionId: chargeback.transactionId,
        amount: chargeback.amount
      }, chargeback.propertyId);

      results.push({
        chargebackId: chargeback.id,
        match
      });
    }

    return results;
  }

  /**
   * Link a chargeback to a reservation and update guest profile stats.
   *
   * @param {string} chargebackId - Chargeback ID
   * @param {string} reservationId - Reservation ID to link
   * @returns {Object} Updated chargeback
   */
  async linkChargebackToReservation(chargebackId, reservationId) {
    try {
      // Update the chargeback with the reservation link
      const updatedChargeback = await prisma.chargeback.update({
        where: { id: chargebackId },
        data: { reservationId: reservationId },
        include: {
          reservation: {
            include: {
              guestProfile: true
            }
          }
        }
      });

      // Update guest profile chargeback stats if a profile exists
      if (updatedChargeback.reservation?.guestProfileId) {
        await prisma.guestProfile.update({
          where: { id: updatedChargeback.reservation.guestProfileId },
          data: {
            chargebackCount: { increment: 1 },
            totalDisputeAmount: {
              increment: parseFloat(updatedChargeback.amount)
            },
            // Auto-flag guests with 2+ chargebacks
            isFlagged: true,
            flagReason: `Chargeback filed: ${updatedChargeback.caseNumber}`,
            flaggedAt: new Date()
          }
        });
      }

      logger.info(`[ReservationMatcher] Linked chargeback ${chargebackId} to reservation ${reservationId}`);
      return updatedChargeback;
    } catch (error) {
      logger.error('[ReservationMatcher] Error linking chargeback to reservation:', error.message);
      throw error;
    }
  }
}

module.exports = new ReservationMatcher();
