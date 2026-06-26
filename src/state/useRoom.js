// Realtime room hook for online play.
//
// Transport: a single Supabase Realtime channel `room:<CODE>` per game.
//  - presence  -> who is connected (members; one is flagged `host`)
//  - broadcast 'action'   -> a game action to apply on every client
//  - broadcast 'request_snapshot' / 'snapshot' -> late-joiner / reconnect sync
//
// No database table: online play needs only the anon key. The "host" holds the
// authoritative copy and answers snapshot requests — BUT host is migratable:
// every client applies the same actions, so each has the full shared state. If
// the current host leaves, the lowest-key surviving member promotes itself, so
// the game survives anyone (incl. the original host) dropping. It only ends when
// the last player leaves.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { supabase, isCloud } from '../lib/supabase.js'
import { tableReducer, actions } from '../lib/gameTable.js'

export function useRoom({ code, identity, isHost, initialState }) {
  const [state, dispatch] = useReducer(tableReducer, initialState ?? null)
  const [members, setMembers] = useState([])
  const [status, setStatus] = useState(isCloud ? 'connecting' : 'offline')

  const channelRef = useRef(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const amHost = useRef(!!isHost) // migratable host flag

  // Apply locally + tell everyone else. Used for every player action.
  const act = useCallback((action) => {
    dispatch(action)
    channelRef.current?.send({ type: 'broadcast', event: 'action', payload: { action, from: identity.key } })
  }, [identity.key])

  useEffect(() => {
    if (!isCloud || !code) return
    let cancelled = false

    const channel = supabase.channel(`room:${code}`, {
      config: { presence: { key: identity.key }, broadcast: { self: false } },
    })
    channelRef.current = channel

    const track = () => channel.track({ name: identity.name, key: identity.key, host: amHost.current, at: Date.now() })

    channel.on('broadcast', { event: 'action' }, ({ payload }) => {
      if (payload?.action) dispatch(payload.action)
    })

    channel.on('broadcast', { event: 'request_snapshot' }, ({ payload }) => {
      // the current host answers (avoids duplicate snapshot storms)
      if (amHost.current && stateRef.current) {
        channel.send({ type: 'broadcast', event: 'snapshot', payload: { state: stateRef.current, to: payload.from } })
      }
    })

    channel.on('broadcast', { event: 'snapshot' }, ({ payload }) => {
      if (payload?.to && payload.to !== identity.key) return
      if (payload?.state) {
        dispatch(actions.snapshot(payload.state))
        setStatus('connected')
      }
    })

    channel.on('presence', { event: 'sync' }, () => {
      const presence = channel.presenceState()
      const list = Object.entries(presence).map(([key, metas]) => ({ key, ...(metas[0] || {}) }))
      setMembers(list)

      // host election: if nobody currently advertises host, the lowest-key
      // surviving member (that has state) promotes itself.
      const someHost = list.some((m) => m.host)
      if (!someHost && list.length) {
        const lowest = list.map((m) => m.key).sort()[0]
        if (lowest === identity.key && stateRef.current && !amHost.current) {
          amHost.current = true
          track()
        }
      } else if (amHost.current) {
        // resolve a brief split (two hosts) deterministically: lowest key keeps it
        const hostKeys = list.filter((m) => m.host).map((m) => m.key).sort()
        if (hostKeys.length > 1 && hostKeys[0] !== identity.key) { amHost.current = false; track() }
      }
    })

    channel.on('presence', { event: 'leave' }, ({ key }) => {
      if (amHost.current) act(actions.releaseSeats(key)) // free the departed player's seats
    })

    channel.subscribe(async (st) => {
      if (st !== 'SUBSCRIBED' || cancelled) return
      await track() // also re-runs on auto-reconnect → re-announces presence
      setStatus('connected')
      // get the current board if we don't have it yet (late join or reconnect)
      if (!stateRef.current) {
        channel.send({ type: 'broadcast', event: 'request_snapshot', payload: { from: identity.key } })
      }
    })

    return () => {
      cancelled = true
      channelRef.current = null
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, identity.key, identity.name])

  return { state, act, members, status }
}
