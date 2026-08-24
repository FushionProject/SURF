import type { SurfLeague, SurfSportKey, SurfSportLabel } from "./sports";

export type OddsApiOutcome = {
  name: string;
  price?: number;
  point?: number;
};

export type OddsApiMarket = {
  key: string;
  last_update?: string;
  outcomes?: OddsApiOutcome[];
};

export type OddsApiBookmaker = {
  key: string;
  title: string;
  last_update?: string;
  markets?: OddsApiMarket[];
};

export type OddsApiGame = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: OddsApiBookmaker[];
};

export type SurfSignalType =
  | "BOOK_DISAGREEMENT"
  | "RUN_LINE_PRICE_CONFLICT"
  | "BEST_NUMBER_AVAILABLE"
  | "LINE_MOVEMENT"
  | "SNAPSHOT_MOVEMENT"
  | "STALE_BOOK";

export type SurfSignalTypeLabel =
  | "Book Disagreement"
  | "Run Line Price Conflict"
  | "Best Number"
  | "Line Movement"
  | "Market Movement"
  | "Stale Book";

export type SurfMarketType = "spreads" | "totals";

export type SurfSelection = {
  market: SurfMarketType;
  side?: "home" | "away";
  team?: string;
  point: number;
};

export type SurfSignalDetection = {
  type: SurfSignalType;
  gameId: string;
  market: SurfMarketType;
  commenceTime: string;
  selection?: SurfSelection;
  booksInSample: number;
  range: number;
  lowPoint?: number;
  highPoint?: number;
  baselinePoint?: number;
  movedPoint?: number;
  prevSnapshotAt?: string;
  movementSeverity?: "LINE_MOVED" | "SHARP_MOVEMENT";
  movedBook?: {
    key: string;
    title: string;
    point: number;
  };
  clusterPoint?: number;
  stalePoint?: number;
  staleBook?: {
    key: string;
    title: string;
    point: number;
  };
  lowBook?: {
    key: string;
    title: string;
  };
  highBook?: {
    key: string;
    title: string;
  };
  consensusPoint?: number;
  bestBook?: {
    key: string;
    title: string;
    point: number;
  };
  marketBook?: {
    key: string;
    title: string;
    point: number;
  };
  valueOptions?: Array<{
    selection: string;
    book: {
      key: string;
      title: string;
    };
    point: number;
    price?: number;
  }>;

  // MLB run line price conflict (same abs line, conflicting prices)
  priceConflict?: {
    team: string;
    absLine: number;
    plus?: { point: number; price: number; book: { key: string; title: string } };
    minus?: { point: number; price: number; book: { key: string; title: string } };
    delta?: number;
  };
};

export type SignalCardSource = {
  label: string;
  book: string;
  value: string;
};

export type SignalCardValueOption = {
  selection: string;
  book: string;
  line: string;
  price?: string;
};

export type SignalCard = {
  id: string;
  game: {
    id: string;
    league: SurfLeague;
    sportKey: SurfSportKey;
    sportLabel: SurfSportLabel;
    homeTeam: string;
    awayTeam: string;
  };
  signalType: SurfSignalTypeLabel;
  market?: SurfMarketType;
  title: string;
  detail: string;
  insight: string;
  sources?: SignalCardSource[];
  valueOptions?: SignalCardValueOption[];
  commenceTime: string;
  gap?: number;
  lineMovement?: number;
  recentMovement?: number;
  recentMovementAbs?: number;
  recentMovementMinutes?: number;
  recentMovementLabel?: string;
  lastMovedAt?: number;
  detectedAt?: number;
  signalChangedAt?: number;
  lastSeenAt?: number;
  status?: "active" | "resolved";
  strengthScore?: number;
  isTopSignal?: boolean;
  topBadge?: string;
  topReason?: "gap" | "movement" | "disagreement";
};

export type OvernightMarketMove = {
  id: string;
  game: {
    id: string;
    sportKey: SurfSportKey;
    homeTeam: string;
    awayTeam: string;
  };
  market: SurfMarketType;
  selectionName: string;
  startPoint: number;
  currentPoint: number;
  lowPoint: number;
  highPoint: number;
  netMovement: number;
  largestSwing: number;
  observedFrom: number;
  lastMovedAt: number;
  observations: number;
};

export type OvernightMarketSummary = {
  windowKey: string;
  windowLabel: string;
  isActive: boolean;
  isMorningRecap: boolean;
  minimumMove: number;
  moves: OvernightMarketMove[];
};
