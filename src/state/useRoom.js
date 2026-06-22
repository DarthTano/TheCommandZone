// Realtime room hook for online play.
//
// Transport: a single Supabase Realtime channel `room:<CODE>` per game.
//  - presence  -> who is connected (members list, seat release on leave)
//  - broadcast 'action'   -> a game action to apply on every client
//  - broadcast 'request_snapshot' / 'snapshot' -> late-joiner state sync
//
// Deliberately uses NO database table: online play needs only the anon key
// (Realtime is on by default). The host holds the authoritative state and
// answers snapshot requests; if everyone disconnects the game simply ends.

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

    channel.on('broadcast', { event: 'action' }, ({ payload }) => {
      if (payload?.action) dispatch(payload.action)
    })

    channel.on('broadcast', { event: 'request_snapshot' }, ({ payload }) => {
      // only the host answers, to avoid a storm of duplicate snapshots
      if (isHost && stateRef.current) {
        channel.send({
          type: 'broadcast',
          event: 'snapshot',
          payload: { state: stateRef.current, to: payload.from },
        })
      }
    })

    channel.on('broadcast', { event: 'snapshot' }, ({ payload }) => {
      if (payload?.to && payload.to !== identity.key) return
      if (payload?.state) {
        dispatch(actions.snapshot(payload.state))
        setStatus('connected')
      }
    })

    channel.on('presence', { sync: true }, () => {
      const presence = channel.presenceState()
      const list = Object.entries(presence).map(([key, metas]) => ({ key, ...(metas[0] || {}) }))
      setMembers(list)
    })

    channel.on('presence', { event: 'leave' }, ({ key }) => {
      // host frees any seats the departing player was holding
      if (isHost) act(actions.releaseSeats(key))
    })

    channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED' || cancelled) return
      await channel.track({ name: identity.name, key: identity.key, at: Date.now() })
      if (isHost) {
        setStatus('connected')
      } else {
        // ask the host for the current board
        channel.send({ type: 'broadcast', event: 'request_snapshot', payload: { from: identity.key } })
      }
    })

    return () => {
      cancelled = true
      channelRef.current = null
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, isHost, identity.key, identity.name])

  return { state, act, members, status }
}
