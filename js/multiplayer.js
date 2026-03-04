// js/multiplayer.js

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { generateScramble } from './scramble.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentRoom = null;
let currentChannel = null;
let playerNumber = null; // 1 or 2
let callbacks = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createRoom(playerName) {
  const code = generateRoomCode();
  const scramble = generateScramble().join(' ');

  const { data, error } = await supabase
    .from('rooms')
    .insert({ code, scramble, player1_name: playerName, status: 'waiting' })
    .select()
    .single();

  if (error) throw error;

  currentRoom = data;
  playerNumber = 1;
  await joinChannel(code);
  return { code, room: data };
}

export async function joinRoom(code, playerName) {
  // Fetch room
  const { data: room, error: fetchErr } = await supabase
    .from('rooms')
    .select()
    .eq('code', code.toUpperCase())
    .single();

  if (fetchErr || !room) throw new Error('Room not found');
  if (room.status !== 'waiting') throw new Error('Room is already full');

  // Update room with player 2
  const { data, error } = await supabase
    .from('rooms')
    .update({ player2_name: playerName, status: 'active' })
    .eq('id', room.id)
    .select()
    .single();

  if (error) throw error;

  currentRoom = data;
  playerNumber = 2;
  await joinChannel(code.toUpperCase());

  // Notify P1 that P2 joined
  currentChannel.send({
    type: 'broadcast',
    event: 'player_joined',
    payload: { name: playerName },
  });

  return { room: data };
}

async function joinChannel(code) {
  currentChannel = supabase.channel(`room:${code}`, {
    config: { broadcast: { self: false } },
  });

  currentChannel
    .on('broadcast', { event: 'timer_update' }, ({ payload }) => {
      if (callbacks.onOpponentTimerUpdate) callbacks.onOpponentTimerUpdate(payload);
    })
    .on('broadcast', { event: 'player_joined' }, ({ payload }) => {
      if (callbacks.onOpponentJoined) callbacks.onOpponentJoined(payload);
    })
    .on('broadcast', { event: 'new_scramble' }, ({ payload }) => {
      if (callbacks.onNewScramble) callbacks.onNewScramble(payload);
    })
    .on('broadcast', { event: 'player_left' }, () => {
      if (callbacks.onOpponentLeft) callbacks.onOpponentLeft();
    })
    .on('broadcast', { event: 'countdown_start' }, () => {
      if (callbacks.onCountdownStart) callbacks.onCountdownStart();
    })
    .on('broadcast', { event: 'countdown_tick' }, ({ payload }) => {
      if (callbacks.onCountdownTick) callbacks.onCountdownTick(payload);
    })
    .subscribe();
}

export function broadcastTimerUpdate(state, elapsed) {
  if (!currentChannel) return;
  currentChannel.send({
    type: 'broadcast',
    event: 'timer_update',
    payload: { player: playerNumber, state, elapsed },
  });
}

export async function broadcastNewScramble() {
  if (!currentChannel || !currentRoom) return;
  const scramble = generateScramble().join(' ');

  // Update room in DB
  await supabase
    .from('rooms')
    .update({ scramble, player1_time: null, player2_time: null })
    .eq('id', currentRoom.id);

  currentChannel.send({
    type: 'broadcast',
    event: 'new_scramble',
    payload: { scramble },
  });

  return scramble;
}

export function broadcastCountdownStart() {
  if (!currentChannel) return;
  currentChannel.send({
    type: 'broadcast',
    event: 'countdown_start',
    payload: {},
  });
}

export function broadcastCountdownTick(value) {
  if (!currentChannel) return;
  currentChannel.send({
    type: 'broadcast',
    event: 'countdown_tick',
    payload: { value },
  });
}

export async function saveFinishTime(timeMs) {
  if (!currentRoom) return;
  const col = playerNumber === 1 ? 'player1_time' : 'player2_time';
  await supabase
    .from('rooms')
    .update({ [col]: timeMs })
    .eq('id', currentRoom.id);
}

export async function leaveRoom() {
  if (currentChannel) {
    currentChannel.send({
      type: 'broadcast',
      event: 'player_left',
      payload: { player: playerNumber },
    });
    supabase.removeChannel(currentChannel);
  }
  currentRoom = null;
  currentChannel = null;
  playerNumber = null;
}

export function onEvent(eventName, callback) {
  callbacks[eventName] = callback;
}

export function getRoomInfo() {
  return { room: currentRoom, playerNumber };
}
