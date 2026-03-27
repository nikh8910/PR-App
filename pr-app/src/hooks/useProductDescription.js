/**
 * @file useProductDescription.js
 * @description React hook for fetching and caching SAP product descriptions.
 *
 * Product descriptions are fetched lazily on demand (first call to
 * getDescription triggers the API request) and cached at module level so the
 * same product code is never fetched twice — even across component remounts.
 *
 * ## Module-Level Cache
 * `descriptionCache` and `inFlight` are defined outside the hook so they
 * persist for the lifetime of the app session, not just the component.
 * This means if PickingSearch fetches product "30", ConfirmPicking will get
 * the result immediately from cache without a second network call.
 *
 * ## Usage
 *   const { getDescription } = useProductDescription();
 *   // Returns '' while loading, returns the description once fetched.
 *   const desc = getDescription('30');  // → 'Finished Door Assembly'
 *
 * ## Deduplication
 * SAP's API_PRODUCT_SRV sometimes returns the ProductDescription field with
 * the value doubled (e.g. "Finished Door AssemblyFinished Door Assembly").
 * This is handled inside api.fetchProductDescription before caching.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

// Module-level cache: productId → description string.
// Shared across all components; outlives any single component's lifecycle.
const descriptionCache = new Map();

// Tracks in-flight requests keyed by productId to prevent duplicate fetches
// when multiple components request the same product at the same time.
const inFlight = new Map();

/**
 * useProductDescription — provides a getDescription(productId) function.
 *
 * @returns {{ getDescription: (productId: string) => string }}
 */
export const useProductDescription = () => {
    const { apiConfig } = useAuth();
    // Dummy state used only to trigger a re-render once a fetch completes.
    const [, forceUpdate] = useState(0);
    const mountedRef = useRef(true);

    // Keep mountedRef in sync with the component's mounted state to avoid
    // calling forceUpdate after the component unmounts.
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    /**
     * Returns the human-readable description for a SAP product/material code.
     * - Returns '' immediately if the value is loading or unavailable.
     * - Triggers an async fetch on first call for a new productId.
     * - Triggers a re-render once the description is cached.
     *
     * @param {string} productId - SAP material/product code (e.g. '0000000030')
     * @returns {string} Description, or '' while loading
     */
    const getDescription = useCallback((productId) => {
        if (!productId) return '';
        const key = String(productId).trim();
        if (!key) return '';

        // Return cached value immediately if available
        if (descriptionCache.has(key)) {
            return descriptionCache.get(key);
        }

        // Prevent duplicate parallel requests for the same product
        if (inFlight.has(key)) return '';

        // Kick off async fetch; store promise in inFlight to deduplicate
        const promise = api.fetchProductDescription(apiConfig, key)
            .then(desc => {
                descriptionCache.set(key, desc || '');
            })
            .catch(() => {
                // On failure, cache empty string so we don't retry on every render
                descriptionCache.set(key, '');
            })
            .finally(() => {
                inFlight.delete(key);
                // Re-render this component so it picks up the cached value
                if (mountedRef.current) {
                    forceUpdate(n => n + 1);
                }
            });

        inFlight.set(key, promise);
        return ''; // Not yet available; will re-render when ready
    }, [apiConfig]);

    return { getDescription };
};
