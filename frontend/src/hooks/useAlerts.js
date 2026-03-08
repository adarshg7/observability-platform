// useAlerts.js
// Manages the WebSocket connection to /ws/alerts.
// Exposes:
//   alerts         – persisted from DB, updated in real-time
//   connected      – WS connection status
//   error          – last error message
//   acknowledge    – mark single alert as read (persists via WS → DB)
//   acknowledgeAll – marks all as read (persists via WS → DB)
//   onMetricUpdate – callback called when a metric_updated event arrives
//                    (used by Dashboard & ModelCharts to re-fetch data)

import { useState, useEffect, useRef, useCallback } from 'react'

const WS_URL = 'ws://localhost:8000/ws/alerts'
const RECONNECT_DELAY = 3000
const MAX_ALERTS = 100   // cap in-memory list

export function useAlerts({ onMetricUpdate } = {}) {
  const [alerts, setAlerts] = useState([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)
  const wsRef = useRef(null)
  const timerRef = useRef(null)
  const onMetricUpdateRef = useRef(onMetricUpdate)
  onMetricUpdateRef.current = onMetricUpdate   // keep latest callback without re-subscribing

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    // S1 FIX: Token is NOT appended to the URL (that leaks into server logs, browser history, proxies).
    // Instead, we send it as the very first message after the WS connection opens.
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      // S1: Send auth token as first message — server expects {type:'auth', token: '...'}
      const token = sessionStorage.getItem('token') || ''
      ws.send(JSON.stringify({ type: 'auth', token }))
      setConnected(true)
      setError(null)
      clearTimeout(timerRef.current)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.type === 'initial_alerts') {
          // DB history — already newest-first
          setAlerts(msg.alerts.slice(0, MAX_ALERTS))
        }

        if (msg.type === 'new_alert') {
          setAlerts(prev => [msg.alert, ...prev].slice(0, MAX_ALERTS))
        }

        if (msg.type === 'alert_acknowledged') {
          setAlerts(prev =>
            prev.map(a => a.id === msg.alert_id ? { ...a, ack: true } : a)
          )
        }

        if (msg.type === 'all_acknowledged') {
          setAlerts(prev => prev.map(a => ({ ...a, ack: true })))
        }

        if (msg.type === 'metric_updated') {
          // Charts listen for this to re-fetch without waiting for poll
          if (onMetricUpdateRef.current) {
            onMetricUpdateRef.current(msg.model_id, msg.model_type)
          }
        }
      } catch (e) {
        console.error('Failed to parse WS message', e)
      }
    }

    ws.onclose = (event) => {
      setConnected(false)
      // S1 fix: code 4001 = server rejected our auth token (expired or missing)
      // Do NOT reconnect automatically — that would create an infinite auth loop
      if (event.code === 4001) {
        setError('Session expired — please log in again')
        localStorage.removeItem('token')
        setTimeout(() => { window.location.href = '/login' }, 1500)
        return
      }
      setError('Connection lost — reconnecting...')
      timerRef.current = setTimeout(connect, RECONNECT_DELAY)
    }

    ws.onerror = () => ws.close()
  }, [])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  // Acknowledge single — persists via server
  function acknowledge(alertId) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'acknowledge', alert_id: alertId }))
    }
    // Optimistic update
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, ack: true } : a))
  }

  // Acknowledge all — persists via server (broadcasts all_acknowledged to all tabs)
  function acknowledgeAll() {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'acknowledge_all' }))
    }
    // Optimistic update
    setAlerts(prev => prev.map(a => ({ ...a, ack: true })))
  }

  return { alerts, connected, error, acknowledge, acknowledgeAll }
}
