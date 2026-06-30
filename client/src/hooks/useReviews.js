import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api.js';

/**
 * Hook to fetch and manage the reviews list with filters and pagination.
 *
 * @param {Object} filters - { repo, severity }
 * @returns {{ reviews, stats, pagination, loading, error, setPage, refresh }}
 */
export function useReviews(filters = {}) {
  const [reviews, setReviews]       = useState([]);
  const [stats, setStats]           = useState(null);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [page, setPage]             = useState(1);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: 20, ...filters };
      // Remove empty filter values
      Object.keys(params).forEach((k) => !params[k] && delete params[k]);

      const [reviewsRes, statsRes] = await Promise.all([
        api.get('/reviews', { params }),
        api.get('/reviews/stats'),
      ]);

      setReviews(reviewsRes.data.data.reviews);
      setPagination(reviewsRes.data.data.pagination);
      setStats(statsRes.data.data);
    } catch (err) {
      const errorData = err.response?.data?.error || err.response?.data;
      const errorMsg = typeof errorData === 'object'
        ? (errorData.message || errorData.error || JSON.stringify(errorData))
        : (errorData || err.message || 'Failed to load reviews');
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [page, filters.repo, filters.severity]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  return { reviews, stats, pagination, loading, error, setPage, refresh: fetchReviews };
}
