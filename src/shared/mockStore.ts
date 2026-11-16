import {
  isBattleResultPendingApproval,
  type CompletedMatchRecord,
  type HubSnapshot,
  type MatchRoom,
  type TokenColor,
} from './matchmaking';
import {
  createInitialAdminStore,
  type AdminStoreState,
} from './admin';
import type { AuthStoreState } from './auth';
import type { KycStoreState } from './imbAadhaarKyc';

export interface StoreState {
  rooms: Record<string, MatchRoom>;
  recentMatches: CompletedMatchRecord[];
  adminState?: AdminStoreState;
  authState?: AuthStoreState;
  kycState?: KycStoreState;
}

export function createInitialMockStore(now = Date.now()): StoreState {
  const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const makeRunningRoom = (
    code: string,
    amount: number,
    ludoKingRoomCode: string,
    p1: { id: string; name: string; color: TokenColor },
    p2: { id: string; name: string; color: TokenColor },
    createdOffsetMs: number,
    updatedOffsetMs: number
  ): MatchRoom => ({
    code,
    visibility: 'open',
    mode: 'Classic',
    amount,
    stakesLabel: amount >= 1000 ? '1000 Pts' : amount >= 250 ? '500 Pts' : '100 Pts',
    bestOf: 1,
    createdAt: iso(createdOffsetMs),
    updatedAt: iso(updatedOffsetMs),
    status: 'in_ludo_king',
    ludoKingRoomCode,
    players: [
      {
        ...p1,
        isHost: true,
        readyInApp: true,
        connected: false,
        joinedAt: iso(createdOffsetMs),
      },
      {
        ...p2,
        isHost: false,
        readyInApp: true,
        connected: false,
        joinedAt: iso(updatedOffsetMs + 30000),
      },
    ],
    winnerId: null,
    winnerName: null,
    roundNumber: 1,
    isDemo: true,
    messages: [
      {
        id: `msg-${code.toLowerCase()}-1`,
        senderId: 'system',
        senderName: 'Matchmaker',
        text: `${p1.name} opened a public 1v1 Classic lobby.`,
        kind: 'system',
        createdAt: iso(createdOffsetMs),
      },
      {
        id: `msg-${code.toLowerCase()}-2`,
        senderId: 'system',
        senderName: 'Matchmaker',
        text: `${p2.name} joined the match room.`,
        kind: 'system',
        createdAt: iso(updatedOffsetMs + 30000),
      },
      {
        id: `msg-${code.toLowerCase()}-3`,
        senderId: 'system',
        senderName: 'Matchmaker',
        text: `${p1.name} shared Ludo King room code ${ludoKingRoomCode}.`,
        kind: 'system',
        createdAt: iso(updatedOffsetMs),
      },
    ],
  });

  const openLobbies: MatchRoom[] = [];

  const runningBattles: MatchRoom[] = [
    makeRunningRoom(
      'RN100Z',
      100,
      '03924815',
      { id: 'mock-sid', name: 'Siddharth', color: 'Red' },
      { id: 'mock-kavya', name: 'Kavya', color: 'Yellow' },
      290000,
      30000
    ),
    makeRunningRoom(
      'RN150X',
      150,
      '05491804',
      { id: 'mock-aarav', name: 'Aarav', color: 'Red' },
      { id: 'mock-zoya', name: 'Zoya', color: 'Yellow' },
      360000,
      60000
    ),
    makeRunningRoom(
      'RN300K',
      300,
      '08462093',
      { id: 'mock-dev', name: 'Dev', color: 'Green' },
      { id: 'mock-ishita', name: 'Ishita', color: 'Blue' },
      410000,
      90000
    ),
    makeRunningRoom(
      'RN500Y',
      500,
      '07183290',
      { id: 'mock-vikram', name: 'Vikram', color: 'Green' },
      { id: 'mock-neha', name: 'Neha', color: 'Blue' },
      480000,
      115000
    ),
    makeRunningRoom(
      'RN1000',
      1000,
      '02045718',
      { id: 'mock-rishi', name: 'Rishi', color: 'Red' },
      { id: 'mock-tanya', name: 'Tanya', color: 'Yellow' },
      540000,
      140000
    ),
    makeRunningRoom(
      'RN2000',
      2000,
      '06658342',
      { id: 'mock-karan', name: 'Karan', color: 'Blue' },
      { id: 'mock-pooja', name: 'Pooja', color: 'Green' },
      600000,
      175000
    ),
    makeRunningRoom(
      'RN020A',
      20,
      '01482930',
      { id: 'mock-aman', name: 'Aman', color: 'Red' },
      { id: 'mock-riya', name: 'Riya', color: 'Yellow' },
      620000,
      195000
    ),
    makeRunningRoom(
      'RN030B',
      30,
      '02593841',
      { id: 'mock-yash', name: 'Yash', color: 'Green' },
      { id: 'mock-naina', name: 'Naina', color: 'Blue' },
      640000,
      215000
    ),
    makeRunningRoom(
      'RN050C',
      50,
      '03604952',
      { id: 'mock-meera', name: 'Meera', color: 'Yellow' },
      { id: 'mock-harsh', name: 'Harsh', color: 'Red' },
      660000,
      235000
    ),
    makeRunningRoom(
      'RN060D',
      60,
      '04715063',
      { id: 'mock-kunal', name: 'Kunal', color: 'Blue' },
      { id: 'mock-tara', name: 'Tara', color: 'Green' },
      680000,
      255000
    ),
    makeRunningRoom(
      'RN080E',
      80,
      '05826174',
      { id: 'mock-sahil', name: 'Sahil', color: 'Red' },
      { id: 'mock-sana', name: 'Sana', color: 'Yellow' },
      700000,
      275000
    ),
    makeRunningRoom(
      'RN120F',
      120,
      '06937285',
      { id: 'mock-rahul', name: 'Rahul', color: 'Green' },
      { id: 'mock-ananya', name: 'Ananya', color: 'Blue' },
      720000,
      295000
    ),
    makeRunningRoom(
      'RN180G',
      180,
      '07048396',
      { id: 'mock-vivek', name: 'Vivek', color: 'Red' },
      { id: 'mock-diya', name: 'Diya', color: 'Yellow' },
      740000,
      315000
    ),
    makeRunningRoom(
      'RN200H',
      200,
      '08159407',
      { id: 'mock-kabir', name: 'Kabir', color: 'Blue' },
      { id: 'mock-priya', name: 'Priya', color: 'Green' },
      760000,
      335000
    ),
    makeRunningRoom(
      'RN250J',
      250,
      '09260518',
      { id: 'mock-rohan', name: 'Rohan', color: 'Red' },
      { id: 'mock-sneha', name: 'Sneha', color: 'Yellow' },
      780000,
      355000
    ),
    makeRunningRoom(
      'RN350L',
      350,
      '01371629',
      { id: 'mock-arjun', name: 'Arjun', color: 'Green' },
      { id: 'mock-komal', name: 'Komal', color: 'Blue' },
      800000,
      375000
    ),
    makeRunningRoom(
      'RN400M',
      400,
      '02482730',
      { id: 'mock-nikhil', name: 'Nikhil', color: 'Red' },
      { id: 'mock-isha', name: 'Isha', color: 'Yellow' },
      820000,
      395000
    ),
    makeRunningRoom(
      'RN450N',
      450,
      '03593841',
      { id: 'mock-manav', name: 'Manav', color: 'Blue' },
      { id: 'mock-aarti', name: 'Aarti', color: 'Green' },
      840000,
      415000
    ),
    makeRunningRoom(
      'RN600P',
      600,
      '04604952',
      { id: 'mock-pranav', name: 'Pranav', color: 'Red' },
      { id: 'mock-aditi', name: 'Aditi', color: 'Yellow' },
      860000,
      435000
    ),
    makeRunningRoom(
      'RN750Q',
      750,
      '05715063',
      { id: 'mock-varun', name: 'Varun', color: 'Green' },
      { id: 'mock-shruti', name: 'Shruti', color: 'Blue' },
      880000,
      455000
    ),
    makeRunningRoom(
      'RN800R',
      800,
      '06826174',
      { id: 'mock-omkar', name: 'Omkar', color: 'Red' },
      { id: 'mock-palak', name: 'Palak', color: 'Yellow' },
      900000,
      475000
    ),
    makeRunningRoom(
      'RN1200',
      1200,
      '07937285',
      { id: 'mock-tushar', name: 'Tushar', color: 'Blue' },
      { id: 'mock-mansi', name: 'Mansi', color: 'Green' },
      920000,
      495000
    ),
    makeRunningRoom(
      'RN1500',
      1500,
      '08048396',
      { id: 'mock-deepak', name: 'Deepak', color: 'Red' },
      { id: 'mock-kirti', name: 'Kirti', color: 'Yellow' },
      940000,
      515000
    ),
    makeRunningRoom(
      'RN2500',
      2500,
      '09159407',
      { id: 'mock-gaurav', name: 'Gaurav', color: 'Green' },
      { id: 'mock-simran', name: 'Simran', color: 'Blue' },
      960000,
      535000
    ),
    makeRunningRoom(
      'RN5000',
      5000,
      '01260518',
      { id: 'mock-rajat', name: 'Rajat', color: 'Red' },
      { id: 'mock-bhavna', name: 'Bhavna', color: 'Yellow' },
      980000,
      555000
    ),
  ];

  const rooms: Record<string, MatchRoom> = {};
  for (const room of [...openLobbies, ...runningBattles]) {
    rooms[room.code] = room;
  }

  const recentMatches: CompletedMatchRecord[] = [
    {
      id: 'rec-mock-1',
      lobbyCode: 'MK912A',
      mode: 'Classic',
      amount: 250,
      stakesLabel: '500 Pts',
      bestOf: 1,
      player1Name: 'Rahul',
      player1Color: 'Red',
      player2Name: 'Priya',
      player2Color: 'Yellow',
      winnerName: 'Rahul',
      ludoKingRoomCode: '63419082',
      roundNumber: 1,
      completedAt: iso(420000),
    },
    {
      id: 'rec-mock-2',
      lobbyCode: 'MK704B',
      mode: 'Classic',
      amount: 100,
      stakesLabel: '100 Pts',
      bestOf: 1,
      player1Name: 'Aarav',
      player1Color: 'Green',
      player2Name: 'Kabir',
      player2Color: 'Blue',
      winnerName: 'Kabir',
      ludoKingRoomCode: '48205519',
      roundNumber: 1,
      completedAt: iso(840000),
    },
    {
      id: 'rec-mock-3',
      lobbyCode: 'MK615C',
      mode: 'Classic',
      amount: 500,
      stakesLabel: '500 Pts',
      bestOf: 1,
      player1Name: 'Vikram',
      player1Color: 'Red',
      player2Name: 'Rohan',
      player2Color: 'Yellow',
      winnerName: 'Rohan',
      ludoKingRoomCode: '91742038',
      roundNumber: 1,
      completedAt: iso(1380000),
    },
    {
      id: 'rec-mock-4',
      lobbyCode: 'MK508D',
      mode: 'Classic',
      amount: 1000,
      stakesLabel: '1000 Pts',
      bestOf: 1,
      player1Name: 'Ananya',
      player1Color: 'Green',
      player2Name: 'Sneha',
      player2Color: 'Blue',
      winnerName: 'Ananya',
      ludoKingRoomCode: '30581492',
      roundNumber: 1,
      completedAt: iso(1920000),
    },
    {
      id: 'rec-mock-5',
      lobbyCode: 'MK429E',
      mode: 'Classic',
      amount: 150,
      stakesLabel: '100 Pts',
      bestOf: 1,
      player1Name: 'Dev',
      player1Color: 'Red',
      player2Name: 'Zoya',
      player2Color: 'Yellow',
      winnerName: 'Zoya',
      ludoKingRoomCode: '57194820',
      roundNumber: 1,
      completedAt: iso(2580000),
    },
    {
      id: 'rec-mock-6',
      lobbyCode: 'MK317F',
      mode: 'Classic',
      amount: 200,
      stakesLabel: '100 Pts',
      bestOf: 1,
      player1Name: 'Siddharth',
      player1Color: 'Blue',
      player2Name: 'Meera',
      player2Color: 'Green',
      winnerName: 'Siddharth',
      ludoKingRoomCode: '82640175',
      roundNumber: 1,
      completedAt: iso(3240000),
    },
    {
      id: 'rec-mock-7',
      lobbyCode: 'MK288G',
      mode: 'Classic',
      amount: 1500,
      stakesLabel: '1000 Pts',
      bestOf: 1,
      player1Name: 'Karan',
      player1Color: 'Red',
      player2Name: 'Arjun',
      player2Color: 'Yellow',
      winnerName: 'Arjun',
      ludoKingRoomCode: '44907213',
      roundNumber: 1,
      completedAt: iso(4020000),
    },
    {
      id: 'rec-mock-8',
      lobbyCode: 'MK194H',
      mode: 'Classic',
      amount: 50,
      stakesLabel: '100 Pts',
      bestOf: 1,
      player1Name: 'Neha',
      player1Color: 'Green',
      player2Name: 'Pooja',
      player2Color: 'Blue',
      winnerName: 'Pooja',
      ludoKingRoomCode: '79321654',
      roundNumber: 1,
      completedAt: iso(4800000),
    },
    {
      id: 'rec-mock-9',
      lobbyCode: 'MK142J',
      mode: 'Classic',
      amount: 300,
      stakesLabel: '500 Pts',
      bestOf: 1,
      player1Name: 'Rishi',
      player1Color: 'Red',
      player2Name: 'Ishita',
      player2Color: 'Yellow',
      winnerName: 'Rishi',
      ludoKingRoomCode: '16483920',
      roundNumber: 1,
      completedAt: iso(5700000),
    },
    {
      id: 'rec-mock-10',
      lobbyCode: 'MK089K',
      mode: 'Classic',
      amount: 2500,
      stakesLabel: '1000 Pts',
      bestOf: 1,
      player1Name: 'Tanya',
      player1Color: 'Blue',
      player2Name: 'Kavya',
      player2Color: 'Green',
      winnerName: 'Kavya',
      ludoKingRoomCode: '95031748',
      roundNumber: 1,
      completedAt: iso(6900000),
    },
  ];

  return {
    rooms,
    recentMatches,
    adminState: createInitialAdminStore(now),
  };
}

export function buildHubSnapshotFromStore(store: StoreState): HubSnapshot {
  const allRooms = Object.values(store.rooms);
  const openLobbies = allRooms
    .filter((room) => room.visibility === 'open' && room.players.length === 1 && room.status === 'waiting')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const runningBattles = allRooms
    .filter(
      (room) =>
        room.players.length === 2 &&
        (room.status !== 'completed' || isBattleResultPendingApproval(room))
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 50);

  return {
    openLobbies,
    runningBattles,
    recentMatches: store.recentMatches.slice(0, 20),
    stats: {
      openCount: openLobbies.length,
      activeMatchesCount: runningBattles.filter((room) => room.status !== 'completed').length,
      completedCount: store.recentMatches.length,
    },
  };
}
