/**
 * useRefreshInterval
 * ------------------
 * Reads `refreshInterval` from the backend user_settings table (saved in
 * Settings → Thresholds). Returns the number of MILLISECONDS to use as the
 * chart auto-refresh interval.
 *
 * Defaults to 30 000 ms (30s) while loading or if the setting is absent.
 * Auto-updates when the setting changes in the DB (re-fetches every 60s).
 */
import { useState, useEffect } from 'react'
import { userAPI } from '../api/client'

const DEFAULT_MS = 30_000  // 30 seconds
const MIN_MS = 5_000   // never faster than 5s (safety guard)

export function useRefreshInterval() {
    const [intervalMs, setIntervalMs] = useState(DEFAULT_MS)

    useEffect(() => {
        let mounted = true

        async function fetchInterval() {
            try {
                const res = await userAPI.getSettings()
                const settings = res.data?.settings ?? res.data ?? {}
                const raw = settings['refreshInterval']
                if (raw !== undefined && raw !== null) {
                    const parsed = parseFloat(raw)
                    if (!isNaN(parsed) && parsed >= 5) {
                        // The setting is stored in SECONDS (matches the Settings page unit)
                        const ms = Math.max(parsed * 1000, MIN_MS)
                        if (mounted) setIntervalMs(ms)
                    }
                }
            } catch {
                // API unavailable — keep default
            }
        }

        fetchInterval()
        // Re-check every 60s so chart adapts if user changes the setting
        const check = setInterval(fetchInterval, 60_000)
        return () => {
            mounted = false
            clearInterval(check)
        }
    }, [])

    return intervalMs
}
